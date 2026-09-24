// card-canvas.ts — เอฟเฟกต์แสงการ์ดด้วย **Canvas 2D** (ตามคำสั่งผู้ใช้ 2026-09-24)
//
// ทำไมเปลี่ยนจาก SVG/CSS มาเป็น Canvas (ผู้ใช้สั่ง):
//   "เขียนทับด้วยระบบพิกัด 2D ธรรมดา จะใช้คุณสมบัติการเรืองแสงและการเบลอของ Canvas
//    ctx.globalCompositeOperation = 'lighter' ... ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff';
//    เพื่อสร้างออร่ารอบตัวการ์ด"
// ข้อดีจริงของ Canvas ที่ SVG/CSS ทำไม่ได้:
//   - `shadowBlur` ให้แสงฟุ้งแบบ "นีออน" ในคำสั่งเดียว และซ้อนทับกันได้ไม่จำกัดชั้น
//   - `globalCompositeOperation='lighter'` = บวกแสงแบบ additive จริง (สีสว่างขึ้นเมื่อทับกัน)
//   - วาดอนุภาค (ประกาย/เปลว/การไหล) ได้ในลูปเดียว โดยไม่ต้องสร้าง DOM/SVG node ต่ออนุภาค
//
// ⚠️ โมดูลนี้เป็น "pure" (ไม่แตะ DOM/canvas จริง) → เทสต์ได้ และคอมโพเนนต์ใช้ค่าชุดเดียวกัน
//    หน่วยทั้งหมดเป็น "หน่วยการ์ด" 420×600 (ตรงกับ AURA_CARD ใน card-aura.ts)

import { AURA_CARD, auraSpec } from '@/lib/card-aura';
import { foilHash } from '@/lib/card-foil';

// ===== สเปกแสงนีออนตามระดับความหายาก =====
export interface NeonSpec {
  enabled: boolean;
  /** สีออร่า (ctx.shadowColor) */
  color: string;
  /** สีแกนเส้น (สว่างกว่า → เห็นเป็นเส้นนีออน) */
  core: string;
  /** ความเบลอของออร่า (ctx.shadowBlur) — หน่วยการ์ด */
  blur: number;
  /** ความหนาเส้น (ctx.lineWidth) */
  lineWidth: number;
  /** ช่วงแสงที่ไหล [ติด, ดับ] ตามความยาวเส้นรอบการ์ด */
  dash: [number, number];
  /** ความเร็วการไหล (หน่วยการ์ด/วินาที) */
  flowSpeed: number;
  /** จำนวนอนุภาคที่ไหลตามขอบ */
  flowCount: number;
  /** จำนวนเปลวไฟที่ลุกขึ้นจากขอบล่าง */
  flameCount: number;
  /** คาบการเกิดเปลว (วินาที) */
  flameSec: number;
  /** ความเข้มรวม 0–1 (ตัวคูณ alpha ของทุกชั้น) */
  alpha: number;
  /** ค่าความเข้มของแสงตามระดับ (ใช้คูณเพิ่มความสว่างเส้น) */
  intensity: number;
}

const NO_NEON: NeonSpec = {
  enabled: false, color: '#9ca3af', core: '#ffffff', blur: 0, lineWidth: 0,
  dash: [0, 1], flowSpeed: 0, flowCount: 0, flameCount: 0, flameSec: 0, alpha: 0, intensity: 0,
};

/** สีออร่า/แกน ตามระดับความหายาก (ตรงกับ AURA_SPECS ของดีไซน์ SVG) */
export function neonSpec(rarity?: string | null): NeonSpec {
  const spec = auraSpec(rarity);
  if (spec.tier === 'NONE' || spec.intensity <= 0) return NO_NEON;
  return {
    enabled: true,
    color: spec.edge,
    core: spec.core,
    // shadowBlur ยิ่งสูงยิ่งฟุ้ง: RARE 14 → MYTHIC 26 (หน่วยการ์ด, scale ตามขนาดการ์ดจริงตอนวาด)
    blur: 12 + spec.intensity * 14,
    lineWidth: 2.6 + spec.intensity * 2.6,
    dash: [0, 0], // เติมค่าจริงใน ringDash()
    flowSpeed: 70 + spec.intensity * 90,
    flowCount: 4 + Math.round(spec.intensity * 8),
    flameCount: 6 + Math.round(spec.intensity * 8),
    flameSec: spec.sparkSec,
    alpha: 0.5 + spec.intensity * 0.5,
    intensity: spec.intensity,
  };
}

