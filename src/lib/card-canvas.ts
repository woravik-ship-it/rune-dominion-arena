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
  const i = spec.intensity;
  return {
    enabled: true,
    color: spec.edge,
    core: spec.core,
    // shadowBlur ยิ่งสูงยิ่งฟุ้ง: UNCOMMON 15 → MYTHIC 26 (หน่วยการ์ด, scale ตามขนาดการ์ดจริง)
    blur: 10 + i * 16,
    lineWidth: 2.4 + i * 3,
    dash: [0, 0], // เติมค่าจริงใน ringDash()
    flowSpeed: 60 + i * 100,
    flowCount: 3 + Math.round(i * 9),
    flameCount: 6 + Math.round(i * 8),
    flameSec: spec.sparkSec,
    alpha: 0.42 + i * 0.55,
    intensity: i,
  };
}

/**
 * ชั้นที่จะวาดจริงตามระดับความหายาก (บันไดเอฟเฟกต์ — ผู้ใช้สั่ง 2026-09-25)
 *
 * *"Uncommon อาจจะมีแค่วิ่งรอบอย่างเดียว · Rare มีเลื่อมๆ มีวนนิดๆ · Epic จัดเต็ม"*
 *   · COMMON   = ไม่มีอะไรเลย (การ์ดธรรมดา ไม่ต้องมี canvas)
 *   · UNCOMMON = ออร่าขอบ + ลำแสงไหลรอบขอบ ("วิ่งรอบอย่างเดียว")
 *   · RARE     = + อนุภาค + แถบแสงกวาด (เลื่อมบนภาพ) + เกลียว 2 เส้น (วนนิด ๆ)
 *   · EPIC     = + เกลียว 4 เส้น (จัดเต็ม)
 *   · LEG/MT   = 5–6 เส้น + ทุกชั้นความเข้มสูงสุด
 */
export interface NeonLayers {
  /** ออร่านีออนรอบกรอบการ์ด (ชั้นฐาน — ถ้าปิด = ไม่ต้องวาดอะไรเลย) */
  frame: boolean;
  /** ลำแสงไหลรอบขอบการ์ด */
  flow: boolean;
  /** อนุภาคไหลตามขอบ (มีหาง) */
  particles: boolean;
  /** เกลียวแสงวนทั้งการ์ด */
  spiral: boolean;
  /** แถบแสงกวาดบนตัวแบบ (แสงสะท้อน = เลื่อมบนภาพ) */
  sheen: boolean;
}

const NO_NEON_LAYERS: NeonLayers = {
  frame: false, flow: false, particles: false, spiral: false, sheen: false,
};

export function neonLayers(rarity?: string | null): NeonLayers {
  const tier = auraSpec(rarity).tier;
  switch (tier) {
    case 'PLUS5': // UNCOMMON — วิ่งรอบอย่างเดียว
      return { frame: true, flow: true, particles: false, spiral: false, sheen: false };
    case 'PLUS7': // RARE — มีเลื่อม + วนนิด ๆ
      return { frame: true, flow: true, particles: true, spiral: true, sheen: true };
    case 'PLUS9': // EPIC — จัดเต็ม
    case 'PLUS11':
    case 'PLUS13':
      return { frame: true, flow: true, particles: true, spiral: true, sheen: true };
    default:
      return NO_NEON_LAYERS;
  }
}

