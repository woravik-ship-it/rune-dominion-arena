'use client';

import { useEffect, useRef, useState } from 'react';
import { easeOutCubic, lerpSeries } from '@/lib/deck-formation';

/**
 * ไล่ค่าตัวเลขของกราฟให้ "วิ่งเข้าที่" ด้วย requestAnimationFrame
 * — ใช้ทั้งเส้นเชื่อมวงกลมและรูปหกเหลี่ยม เพื่อให้ผู้ใช้เห็นกราฟขยับทันทีตอนการ์ดเข้า/ออก
 *
 * หลักการ: เก็บค่าล่าสุดไว้ใน ref (ไม่ใช่ state) จึงไล่จาก "ค่าที่เห็นอยู่จริง" ได้เสมอ
 * แม้ผู้ใช้จะสลับการ์ดถี่ๆ กลางอนิเมชัน — และเคารพ `prefers-reduced-motion`
 * (ผู้ใช้ที่ปิดอนิเมชันจะเห็นค่าใหม่ทันที ไม่มีอาการกะพริบ)
 */
export function useSmoothNumbers(target: readonly number[], duration = 520): number[] {
  const [values, setValues] = useState<number[]>(() => [...target]);
  const latest = useRef<number[]>([...target]);
  const key = target.join(',');

  useEffect(() => {
    const to = key === '' ? [] : key.split(',').map(Number);
    const from = latest.current;

    const settle = (next: number[]) => {
      latest.current = next;
      setValues(next);
    };

    if (from.length !== to.length) {
      settle(to);
      return;
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ค่าไม่เปลี่ยนเลย → ไม่ต้องเปิดลูป rAF (ประหยัดพลังงาน)
    const same = to.every((value, i) => value === from[i]);
    if (reduceMotion || same || typeof window === 'undefined') {
      settle(to);
      return;
    }

    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = duration <= 0 ? 1 : (now - startedAt) / duration;
      const eased = easeOutCubic(progress);
      const next = lerpSeries(from, to, eased);
      latest.current = next;
      setValues(next);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        settle(to);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // key = ค่าเป้าหมายที่ต่อกันแล้ว → เปลี่ยนเมื่อค่าจริงเปลี่ยนเท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return values;
}
