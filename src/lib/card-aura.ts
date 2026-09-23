// ชั้น "แสงเรืองแบบไอเทมตีบวก" (item upgrade glow — สไตล์ MU Online) ครอบบนการ์ด
//
// ประวัติ (สำคัญ — ห้ามทำซ้ำของเดิม):
//   1. aura box-shadow รอบขอบ → ดูเป็น "กรอบสี่เหลี่ยม" ไม่มีแสง (ผู้ใช้ปฏิเสธ)
//   2. เปลวไฟ 9 ลูกกระพริบรอบขอบ → ผู้ใช้บอก "พอๆ ไม่ได้" (ถูก revert ทั้งหมด)
//   ดู docs/FOIL_STATUS.md
//
// แนวทางรอบนี้ (ต่างจากของเดิมโดยสิ้นเชิง):
//   - **ไม่ใช้ box-shadow / ไม่ใช้ลูกเปลวไฟ** → วาดด้วย SVG glow จริง (`feGaussianBlur` + gradient)
//     ข้อดี: สเกลตามขนาดการ์ดทุกขนาด (ไม่แตกเป็น px), เงาไม่จืดแบบ box-shadow,
//     และ "แสงเกาะรูปทรงการ์ด" (rounded rect) เหมือนแสงเกาะไอเทมใน MU จริง
//   - 4 องค์ประกอบ: bloom (แสงเรืองเกาะขอบ) · flare (ประกายดาว 4 แฉก) · pillar (เสาแสงแนวตั้ง) · sparks (ประกายลอยขึ้น)
//   - 5 ดีไซน์ให้เลือก (`AuraVariant`) เพื่อให้ผู้ใช้ตัดสินจากภาพจริงก่อนนำไปใช้ทุกหน้า
//   - deterministic 100% ต่อการ์ดใบนั้น (ใช้ `foilHash` ร่วมกับชั้นแสงเลื่อม) — ไม่มีการสุ่มตอน render
//   - โมดูลนี้เป็น pure module (ไม่ import React) → คอมโพเนนต์และเทสต์ใช้กติกาเดียวกัน

import { foilHash } from '@/lib/card-foil';

// ===== ระดับ "ตีบวก" (เทียบเคียง MU Online: ยิ่งสูงยิ่งเรือง) =====
export type AuraTier = 'NONE' | 'PLUS7' | 'PLUS9' | 'PLUS11' | 'PLUS13';

/** ดีไซน์แสงที่ผู้ใช้เลือกได้ */
export type AuraVariant = 'tier' | 'bloom' | 'radiant' | 'ascend' | 'inner';

export const AURA_VARIANTS: AuraVariant[] = ['tier', 'bloom', 'radiant', 'ascend', 'inner'];

/**
 * ดีไซน์ที่ใช้จริงบนการ์ดทุกหน้า (ผู้ใช้เลือกจากภาพจริง 2026-09-23: "ลองทำแบบ inner")
 *
 * ทำไมเลือก `inner`:
 *  - ตัดแสงให้อยู่ในกรอบการ์ด → **ไม่ต้องแก้ layout/overflow ของหน้าไหนเลย**
 *    (กล่องการ์ดในหน้าจริงมี `overflow-hidden` หลายที่ ซึ่งจะตัดแสงของดีไซน์นอกกรอบทิ้ง)
 *  - ยังได้ครบทั้งขอบเรือง + ประกายดาวกลางภาพ + ประกายลอยขึ้น
 *
 * เปลี่ยนดีไซน์ทั้งเกมได้ที่จุดเดียวนี้ (CardFace ใช้ค่านี้เป็นค่าตั้งต้น)
 */
export const DEFAULT_AURA_VARIANT: AuraVariant = 'inner';


export interface AuraSpec {
  /** ระดับเทียบเคียง MU (+7 = เริ่มเรือง, +13 = สว่างสุด) */
  tier: AuraTier;
  /** ความเข้มรวม 0–1 — เป็นตัวคูณ opacity ของทุกชั้น */
  intensity: number;
  /** สีแกนแสง (ติดกับขอบการ์ด) */
  core: string;
  /** สีวงแสงด้านนอก */
  edge: string;
  /** คาบการ "หายใจ" ของแสง (วินาที) */
  breatheSec: number;
  /** คาบการหมุนของประกายดาว (วินาที) */
  flareSec: number;
  /** คาบการไหลขึ้นของเสาแสง (วินาที) */
  pillarSec: number;
  /** คาบการลอยของประกาย (วินาที) */
  sparkSec: number;
  /** จำนวนประกายที่ลอยขึ้น */
  sparkCount: number;
}

