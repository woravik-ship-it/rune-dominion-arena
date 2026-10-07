// ระบบตีบวก Item +0..+15 (ผู้ใช้สั่ง 2026-10-03 → ปรับเป็น "ต่อชิ้น" 2026-10-04)
//
// กติกา (ตามที่ผู้ใช้กำหนด):
//  - เพดาน +15 · ระดับ +1..+6 พลาด = ระดับคงเดิม (เสียค่าวัสดุ)
//  - พยายามไป +7..+9 พลาด = ระดับลงมา +6
//  - พยายามไป +10..+15 ต้องใช้ "อัญมณีตีบวก" เพิ่ม พลาด = ระดับลงมา +6
//  - โบนัสสถานะ = +8% ของค่าพื้นฐาน ต่อระดับ (สายตรง ไม่ทบต้น) → +15 ≈ ×2.2
//    (กันของต่ำอัดบวกแล้วโค่นของสูง: EPIC+9 ยังไม่ทาบ LEGENDARY+0)
//
// ⚠️ ผู้ใช้สั่ง 2026-10-04: "การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
//  ⇒ 1 ครั้งใช้ **1 ชิ้น** (ชิ้นที่เลือกจากกองระดับนั้น) ไม่กิน "สำเนา" เพิ่ม
//    ของชิ้นนั้นย้ายไปกองระดับใหม่ → ของทั้งกองเดิมไม่ถูกบวกตาม
//    ต้วอย่าง: กอง +0 ×3 ตีบวกสำเร็จ → เหลือ +0 ×2 และได้ +1 ×1
//
// ไฟล์นี้บริสุทธิ์ (ไม่แตะ DB) ⇒ เทสต์ได้ และเป็นแหล่งเดียวของตัวเลข/โอกาส
// อัญมณีเป็นทรัพยากร InventoryItemType ใหม่ — หาได้จากฟาร์มแผนที่เท่านั้น ไม่มีการขาย
// (ผู้ใช้สั่ง 2026-10-03: เลิกขายอัญมณีตีบวก — ได้จากฟาร์มแผนที่อย่างเดียว)

/** ระดับสูงสุดที่ตีบวกได้ */
export const ENHANCE_MAX_LEVEL = 15;
/** ระดับ "ปลอดภัย": พยายามจากระดับนี้ขึ้นไป (ไป +7 ขึ้นไป) ถ้าพลาด ระดับจะลงมาเท่านี้ */
export const ENHANCE_SAFE_MAX = 6;
/** โบนัสสถานะต่อระดับ (8%) */
export const ENHANCE_BONUS_PER_LEVEL = 0.08;
/** จำนวนชิ้นที่ใช้ต่อการตีบวก 1 ครั้ง — 1 ชิ้น = ชิ้นที่ถูกตีบวกเอง (ไม่กินเพิ่ม) */
export const ENHANCE_PIECES_PER_TRY = 1;

/** ประเภทอัญมณีใน UserInventoryItem (ต้องตรงกับ enum InventoryItemType) */
export const ENHANCE_JEWEL_TYPE = 'ENHANCE_JEWEL';
/** ชื่อที่แสดงของผู้เล่น — ตั้งชื่อสั้น ๆ แค่ "Jewelry" (ผู้ใช้สั่ง 2026-10-03: ไม่ต้องมีคำว่า Enhance/ตีบวก) */
export const ENHANCE_JEWEL_NAME_TH = 'Jewelry';
/** ไม่มีราคาซื้อแล้ว — หาได้จากฟาร์มแผนที่เท่านั้น (ผู้ใช้สั่ง 2026-10-03) */

export interface EnhanceQuote {
  /** ระดับเป้าหมาย (จาก + 1) */
  target: number;
  /** โอกาสสำเร็จ (%) */
  chancePercent: number;
  /** จำนวนชิ้นที่ใช้ต่อครั้ง = 1 ชิ้น (ชิ้นที่เลือกจากกอง — ชิ้นนั้นคือของที่ตีบวก) */
  pieces: number;
  /** Coin ที่ต้องใช้ */
  coin: number;
  /** ฝุ่นเวทที่ต้องใช้ */
  dust: number;
  /** อัญมณีที่ต้องใช้ (0 = ไม่ต้องใช้ — ระดับเป้าหมาย < +10) */
  jewels: number;
}

