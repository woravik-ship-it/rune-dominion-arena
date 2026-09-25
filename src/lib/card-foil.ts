// ชั้น "แสงเลื่อม" (foil / holo overlay) ที่ครอบบนการ์ด — ระดับความหายากกำหนดความเข้ม
//
// ผู้ใช้กำหนด (2026-09-22): ต้องการเอฟเฟกต์แสงเลื่อมครอบบนการ์ดอีกชั้น โดย **ไม่เกี่ยวกับการเจนภาพ**
//  → ชั้นนี้เป็น CSS ล้วน (ไม่เรียก AI ไม่แตะไฟล์ภาพ) คอมโพเนนต์ `CardFoil` เป็นผู้วาด
//  → โมดูลนี้เป็น pure module (ไม่ import React) เพื่อให้คอมโพเนนต์และเทสต์ใช้กติกาเดียวกัน
//
// กติกาความหายาก (ให้ตรงกับกรอบการ์ดใน image-placeholder.ts: `RARITY_FRAME[].foil`):
//   COMMON / UNCOMMON = ไม่มีชั้นแสง (การ์ดธรรมดาต้องเรียบ) · RARE ขึ้นไป = มี และเข้มขึ้นตามระดับ

export type FoilTier = 'NONE' | 'SHEEN' | 'HOLO' | 'PRISMATIC';

export interface FoilSpec {
  /** ระดับของเอฟเฟกต์ (NONE = ไม่มีชั้นแสงเลย) */
  tier: FoilTier;
  /** ความเข้มรวม 0–1 — ใช้เป็นตัวคูณ opacity ของทุกชั้น */
  intensity: number;
  /** คาบการกวาดแสง (วินาที) — ค่าน้อย = เลื่อมไวขึ้น */
  sweepSec: number;
  /** คาบการหมุนวงรุ้งในช่องภาพ (วินาที) */
  prismSec: number;
  /** สีของชั้น tint [ต้น, ปลาย] */
  tint: [string, string];
  /** เปิดชั้นแสงกวาด (ทุกการ์ดที่ tier ไม่ใช่ NONE) */
  sweep: boolean;
  /** เปิดชั้นวงรุ้งในช่องภาพ */
  prism: boolean;
  /** เปิดชั้นประกายดาว */
  sparkle: boolean;
}

/** ค่าตั้งต้นของระดับที่ไม่รู้จัก = การ์ดธรรมดา (ไม่ใส่เอฟเฟกต์) */
const NO_FOIL: FoilSpec = {
  tier: 'NONE',
  intensity: 0,
  sweepSec: 0,
  prismSec: 0,
  tint: ['#9ca3af', '#4b5563'],
  sweep: false,
  prism: false,
  sparkle: false,
};

export const FOIL_SPECS: Record<string, FoilSpec> = {
  COMMON: NO_FOIL,
  UNCOMMON: { ...NO_FOIL, tint: ['#86efac', '#15803d'] },
  RARE: {
    tier: 'SHEEN',
    intensity: 0.48,
    sweepSec: 7.2,
    prismSec: 16,
    tint: ['#dbeafe', '#93c5fd'],
    sweep: true,
    // 2026-09-25 (แก้ 2): ผู้ใช้ติ "รุ้งเลื่อมไม่เอา ไม่เนียน สีเพี้ยน" → ปิด prism
    // "เลื่อม" ของ RARE ใช้แถบแสงกวาด (sweep) + แสงกวาดบนภาพจาก Canvas แทน
    prism: false,
    sparkle: false,
  },
  EPIC: {
    tier: 'HOLO',
    intensity: 0.66,
    sweepSec: 6,
    prismSec: 13,
    tint: ['#f3e8ff', '#a855f7'],
    sweep: true,
    prism: true,
    sparkle: false,
  },
  LEGENDARY: {
    tier: 'HOLO',
    intensity: 0.85,
    sweepSec: 4.8,
    prismSec: 10,
    tint: ['#fff7d6', '#e0b64a'],
    sweep: true,
    prism: true,
    sparkle: true,
  },
  MYTHIC: {
    tier: 'PRISMATIC',
    intensity: 1.0,
    sweepSec: 3.8,
    prismSec: 8,
    tint: ['#fff7cc', '#f0abfc'],
    sweep: true,
    prism: true,
    sparkle: true,
  },
};

/** กติกาแสงเลื่อมของระดับความหายากนั้น (ไม่สนตัวพิมพ์เล็ก/ใหญ่ · ค่าที่ไม่รู้จัก → COMMON) */
export function foilSpec(rarity?: string | null): FoilSpec {
  const key = (rarity ?? '').toUpperCase();
  return FOIL_SPECS[key] ?? NO_FOIL;
}

/** การ์ดระดับนี้มีชั้นแสงเลื่อมหรือไม่ */
export function foilEnabled(rarity?: string | null): boolean {
  const spec = foilSpec(rarity);
  return spec.sweep || spec.prism || spec.sparkle;
}

export interface FoilVariation {
  /** องศาของไล่เฉดแสง (แต่ละใบต่างกันเล็กน้อย → ไม่เลื่อมพร้อมกันทั้งกระดาน) */
  angleDeg: number;
  /** หน่วงเวลาเป็นวินาที (ใช้ค่าลบ = เริ่มกลางคาบ → เฟสต่างกัน) */
  delaySec: number;
  /** หมุนเฉดสีของวงรุ้ง (−20 ถึง +20 องศา) */
  hueDeg: number;
}

/** hash แบบ FNV-1a 32-bit (deterministic — seed เดิมได้ค่าเดิมเสมอ) */
export function foilHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** ความต่างของแสงต่อการ์ดแต่ละใบ (คิดจาก cardId) — deterministic 100% */
export function foilVariation(seed: string): FoilVariation {
  const hash = foilHash(seed);
  return {
    angleDeg: 96 + (hash % 25), // 96–120 องศา
    delaySec: ((hash >>> 8) % 100) / 10, // 0–9.9 วินาที
    hueDeg: ((hash >>> 16) % 41) - 20, // −20 ถึง +20 องศา
  };
}

/**
 * ค่า CSS custom properties ของชั้นแสงเลื่อม (ให้คอมโพเนนต์เอาไปใส่ใน `style`)
 * ใช้ชื่อตัวแปรเดียวกันทั้งหมด เพื่อให้ CSS ใน globals.css เป็นคนตัดสินหน้าตาจริง
 */
export function foilStyle(rarity?: string | null, seed = ''): Record<string, string> {
  const spec = foilSpec(rarity);
  const variation = foilVariation(seed);
  return {
    '--foil-intensity': String(spec.intensity),
    '--foil-angle': `${variation.angleDeg}deg`,
    '--foil-dur': `${spec.sweepSec}s`,
    '--foil-prism-dur': `${spec.prismSec}s`,
    '--foil-delay': `-${variation.delaySec}s`,
    '--foil-hue': `${variation.hueDeg}deg`,
    '--foil-tint-a': spec.tint[0],
    '--foil-tint-b': spec.tint[1],
  };
}
