'use client';

import { useEffect, useRef } from 'react';
import { AURA_BLEED_PERCENT, AURA_CARD } from '@/lib/card-aura';
import {
  flowParticles,
  neonLayers,
  neonSpec,
  orbitSpec,
  ringDash,
  ringGeometry,
  ribbonCenterline,
  ringPointAt,
  sheenBand,
  spiralStrands,
  spiralStreak,
  type RibbonQuad,
} from '@/lib/card-canvas';
import { useAudio } from '@/components/providers/AudioProvider';

interface CardAuraCanvasProps {
  rarity?: string | null;
  /** seed ของการ์ดใบนั้น (ปกติส่ง cardId) — ทำให้ลายแสง/อนุภาคต่างกันต่อใบแบบ deterministic */
  seed?: string;
  className?: string;
}

/** เส้นไหลขยับเข้าจากกรอบกี่หน่วย — กันเงาฟุ้งล้นขอบการ์ด (ผู้ใช้ติว่าแสงหมุนหลุดขอบ) */
const FLOW_INSET = 8;

/** จำนวนช่วงย่อยของแถบแสง — ยิ่งมากยิ่งโค้งเนียน (วาดเป็น stroke เส้นเดียว จึงเพิ่มได้ถูก ๆ) */
const WISP_STEPS = 48;