/** ค่าตั้งต้นของระดับที่ไม่มีแสง = การ์ดธรรมดา */
const NO_AURA: AuraSpec = {
  tier: 'NONE',
  intensity: 0,
  core: '#ffffff',
  edge: '#9ca3af',
  breatheSec: 0,
  flareSec: 0,
  pillarSec: 0,
  sparkSec: 0,
  sparkCount: 0,
};

/**
 * กติกาแสงเรืองตามระดับความหายาก
 * ใช้สีเดียวกับกรอบการ์ด (image-placeholder.ts: RARITY_FRAME) และชั้นแสงเลื่อม (card-foil.ts)
 * เพื่อไม่ให้ภาพรวมของเกมขัดกันเอง
 *   COMMON/UNCOMMON = ไม่มีแสง (การ์ดธรรมดาต้องเรียบ — กติกาเดิมของผู้ใช้)
 *   RARE = +7 (ฟ้าเงิน) · EPIC = +9 (ม่วง) · LEGENDARY = +11 (ทอง) · MYTHIC = +13 (ชมพู-ทอง สว่างสุด)
 */
export const AURA_SPECS: Record<string, AuraSpec> = {
  COMMON: NO_AURA,
  UNCOMMON: { ...NO_AURA, core: '#f0fdf4', edge: '#86efac' },
  RARE: {
    tier: 'PLUS7',
    intensity: 0.5,
    core: '#ffffff',
    edge: '#93c5fd',
    breatheSec: 4.6,
    flareSec: 26,
    pillarSec: 7.5,
    sparkSec: 5.4,
    sparkCount: 4,
  },
  EPIC: {
    tier: 'PLUS9',
    intensity: 0.68,
    core: '#fff6d8',
    edge: '#c084fc',
    breatheSec: 3.9,
    flareSec: 22,
    pillarSec: 6.6,
    sparkSec: 4.8,
    sparkCount: 6,
  },
  LEGENDARY: {
    tier: 'PLUS11',
    intensity: 0.86,
    core: '#fffbe8',
    edge: '#f5c451',
    breatheSec: 3.3,
    flareSec: 18,
    pillarSec: 5.8,
    sparkSec: 4.2,
    sparkCount: 8,
  },
  MYTHIC: {
    tier: 'PLUS13',
    intensity: 1,
    core: '#ffffff',
    edge: '#f0abfc',
    breatheSec: 2.8,
    flareSec: 15,
    pillarSec: 5,
    sparkSec: 3.6,
    sparkCount: 10,
  },
};

/** กติกาแสงของระดับนั้น (ไม่สนตัวพิมพ์เล็ก/ใหญ่ · ค่าที่ไม่รู้จัก → COMMON = ไม่มีแสง) */
export function auraSpec(rarity?: string | null): AuraSpec {
  const key = (rarity ?? '').toUpperCase();
  return AURA_SPECS[key] ?? NO_AURA;
}

/** ระดับนี้มีแสงเรืองหรือไม่ */
export function auraEnabled(rarity?: string | null): boolean {
  return auraSpec(rarity).tier !== 'NONE';
}

/** องค์ประกอบแสงที่จะถูกวาดจริง */
export interface AuraLayers {
  halo: boolean;
  flare: boolean;
  pillar: boolean;
  sparks: boolean;
  /** true = ตัดแสงให้อยู่ "ในกรอบการ์ด" (ใช้ในกล่องที่มี overflow-hidden) */
  clip: boolean;
}

const NO_LAYERS: AuraLayers = { halo: false, flare: false, pillar: false, sparks: false, clip: false };

/** บันไดของระดับ "ตีบวก" — ยิ่งสูงยิ่งมีองค์ประกอบเพิ่ม (ใช้กับดีไซน์ `tier`) */
export function tierLayers(rarity?: string | null): AuraLayers {
  switch (auraSpec(rarity).tier) {
    case 'PLUS7':
      return { halo: true, flare: false, pillar: false, sparks: false, clip: false };
    case 'PLUS9':
      return { halo: true, flare: true, pillar: false, sparks: false, clip: false };
    case 'PLUS11':
      return { halo: true, flare: true, pillar: true, sparks: false, clip: false };
    case 'PLUS13':
      return { halo: true, flare: true, pillar: true, sparks: true, clip: false };
    default:
      return NO_LAYERS;
  }
}