/** TRUE = ระดับนี้ต้องวาดเอฟเฟกต์ (COMMON/UNCOMMON = การ์ดธรรมดา ไม่วาด) */
export function neonEnabled(rarity?: string | null): boolean {
  return neonSpec(rarity).enabled;
}

// ===== อนุภาค (deterministic จาก seed ของการ์ดใบนั้น) =====
export interface FlowParticle {
  /** ระยะตามเส้นรอบการ์ด (หน่วยการ์ด) */
  offset: number;
  /** ความเร็ว (หน่วยการ์ด/วินาที) */
  speed: number;
  /** รัศมี (หน่วยการ์ด) */
  radius: number;
  /** ความสว่าง 0–1 */
  brightness: number;
}

/**
 * อนุภาค "ไหลตามขอบการ์ด" (เหมือนน้ำไหล / พลังงานวิ่ง)
 * กระจายระยะให้ทั่วเส้นรอบ + ความเร็ว/ขนาดต่างกัน (deterministic ต่อใบ)
 */
export function flowParticles(seed: string, count: number, length: number, baseSpeed: number): FlowParticle[] {
  if (count <= 0 || length <= 0) return [];
  const out: FlowParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = foilHash(`${seed}~flow#${i}`);
    const slot = length / count;
    const jitter = (h % 1000) / 1000 - 0.5;
    out.push({
      offset: slot * (i + 0.5) + jitter * slot * 0.8,
      speed: baseSpeed * (0.75 + (((h >>> 9) % 100) / 100) * 0.6),
      radius: 1.6 + (((h >>> 15) % 100) / 100) * 2.4,
      brightness: 0.45 + (((h >>> 21) % 100) / 100) * 0.55,
    });
  }
  return out;
}

export interface FlameParticle {
  /** ตำแหน่งฐานบนขอบล่าง (หน่วยการ์ด) */
  x: number;
  /** ความสูงที่ลุกขึ้น (หน่วยการ์ด) */
  height: number;
  /** ความกว้างของเปลว */
  width: number;
  /** ความเร็วการเกิด–ดับ (วินาที) */
  lifeSec: number;
  /** หน่วงเวลาเริ่ม (0–1 ของคาบ) */
  phase: number;
  /** การแกว่งซ้าย–ขวา (หน่วยการ์ด) */
  sway: number;
  /** เอียงฐาน (องศา) */
  tiltDeg: number;
}

/**
 * เปลวไฟที่ลุกขึ้นจากขอบล่าง (อยู่บนวงแหวนขอบการ์ดเท่านั้น)
 * ใช้ชีวิตเป็นคาบ (phase ต่างกันไป) → ดูเป็นไฟลุกต่อเนื่องโดยไม่ต้องมี state ในลูป
 */
export function flameParticles(seed: string, count: number): FlameParticle[] {
  if (count <= 0) return [];
  const { frame } = AURA_CARD;
  const out: FlameParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = foilHash(`${seed}~flame#${i}`);
    const slot = frame.w / count;
    const jitter = (h % 1000) / 1000 - 0.5;
    out.push({
      x: frame.x + slot * (i + 0.5) + jitter * slot * 0.7,
      height: 10 + (((h >>> 9) % 100) / 100) ** 1.3 * 18, // 10–28 (ในวงแหวนขอบการ์ด)
      width: 5 + (((h >>> 15) % 100) / 100) * 9,
      lifeSec: 0.9 + (((h >>> 5) % 100) / 100) * 1.5,
      phase: ((h >>> 17) % 1000) / 1000,
      sway: 1.5 + (((h >>> 23) % 100) / 100) * 3.5,
      tiltDeg: (((h >>> 27) % 15) - 7) * 1.2,
    });
  }
  return out;
}