/**
 * เอฟเฟกต์แสงการ์ดด้วย **Canvas 2D** (ตามคำสั่งผู้ใช้ 2026-09-24)
 *
 * เทคนิคตาม prompt:
 *   - `ctx.globalCompositeOperation = 'lighter'` → แสงที่วาดซ้อน "บวก" กับสีการ์ดเดิม (additive)
 *   - `ctx.shadowBlur` + `ctx.shadowColor` → สร้างออร่านีออนรอบการ์ด (ไม่ต้องใช้ภาพสำเร็จรูป)
 *   - วาดในระบบพิกัด 2D ของการ์ด (420×600) แล้ว `setTransform` สเกลตามขนาดจริงทุกขนาด
 *
 * ชั้นที่วาด (แสงขอบอยู่บนวงแหวนขอบการ์ด · ชั้นวนรอบอยู่ใน "ช่องภาพ" เท่านั้น):
 *   1) ออร่านีออนรอบกรอบ (stroke: ฟุ้งสีระดับ → แกนสีระดับ → ไส้ขาวบาง)
 *   2) ลำแสงไหลรอบขอบ (setLineDash + lineDashOffset) = "การไหลเหมือนน้ำ"
 *      · เส้นขยับเข้าจากกรอบ 8 หน่วย (ไม่หลุดขอบ) · สี = สีรูปการ์ดใบนั้น (เก็บจากภาพจริง)
 *   3) อนุภาคไหลตามขอบ (มีหางแบบดาวหาง · สีเดียวกับลำแสง)
 *   4) **แถบแสงกวาดผ่านตัวแบบ** (แสงสะท้อนบนโลหะ — จาก GIF อ้างอิง 419–424)
 *   5) **เกลียวแสงปีนขึ้น หลายเส้น** (helix streak 2–3 เส้น ยาว/สั้น/สว่างไม่เท่ากัน
 *      — ครอบทั้งตัวแบบ ปีนจากเท้าถึงหัว — จาก GIF อ้างอิง)
 *
 * หมายเหตุ 2026-09-25 (คำติ \"แสงหมุนทับภาพ แหว่ง + ภาพสีเพี้ยน\" + GIF อ้างอิง):
 *   ชั้น 4–5 เป็นเรขาคณิตล้วน + additive เท่านั้น (lighter) · ไม่มี conic-gradient/color-dodge
 *   ⇒ ไม่มีรอยต่อ/วงแหว่งให้เห็น และสีของภาพการ์ดไม่เพี้ยน
 *   · ทุกชั้นถูก clip ไว้ใน \"ช่องภาพ\" → ไม่ทับชื่อ/กล่องข้อความ/สเตตัส และไม่ล้นออกนอกการ์ด
 *   · **ชั้น 1–3 (ออร่า + แสงไหล + ประกายที่ขอบการ์ด) ไม่ถูกแตะเลย** — คงไว้ตามที่ผู้ใช้ชมว่า
 *     \"ที่ขอบของเดิมดีอยู่แล้ว\" (ผู้ใช้ยืนยัน 2026-09-25)
 *
 * หมายเหตุ 2026-09-25 (คำติรอบสอง: \"เป็นแค่หมุนเป็นวงกลม + วงกลมยืดหด เฉยๆ ...
 *   ตัวอย่างจะเป็นเกลียว ขึ้นไปเลย และคลุมทั้งตัว ไม่ใช่อยู่แต่ตรงกลางการ์ด\"):
 *   ชั้น 5 เปลี่ยนจาก \"วงรีแบนหมุนอยู่กลางช่องภาพ\" → **เกลียวปีนขึ้น** (`spiralStreak`)
 *   ที่ปีนจากขอบล่างถึงขอบบนของช่องภาพ
 *
 * หมายเหตุ 2026-09-25 (คำติรอบสาม: \"วงแหวนด้านล่างเอาออก · เกลียวต้องค่อย ๆ ขยับขึ้น
 *   แล้วค่อย ๆ จางหาย ไม่ใช่หายวับไปเลย · ต้องมีเกลียวมากกว่า 1 อัน มีสั้น มียาว\"):
 *   · **ถอดวงแหวนฐาน (ใต้เท้า) ออกทั้งหมด** (`drawBaseRing`/`baseRingGeometry`/`ringPulse` ถูกลบ)
 *   · จางหัว-ท้ายนุ่มขึ้น (`sin^0.9`) และช้าลง (ปีน 1 รอบ ~4.8–5.8 วิ) = ค่อย ๆ ขึ้น/ค่อย ๆ จาง
 *   · มี 2–3 เส้นต่อใบ (`spiralStrands`) ยาว/สั้น/สว่าง ไม่เท่ากัน และเคลื่อนคนละจังหวะ
 *   · เกลียวกว้างขึ้น (rxRatio 0.72–0.84) → แสงกวาดไปสุดขอบซ้าย/ขวาของช่องภาพ
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
    if (!spec.enabled) return; // COMMON = การ์ดธรรมดา ไม่มีเอฟเฟกต์เลย
    // บันไดเอฟเฟกต์ตามระดับ: UNCOMMON = วิ่งรอบ · RARE = +เลื่อม/วนนิด ๆ · EPIC+ = จัดเต็ม
    const layers = neonLayers(rarity);
    if (!layers.frame) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const geo = ringGeometry(); // วงกรอบนอก — ใช้กับออร่าพื้นหลังเท่านั้น
    // วงแหวนเส้นไหล (หดเข้าจากกรอบ FLOW_INSET) — อนุภาค + เส้นประต้องใช้วงเดียวกัน
    // (บั๊กเดิม: เส้นใช้ inset แต่จุดอนุภาคใช้กรอบนอก → อนุภาคโดน clip หาย + ดูเหมือนแสงหลุดขอบ)
    const frame0 = AURA_CARD.frame;
    const flowR = Math.max(0, frame0.r - FLOW_INSET);
    const flowStraight =
      2 * (frame0.w - 2 * FLOW_INSET - 2 * flowR) + 2 * (frame0.h - 2 * FLOW_INSET - 2 * flowR);
    const geoFlow = {
      x: frame0.x + FLOW_INSET,
      y: frame0.y + FLOW_INSET,
      w: frame0.w - FLOW_INSET * 2,
      h: frame0.h - FLOW_INSET * 2,
      r: flowR,
      length: flowStraight + 2 * Math.PI * flowR,
    };
    const dash = ringDash(spec, geoFlow);
    const flows = flowParticles(seed, spec.flowCount, geoFlow.length, spec.flowSpeed);
    // สเปกของเอฟเฟกต์ "วนรอบตัว + วงแหวนฐาน" (ตาม GIF อ้างอิง 419–424 · 2026-09-25)
    const orbit = orbitSpec(rarity);
    const k = reduceIntense ? 0.5 : 1;
    // สี "แสงที่วิ่งรอบ" = สีโดยรวมของรูปการ์ดใบนั้น (ผู้ใช้ขอ 2026-09-24)
    // เก็บจากพิกเซลจริงของ <img> รูปการ์ด (เฉลี่ยช่องภาพ) → fallback = สีออร่าระดับนั้น
    //
    // หมายเหตุสี (กัน "แสงม่วงบนการ์ดโทนเหลือง"): สีเฉลี่ยของภาพมักเอียงไปทางเทา/ม่วงหม่น
    // จึงปรับให้อิ่มตัวขึ้น (+saturation) และติดสว่างขึ้นก่อนใช้เป็นสีแสง
    let flowColor = spec.color;
    /** bitmap ออร่าขอบการ์ดที่แคชไว้ (นิ่ง ไม่ขึ้นกับเวลา) — สร้างใหม่เมื่อขนาด/สเกลเปลี่ยน */
    let frameLayer: HTMLCanvasElement | null = null;
    const hexToRgb = (hex: string): [number, number, number] | null => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
      if (!m) return null;
      const v = parseInt(m[1], 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    };
    const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const mx = Math.max(rn, gn, bn);
      const mn = Math.min(rn, gn, bn);
      const l = (mx + mn) / 2;
      if (mx === mn) return [0, 0, l];
      const d = mx - mn;
      const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      let h = 0;
      if (mx === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      else if (mx === gn) h = ((bn - rn) / d + 2) / 6;
      else h = ((rn - gn) / d + 4) / 6;
      return [h, s, l];
    };
    const hslToHex = (h: number, s: number, l: number): string => {
      const hue = ((h % 1) + 1) % 1;
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const ch = (t: number) => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
      return `#${((1 << 24) + (to(ch(hue + 1 / 3)) << 16) + (to(ch(hue)) << 8) + to(ch(hue - 1 / 3))).toString(16).slice(1)}`;
    };
    /** ดันสีหม่นให้อิ่ม + สว่าง → เป็น "แสง" ของสีรูปใบนั้น (เหลืองอยู่เหลือง ไม่ม่วง) */
    const vividLight = (hex: string): string => {
      const rgb = hexToRgb(hex);
      if (!rgb) return spec.color;
      const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
      if (s < 0.08) return spec.color; // ภาพเทา/หม่นเกิน → ใช้สีระดับแทน (กันแสงม่วงเทา)
      return hslToHex(h, Math.min(1, s * 1.6 + 0.15), Math.min(0.72, l * 0.6 + 0.32));
    };
    const sampleArtColor = (): string => {
      try {
        // หมายเหตุ CORS: รูปการ์ดเสิร์ฟจาก origin เดียวกัน (/api/cards/[id]/art) + ไม่ตั้ง
        // crossOrigin (ใช้ bitmap เดิม ไม่โหลดซ้ำ) → getImageData ไม่ทainted ในเคสปกติ
        // ถ้าโดน tainted (SecurityError) → catch แล้ว fallback = สีระดับ (ยังมีสี ไม่พัง)
        const artImg = host.querySelector('img[alt=""]') as HTMLImageElement | null;
        if (!artImg || !artImg.complete || !artImg.naturalWidth) return spec.color;
        const sw = 24;
        const sh = 24;
        const probe = document.createElement('canvas');
        probe.width = sw;
        probe.height = sh;
        const pctx = probe.getContext('2d', { willReadFrequently: true });
        if (!pctx) return spec.color;
        // วาดเฉพาะ "ช่องภาพ" ของการ์ด (เทียบสัดส่วน object-cover) แล้วเฉลี่ยสี
        pctx.drawImage(artImg, 0, 0, sw, sh);
        const d = pctx.getImageData(0, 0, sw, sh).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (a < 16) continue;
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          n += 1;
        }
        if (!n) return spec.color;
        r = Math.round(r / n);
        g = Math.round(g / n);
        b = Math.round(b / n);
        // ผสมขาว 35% → เป็น "แสง" ของสีรูป (ไม่ทึบจนกลมกลืนกับภาพ)
        const mix = (c: number) => Math.round(c + (255 - c) * 0.35);
        const avg = `#${((1 << 24) + (mix(r) << 16) + (mix(g) << 8) + mix(b)).toString(16).slice(1)}`;
        const vivid = vividLight(avg);
        canvas.dataset.flowColor = vivid; // ดีบัก: เปิด inspector ดูได้ว่าใบนี้ใช้สีอะไร
        return vivid;
      } catch {
        canvas.dataset.flowColor = spec.color;
        return spec.color;
      }
    };

    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // hook สำหรับถ่ายภาพนิ่ง (ให้เทียบดีไซน์ได้ผลคงที่): window.__CARD_NEON_TIME__ = วินาที
    const fixedTime = (window as unknown as { __CARD_NEON_TIME__?: number }).__CARD_NEON_TIME__;

    let w = 0;
    let h = 0;
    // สเกล + ตำแหน่ง "มุมการ์ดบนซ้าย" บน canvas — คำนวณใน resize() ให้ตรงกับที่ object-contain วาดการ์ดจริง
    let fit = { s: 1, x: 0, y: 0 };
    // ตัวคูณ shadowBlur → device px (shadowBlur ไม่โดน CTM สเกลให้ ต้องคูณเอง)
    let blurK = 1;
    let raf = 0;
    let running = false;
    let t = 0;
    let last = 0;
    let visible = true;
    let small = true; // การ์ดเล็กกว่า 120px → ไม่อนิเมต (ประหยัดแรง) — อัปเดตทุกครั้งใน resize()

    const bleed = AURA_BLEED_PERCENT / 100;

    /**
     * วัดกล่อง host → คำนวณ "กล่องการ์ดจริงบน canvas" แบบเดียวกับที่ <img class="object-contain">
     * วาดเฟรมการ์ด (พอดีด้านสั้น แล้วกึ่งกลางอีกแกน) — ไม่สมมติว่ากล่อง host ได้สัดส่วน 7:10 เป๊ะ
     *
     * 🐞 บั๊กเดิม (พบจากพิกเซลจริง 2026-09-24): ใช้ pad แกน X (12% ของความกว้าง 420 = 50.4)
     * เป็น pad แกน Y ด้วย ทั้งที่ CSS inset:-12% แนวตั้งคิดจากความสูง 600 (=72)
     * → ออร่าทั้งชุดเยื้องขึ้น ~25 หน่วยการ์ด ลอยนอกการ์ดด้านบน และทับแถบสเตตัสด้านล่าง
     */
    const resize = () => {
      const rect = host.getBoundingClientRect();
      small = rect.width < 120;
      if (rect.width < 24 || rect.height < 24) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // แสงเป็นเงาฟุ้งอยู่แล้ว - 1.5x พอ (ลดงานต่อเฟรม ~45%)
      const nw = Math.max(1, Math.round(rect.width * (1 + bleed * 2) * dpr));
      const nh = Math.max(1, Math.round(rect.height * (1 + bleed * 2) * dpr));
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
      }
      w = nw;
      h = nh;
      // หา "การ์ดจริง" จากกล่อง host ก่อน แล้วค่อยเติมพื้นที่ขอบภายนอก 12% บน canvas
      // (canvas นี้ใหญ่กว่า host — ถ้าใช้ canvas เป็นตัวกำหนดขนาดการ์ด จะทำให้ aura เล็กลงเท่ากับ 1/1.24)
      // เทียบกับ <img class="object-contain"> ที่กินพื้นที่ host เต็มสัดส่วน 0.7 แล้วจึงมีพื้นที่รอบสำหรับ glow
      const hostW = rect.width * dpr;
      const hostH = rect.height * dpr;
      const ratio = AURA_CARD.width / AURA_CARD.height;
      const cardW = Math.min(hostW, hostH * ratio);
      const cardH = cardW / ratio;
      fit = { s: cardW / AURA_CARD.width, x: (w - cardW) / 2, y: (h - cardH) / 2 };
      // shadowBlur ไม่โดน CTM สเกล → คูณด้วยสเกลการ์ด (×dpr ในตัวแล้ว) จึงฟุ้งเท่ากันทุกขนาดจอ
      blurK = fit.s;
      frameLayer = buildFrameLayer(); // ขอบการ์ดนิ่ง → เรนเดอร์ครั้งเดียวต่อขนาด (กันกระตุก)
      return true;
    };

    /**
     * ออร่าขอบการ์ด "นิ่ง" (ไม่ขึ้นกับเวลา) → วาดครั้งเดียวเก็บเป็น bitmap แล้ว `drawImage` ทุกเฟรม
     * ⚠️ ประสิทธิภาพ (2026-09-25): เดิม stroke กรอบการ์ด 4 ครั้ง พร้อม shadowBlur ขนาดใหญ่ ทุกเฟรม
     *    ซึ่งกินเวลามากที่สุดในบรรดาชั้นทั้งหมด ⇒ แคชไว้ = ประหยัดไปเกือบทั้งก้อน
     */
    function buildFrameLayer(): HTMLCanvasElement | null {
      if (typeof document === 'undefined') return null;
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      if (!octx) return null;
      octx.setTransform(fit.s, 0, 0, fit.s, fit.x, fit.y);
      drawFrame(octx);
      return off;
    }

    /**
     * path มุมโค้งในหน่วยการ์ด (inset = เยื้องเข้าไปกี่หน่วย)
     * ⚠️ เป็น "subpath" เท่านั้น — ห้ามเรียก ctx.beginPath() ข้างใน
     * ผู้เรียกต้อง ctx.beginPath() เองก่อนสะสม subpath
     */
    const roundRect = (c: CanvasRenderingContext2D, inset: number) => {
      const { frame } = AURA_CARD;
      const x = frame.x + inset;
      const y = frame.y + inset;
      const ww = frame.w - inset * 2;
      const hh = frame.h - inset * 2;
      const r = Math.max(0, frame.r - inset);
      c.moveTo(x + r, y);
      c.lineTo(x + ww - r, y);
      c.quadraticCurveTo(x + ww, y, x + ww, y + r);
      c.lineTo(x + ww, y + hh - r);
      c.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
      c.lineTo(x + r, y + hh);
      c.quadraticCurveTo(x, y + hh, x, y + hh - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    };

    /**
     * clip = "นอกช่องภาพ" (เจาะรูที่ช่องภาพ) → ออร่าที่ฟุ้งเข้ามาในการ์ดจะไม่ทับตัวภาพเลย
     * ใช้กับชั้นออร่า/ลำแสงไหล/อนุภาค
     * โหมด 'intersect' = ตัดเพิ่มด้วยกรอบใน (FLOW_INSET) → เงาฟุ้งของเส้นไหลไม่ล้นขอบการ์ด
     */
    const clipOutsideArt = (c: CanvasRenderingContext2D, innerInset = 0) => {
      const { art, frame } = AURA_CARD;
      const bleed = AURA_BLEED_PERCENT / 100;
      c.beginPath();
      if (innerInset > 0) {
        // ผืนวาด = กรอบการ์ดที่หดเข้า (เส้นไหลวาดในนี้ เงานอกเส้นจึงไม่ล้นขอบการ์ด)
        const r = Math.max(0, frame.r - innerInset);
        const x = frame.x + innerInset;
        const y = frame.y + innerInset;
        const ww = frame.w - innerInset * 2;
        const hh = frame.h - innerInset * 2;
        c.moveTo(x + r, y);
        c.lineTo(x + ww - r, y);
        c.quadraticCurveTo(x + ww, y, x + ww, y + r);
        c.lineTo(x + ww, y + hh - r);
        c.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
        c.lineTo(x + r, y + hh);
        c.quadraticCurveTo(x, y + hh, x, y + hh - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
        c.clip();
        c.beginPath();
      }
      // ผืนใหญ่ = ทั้ง canvas (การ์ด + เผื่อ 12%)
      c.rect(
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
      c.moveTo(x + r, y);
      c.lineTo(x + ww - r, y);
      c.quadraticCurveTo(x + ww, y, x + ww, y + r);
      c.lineTo(x + ww, y + hh - r);
      c.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
      c.lineTo(x + r, y + hh);
      c.quadraticCurveTo(x, y + hh, x, y + hh - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
      c.clip('evenodd');
    };

    /** path ของสี่เหลี่ยมมุมโค้ง (หน่วยการ์ด) → ใช้ clip ให้แสงอยู่ในกรอบที่กำหนด */
    const clipBox = (box: { x: number; y: number; w: number; h: number; r: number }) => {
      const { x, y, w: ww, h: hh } = box;
      const r = Math.min(box.r, ww / 2, hh / 2);
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
      ctx.clip();
    };

    /** clip = เฉพาะ "ช่องภาพ" (มุมโค้ง) — ใช้กับชั้นที่ต้องอยู่แต่ในภาพ (แสงกวาดบนตัวแบบ) */
    const clipArt = () => clipBox(AURA_CARD.art);

    /**
     * clip = **ทั้งการ์ด** (กรอบมุมโค้ง 8,8,404×584) — ใช้กับเกลียวแสง
     * ตามคำสั่งผู้ใช้ 2026-09-25: *"ให้วนทั้งการ์ด ไม่ใช่แค่ในภาพ"*
     * (ยังกันไม่ให้แสงล้นออกนอกกรอบการ์ด — ดูสะอาด ไม่เลอะพื้นหลังหน้าเว็บ)
     */
    const clipCard = () => clipBox(AURA_CARD.frame);

    /** 1) ออร่านีออนรอบกรอบ — shadowBlur + shadowColor (หัวใจของ prompt นี้)
     * สีต้องอ่านเป็นสีประจำระดับ (MYTHIC = ชมพู-ทอง) ไม่ใช่แสงขาว —
     * ชั้นแกน/ลำแสงจึงย้อมสีออร่า (ผสมขาวแค่ให้สว่าง) และลด alpha ชั้นขาวลง */
    const drawFrame = (c: CanvasRenderingContext2D) => {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineJoin = 'round';
      clipOutsideArt(c); // ออร่าฟุ้งเข้ามาได้ แต่ห้ามทับช่องภาพ

      // ออร่าฟุ้ง: วาด 2 ครั้ง → แสงบวกกันสว่างขึ้น (additive)
      // ใช้ source-over (ไม่ lighter) → สีตรงตาม spec.color ไม่ถูกบวกจนขาว
      // ชั้นนี้คือ "พื้นหลัง" — alpha ต่ำไว้ก่อน ให้แสงสีรูป (flow) เด่นกว่า
      c.globalCompositeOperation = 'source-over';
      c.shadowColor = spec.color;
      c.shadowBlur = spec.blur * blurK * 1.2;
      c.strokeStyle = spec.color;
      c.globalAlpha = Math.min(1, spec.alpha * 0.4 * k);
      c.lineWidth = spec.lineWidth * 0.9;
      c.beginPath();
      roundRect(c, 0);
      c.stroke();
      c.stroke();

      // แกนนีออน: สีออร่า + ไส้ขาวบาง → เห็นสีประจำระดับ ไม่ขาวทั้งเส้น
      c.shadowColor = spec.color;
      c.shadowBlur = spec.blur * blurK * 0.3;
      c.strokeStyle = spec.color;
      c.globalAlpha = Math.min(1, spec.alpha * 0.55 * k);
      c.lineWidth = Math.max(1.2, spec.lineWidth * 0.45);
      c.beginPath();
      roundRect(c, 0);
      c.stroke();
      // ไส้สว่างกลางเส้น: เส้นบาง + alpha ต่ำ → เห็นเป็น "ไส้นีออน" โดยสียังเป็นของระดับนั้น
      c.shadowBlur = 0;
      c.strokeStyle = '#ffffff';
      c.globalAlpha = spec.alpha * 0.2 * k;
      c.lineWidth = Math.max(1, spec.lineWidth * 0.18);
      c.beginPath();
      roundRect(c, 0);
      c.stroke();
      c.restore();
    };

    /** 2) ลำแสงไหลรอบขอบ (เส้นประเลื่อน) = "การไหลเหมือนน้ำ"
     * เส้นขยับเข้าจากกรอบ (FLOW_INSET) → เงาฟุ้งไม่หลุดขอบการ์ด
     * สี = สีรูปการ์ดใบนั้น (flowColor เก็บจากภาพจริง · fallback = สีระดับ) */
    const drawFlowDash = (time: number) => {
      ctx.save();
      // เส้นไหล = "พระเอก" (สีรูปการ์ดใบนั้น) → alpha/blur สูงกว่าชั้นพื้นหลัง
      ctx.globalCompositeOperation = 'source-over';
      clipOutsideArt(ctx, FLOW_INSET); // ตัดเงาฟุ้งไม่ให้ล้นขอบการ์ด (ผู้ใช้ติว่าหลุดขอบ)
      ctx.setLineDash(dash.dash);
      ctx.lineDashOffset = -time * dash.offsetPerSec;
      ctx.shadowColor = flowColor;
      ctx.shadowBlur = Math.min(spec.blur * blurK * 0.9, 18 * blurK);
      ctx.strokeStyle = flowColor;
      ctx.globalAlpha = Math.min(1, spec.alpha * 0.9 * k);
      ctx.lineWidth = spec.lineWidth * 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      roundRect(ctx, FLOW_INSET);
      ctx.stroke();
      // ไส้สว่างทับเส้นไหล → เห็นเป็นลำแสง ไม่ใช่เส้นทึบ
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = Math.min(1, spec.alpha * 0.5 * k);
      ctx.lineWidth = Math.max(1, spec.lineWidth * 0.4);
      ctx.beginPath();
      roundRect(ctx, FLOW_INSET);
      ctx.stroke();
      ctx.restore();
    };

    /** 3) อนุภาคไหลตามขอบ (หัวสว่าง + หางจางลง · สีเดียวกับลำแสง = สีรูปการ์ดใบนั้น) */
    const drawFlowParticles = (time: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      clipOutsideArt(ctx, FLOW_INSET); // ตัดเงาฟุ้งไม่ให้ล้นขอบการ์ด
      ctx.shadowColor = flowColor;
      ctx.shadowBlur = Math.min(spec.blur * blurK * 0.7, 14 * blurK);
      ctx.fillStyle = flowColor;
      // ⚠️ ประสิทธิภาพ (2026-09-25): รวมทุกอนุภาค+หางเป็น path เดียว → fill ครั้งเดียว (เดิม 5 ครั้ง/อนุภาค พร้อม blur)
      for (const p of flows) {
        const head = p.offset + time * p.speed;
        ctx.globalAlpha = spec.alpha * p.brightness * k;
        const pt = ringPointAt(geoFlow, head);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const tails = new Path2D();
      for (const p of flows) {
        const head = p.offset + time * p.speed;
        for (let i = 1; i <= 4; i += 1) {
          const back = ringPointAt(geoFlow, head - i * (p.radius * 2.4));
          tails.moveTo(back.x + p.radius * (1 - i * 0.18), back.y);
          tails.arc(back.x, back.y, p.radius * (1 - i * 0.18), 0, Math.PI * 2);
        }
      }
      ctx.globalAlpha = spec.alpha * k * 0.28;
      ctx.fill(tails);
      ctx.restore();
    };

    /**
     * 4) แถบแสงกวาดผ่านตัวแบบ (แสงสะท้อนบนโลหะ — จาก GIF อ้างอิง)
     * additive + ไล่เฉด "ขาวจาง" ⇒ สว่างขึ้นโดยไม่เปลี่ยนสีของภาพ (ต่างจาก color-dodge เดิม)
     */
    const drawArtSheen = (time: number) => {
      const band = sheenBand(time, orbit);
      if (band.alpha <= 0.01) return;
      const { art } = AURA_CARD;
      const bx = art.x + (band.x - band.w / 2) * art.w;
      const bw = Math.max(1, band.w * art.w);
      // ผู้ใช้ขอ "เลื่อม" แบบเนียน (ไม่ใช่วงรุ้ง) → เพิ่มความสว่างแถบกวาดเล็กน้อย
      const peak = Math.min(0.3, 0.13 * band.alpha * spec.alpha * k);
      if (peak <= 0.004) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      clipArt();
      const grad = ctx.createLinearGradient(bx, art.y, bx + bw, art.y + art.h);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${peak.toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(art.x, art.y, art.w, art.h);
      ctx.restore();
    };

    /**
     * วาดแถบแสง 1 เส้น — **วาดจาก "เส้นกลาง" ด้วย stroke ปลายมน + ไล่เฉด**
     *
     * ⚠️ ประวัติ (ผู้ใช้ติ 2026-09-25: "เส้นไม่สมูท ดูแข็ง ๆ เป็นท่อน ๆ เหมือนรถไฟ มากกว่าแสง"):
     *   · รุ่นก่อนรวมช่วงเป็น 6 กลุ่มแล้ว fill → เห็นเป็นท่อน (alpha กระโดดเป็นขั้น) + เหลี่ยมตามช่วง
     *   · รุ่นนี้สร้าง "เส้นกลาง" จากทุกช่วง (30 จุด) แล้ว **stroke ปลายมน/มุมมน**
     *     + ไล่เฉดตามแนวหัว→หาง ⇒ เนียนต่อเนื่อง ไม่มีเหลี่ยม/ไม่มีขั้น
     *   · ยังเร็ว: 4 stroke ต่อเส้น (เบลอแค่ครั้งเดียว) และไม่ต้อง fill ทีละช่วงอีก
     */
    const drawRibbon = (quads: RibbonQuad[]) => {
      if (quads.length < 2) return;
      const pts = ribbonCenterline(quads);
      if (pts.length < 2) return;
      const pathOf = (from: number, to: number) => {
        const p = new Path2D();
        const i0 = Math.max(0, Math.floor(from * (pts.length - 1)));
        const i1 = Math.min(pts.length - 1, Math.ceil(to * (pts.length - 1)));
        p.moveTo(pts[i0].x, pts[i0].y);
        for (let i = i0 + 1; i <= i1; i += 1) p.lineTo(pts[i].x, pts[i].y);
        return p;
      };
      const head = pts[0];
      const tail = pts[pts.length - 1];
      const rgb = hexToRgb(flowColor) ?? [255, 255, 255];
      const w = Math.max(2, quads[0].width);
      const idxAt = (t: number) => Math.max(0, Math.min(pts.length - 1, Math.round(t * (pts.length - 1))));
      const quadAt = (t: number) => quads[Math.max(0, Math.min(quads.length - 1, Math.round(t * (quads.length - 1))))];

      /**
       * เฉดที่ใช้ **alpha จริงของแต่ละช่วง** (จาก `quad.alpha` = ซองแสง+ความจางหัว→หาง)
       * ⇒ หัว/ท้ายของเส้นค่อย ๆ เฟดขึ้น/ลงตามเวลาจริง **ไม่กระพริบโผล่-หาย**
       * (บั๊กเดิม 2026-09-25: ชั้นฟุ้ง/ไส้ขาวใช้ alpha คงที่ → พอเส้นเกิด/ดับจะวาบเป็นท่อน)
       */
      const gradOf = (from: number, to: number, gain: number, white = false) => {
        const a0 = pts[idxAt(from)];
        const a1 = pts[idxAt(Math.max(from + 0.01, to))];
        const g = ctx.createLinearGradient(a0.x, a0.y, a1.x, a1.y);
        const steps = 8;
        for (let k = 0; k <= steps; k += 1) {
          const t = from + (to - from) * (k / steps);
          const a = Math.min(1, quadAt(t).alpha * gain);
          g.addColorStop(
            k / steps,
            white ? `rgba(255, 255, 255, ${a.toFixed(3)})` : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(3)})`
          );
        }
        return g;
      };

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // ① แสงฟุ้งรอบเส้น (เบลอครั้งเดียว) — alpha ไล่ตามซองแสงจริง ⇒ เฟดนุ่มทั้งตอนเกิด/ดับ
      ctx.shadowColor = flowColor;
      ctx.shadowBlur = Math.min(spec.blur * blurK, 14 * blurK);
      ctx.strokeStyle = gradOf(0, 1, orbit.alpha * k * 0.5);
      ctx.lineWidth = w * 1.6;
      ctx.stroke(pathOf(0, 1));

      // ② แกนกลาง: ซ้อนหลายความหนา (ปลายมนทุกช่วง + ไล่เฉดหัว→หาง)
      //    ⇒ ค่อย ๆ ผายหัว/เรียมหางแบบนุ่ม ไม่มีขั้นความหนาให้เห็นเป็น "ท่อน"
      ctx.shadowBlur = 0;
      const core = gradOf(0, 1, orbit.alpha * k * 0.95);
      const taper: ReadonlyArray<readonly [number, number, number]> = [
        [1, 0.32, 0.9], // [ไปถึงสัดส่วนไหน, ความหนา ×w, alpha]
        [0.72, 0.46, 0.5],
        [0.45, 0.66, 0.4],
        [0.22, 1, 0.32],
      ];
      for (const [to, wf, al] of taper) {
        ctx.globalAlpha = al;
        ctx.strokeStyle = core;
        ctx.lineWidth = Math.max(1.2, w * wf);
        ctx.stroke(pathOf(0, to));
      }
      ctx.globalAlpha = 1;

      // ③ ไส้ขาวที่ช่วงหัว → จุดสว่างสุดของแสง (ไล่เฉดตามซองแสงเหมือนกัน ⇒ ไม่วาบ)
      ctx.strokeStyle = gradOf(0, 0.12, orbit.alpha * k * 0.6, true);
      ctx.lineWidth = Math.max(1, w * 0.22);
      ctx.stroke(pathOf(0, 0.12));
      ctx.restore();
    };

    /**
     * 6) เกลียวแสงปีนขึ้น (helix streak) — แกนหลักของเอฟเฟกต์ (ตามตัวอย่างผู้ใช้ 2026-09-25)
     *   - **วนทั้งการ์ด** (ไม่ใช่แค่ในช่องภาพ) — ปีนจากขอบล่างถึงขอบบนของกรอบการ์ด
     *   - หลายเส้นพร้อมกัน (2–3 เส้น) ยาว/สั้น/สว่าง ไม่เท่ากัน · **คนละแกน/คนละฝั่ง/คนละทิศหมุน**
     *   - ค่อย ๆ ขึ้นและค่อย ๆ จาง (ไม่หายวับ) · ด้านหลังตัวแบบหรี่ลง
     */
    const drawSpiral = (time: number) => {
      const strands = spiralStrands(orbit, seed);
      if (!strands.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      clipCard();
      for (const strand of strands) {
        drawRibbon(spiralStreak(time, orbit, seed, strand, WISP_STEPS));
      }
      ctx.restore();
    };

    const render = (time: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // ขอบการ์ด = bitmap ที่แคชไว้ (นิ่ง) → blit ครั้งเดียว; ไม่มีแคช (ยังสร้างไม่เสร็จ) ก็วาดสด
      if (frameLayer) ctx.drawImage(frameLayer, 0, 0);
      // วาดใน "หน่วยการ์ด" — จุด (0,0) คือมุมการ์ดบนซ้ายตามที่ object-contain วาดการ์ดจริง
      // (fit คำนวณใน resize() → แสงเกาะเส้นกรอบการ์ดพอดีทุกหน้า แม้กล่องไม่ได้ 7:10 เป๊ะ)
      ctx.setTransform(fit.s, 0, 0, fit.s, fit.x, fit.y);
      if (!frameLayer) drawFrame(ctx);
      if (layers.flow) drawFlowDash(time);
      if (layers.particles) drawFlowParticles(time);
      // ชั้นในกรอบการ์ด (บันไดตามระดับ): RARE ขึ้นไปจึงมี "เลื่อมบนภาพ + เกลียว"
      if (layers.sheen) drawArtSheen(time);
      if (layers.spiral && orbit.enabled) drawSpiral(time); // เกลียวแสงวนทั้งการ์ด
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
      if (small || !visible || document.hidden) return;
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    // ---- ติดตั้งผู้สังเกตการณ์ก่อนเสมอ (แม้ตอน mount กล่องยังเล็ก/ยังไม่ layout ก็จะเริ่มวาดเมื่อพร้อม) ----
    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // การ์ดพ้นจอ → หยุดวาด · กลับเข้าจอ → วาดต่อ (rootMargin เผื่อให้แสงฟุ้งนอกการ์ดเตรียมไว้ก่อน)
    const observer = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) startLoop();
        else stopLoop();
      }, { rootMargin: '120px' })
      : null;
    observer?.observe(host);

    // กล่องเปลี่ยนขนาด → วัดใหม่ + วาดซ้ำ (การ์ดโตจาก <120px → เริ่มอนิเมตได้)
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        if (!resize()) return;
        flowColor = sampleArtColor(); // รูปโหลดทีหลัง → เก็บสีใหม่แล้ววาดซ้ำ
        if (fixedTime !== undefined) render(fixedTime); // ภาพแช่เวลา (ถ่ายภาพเทียบดีไซน์)
        else if (!running) render(t);
        startLoop();
      })
      : null;
    ro?.observe(host);

    if (resize()) {
      flowColor = sampleArtColor();
      // รูปการ์ดโหลดทีหลัง canvas → ลองเก็บสีอีกรอบเมื่อ <img> โหลดเสร็จ
      const artImg = host.querySelector('img[alt=""]') as HTMLImageElement | null;
      if (artImg && !artImg.complete) {
        artImg.addEventListener('load', () => {
          flowColor = sampleArtColor();
          if (fixedTime !== undefined) render(fixedTime);
          else if (!running) render(t);
        }, { once: true });
      }
      if (fixedTime !== undefined) {
        render(fixedTime); // ภาพนิ่ง ณ เวลาที่กำหนด (ใช้ถ่ายภาพเทียบดีไซน์)
      } else if (reduceMotion) {
        render(1.2); // แสงนิ่ง (ยังสวย ไม่ขยับ)
      } else {
        render(0);
        startLoop();
      }
    }

    return () => {
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      ro?.disconnect();
    };
  }, [rarity, seed, reduceIntense]);

  return <canvas ref={ref} aria-hidden className={`card-aura-canvas ${className}`.trim()} />;
}

