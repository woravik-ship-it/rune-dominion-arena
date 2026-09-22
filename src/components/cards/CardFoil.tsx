'use client';

import type { CSSProperties } from 'react';
import { foilSpec, foilStyle } from '@/lib/card-foil';

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
    <div aria-hidden className="card-foil" style={style}>
      {/* ออร่าเรืองรอบขอบ (สไตล์ item ตีบวก MU Online) — ใต้ชั้นอื่นทุกชั้น */}
      <span className="card-foil__aura" />
      <span className="card-foil__tint" />
      {spec.prism && (
        <span className="card-foil__art" style={ART_WINDOW}>
          <span className="card-foil__prism" />
        </span>
      )}
      {spec.sweep && <span className="card-foil__sweep" />}
      {spec.sparkle && <span className="card-foil__sparkle" />}
    </div>
  );
}
