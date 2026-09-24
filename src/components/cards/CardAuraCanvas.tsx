'use client';

import { useEffect, useRef } from 'react';
import { AURA_BLEED_PERCENT, AURA_CARD } from '@/lib/card-aura';
import {
  flameParticles,
  flowParticles,
  neonSpec,
  ringDash,
  ringGeometry,
  ringPointAt,
} from '@/lib/card-canvas';
import { useAudio } from '@/components/providers/AudioProvider';

interface CardAuraCanvasProps {
  rarity?: string | null;
  /** seed ของการ์ดใบนั้น (ปกติส่ง cardId) — ทำให้ลายแสง/อนุภาคต่างกันต่อใบแบบ deterministic */
  seed?: string;
  className?: string;
}

/** ความกว้าง "รู" ที่เจาะใน clip (วงแหวนขอบการ์ด) — กันแสงทับตัวภาพ/กล่องข้อความ */
const RING_HOLE = 30;

/**
 * เอฟเฟกต์แสงการ์ดด้วย **Canvas 2D** (ตามคำสั่งผู้ใช้ 2026-09-24)
 *
 * เทคนิคตาม prompt:
 *   - `ctx.globalCompositeOperation = 'lighter'` → แสงที่วาดซ้อน "บวก" กับสีการ์ดเดิม (additive)
 *   - `ctx.shadowBlur` + `ctx.shadowColor` → สร้างออร่านีออนรอบการ์ด (ไม่ต้องใช้ภาพสำเร็จรูป)
 *   - วาดในระบบพิกัด 2D ของการ์ด (420×600) แล้ว `setTransform` สเกลตามขนาดจริงทุกขนาด
 *
 * ชั้นที่วาด (แสงอยู่บนวงแหวนขอบการ์ด/นอกการ์ด — ไม่ทับตัวภาพ ตามที่ผู้ใช้ยืนยัน "ต้องเป็น Inner"):
 *   1) ออร่านีออนรอบกรอบ (stroke 3 รอบ: ฟุ้ง → แกน → สว่างสุด)
 *   2) ลำแสงไหลรอบขอบ (setLineDash + lineDashOffset) = "การไหลเหมือนน้ำ"
 *   3) อนุภาคไหลตามขอบ (มีหางแบบดาวหาง)
 *   4) เปลวไฟลุกขึ้นจากขอบล่าง = "เปลวไฟ"
 *
 * เคารพ: COMMON/UNCOMMON ไม่วาด · prefers-reduced-motion (วาดนิ่ง ไม่ขยับ) ·
 *        ตั้งค่า "ลดเอฟเฟกต์รุนแรง" (alpha ÷2) · หยุดวาดเมื่ออยู่นอกจอ/แท็บซ่อน (ประหยัด CPU)
 */
