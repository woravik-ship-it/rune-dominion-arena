// เทสต์กติกาตาราง Ranking (Phase 28)
// ผู้ใช้สั่ง 2026-09-27: "ทำตาราง Ranking ผู้เล่น ให้ด้วย"
import {
  RANKING_CATEGORIES,
  RARITY_SCORE_WEIGHT,
  assignRanks,
  categoryDef,
  collectionScore,
  medalFor,
  normalizeCategory,
  rankOfValue,
  rarityScoreWeight,
  topEntries,
} from '@/lib/ranking';

describe('หมวดการจัดอันดับ', () => {
  test('มี 5 หมวด ตามที่ออกแบบ (พลังทีม/สะสม/ชนะ/กิจกรรม/Coin)', () => {
    expect(RANKING_CATEGORIES.map((c) => c.key)).toEqual([
      'power', 'collection', 'wins', 'event', 'coin',
    ]);
  });

  test('ทุกหมวดมีคีย์คำแปล + ไอคอน', () => {
    for (const category of RANKING_CATEGORIES) {
      expect(category.labelKey).toMatch(/^rank\./);
      expect(category.unitKey).toMatch(/^rank\./);
      expect(category.icon.length).toBeGreaterThan(0);
    }
  });

  test('หมวดที่ไม่รู้จัก → ใช้พลังทีม (ไม่ throw)', () => {
    expect(normalizeCategory('nope')).toBe('power');
    expect(normalizeCategory(undefined)).toBe('power');
    expect(normalizeCategory(123)).toBe('power');
    expect(normalizeCategory('wins')).toBe('wins');
  });

  test('categoryDef คืนคำนิยามของหมวดนั้น', () => {
    expect(categoryDef('coin').key).toBe('coin');
  });
});

describe('คะแนนสะสมการ์ด (rarity × จำนวนใบ)', () => {
  test('การ์ดหายากให้คะแนนมากกว่า (ทุกขั้น)', () => {
    const order = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;
    for (let i = 1; i < order.length; i += 1) {
      expect(rarityScoreWeight(order[i])).toBeGreaterThan(rarityScoreWeight(order[i - 1]));
    }
    expect(RARITY_SCORE_WEIGHT.MYTHIC).toBeGreaterThan(RARITY_SCORE_WEIGHT.LEGENDARY);
  });

  test('rarity ที่ไม่รู้จักคิดเป็น COMMON', () => {
    expect(rarityScoreWeight('???')).toBe(RARITY_SCORE_WEIGHT.COMMON);
  });

  test('รวมทั้งคลัง = ผลบวก rarity × จำนวน', () => {
    const score = collectionScore([
      { rarity: 'COMMON', quantity: 3 },
      { rarity: 'EPIC', quantity: 2 },
      { rarity: 'MYTHIC', quantity: 1 },
    ]);
    expect(score).toBe(1 * 3 + 8 * 2 + 32 * 1);
  });

  test('คลังว่าง = 0 · จำนวนเพี้ยนไม่ทำให้ติดลบ', () => {
    expect(collectionScore([])).toBe(0);
    expect(collectionScore([{ rarity: 'RARE', quantity: -5 }])).toBe(0);
    expect(collectionScore([{ rarity: 'RARE', quantity: Number.NaN }])).toBe(0);
  });
});

describe('การคิดอันดับ (ค่าเท่ากัน = อันดับเท่ากัน)', () => {
  test('อันดับแบบการแข่งขัน: 100,90,90,80 → 1,2,2,4', () => {
    expect(assignRanks([100, 90, 90, 80])).toEqual([1, 2, 2, 4]);
  });

  test('ทุกคนเท่ากัน → อันดับ 1 ทั้งหมด', () => {
    expect(assignRanks([7, 7, 7])).toEqual([1, 1, 1]);
  });

  test('ค่าลดหลั่นตามลำดับ', () => {
    expect(assignRanks([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });

  test('รายการว่าง → ว่าง', () => {
    expect(assignRanks([])).toEqual([]);
  });

  test('rankOfValue หาอันดับจากค่า (ไม่พบ = null)', () => {
    const values = [100, 90, 80];
    expect(rankOfValue(values, 90)).toBe(2);
    expect(rankOfValue(values, 999)).toBeNull();
  });
});

describe('การตัดตาราง + เหรียญ', () => {
  test('topEntries ตัดตาม limit และกันค่าเพี้ยน', () => {
    const list = [1, 2, 3, 4, 5, 6];
    expect(topEntries(list, 3)).toEqual([1, 2, 3]);
    expect(topEntries(list, 0)).toHaveLength(6);
    expect(topEntries(list, -2)).toHaveLength(6);
  });

  test('เหรียญ 3 อันดับแรกเท่านั้น', () => {
    expect(medalFor(1)).toBe('🥇');
    expect(medalFor(2)).toBe('🥈');
    expect(medalFor(3)).toBe('🥉');
    expect(medalFor(4)).toBe('');
  });
});
