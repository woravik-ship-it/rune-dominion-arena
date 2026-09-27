// Level/EXP (Phase 33) — โค้ง exp, โบนัสดรอป Item, รางวัลขึ้นเลเวล
// ผู้ใช้สั่ง 2026-09-27: "Level สูงสุด 350 · Level สูงเพิ่มโอกาสดรอบ Item สูงสุด +20%
//   · EXP เลเวลสูงยิ่งขึ้นยาก (เล่นหลักปีถึง 300-350) · Level Up ได้ Item/Coin/พลังงานตาม Level"
import {
  EXP_CURVE_POWER,
  EXP_REWARD,
  MAX_ITEM_DROP_BONUS,
  MAX_LEVEL,
  TOTAL_EXP_AT_MAX,
  expForLevel,
  expToNextLevel,
  itemDropBonus,
  itemDropBonusPercent,
  levelFromExp,
  levelProgress,
  levelReward,
  levelRewardItem,
  levelUpSummary,
} from '@/lib/level';

describe('Level/EXP — โครงสร้างพื้นฐาน', () => {
  test('เลเวลสูงสุด 350 และเลเวล 1 = 0 exp', () => {
    expect(MAX_LEVEL).toBe(350);
    expect(expForLevel(1)).toBe(0);
    expect(expForLevel(MAX_LEVEL)).toBe(TOTAL_EXP_AT_MAX);
  });

  test('โค้ง exp ต้องเพิ่มขึ้นเสมอ และเลเวล 2 ใช้ exp น้อย (เล่น 1-2 ศึกก็ถึง)', () => {
    for (let level = 1; level < MAX_LEVEL; level += 1) {
      expect(expForLevel(level + 1)).toBeGreaterThan(expForLevel(level));
    }
    expect(expForLevel(2)).toBeLessThan(EXP_REWARD.battleWin * 5);
  });

  test('levelFromExp สอดคล้องกับ expForLevel (ไป-กลับครบทุกช่วง)', () => {
    for (const level of [1, 2, 5, 10, 50, 100, 200, 300, 349, 350]) {
      expect(levelFromExp(expForLevel(level))).toBe(level);
      if (level > 1) expect(levelFromExp(expForLevel(level) - 1)).toBe(level - 1);
    }
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(TOTAL_EXP_AT_MAX * 10)).toBe(MAX_LEVEL);
  });

  test('ช่วงท้ายเกมต้องหนักจริง (ผู้ใช้สั่ง: 300-350 ต้องเล่นยาวเป็นเดือน-เป็นปี)', () => {
    const to300 = expForLevel(300);
    const tail = expForLevel(350) - to300;
    // ช่วง 300→350 ต้องกิน exp อย่างน้อย 1/4 ของทั้งหมด
    expect(tail / TOTAL_EXP_AT_MAX).toBeGreaterThan(0.24);
    // และ exp ต่อเลเวลช่วงท้ายต้องมากกว่าช่วงต้นหลายร้อยเท่า
    expect(expToNextLevel(340) / expToNextLevel(2)).toBeGreaterThan(200);
  });

  test('levelProgress คืนค่าตรงกับช่วงเลเวลปัจจุบัน', () => {
    const level = 57;
    const base = expForLevel(level);
    const progress = levelProgress(base + 10);
    expect(progress.level).toBe(level);
    expect(progress.intoLevel).toBe(10);
    expect(progress.levelSpan).toBe(expForLevel(level + 1) - base);
    expect(progress.toNext).toBe(progress.levelSpan - 10);
    expect(progress.ratio).toBeGreaterThan(0);
    expect(progress.isMax).toBe(false);

    const maxed = levelProgress(TOTAL_EXP_AT_MAX + 999);
    expect(maxed.level).toBe(MAX_LEVEL);
    expect(maxed.isMax).toBe(true);
    expect(maxed.toNext).toBe(0);
    expect(expToNextLevel(MAX_LEVEL)).toBe(0);
  });
});