/** โอกาสสำเร็จของขั้นจากLevel → จากLevel+1 (ตารางเลขกลมๆ ปรับได้ที่นี่) */
export function enhanceChancePercent(fromLevel: number): number {
  const target = Math.max(1, Math.trunc(fromLevel) + 1);
  const table: Record<number, number> = {
    1: 95, 2: 92, 3: 88, 4: 82, 5: 75,
    6: 65, 7: 55, 8: 45, 9: 35,
    10: 25, 11: 18, 12: 13, 13: 9, 14: 6, 15: 4,
  };
  const v = table[target] ?? 4;
  return Math.min(100, Math.max(1, v));
}

/** จำนวนอัญมณีที่ต้องใช้เพื่อไปถึงระดับเป้าหมาย (+10 ขึ้นไปถึงต้องใช้) */
export function enhanceJewelsNeeded(target: number): number {
  if (target < 10) return 0;
  if (target <= 11) return 1;
  if (target <= 13) return 2;
  return 3;
}

/** ค่าใช้จ่าย/วัตถุดิบของขั้นจากLevel → จากLevel+1 (ใช้ชิ้นที่ตีบวก 1 ชิ้น) */
export function enhanceQuote(fromLevel: number): EnhanceQuote {
  const level = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(fromLevel ?? 0)));
  const target = level + 1;
  return {
    target,
    chancePercent: enhanceChancePercent(level),
    pieces: ENHANCE_PIECES_PER_TRY,
    coin: 15 * target,
    dust: 8 * target,
    jewels: enhanceJewelsNeeded(target),
  };
}

/**
 * ระดับหลังตี (ตามกติกาผู้ใช้):
 *  - สำเร็จ → +1
 *  - พลาด และระดับเดิม < +6 → คงเดิม
 *  - พลาด และระดับเดิม ≥ +6 (กำลังไป +7 ขึ้นไป) → ลงมา +6
 */
export function enhanceResultLevel(fromLevel: number, success: boolean): number {
  const level = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(fromLevel ?? 0)));
  if (success) return Math.min(ENHANCE_MAX_LEVEL, level + 1);
  return level >= ENHANCE_SAFE_MAX ? ENHANCE_SAFE_MAX : level;
}

/** ผลของการตีบวก 1 ชิ้น: ย้ายออกจากกองระดับไหน ไปเข้ากองระดับไหน (บริสุทธิ์ — ไม่แตะ DB) */
export interface EnhanceMove {
  /** ระดับกองต้นทาง (ชิ้นที่ถูกดึงออกมา) */
  fromLevel: number;
  /** ระดับกองปลายทาง (0 = ไม่ย้ายกอง เพราะพลาดแล้วระดับเท่าเดิม) */
  toLevel: number;
  /** ย้ายกองจริงไหม — false = ชิ้นกลับเข้ากองเดิม (กอง +0..+5 ที่พลาด) */
  moved: boolean;
  /** ระดับที่แสดงหลังตี (เท่ากับ toLevel เสมอ) */
  resultLevel: number;
}

/**
 * ผู้ใช้สั่ง 2026-10-04: ตีบวก = "ของ 1 ชิ้นได้บวก ไม่ใช่ทั้งกอง"
 * ⇒ ของ 1 ชิ้นออกจากกอง `fromLevel` แล้วเข้าอีกกองหนึ่ง (หรือกลับกองเดิมถ้าระดับไม่เปลี่ยน)
 */
export function enhanceMove(fromLevel: number, success: boolean): EnhanceMove {
  const from = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(fromLevel ?? 0)));
  const resultLevel = enhanceResultLevel(from, success);
  return { fromLevel: from, toLevel: resultLevel, moved: resultLevel !== from, resultLevel };
}

/** ตัวคูณสถานะที่ระดับนี้ (1 + 8%×level) */
export function enhanceFactor(level: number): number {
  const l = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(level ?? 0)));
  return 1 + ENHANCE_BONUS_PER_LEVEL * l;
}

/** ปรับสถานะพื้นฐานตามระดับบวก (ปัดเศษ) */
export function enhanceStats<T extends { atk: number; def: number; hp: number; spd: number }>(
  base: T,
  level: number
): { atk: number; def: number; hp: number; spd: number } {
  const f = enhanceFactor(level);
  return {
    atk: Math.round(base.atk * f),
    def: Math.round(base.def * f),
    hp: Math.round(base.hp * f),
    spd: Math.round(base.spd * f),
  };
}