export default function CardAuraCanvas({ rarity, seed = '', className = '' }: CardAuraCanvasProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { settings } = useAudio();
  const reduceIntense = settings.reduceIntense;

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const spec = neonSpec(rarity);
    if (!spec.enabled) return; // COMMON/UNCOMMON = การ์ดธรรมดา ไม่มีเอฟเฟกต์
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const geo = ringGeometry();
    const dash = ringDash(spec, geo);
    const flows = flowParticles(seed, spec.flowCount, geo.length, spec.flowSpeed);
    const flames = flameParticles(seed, spec.flameCount);
    const k = reduceIntense ? 0.5 : 1;

    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // hook สำหรับถ่ายภาพนิ่ง (ให้เทียบดีไซน์ได้ผลคงที่): window.__CARD_NEON_TIME__ = วินาที
    const fixedTime = (window as unknown as { __CARD_NEON_TIME__?: number }).__CARD_NEON_TIME__;

    let w = 0;
    let h = 0;
    let scale = 1;
    let raf = 0;
    let running = false;
    let t = 0;
    let last = 0;
    let visible = true;

    const bleed = AURA_BLEED_PERCENT / 100;
    const boxW = AURA_CARD.width * (1 + bleed * 2);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nw = Math.max(1, Math.round(rect.width * (1 + bleed * 2) * dpr));
      const nh = Math.max(1, Math.round(rect.height * (1 + bleed * 2) * dpr));
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
      }
      w = nw;
      h = nh;
      scale = w / boxW;
      return true;
    };

    /** path มุมโค้งในหน่วยการ์ด (inset = เยื้องเข้าไปกี่หน่วย) */
    const roundRect = (inset: number) => {
      const { frame } = AURA_CARD;
      const x = frame.x + inset;
      const y = frame.y + inset;
      const ww = frame.w - inset * 2;
      const hh = frame.h - inset * 2;
      const r = Math.max(0, frame.r - inset);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + ww - r, y);
      ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
      ctx.lineTo(x + ww, y + hh - r);
      ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
      ctx.lineTo(x + r, y + hh);
      ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    /** clip = วงแหวนขอบการ์ด (กรอบการ์ด เจาะรูตรงกลาง) → ไม่ทับตัวภาพ/กล่องข้อความ */
    const clipRing = () => {
      ctx.beginPath();
      roundRect(0);
      roundRect(RING_HOLE);
      ctx.clip('evenodd');
    };

    /**
     * clip = "นอกช่องภาพ" (เจาะรูที่ช่องภาพ) → ออร่าที่ฟุ้งเข้ามาในการ์ดจะไม่ทับตัวภาพเลย
     * ใช้กับชั้นออร่า/ลำแสงไหล/อนุภาค (ชั้นเปลวไฟใช้วงแหวนอยู่แล้ว)
     */
    const clipOutsideArt = () => {
      const { art } = AURA_CARD;
      const bleed = AURA_BLEED_PERCENT / 100;
      ctx.beginPath();
      // ผืนใหญ่ = ทั้ง canvas (การ์ด + เผื่อ 12%)
      ctx.rect(
        -AURA_CARD.width * bleed,
        -AURA_CARD.height * bleed,
        AURA_CARD.width * (1 + bleed * 2),
        AURA_CARD.height * (1 + bleed * 2)
      );
      // รู = ช่องภาพ (มุมโค้ง)
      const r = art.r;
      const x = art.x;
      const y = art.y;
      const ww = art.w;
      const hh = art.h;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + ww - r, y);
      ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
      ctx.lineTo(x + ww, y + hh - r);
      ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
      ctx.lineTo(x + r, y + hh);
      ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.clip('evenodd');
    };

    /** 1) ออร่านีออนรอบกรอบ — shadowBlur + shadowColor (หัวใจของ prompt นี้) */
    const drawFrame = () => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      clipOutsideArt(); // ออร่าฟุ้งเข้ามาได้ แต่ห้ามทับช่องภาพ

      // ออร่าฟุ้ง: วาด 2 ครั้ง → แสงบวกกันสว่างขึ้น (additive)
      ctx.shadowColor = spec.color;
      ctx.shadowBlur = spec.blur * 1.7;
      ctx.strokeStyle = spec.color;
      ctx.globalAlpha = spec.alpha * 0.34 * k;
      ctx.lineWidth = spec.lineWidth * 1.5;
      roundRect(0);
      ctx.stroke();
      ctx.stroke();

      // แกนนีออน: สีสว่าง คม
      ctx.shadowColor = spec.core;
      ctx.shadowBlur = spec.blur * 0.7;
      ctx.strokeStyle = spec.core;
      ctx.globalAlpha = spec.alpha * 0.9 * k;
      ctx.lineWidth = spec.lineWidth;
      roundRect(0);
      ctx.stroke();
      ctx.restore();
    };

    /** 2) ลำแสงไหลรอบขอบ (เส้นประเลื่อน) = "การไหลเหมือนน้ำ" */
    const drawFlowDash = (time: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      clipOutsideArt();
      ctx.setLineDash(dash.dash);
      ctx.lineDashOffset = -time * dash.offsetPerSec;
      ctx.shadowColor = spec.core;
      ctx.shadowBlur = spec.blur;
      ctx.strokeStyle = spec.core;
      ctx.globalAlpha = spec.alpha * 0.85 * k;
      ctx.lineWidth = spec.lineWidth * 1.2;
      ctx.lineJoin = 'round';
      roundRect(0);
      ctx.stroke();
      ctx.restore();
    };

    /** 3) อนุภาคไหลตามขอบ (หัวสว่าง + หางจางลง) */
    const drawFlowParticles = (time: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      clipOutsideArt();
      ctx.shadowColor = spec.color;
      ctx.shadowBlur = spec.blur * 0.9;
      ctx.fillStyle = spec.core;
      for (const p of flows) {
        const head = p.offset + time * p.speed;
        ctx.globalAlpha = spec.alpha * p.brightness * k;
        const pt = ringPointAt(geo, head);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 1; i <= 4; i += 1) {
          const back = ringPointAt(geo, head - i * (p.radius * 2.4));
          ctx.globalAlpha = spec.alpha * p.brightness * k * (0.45 - i * 0.1);
          ctx.beginPath();
          ctx.arc(back.x, back.y, p.radius * (1 - i * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    /** 4) เปลวไฟลุกขึ้นจากขอบล่าง (clip วงแหวน) = "เปลวไฟ" */
    const drawFlames = (time: number) => {
      const baseY = AURA_CARD.frame.y + AURA_CARD.frame.h - 3;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      clipRing();
      ctx.lineCap = 'round';
      ctx.shadowColor = spec.color;
      ctx.shadowBlur = spec.blur * 0.8;
      ctx.strokeStyle = spec.core;
      for (const f of flames) {
        const life = ((time / f.lifeSec) + f.phase) % 1; // 0 → 1 (เกิด → ดับ)
        const alpha = Math.sin(life * Math.PI);
        if (alpha <= 0.02) continue;
        const rise = f.height * (0.35 + 0.65 * alpha);
        const sway = Math.sin((life + f.phase) * Math.PI * 2) * f.sway;
        ctx.globalAlpha = spec.alpha * alpha * k;
        ctx.lineWidth = f.width * 0.55;
        ctx.beginPath();
        ctx.moveTo(f.x, baseY);
        ctx.quadraticCurveTo(
          f.x + sway + f.tiltDeg * 0.4,
          baseY - rise * 0.55,
          f.x + sway * 1.5,
          baseY - rise
        );
        ctx.stroke();
      }
      ctx.restore();
    };

    const render = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // วาดใน "หน่วยการ์ด" + เผื่อที่ 12% รอบการ์ดให้ออร่าล้นออกได้
      const pad = bleed * AURA_CARD.width * scale;
      ctx.setTransform(scale, 0, 0, scale, pad, pad);
      drawFrame();
      drawFlowDash(time);
      drawFlowParticles(time);
      drawFlames(time);
    };

    const loop = (now: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      render(t);
      raf = window.requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (running || reduceMotion || fixedTime !== undefined) return;
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    if (!resize()) return undefined;
    if (fixedTime !== undefined) {
      render(fixedTime); // ภาพนิ่ง ณ เวลาที่กำหนด (ใช้ถ่ายภาพเทียบดีไซน์)
    } else if (reduceMotion) {
      render(1.2); // แสงนิ่ง (ยังสวย ไม่ขยับ)
    } else {
      render(0);
      startLoop();
    }

    // ---- ประหยัดแรง: หยุดวาดเมื่อแท็บซ่อน / การ์ดอยู่นอกจอ / กล่องเล็กเกินไป ----
    const small = host.getBoundingClientRect().width < 120;
    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else if (visible && !small) startLoop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let observer: IntersectionObserver | null = null;
    if (!small && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible && !document.hidden) startLoop();
        else stopLoop();
      }, { rootMargin: '120px' });
      observer.observe(host);
    }

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (resize()) render(t); })
      : null;
    ro?.observe(host);

    return () => {
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      ro?.disconnect();
    };
  }, [rarity, seed, reduceIntense]);

  return <canvas ref={ref} aria-hidden className={`card-aura-canvas ${className}`.trim()} />;
}