describe('Level/EXP — โบนัสโอกาสดรอป Item (สูงสุด +20%)', () => {
  test('เลเวล 1 = 0% · เลเวล 350 = +20% · เพิ่มขึ้นตามเลเวล', () => {
    expect(itemDropBonus(1)).toBe(0);
    expect(itemDropBonusPercent(1)).toBe(0);
    expect(itemDropBonus(MAX_LEVEL)).toBeCloseTo(MAX_ITEM_DROP_BONUS, 5);
    expect(itemDropBonusPercent(MAX_LEVEL)).toBe(20);
    expect(itemDropBonusPercent(175)).toBe(10);
    let previous = -1;
    for (const level of [1, 50, 100, 200, 300, 350]) {
      const value = itemDropBonusPercent(level);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    // ค่าเพี้ยนต้องไม่ทำให้พัง
    expect(itemDropBonusPercent(Number.NaN)).toBe(0);
    expect(itemDropBonusPercent(999)).toBe(20);
  });
});

describe('Level/EXP — รางวัลขึ้นเลเวล', () => {
  test('พลังงานที่ได้ = เลขเลเวล (Level 2 ได้ 2 · Level 3 ได้ 3) ตามที่ผู้ใช้สั่ง', () => {
    expect(levelReward(2).energy).toBe(2);
    expect(levelReward(3).energy).toBe(3);
    expect(levelReward(87).energy).toBe(87);
    // ไต่ขึ้นตามเลเวล
    for (const level of [2, 3, 10, 50, 350]) {
      expect(levelReward(level).energy).toBe(level);
    }
  });

  test('Coin เพิ่มตามเลเวลแบบนุ่ม ๆ (ไม่ให้เงินเฟ้อ)', () => {
    expect(levelReward(2).coins).toBe(16);
    expect(levelReward(350).coins).toBe(712);
    expect(levelReward(100).coins).toBeGreaterThan(levelReward(2).coins);
  });

  test('Item รางวัลตามช่วงเลเวล (ยิ่งสูงยิ่งหายาก) และเลเวล 350 ได้ของสูงสุด', () => {
    expect(levelRewardItem(2)).toBeNull();
    expect(levelRewardItem(5)).toBe('ATK_WHETSTONE');
    expect(levelRewardItem(10)).toBe('DEF_TIDEWALL');
    expect(levelRewardItem(25)).toBe('ATK_MOONLESS_BLADE');
    expect(levelRewardItem(50)).toBe('DEF_VEILGUARD');
    expect(levelRewardItem(100)).toBe('ATK_STORMFANG');
    expect(levelRewardItem(350)).toBe('SUP_ORIGIN_RELIC');
  });

  test('levelUpSummary รวมรางวัลเมื่อขึ้นหลายเลเวลพร้อมกัน', () => {
    const from = expForLevel(5) + 1;
    const to = expForLevel(8) + 1;
    const summary = levelUpSummary(from, to);
    expect(summary.fromLevel).toBe(5);
    expect(summary.toLevel).toBe(8);
    expect(summary.gainedLevels).toBe(3);
    // เลเวล 6, 7, 8 → พลังงาน 6+7+8 (8 ไม่ใช่ผลคูณ 5 → ไม่มี Item)
    expect(summary.totalEnergy).toBe(6 + 7 + 8);
    expect(summary.totalCoins).toBe(12 + 2 * 6 + 12 + 2 * 7 + 12 + 2 * 8);
    expect(summary.items).toEqual([]);

    const many = levelUpSummary(expForLevel(9), expForLevel(11));
    expect(many.gainedLevels).toBe(2);
    expect(many.items).toEqual(['DEF_TIDEWALL']); // เลเวล 10 ได้ Item
  });

  test('ไม่ขึ้นเลเวล = ไม่มีรางวัล', () => {
    const summary = levelUpSummary(expForLevel(12) + 1, expForLevel(12) + 5);
    expect(summary.gainedLevels).toBe(0);
    expect(summary.totalCoins).toBe(0);
    expect(summary.totalEnergy).toBe(0);
  });

  test('EXP_CURVE_POWER ถูกใช้จริง (โค้งไม่ใช่เส้นตรง)', () => {
    expect(EXP_CURVE_POWER).toBeGreaterThan(1);
    // ครึ่งทางของเลเวล ใช้ exp น้อยกว่าครึ่งของทั้งหมดมาก (โค้งยกกำลัง)
    expect(expForLevel(175) / TOTAL_EXP_AT_MAX).toBeLessThan(0.3);
  });
});
