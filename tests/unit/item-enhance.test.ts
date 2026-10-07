// เทสต์กติกาตีบวก Item (ผู้ใช้สั่ง 2026-10-03 → ปรับเป็น "ต่อชิ้น" 2026-10-04)
//  - เพดาน +15 · +1..+6 พลาดคงเดิม · พยายามไป +7 ขึ้นไป พลาด = ลง +6
//  - พยายามไป +10..+15 ต้องใช้ "อัญมณีตีบวก"
//  - โบนัสสถานะ +8% ต่อระดับ (สายตรง)
//  - ผู้ใช้สั่ง 2026-10-04: "เอาของ 1 ชิ้นไปตีบวก ชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง" ⇒ 1 ครั้งใช้ 1 ชิ้น
//    และชิ้นนั้นต้อง "ย้ายกอง" ตามระดับใหม่ (enhanceMove)
import {
  ENHANCE_BONUS_PER_LEVEL,
  ENHANCE_MAX_LEVEL,
  ENHANCE_PIECES_PER_TRY,
  ENHANCE_SAFE_MAX,
  enhanceChancePercent,
  enhanceFactor,
  enhanceJewelsNeeded,
  enhanceMove,
  enhanceQuote,
  enhanceResultLevel,
  enhanceStats,
} from '@/lib/item-enhance';

describe('item-enhance — ระดับ/โอกาส', () => {
  it('เพดาน +15 และโบนัส 8% ต่อระดับ', () => {
    expect(ENHANCE_MAX_LEVEL).toBe(15);
    expect(ENHANCE_BONUS_PER_LEVEL).toBe(0.08);
    expect(enhanceFactor(0)).toBe(1);
    expect(enhanceFactor(15)).toBe(1 + 15 * 0.08);
  });

  it('โอกาสลดลงตามระดับ (ยิ่งสูงยิ่งยาก)', () => {
    expect(enhanceChancePercent(0)).toBeGreaterThan(enhanceChancePercent(5));
    expect(enhanceChancePercent(5)).toBeGreaterThan(enhanceChancePercent(9));
    expect(enhanceChancePercent(9)).toBeGreaterThan(enhanceChancePercent(14));
    expect(enhanceChancePercent(15)).toBeGreaterThanOrEqual(1);
    expect(enhanceChancePercent(15)).toBeLessThanOrEqual(100);
  });
});

describe('item-enhance — วัสดุ', () => {
  it('อัญมณีต้องใช้เฉพาะเป้าหมาย +10 ขึ้นไป', () => {
    expect(enhanceJewelsNeeded(9)).toBe(0);
    expect(enhanceJewelsNeeded(10)).toBeGreaterThan(0);
    expect(enhanceJewelsNeeded(15)).toBeGreaterThan(enhanceJewelsNeeded(10));
  });

  it('quote: ใช้ 1 ชิ้นต่อครั้ง (ชิ้นที่ตีบวก) · Coin/ฝุ่นเพิ่มตามระดับ · ค่าใช้จ่าย +10 มีอัญมณี', () => {
    const early = enhanceQuote(0);
    expect(early.pieces).toBe(1);
    expect(early.pieces).toBe(ENHANCE_PIECES_PER_TRY);
    expect(early.jewels).toBe(0);
    expect(early.coin).toBeGreaterThan(0);
    expect(early.dust).toBeGreaterThan(0);

    const late = enhanceQuote(9); // ไป +10
    expect(late.target).toBe(10);
    expect(late.jewels).toBeGreaterThan(0);
    expect(late.coin).toBeGreaterThan(early.coin);
  });

  it('อัญมณีเลิกขายแล้ว (ไม่มีราคาซื้อให้ใช้ 💠)', async () => {
    // ผู้ใช้สั่ง 2026-10-03: เอาอัญมณีตีบวกออกจากการขาย — หาได้จากฟาร์มแผนที่เท่านั้น
    const mod = await import('@/lib/item-enhance');
    expect('ENHANCE_JEWEL_PRICE_SHARDS' in mod).toBe(false);
  });
});