/** TRUE = ระดับนี้ต้องวาดเอฟเฟกต์ (COMMON = การ์ดธรรมดา ไม่วาด) */
export function neonEnabled(rarity?: string | null): boolean {
  return neonLayers(rarity).frame;
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

/**
 * ช่วงแสงที่ไหลบนเส้นรอบการ์ด — **หลายช่วงพร้อมกัน** (แบบน้ำไหลรอบการ์ด)
 * ระดับยิ่งสูง ยิ่งมีช่วงถี่ขึ้น และช่วงละยิ่งยาวขึ้น
 * (รุ่นก่อนมีช่วงสว่างเดี่ยว 1 ช่วง/รอบ → เห็นเป็น "โชน์วิ่งจอดเดียว" ไม่เหมือนการไหล)
 *
 * dash = [ติด, ดับ] ที่หารเส้นรอบลงตัว → วนซ้ำรอบเส้นได้ **ไร้รอยต่อ**
 */
export function ringDash(spec: NeonSpec, geo: RingGeometry): {
  dash: [number, number];
  /** จำนวนช่วงแสงรอบเส้น (≥2 — บังคับให้เห็น "การไหล" ไม่ใช่จุดเดียว) */
  segments: number;
  offsetPerSec: number;
} {
  const segments = Math.max(2, Math.round(2 + spec.intensity * 2));
  const period = geo.length / segments;
  const on = period * (0.45 + spec.intensity * 0.15);
  return { dash: [on, period - on], segments, offsetPerSec: spec.flowSpeed };
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

// ============================================================================
// เอฟเฟกต์ "เกลียวแสงปีนขึ้น + วงแหวนฐาน" — ทำตาม GIF อ้างอิง (dreamassets 419–424)
// ผู้ใช้ส่ง GIF ให้เมื่อ 2026-09-25: "ให้แก้ effect เป็นเหมือนตัวอย่างตาม Link"
// แล้วติอีกรอบ (2026-09-25): "effect ล่าสุดเป็นแค่หมุนเป็นวงกลม กับมีวงกลมยืดหดเฉยๆ
//    ตัวอย่างจะเป็นเกลียว ขึ้นไปเลย และเป็นคลุมทั้งตัว ไม่ใช่อยู่แต่ตรงกลางการ์ด"
// ============================================================================
//
// สเปกที่แยกได้จากเฟรมจริงของ GIF ทั้ง 6 ใบ (ใช้เป็นข้อกำหนดของรอบนี้):
//   1) แถบแสง "หางดาวหาง" (comet ribbon) **ปีนขึ้นเป็นเกลียว** (helix) — ผายหัว เรียมหาง
//      หัวสว่างเกือบขาว → หางจางหาย · แกว่งซ้าย–ขวาเต็มความกว้างช่องภาพ และปีนจาก
//      ระดับเท้าถึงระดับหัว (ครอบทั้งตัวแบบ ไม่ใช่หมุนเป็นวงกลมอยู่กลางการ์ด)
//      ด้านหลังตัวแบบจะหรี่ลง / ด้านหน้าจะสว่างกว่า (ให้ความรู้สึกว่าแถบพันรอบตัวจริง)
//   2) วงแหวนฐาน (summoning ring) ใต้เท้าตัวแบบ — วงรีแบนเรืองแสง เต้นช้า ๆ (บางเบา)
//   3) แถบแสงกวาดผ่านตัวแบบ (แสงสะท้อนบนโลหะ) — กวาดช้า ๆ จากด้านหนึ่งไปอีกด้าน
//
// ⚠️ บทเรียนจากคำติของผู้ใช้ (2026-09-24: "แสงหมุนทับภาพ แหว่ง + ภาพสีเพี้ยน")
//    → รอบนี้ **ไม่ใช้ conic-gradient + color-dodge** อีกเลย
//      ทุกอย่างคำนวณจากเรขาคณิตล้วน + วาดแบบ additive (lighter/screen)
//      ⇒ ไม่มีรอยต่อให้เห็น และสีของภาพการ์ดไม่เพี้ยน
// ⚠️ บทเรียนจากคำติ (2026-09-25 รอบก่อน): วงรีแบนกลางช่องภาพ (`orbitGeometry` เดิม)
//    + `speedDegPerSec` ที่หมุนเร็ว (วนรอบ 2.4 วิ) → ผู้ใช้เห็นเป็น "วงกลมหมุนกลางการ์ด"
//    รอบนี้เปลี่ยนเส้นทางเป็นเกลียวปีนขึ้นตามแกนตั้ง + ลดความเร็ว (ปีนรอบละ ~4.2–5.4 วิ)
// ⚠️ โมดูลนี้ pure (ไม่แตะ DOM/canvas) → ทดสอบได้ · หน่วยทั้งหมดเป็น "หน่วยการ์ด" 420×600

export interface OrbitSpec {
  enabled: boolean;
  /**
   * จำนวนเส้นเกลียวที่ปีนขึ้นพร้อมกัน (2–3 เส้น · สั้น/ยาว/สว่างไม่เท่ากัน ตามตัวอย่าง)
   * ดูรายละเอียดต่อเส้นใน `spiralStrands()`
   */
  wisps: number;
  /**
   * ความยาวแถบแสง คิดเป็น "สัดส่วนของการปีน" (1 = ยาวเท่าระยะปีนทั้งช่วง)
   * ยิ่งมาก ยิ่งเห็นเกลียวหลายรอบพร้อมกัน (≥ 1 = คลุมทั้งตัวตลอดเวลา)
   */
  tailClimb: number;
  /** ความกว้างสูงสุดของแถบแสง (หน่วยการ์ด) */
  width: number;
  /** ความเข้มรวม 0–1 */
  alpha: number;
  /** ครึ่งความกว้างของเกลียว เทียบกับครึ่งความกว้างของช่องภาพ (กว้าง = แกว่งเต็มช่องภาพ) */
  rxRatio: number;
  /** จำนวนรอบหมุน ตลอดการปีน 1 รอบแนวตั้ง (ล่าง → บน) */
  turns: number;
  /** เวลาที่ใช้ปีนจากขอบล่าง → ขอบบนของช่องภาพ 1 รอบ (วินาที) */
  riseSec: number;
  /** คาบการกวาดแสงบนตัวภาพ (วินาที) */
  sheenSec: number;
}

const NO_ORBIT: OrbitSpec = {
  enabled: false, wisps: 0, tailClimb: 0, width: 0, alpha: 0,
  rxRatio: 0, turns: 0, riseSec: 0, sheenSec: 0,
};

/** สเปกเอฟเฟกต์วนรอบตามระดับความหายาก (ใช้ความเข้มชุดเดียวกับออร่า `auraSpec`) */
export function orbitSpec(rarity?: string | null): OrbitSpec {
  const aura = auraSpec(rarity);
  // PLUS5 (UNCOMMON) = มีแค่แสงวิ่งรอบขอบ → ยังไม่มีเกลียว/แสงกวาด
  if (aura.tier === 'NONE' || aura.tier === 'PLUS5' || aura.intensity <= 0) return NO_ORBIT;
  const i = aura.intensity;
  return {
    enabled: true,
    // 2026-09-25 (แก้): ผู้ใช้สั่ง "เพิ่มเส้นอีก แต่แสดงแบบ Random" ⇒ 3–6 เส้นตามระดับ
    // บันไดจำนวนเส้น: RARE 2 (วนนิด ๆ) · EPIC 4 (จัดเต็ม) · LEGENDARY 5 · MYTHIC 6
    wisps: i >= 0.95 ? 6 : i >= 0.8 ? 5 : i >= 0.6 ? 4 : 2,
    // 2026-09-25 (แก้): เดิมเป็น "หาง 190–280 องศา" = สั้นกว่า 1 รอบ → เห็นเป็นเส้นเดียวพาด
    // รอบนี้ผูกกับ "สัดส่วนการปีน" (≥ 1 = แถบยาวคลุมทั้งช่วงการปีน) → เห็นเป็นเกลียวหลายรอบจริง
    tailClimb: 0.95 + i * 0.1,
    // 2026-09-25 (แก้): เดิมเป็น speedDegPerSec 110–150 = หมุนรอบละ ~2.4 วิ → ผู้ใช้เห็นเป็น
    // "วงกลมหมุนอยู่กลางการ์ด" · รอบนี้ผูกกับ "เวลาที่ใช้ปีน 1 รอบแนวตั้ง" (ช้า = ค่อย ๆ ขยับขึ้น)
    riseSec: 6.8 - i * 2,
    width: 6 + i * 6, // หน่วยการ์ด — บางพอให้อ่านเป็น "เส้นแสง" แต่หนาพอให้เห็นเกลียว
    alpha: 0.45 + i * 0.4,
    // กว้างเกือบสุดช่องภาพ → แสงกวาดออกไปสุดขอบซ้าย/ขวาของช่องภาพ (ไม่จุกอยู่กลางการ์ด)
    rxRatio: 0.72 + i * 0.12,
    // จำนวนรอบต่อ "ความสูงการ์ด 1 รอบ" (ไม่มากเกินไป — ไม่งั้นเส้นสั้นจะดูเป็นลูปกลม)
    turns: 1.4 + i * 0.5,
    sheenSec: 5.2 - i * 1.6,
  };
}

/** ระยะที่เว้นจากขอบบน/ล่างของช่องภาพ (หน่วยการ์ด) — กันแสงเบลอถูกตัดเป็นเส้นตรง */
const SPIRAL_PAD = 4;

export interface SpiralGeometry {
  /** แกนตั้งของเกลียว (กลางช่องภาพแนวนอน) */
  cx: number;
  /** ครึ่งความกว้างของเกลียว (หน่วยการ์ด) */
  rx: number;
  /** จุดเริ่มปีน (ขอบล่างของช่องภาพ) */
  yBottom: number;
  /** จุดสิ้นสุดการปีน (ขอบบนของช่องภาพ) */
  yTop: number;
  /** จำนวนรอบหมุนตลอดการปีน 1 รอบแนวตั้ง */
  turns: number;
}

/**
 * เรขาคณิตของเกลียวแสงของ "เส้นนั้น" — วนจากขอบล่าง → ขอบบนของ **การ์ดทั้งใบ**
 * (คำนวณจาก AURA_CARD.frame → ครอบทั้งการ์ด รวมโซนชื่อ/ข้อความ/สเตตัส ไม่ใช่แค่ช่องภาพ)
 * · แต่ละเส้นมีแกน/รัศมี/จำนวนรอบของตัวเอง (เส้น 2 เยื้องซ้าย + หมุนสวนทาง)
 */
export function spiralGeometry(spec: OrbitSpec, strand: SpiralStrand): SpiralGeometry {
  const { frame, width: cardW } = AURA_CARD;
  return {
    cx: cardW * strand.centerX,
    rx: cardW * 0.5 * spec.rxRatio * strand.spread,
    yBottom: frame.y + frame.h - SPIRAL_PAD,
    yTop: frame.y + SPIRAL_PAD,
    turns: spec.turns,
  };
}

/** เพดานจำนวนเส้นต่อการ์ด (กันภาระการวาด) */
const STRAND_MAX = 6;

/**
 * รูปร่างของเกลียว — **สุ่มแบบ deterministic ต่อการ์ด** (ตามคำสั่งผู้ใช้ 2026-09-25)
 *
 * *"เพิ่มเส้นอีก แต่แสดงแบบ Random ไม่จำเป็นต้องวิ่งสุดการ์ด ทุกเส้น หายไประหว่างทางก็ได้"*
 *
 * หลักการ: ใช้ `foilHash(seed ~ ค่า ~ ลำดับ)` เป็นตัวสุ่ม (การ์ดใบเดิมได้ผลเดิมเสมอ)
 *   · `centerX` 0.25–0.75 (แกนเยื้องซ้าย/ขวาไม่ซ้ำกัน)
 *   · `spread`  0.5–0.98 ของรัศมีฐาน (เส้นกว้าง/แคบต่างกัน)
 *   · `spin`    ±1 (ครึ่งหนึ่งวนสวนทาง = วนอีกฝั่ง)
 *   · `w0/w1`   "ช่วงชีวิต" บนความสูงการ์ด — เริ่ม/จบกลางการ์ดได้ (หายไประหว่างทางได้)
 *   · `tailClimb` 0.3–0.7 · `riseSec` ×0.7–1.6 · `width`/`alpha` สุ่มในช่วงที่กำหนด
 *
 * ⚠️ จำนวนรอบคิดจาก "ระยะที่เส้นนั้นเดินจริง" (w1−w0) ⇒ เส้นที่ช่วงชีวิตสั้นจะได้ < 1 รอบ
 *    = เส้นพาดเฉียง ไม่กี่รอบ → ไม่ดูเป็น "ลูปกลม" (แก้คำติ "2 เส้นดูเป็นลูปเกินไป")
 */
const HERO: readonly [number, number] = [0.02, 0.98]; // เส้นเอก: วิ่งเกือบสุดการ์ด

export interface SpiralStrand {
  /** องศาเริ่มต้นของหัวแถบ (แต่ละเส้นต่างกัน → ไม่ทับกัน) */
  phaseDeg: number;
  /** ความยาวแถบ (สัดส่วนของช่วงชีวิตของเส้นนั้น) — มีทั้งสั้นและยาว */
  tailClimb: number;
  /** ความกว้างของแถบ (หน่วยการ์ด) */
  width: number;
  /** ตัวคูณความสว่าง 0–1 */
  alpha: number;
  /** เวลาที่ใช้เดินครบช่วงชีวิต 1 รอบ (วินาที) — คนละจังหวะกัน = เหมือน GIF */
  riseSec: number;
  /** แกนกลางของเส้นนี้ (สัดส่วนของความกว้างการ์ด 0–1) */
  centerX: number;
  /** ตัวคูณรัศมี (สัดส่วนของค่าฐาน) — เส้นแคบ/กว้างไม่เท่ากัน */
  spread: number;
  /** ทิศการหมุน: 1 = วนขึ้นทางขวา · -1 = วนสวนทาง (หมุนวนอีกฝั่ง) */
  spin: 1 | -1;
  /** มุมเริ่มต้นของการหมุน (เรเดียน) — 0/π = เริ่มจากฝั่งขวา/ซ้าย · π/2,3π/2 = เริ่มจากด้านหน้า/หลัง */
  aOff: number;
  /** ตำแหน่งเริ่มของ "ช่วงชีวิต" บนความสูงการ์ด (0 = ขอบล่าง · 1 = ขอบบน) */
  w0: number;
  /** ตำแหน่งจบของ "ช่วงชีวิต" — < 1 = แสงหายไปกลางการ์ด (ไม่จำเป็นต้องสุดการ์ด) */
  w1: number;
}

/**
 * รายการเกลียวทั้งหมดของการ์ดใบหนึ่ง (deterministic ต่อ seed)
 * เส้นแรก = เส้นเอก (วิ่งเกือบสุดการ์ด) · เส้นที่เหลือ = สุ่ม (สั้น/ยาว/คนละฝั่ง/หายกลางทาง)
 */
export function spiralStrands(spec: OrbitSpec, seed: string): SpiralStrand[] {
  if (!spec.enabled) return [];
  const count = Math.max(1, Math.min(STRAND_MAX, Math.round(spec.wisps)));
  const rnd = (key: string, i: number) => (foilHash(`${seed}~${key}~${i}`) % 1000) / 1000;
  return Array.from({ length: count }, (_, i) => {
    if (i === 0) {
      return {
        phaseDeg: rnd('ph', 0) * 360,
        tailClimb: spec.tailClimb,
        width: spec.width,
        alpha: 1,
        riseSec: spec.riseSec,
        centerX: 0.5,
        spread: 0.97,
        spin: (rnd('hspin', 0) > 0.5 ? 1 : -1) as 1 | -1,
        aOff: rnd('hoff', 0) > 0.5 ? Math.PI : 0,
        w0: HERO[0],
        w1: HERO[1],
      };
    }
    // ช่วงชีวิต: สุ่มความยาว 0.35–0.9 ของความสูงการ์ด แล้วสุ่มจุดเริ่ม (จบเกินขอบบนได้)
    const life = 0.35 + rnd('life', i) * 0.55;
    const start = rnd('start', i) * (1.06 - life);
    return {
      phaseDeg: rnd('ph', i) * 360,
      tailClimb: 0.3 + rnd('tail', i) * 0.4,
      width: spec.width * (0.45 + rnd('wid', i) * 0.5),
      alpha: 0.35 + rnd('al', i) * 0.5,
      riseSec: spec.riseSec * (0.7 + rnd('sp', i) * 0.9),
      centerX: 0.25 + rnd('cx', i) * 0.5,
      spread: 0.5 + rnd('spread', i) * 0.48,
      // สลับทิศรับประกัน: คี่ = วนสวนทาง (มาจากอีกฝั่ง) — กัน "วนทางเดียวกันหมด"
      spin: (i % 2 === 1 ? -1 : 1) as 1 | -1,
      aOff: (Math.PI / 2) * Math.floor(rnd('aoff', i) * 4),
      w0: start,
      w1: Math.min(1.06, start + life),
    };
  });
}

export interface RibbonQuad {
  /** จุด 4 มุมของช่วงแถบ (เรียงเป็นสี่เหลี่ยม: ฝั่งหนึ่ง → ฝั่งหนึ่ง → อีกฝั่ง) */
  x1: number; y1: number;
  x2: number; y2: number;
  x3: number; y3: number;
  x4: number; y4: number;
  /** ความสว่างของช่วงนี้ 0–1 (หัวสว่างสุด → ปลายหางจางหาย) */
  alpha: number;
  /** ความหนาของแถบกลางช่วงนี้ (หน่วยการ์ด) */
  width: number;
  /** ตำแหน่งตามความยาวหาง 0 = หัว · 1 = ปลายหาง */
  from: number;
}

/**
 * ชิ้นส่วนของแถบแสง "เกลียวปีนขึ้น" (helix streak) ณ เวลาหนึ่ง — pure
 *
 * แก้ตามคำติผู้ใช้ 2026-09-25: *"effect เป็นแค่หมุนเป็นวงกลม + วงกลมยืดหด
 * ตัวอย่างจะเป็นเกลียว ขึ้นไปเลย และเป็นคลุมทั้งตัว ไม่ใช่อยู่แต่ตรงกลางการ์ด"*
 * และ *"เกลียวต้องค่อย ๆ ขยับขึ้น แล้วค่อย ๆ จางหาย ไม่ใช่หายวับไปเลย
 * แล้วต้องมีเกลียวมากกว่า 1 อัน มีสั้น มียาว ตามตัวอย่าง"*
 *
 * หลักการ:
 *   - หัวแถบ **ปีนขึ้น** จากขอบล่าง → ขอบบนของช่องภาพ (ครอบทั้งตัวแบบ)
 *     · ปีน 1 รอบแนวตั้ง = หมุน `spec.turns` รอบ · ใช้เวลา `strand.riseSec` → ความเร็วคงที่
 *   - ตำแหน่ง x = กลางช่องภาพ ± rx·cos θ → แกว่งซ้าย–ขวาจนสุดขอบช่องภาพ
 *   - ความลึก (sin θ): ด้านหน้า = สว่าง/หนา · ด้านหลัง = หรี่/แคบ (ให้ความรู้สึกพันรอบตัวจริง)
 *   - **จางหัว-ท้ายแบบค่อยเป็นค่อยไป** — หัวแถบปีนขึ้น (0 → 1) แล้ว *ไถลต่อพ้นขอบบน*
 *     อีก `tailClimb` ช่วง ⇒ แถบค่อย ๆ ไหลออกและจางหายไปเอง แล้วรอบใหม่จึงเริ่มที่ขอบล่าง
 *     (ไม่มีจังหวะ "หายวับ" ตอนวนรอบ เพราะทั้งสองฝั่งของรอยต่อ = ว่างทั้งคู่)
 *   - ความกว้าง/ความสว่างลดหลั่นจากหัว (1) → ปลายหาง (0) → ได้รูป comet เหมือน GIF
 *   - ช่วงที่ติดกันใช้ "ขอบร่วม" (มุม+ความกว้างชุดเดียวกัน) ⇒ ต่อเนื่องไม่มีร่อง/ไม่แหว่ง
 *
 * @param strand เส้นเกลียวของเส้นนี้ (จาก `spiralStrands()`) — ยาว/สั้น/กว้าง/สว่าง ต่างกันได้
 */
export function spiralStreak(
  timeSec: number,
  spec: OrbitSpec,
  seed: string,
  strand: SpiralStrand,
  steps = 30
): RibbonQuad[] {
  if (!spec.enabled || steps <= 0 || !strand) return [];
  const geo = spiralGeometry(spec, strand);
  const span = geo.yBottom - geo.yTop; // ระยะปีน (บวก = ขอบล่าง → ขอบบน)
  if (geo.rx <= 0 || span <= 0) return [];
  if (!Number.isFinite(strand.riseSec) || strand.riseSec <= 0) return [];
  if (!Number.isFinite(spec.turns) || spec.turns <= 0) return [];

  const t = Number.isFinite(timeSec) ? timeSec : 0;
  // เฟสต่างกันเล็กน้อยต่อการ์ดใบนั้น (deterministic — ใบเดิมได้ค่าเดิมเสมอ)
  const jitter = (foilHash(`${seed}~spiral`) % 1000) / 1000;
  /** ความยาวแถบ (สัดส่วนของการปีน) — ≥1 = แถบคลุมทั้งช่วงการปีน (เห็นเกลียวหลายรอบ) */
  const tailClimb = Math.max(0.05, strand.tailClimb);
  /**
   * 1 คาบ = 1 ช่วงชีวิตของเส้น (หัวเดินจาก w0 → w1)
   *
   * ⚠️ ประวัติการแก้ (ผู้ใช้ติ 2026-09-25: "ไม่ใช่หายวับไปเลย" + "กระพริบมา กระพริบหาย"):
   *   · ซองแสง (envelope) ทำให้ alpha = 0 ที่หัวและท้ายของช่วงชีวิต ⇒ ค่อย ๆ เฟดขึ้น/ลง
   *   · ทุกชั้นวาด (ฟุ้ง/แกน/ไส้ขาว) ใช้ "alpha จริงต่อช่วง" ผ่าน `gradOf()` ในคอมโพเนนต์
   *     ⇒ ไม่มีชั้นไหนวาบโผล่/วับหายก่อนเวลา (ตัวการ "กระพริบ" เดิมคือชั้นที่ใช้ alpha คงที่)
   *   · วนกลับที่ mod (1 + tailClimb) — ให้หัวไถลพ้นขอบบนไปก่อน (ช่วงท้ายแถบไหลออกเอง)
   *     ⇒ ไม่มีวูบตอนวนกลับ (ทั้งสองฝั่งของรอยต่อ = แทบว่างทั้งคู่)
   */
  const cycleClimb = 1 + tailClimb;
  // ความคืบหน้าการปีนของ "หัว": 0 = ขอบล่าง · 1 = ขอบบน · >1 = เลยขอบบนไปแล้ว
  const head = ((((t / strand.riseSec) + jitter + strand.phaseDeg / 360) % cycleClimb) + cycleClimb) % cycleClimb;
  /** ความกว้างของเส้นนี้ (เส้นสั้นของแต่ละระดับจะบางกว่า) */
  const width = Math.max(0.5, strand.width);
  /** ตัวคูณความสว่างของเส้นนี้ (เส้นสั้นหรี่กว่าเส้นยาว) */
  const strandAlpha = Math.min(1, Math.max(0, strand.alpha));
  /** ระยะเอียงของเกลียวต่อ 1 เรเดียน (ใช้หาทิศตั้งฉากกับเส้นทางจริง) */
  const pitch = span / (2 * Math.PI * geo.turns);

  /** จุดขอบแถบที่ตำแหน่ง f (0 = หัว · 1 = ปลายหาง) · side = ±1 คือสองฝั่งของเส้นกลาง */
  const edge = (f: number, side: 1 | -1) => {
    const pc = head - tailClimb * f; // ความคืบหน้าของเส้นนี้ (0 = เริ่มช่วงชีวิต · 1 = จบช่วงชีวิต)
    // ตำแหน่งจริงบนความสูงการ์ด (0 = ขอบล่าง · 1 = ขอบบน) — แต่ละเส้นมี "ช่วงชีวิต" ของตัวเอง
    // (ช่วงสั้น ⇒ เดินไม่สุดการ์ด = แสงหายไประหว่างทาง · ระยะสั้น ⇒ หมุนน้อยรอบ = ไม่เป็นลูปกลม)
    const climb = strand.w0 + pc * (strand.w1 - strand.w0);
    // ทิศการหมุน: spin = -1 → วนสวนทาง (เส้นนั้นขึ้นอีกฝั่งหนึ่งของการ์ด)
    const a = strand.spin * climb * 2 * Math.PI * geo.turns + strand.aOff;
    // ความลึกบนเกลียว: sin a > 0 = ด้านหน้าตัวแบบ (สว่าง/หนา) · < 0 = ด้านหลัง (หรี่/แคบ)
    const depth = 0.5 + 0.5 * Math.sin(a);
    const half = (width * Math.pow(1 - f, 0.9) * (0.74 + 0.26 * depth)) / 2;
    // ตั้งฉากกับเส้นทางเกลียว (dx = -rx·sin a · dy = -pitch/spin)
    const tx = -geo.rx * Math.sin(a);
    const ty = -pitch / strand.spin;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    // ค่อย ๆ เกิด/ค่อย ๆ จางที่หัวและท้ายของช่วงชีวิต (sin^0.9 = นุ่มตลอดช่วง ไม่หายวับ)
    const inside = Math.min(1, Math.max(0, pc));
    const envelope = Math.pow(Math.sin(Math.PI * inside), 0.9);
    return {
      x: geo.cx + geo.rx * Math.cos(a) + side * nx * half,
      y: geo.yBottom - span * climb + side * ny * half,
      width: half * 2,
      alpha: strandAlpha * envelope * Math.pow(1 - f, 1.1) * (0.34 + 0.66 * depth),
    };
  };

  const out: RibbonQuad[] = [];
  for (let j = 0; j < steps; j += 1) {
    const f0 = j / steps;
    const f1 = (j + 1) / steps;
    const a0 = edge(f0, 1);
    const a1 = edge(f1, 1);
    const b1 = edge(f1, -1);
    const b0 = edge(f0, -1);
    const mid = edge((f0 + f1) / 2, 1);
    out.push({
      x1: a0.x, y1: a0.y,
      x2: a1.x, y2: a1.y,
      x3: b1.x, y3: b1.y,
      x4: b0.x, y4: b0.y,
      alpha: mid.alpha,
      width: mid.width,
      from: f0,
    });
  }
  return out;
}

export interface RibbonPoint {
  /** จุดกึ่งกลางของแถบ ณ ตำแหน่งนั้น (หน่วยการ์ด) */
  x: number;
  y: number;
  /** ครึ่งความกว้างของแถบที่จุดนั้น (ใช้ไล่ความหนา) */
  half: number;
  /** ตำแหน่งตามความยาว 0 = หัว · 1 = ปลายหาง */
  from: number;
}

/**
 * "เส้นกลาง" ของแถบแสง (จากชุด `RibbonQuad`) — ใช้ **วาดด้วย stroke ปลายมน**
 * ทำให้แสงเนียนต่อเนื่อง ไม่เห็นเป็นเหลี่ยม/ท่อน ๆ (แก้คำติ "ดูแข็ง ๆ เป็นท่อน ๆ เหมือนรถไฟ")
 *
 * จุดที่ i = กึ่งกลางของรอยต่อระหว่างช่วง (ช่วงติดกันใช้ขอบร่วม ⇒ เส้นกลางต่อเนื่องกันเป๊ะ)
 */
export function ribbonCenterline(quads: RibbonQuad[]): RibbonPoint[] {
  if (!quads.length) return [];
  const step = 1 / quads.length;
  const out: RibbonPoint[] = [
    {
      x: (quads[0].x1 + quads[0].x4) / 2,
      y: (quads[0].y1 + quads[0].y4) / 2,
      half: Math.hypot(quads[0].x1 - quads[0].x4, quads[0].y1 - quads[0].y4) / 2,
      from: 0,
    },
  ];
  for (const q of quads) {
    out.push({
      x: (q.x2 + q.x3) / 2,
      y: (q.y2 + q.y3) / 2,
      half: Math.hypot(q.x2 - q.x3, q.y2 - q.y3) / 2,
      from: q.from + step,
    });
  }
  return out;
}

export interface SheenBand {
  /** กึ่งกลางแถบแสง — เศษของความกว้างช่องภาพ (0 = ขอบซ้าย · 1 = ขอบขวา) */
  x: number;
  /** ความกว้างแถบ (สัดส่วนของความกว้างช่องภาพ) */
  w: number;
  /** ความสว่าง 0–1 (จางหายหัว-ท้ายรอบ → วนซ้ำเนียน ไม่มีสะดุด) */
  alpha: number;
}

/** แถบแสงกวาดผ่านตัวแบบ (แสงสะท้อนบนโลหะ) ณ เวลาหนึ่ง */
export function sheenBand(timeSec: number, spec: OrbitSpec): SheenBand {
  const fallback: SheenBand = { x: 0.5, w: 0.22, alpha: 0 };
  if (!spec.enabled || spec.sheenSec <= 0) return fallback;
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const p = ((t / spec.sheenSec) % 1 + 1) % 1;
  return {
    x: -0.2 + 1.4 * p, // กวาดซ้าย → ขวา ออกนอกช่องภาพทั้งสองข้าง
    w: 0.22,
    alpha: Math.pow(Math.sin(Math.PI * p), 0.8),
  };
}