/** ดีไซน์ที่ผู้ใช้เลือก → องค์ประกอบที่จะวาด (ดีไซน์เป็นตัวตัดสิน · ระดับเป็นตัวคุมความเข้ม/จังหวะ) */
export function auraLayers(variant: AuraVariant, rarity?: string | null): AuraLayers {
  if (!auraEnabled(rarity)) return NO_LAYERS;
  switch (variant) {
    case 'tier':
      return tierLayers(rarity);
    case 'bloom':
      return { halo: true, flare: false, pillar: false, sparks: false, clip: false };
    case 'radiant':
      return { halo: true, flare: true, pillar: false, sparks: false, clip: false };
    case 'ascend':
      return { halo: true, flare: false, pillar: true, sparks: true, clip: false };
    case 'inner':
      // ตัดแสงให้อยู่ในกรอบการ์ด → ปลอดภัยกับกล่องที่ overflow-hidden (ไม่ต้องแก้ layout หน้าไหน)
      // flare (ประกายดาว) ถูกถอดออก — ผู้ใช้รีวิวบนการ์ดจริง 2026-09-23: "ประกายดาวไม่เหมาะเลย"
      return { halo: true, flare: false, pillar: false, sparks: true, clip: true };
    default:
      return NO_LAYERS;
  }
}

/** เกณฑ์ความเข้มที่ผู้ใช้เลือก "ลดเอฟเฟกต์รุนแรง" (หน้าตั้งค่า) → ลดความเข้มลงครึ่ง */
export const REDUCE_INTENSE_SCALE = 0.5;

// ===== เรขาคณิตของการ์ด (ตรงกับ image-placeholder.ts) =====
/** ผืนการ์ด 420×600 · กรอบ FRAME = 8,8 404×584 r=22 · ช่องภาพ ART = 24,106 372×222 */
export const AURA_CARD = {
  width: 420,
  height: 600,
  frame: { x: 8, y: 8, w: 404, h: 584, r: 22 },
  art: { x: 24, y: 106, w: 372, h: 222, r: 10 },
} as const;

/** มุมโค้งของกรอบเป็นเปอร์เซ็นต์ (กว้าง/สูง) — ใช้กับ `border-radius` ของกล่อง host */
export const AURA_RADIUS = '5.45% / 3.77%';

/** ขอบเขตที่แสงล้นออกนอกการ์ดได้ (เปอร์เซ็นต์ของกล่องการ์ด) — ต้องมีที่ให้แสงเรืองออก */
export const AURA_BLEED_PERCENT = 12;

