'use client';

import type { CSSProperties } from 'react';
import { foilHash, foilSpec, foilStyle } from '@/lib/card-foil';

/** จำนวนเปลวไฟต่อการ์ด — ถูกพอไม่หนักเครื่อง (blur เป็น GPU-composited) */
const FLAME_COUNT = 9;

interface FlameInstance {
  x: number;       // % จากขอบซ้าย
  height: number;  // % ของความสูงการ์ด
  width: number;   // % ของความกว้างการ์ด
  dur: number;     // คาบกระพริบ (วินาที)
  delay: number;   // หน่วง (วินาที — ค่าลบเริ่มกลางคาบ)
  lean: number;    // องศารีบเทอม (ปลายเปลวเอียง)
  alt: boolean;    // สลับสี A/B ของระดับ
}

/** สุ่ม "เปลว" ต่อการ์ดแบบ deterministic (session เดิมได้เปลวเดิมเสมอ) */
function flameInstances(seed: string): FlameInstance[] {
  return Array.from({ length: FLAME_COUNT }, (_, i) => {
    const hash = foilHash(`${seed}:flame:${i}`);
    return {
      x: 2 + (hash % 90) - 4,                       // 2–92%
      height: 8 + ((hash >> 3) % 12),               // 8–20%
      width: 7 + ((hash >> 6) % 7),                 // 7–14%
      dur: 0.7 + ((hash >> 9) % 90) / 100,          // 0.7–1.6s
      delay: -(((hash >> 12) % 160) / 100),         // -1.6–0s
      lean: ((hash >> 5) % 21) - 10,                // −10–10 องศา
      alt: ((hash >> 11) & 1) === 1,
    };
  });
}

interface CardFoilProps {
  /** ระดับความหายากของการ์ด — เป็นตัวกำหนดความเข้มของแสง (ดู src/lib/card-foil.ts) */
  rarity?: string | null;
  /** ใช้สร้างความต่างของแสงต่อการ์ดแต่ละใบ (ปกติส่ง cardId) */
  seed?: string;
}

/**
 * ขอบการ์ดจริง (ตรงกับ `FRAME` ใน image-placeholder.ts: 8, 8, 404×584 บนผืน 420×600)
 * → คิดเป็นเปอร์เซ็นต์ของผืนการ์ด
 */
const CARD_FRAME = {
  left: '1.9%',
  top: '1.33%',
  width: '96.19%',
  height: '97.33%',
  borderRadius: '5.3%',
} as const;

/**
 * ช่องภาพ (ตรงกับ `ART`: 24, 106, 372×222) — คิดเป็นเปอร์เซ็นต์ของ **ขอบการ์ด** (ไม่ใช่ผืน 420×600)
 * เพราะชั้นแสงซ้อนอยู่ในกล่อง CARD_FRAME
 */
const ART_WINDOW = {
  left: '3.96%',
  top: '16.78%',
  width: '92.08%',
  height: '38.01%',
  borderRadius: '4%',
} as const;

/**
 * ชั้น "แสงเลื่อม" ครอบบนการ์ด — CSS ล้วน ไม่มีการเจนภาพ
 *
 * 4 ชั้น (เปิด/ปิดตามระดับความหายาก):
 *  1. tint      — เฉดสีตามระดับความหายาก (soft-light) ครอบทั้งใบ
 *  2. art prism — วงรุ้งหมุนในช่องภาพ (color-dodge) ทำให้ "ภาพ" เลื่อม
 *  3. sweep     — แถบแสงกวาดผ่านการ์ด (screen)
 *  4. sparkle   — ประกายดาว (เฉพาะ LEGENDARY/MYTHIC)
 *
 * ⚠️ คอมโพเนนต์นี้ `pointer-events: none` + `aria-hidden` เสมอ (ไม่กินคลิก ไม่รบกวน screen reader)
 * ⚠️ ต้องอยู่ในกล่องที่ `position: relative` เหมือน CardFace (เพราะทุกชั้นเป็น `absolute`)
 */
export default function CardFoil({ rarity, seed = '' }: CardFoilProps) {
  const spec = foilSpec(rarity);
  // ระดับล่าง (COMMON/UNCOMMON) ไม่มีชั้นแสงเลย → ไม่ต้อง render DOM เพิ่ม
  if (!spec.sweep && !spec.prism && !spec.sparkle) return null;

  const style = { ...CARD_FRAME, ...foilStyle(rarity, seed) } as unknown as CSSProperties;

  return (
    <div aria-hidden className="card-foil-wrap" style={style}>
      {/* ฐานออร่าเรืองรอบขอบ — อยู่ "นอก" กรอบตัด ฯ มันบึกบือนด้วย */}
      <span className="card-foil__aura" />
      {/* ชั้นเปลวไฟ (ไอเทมติดบวกแบบเปลวไฟ) — ทิ้งลอยรอบขอบ: ไฟกระพริบ สูงปลายไปมาแล้วเป็นรรีบเทอมต่อลูก เหมือนมีลม */}
      <span className="card-foil__flamefield">
        {flameInstances(seed).map((flame, i) => (
          <span
            key={i}
            className={`card-foil__flame ${flame.alt ? 'is-alt' : ''}`}
            style={{
              left: `${flame.x}%`,
              height: `${flame.height}%`,
              width: `${flame.width}%`,
              animationDuration: `${flame.dur}s`,
              animationDelay: `${flame.delay}s`,
              ['--flame-lean' as string]: `${flame.lean}deg`,
            }}
          />
        ))}
      </span>
      {/* ชั้นแสงด้านใน — ตัดที่ขอบการ์ด (overflow hidden) */}
      <div className="card-foil">
        <span className="card-foil__tint" />
        {spec.prism && (
          <span className="card-foil__art" style={ART_WINDOW}>
            <span className="card-foil__prism" />
          </span>
        )}
        {spec.sweep && <span className="card-foil__sweep" />}
        {spec.sparkle && <span className="card-foil__sparkle" />}
      </div>
    </div>
  );
}