/** ช่วงแสงที่ไหลบนเส้นรอบการ์ด — ยิ่งระดับสูง ช่วงแสงยิ่งสั้น/คมขึ้น */
export function ringDash(spec: NeonSpec, geo: RingGeometry): { dash: [number, number]; offsetPerSec: number } {
  const on = geo.length * (0.12 + spec.intensity * 0.1);
  return { dash: [on, geo.length - on], offsetPerSec: spec.flowSpeed };
}

/** ค่าปลอดภัยของเวลา (คาบการวนของอนิเมชัน) — ใช้เทสต์ว่าค่าไม่เป็น NaN */
export function normalizeTime(seconds: number, periodSec: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(periodSec) || periodSec <= 0) return 0;
  return ((seconds % periodSec) + periodSec) % periodSec;
}

export interface RingGeometry {
  x: number; y: number; w: number; h: number; r: number;
  /** ความยาวเส้นรอบทั้งหมด (หน่วยการ์ด) */
  length: number;
}

/** เส้นรอบกรอบการ์ด (มุมโค้ง) — ใช้ค่าเดียวกับ AURA_CARD.frame */
export function ringGeometry(): RingGeometry {
  const { frame } = AURA_CARD;
  const straight = 2 * (frame.w - 2 * frame.r) + 2 * (frame.h - 2 * frame.r);
  return { ...frame, length: straight + 2 * Math.PI * frame.r };
}

/**
 * จุดบนเส้นรอบการ์ดที่ระยะ `distance` (หน่วยการ์ด) จากมุมบนซ้าย (เดินตามเข็มนาฬิกา)
 * ใช้ทั้งการวาดอนุภาคที่ไหล และการวางเปลวไฟตามขอบ
 * (คณิตศาสตร์ล้วน → เทสต์ได้ว่าเดินครบรอบแล้วกลับจุดเดิม)
 */
export function ringPointAt(geo: RingGeometry, distance: number): { x: number; y: number; angleDeg: number } {
  const { x, y, w, h, r } = geo;
  let d = ((distance % geo.length) + geo.length) % geo.length;

  const topLen = w - 2 * r;
  const rightLen = h - 2 * r;
  const bottomLen = topLen;
  const leftLen = rightLen;
  const quarter = (Math.PI * r) / 2;

  // 1) ขอบบน (ซ้าย → ขวา)
  if (d <= topLen) return { x: x + r + d, y, angleDeg: 0 };
  d -= topLen;
  // 2) มุมบนขวา
  if (d <= quarter) {
    const a = -90 + (d / quarter) * 90;
    return { x: x + w - r + r * Math.cos((a * Math.PI) / 180), y: y + r + r * Math.sin((a * Math.PI) / 180), angleDeg: a + 90 };
  }
  d -= quarter;
  // 3) ขอบขวา (บน → ล่าง)
  if (d <= rightLen) return { x: x + w, y: y + r + d, angleDeg: 90 };
  d -= rightLen;
  // 4) มุมล่างขวา
  if (d <= quarter) {
    const a = 0 + (d / quarter) * 90;
    return { x: x + w - r + r * Math.cos((a * Math.PI) / 180), y: y + h - r + r * Math.sin((a * Math.PI) / 180), angleDeg: a + 90 };
  }
  d -= quarter;
  // 5) ขอบล่าง (ขวา → ซ้าย)
  if (d <= bottomLen) return { x: x + w - r - d, y: y + h, angleDeg: 180 };
  d -= bottomLen;
  // 6) มุมล่างซ้าย
  if (d <= quarter) {
    const a = 90 + (d / quarter) * 90;
    return { x: x + r + r * Math.cos((a * Math.PI) / 180), y: y + h - r + r * Math.sin((a * Math.PI) / 180), angleDeg: a + 90 };
  }
  d -= quarter;
  // 7) ขอบซ้าย (ล่าง → บน)
  if (d <= leftLen) return { x, y: y + h - r - d, angleDeg: 270 };
  d -= leftLen;
  // 8) มุมบนซ้าย
  const a = 180 + (d / quarter) * 90;
  return { x: x + r + r * Math.cos((a * Math.PI) / 180), y: y + r + r * Math.sin((a * Math.PI) / 180), angleDeg: a + 90 };
}