/** viewBox/inset ของ SVG — โหมดนอกกรอบ (แสงล้นได้) กับโหมดในกรอบ (clip) */
export function auraGeometry(clip: boolean): { inset: string; viewBox: string } {
  if (clip) {
    return { inset: '0', viewBox: `0 0 ${AURA_CARD.width} ${AURA_CARD.height}` };
  }
  const dx = (AURA_CARD.width * AURA_BLEED_PERCENT) / 100;
  const dy = (AURA_CARD.height * AURA_BLEED_PERCENT) / 100;
  return {
    inset: `-${AURA_BLEED_PERCENT}%`,
    viewBox: `${-dx} ${-dy} ${AURA_CARD.width + dx * 2} ${AURA_CARD.height + dy * 2}`,
  };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** path ของสี่เหลี่ยมมุมโค้ง (หน่วย = user unit ของการ์ด) */
export function roundedRectPath(box: Box, radius: number): string {
  const r = Math.min(radius, box.w / 2, box.h / 2);
  const { x, y, w, h } = box;
  return [
    `M${x + r} ${y}`,
    `H${x + w - r}`,
    `A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}`,
    `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}

/**
 * path ของ "พื้นที่นอกกรอบ" = ขอบเขตใหญ่ ลบ รูตรงกลาง (ใช้กับ clip-rule="evenodd")
 *
 * ใช้ตัดแสงให้อยู่เฉพาะด้านนอกการ์ด → **การ์ดคม ไม่มีฝ้า** (บทเรียน Phase 14.9:
 * ผู้ใช้ไม่ชอบแสงที่ฟุ้งทับตัวภาพ — เดิมต้อง carve รูในชั้น tint ด้วย clip-path)
 */
export function outsideRectPath(outer: Box, hole: Box, holeRadius: number): string {
  const outerPath = roundedRectPath(outer, 0);
  const holePath = roundedRectPath(hole, holeRadius);
  return `${outerPath} ${holePath}`;
}

/** path สำหรับ clip ของชั้นแสง — นอกการ์ด / นอกช่องภาพ */
export function auraClipPaths(clip: boolean): { outsideCard: string; outsideArt: string } {
  const [vx, vy, vw, vh] = auraGeometry(clip).viewBox.split(' ').map(Number);
  const outer: Box = { x: vx, y: vy, w: vw, h: vh };
  const { frame, art } = AURA_CARD;
  return {
    outsideCard: outsideRectPath(outer, { x: frame.x, y: frame.y, w: frame.w, h: frame.h }, frame.r),
    outsideArt: outsideRectPath(outer, { x: art.x, y: art.y, w: art.w, h: art.h }, art.r),
  };
}

// ===== ความต่างของแสงต่อการ์ดแต่ละใบ (deterministic) =====
export interface AuraVariation {
  /** หน่วงเวลาเป็นวินาที (ค่าลบ = เริ่มกลางคาบ → เฟสต่างกันทั้งกระดาน) */
  delaySec: number;
  /** เอียงของประกายดาว (−14 ถึง +14 องศา) */
  tiltDeg: number;
  /** หมุนเฉดสีของแสง (−16 ถึง +16 องศา) */
  hueDeg: number;
}

/** ความต่างของแสงต่อการ์ดแต่ละใบ (คิดจาก seed — ปกติส่ง cardId) · deterministic 100% */
export function auraVariation(seed: string): AuraVariation {
  const hash = foilHash(seed);
  return {
    delaySec: ((hash >>> 4) % 120) / 10, // 0–11.9 วินาที
    tiltDeg: ((hash >>> 12) % 29) - 14, // −14 ถึง +14 องศา
    hueDeg: ((hash >>> 20) % 33) - 16, // −16 ถึง +16 องศา
  };
}

export interface AuraSpark {
  /** ตำแหน่ง x (หน่วยเดียวกับ viewBox) */
  x: number;
  /** ตำแหน่งเริ่มต้น y */
  y: number;
  /** รัศมี */
  r: number;
  /** หน่วงเวลา (วินาที) */
  delaySec: number;
  /** คาบการลอย (วินาที) */
  durSec: number;
}

/**
 * ประกายที่ลอยขึ้น — ตำแหน่ง/จังหวะมาจาก hash ของการ์ด (deterministic)
 * เกลี่ย x ให้ทั่วความกว้างการ์ด เพื่อไม่ให้กองอยู่ที่เดียว
 */
export function auraSparks(seed: string, count: number, sparkSec: number): AuraSpark[] {
  if (count <= 0) return [];
  const { x, w } = AURA_CARD.frame;
  const sparks: AuraSpark[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = foilHash(`${seed}#${i}`);
    // เกลี่ยเป็นช่วงเท่าๆ กัน + เบี่ยงเล็กน้อย → ทั่วทั้งความกว้างแต่ไม่เป็นแถวเป๊ะ
    const slot = w / count;
    const jitter = (h % 1000) / 1000 - 0.5;
    sparks.push({
      x: x + slot * (i + 0.5) + jitter * slot * 0.7,
      y: 500 + ((h >>> 10) % 90),
      r: 1.6 + (((h >>> 6) % 100) / 100) * 2.6,
      delaySec: ((h >>> 14) % 100) / 10,
      durSec: sparkSec * (0.8 + (((h >>> 18) % 100) / 100) * 0.5),
    });
  }
  return sparks;
}

/**
 * ค่า CSS custom properties ของชั้นแสง (ให้คอมโพเนนต์เอาไปใส่ใน `style`)
 * ใช้ชื่อตัวแปรเดียวกันทั้งหมด เพื่อให้ CSS ใน globals.css เป็นคนตัดสินหน้าตาจริง
 */
export function auraStyle(
  rarity?: string | null,
  seed = '',
  options: { reduceIntense?: boolean } = {}
): Record<string, string> {
  const spec = auraSpec(rarity);
  const variation = auraVariation(seed);
  const scale = options.reduceIntense ? REDUCE_INTENSE_SCALE : 1;
  return {
    '--aura-intensity': String(spec.intensity * scale),
    '--aura-core': spec.core,
    '--aura-edge': spec.edge,
    '--aura-breathe': `${spec.breatheSec}s`,
    '--aura-flare-dur': `${spec.flareSec}s`,
    '--aura-pillar-dur': `${spec.pillarSec}s`,
    '--aura-spark-dur': `${spec.sparkSec}s`,
    '--aura-delay': `-${variation.delaySec}s`,
    '--aura-tilt': `${variation.tiltDeg}deg`,
    '--aura-hue': `${variation.hueDeg}deg`,
  };
}

/** รหัสอ้างอิงของ SVG (gradient/filter) ต้องไม่ชนกับการ์ดใบอื่นในหน้าเดียวกัน */
export function auraUid(seed: string): string {
  const safe = seed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return `aura-${safe || 'card'}-${foilHash(seed).toString(36)}`;
}