describe('item-enhance — ผลการตี (กติกาผู้ใช้)', () => {
  it('สำเร็จ = +1 เสมอ (ไม่เกินเพดาน)', () => {
    expect(enhanceResultLevel(0, true)).toBe(1);
    expect(enhanceResultLevel(7, true)).toBe(8);
    expect(enhanceResultLevel(ENHANCE_MAX_LEVEL - 1, true)).toBe(ENHANCE_MAX_LEVEL);
  });

  it('พลาดช่วง +0..+5 = ระดับคงเดิม', () => {
    for (let lvl = 0; lvl < ENHANCE_SAFE_MAX; lvl++) {
      expect(enhanceResultLevel(lvl, false)).toBe(lvl);
    }
  });

  it('พลาดตอน "กำลังไป +7 ขึ้นไป" = ระดับลงมา +6', () => {
    for (let lvl = ENHANCE_SAFE_MAX; lvl < ENHANCE_MAX_LEVEL; lvl++) {
      expect(enhanceResultLevel(lvl, false)).toBe(ENHANCE_SAFE_MAX);
    }
  });
});

// ผู้ใช้สั่ง 2026-10-04: "การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
// ⇒ ของ 1 ชิ้นย้ายจากกองระดับเดิมไปกองระดับใหม่ (หรือกลับกองเดิมถ้าระดับไม่เปลี่ยน)
describe('item-enhance — ตีบวกทีละชิ้น (ย้ายกอง)', () => {
  it('สำเร็จ: ชิ้นย้ายขึ้นกองถัดไป (กองเดิมไม่ถูกบวกทั้งกอง)', () => {
    const move = enhanceMove(0, true);
    expect(move).toEqual({ fromLevel: 0, toLevel: 1, moved: true, resultLevel: 1 });

    const high = enhanceMove(9, true);
    expect(high.fromLevel).toBe(9);
    expect(high.toLevel).toBe(10);
    expect(high.moved).toBe(true);
  });

  it('สำเร็จที่เพดาน: ไม่เกิน +15', () => {
    const move = enhanceMove(ENHANCE_MAX_LEVEL - 1, true);
    expect(move.toLevel).toBe(ENHANCE_MAX_LEVEL);
    expect(move.moved).toBe(true);
  });

  it('พลาดช่วงปลอดภัย (+0..+5): ชิ้นอยู่กองเดิม (moved = false)', () => {
    for (let lvl = 0; lvl < ENHANCE_SAFE_MAX; lvl++) {
      const move = enhanceMove(lvl, false);
      expect(move.fromLevel).toBe(lvl);
      expect(move.toLevel).toBe(lvl);
      expect(move.moved).toBe(false);
    }
  });

  it('พลาดช่วงเสี่ยง (+7 ขึ้นไป): ชิ้นหล่นลงกอง +6', () => {
    for (let lvl = ENHANCE_SAFE_MAX + 1; lvl < ENHANCE_MAX_LEVEL; lvl++) {
      const move = enhanceMove(lvl, false);
      expect(move.fromLevel).toBe(lvl);
      expect(move.toLevel).toBe(ENHANCE_SAFE_MAX);
      expect(move.moved).toBe(true);
    }
  });

  it('พลาดที่ +6 (กำลังไป +7): ระดับเท่าเดิม ⇒ ชิ้นกลับกองเดิม', () => {
    const move = enhanceMove(ENHANCE_SAFE_MAX, false);
    expect(move.toLevel).toBe(ENHANCE_SAFE_MAX);
    expect(move.moved).toBe(false);
  });

  it('กอง +0 ×3 ตีบวกสำเร็จ 1 ครั้ง → กอง +0 เหลือ 2 ชิ้น และได้ +1 ×1', () => {
    const after: Record<number, number> = { 0: 3 };
    const move = enhanceMove(0, true);
    after[move.fromLevel] -= ENHANCE_PIECES_PER_TRY;
    after[move.toLevel] = (after[move.toLevel] ?? 0) + ENHANCE_PIECES_PER_TRY;
    expect(after[0]).toBe(2);
    expect(after[1]).toBe(1);
  });
});

describe('item-enhance — สถานะที่บวก', () => {
  it('enhanceStats คูณ 8% ต่อระดับ (ปัดเศษ)', () => {
    const base = { atk: 10, def: 0, hp: 0, spd: 0 };
    expect(enhanceStats(base, 0)).toEqual({ atk: 10, def: 0, hp: 0, spd: 0 });
    expect(enhanceStats(base, 5)).toEqual({ atk: 14, def: 0, hp: 0, spd: 0 }); // 10 × 1.4
    expect(enhanceStats(base, 10)).toEqual({ atk: 18, def: 0, hp: 0, spd: 0 }); // 10 × 1.8
  });

  it('ระดับนอกช่วงถูก clamp (ติดลบ/เกินเพดาน)', () => {
    expect(enhanceFactor(-3)).toBe(1);
    expect(enhanceFactor(999)).toBe(1 + ENHANCE_MAX_LEVEL * 0.08);
  });
});