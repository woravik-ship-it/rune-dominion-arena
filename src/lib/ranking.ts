// ตาราง Ranking ผู้เล่น (Phase 28)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำตาราง Ranking ผู้เล่น ให้ด้วย"
//  - จัดอันดับได้หลายหมวด (พลังทีม · คะแนนสะสมการ์ด · ชนะศึก · คะแนนกิจกรรม · Coin)
//  - กติกาการจัดอันดับเป็นฟังก์ชันบริสุทธิ์ ⇒ เทสต์ได้ และทุกหมวดคิดเหมือนกันเป๊ะ
//    อันดับแบบ "การแข่งขัน" (competition ranking): ค่าเท่ากันได้อันดับเท่ากัน แล้วข้ามอันดับถัดไป
//    เช่น 100, 90, 90, 80 → อันดับ 1, 2, 2, 4
import type { Rarity } from '@prisma/client';

export type RankingCategory = 'power' | 'collection' | 'wins' | 'event' | 'coin';

export interface RankingCategoryDef {
  key: RankingCategory;
  /** คีย์คำแปลชื่อหมวด */
  labelKey: string;
  /** ไอคอนในตาราง */
  icon: string;
  /** คีย์คำแปลหน่วยของค่า (เช่น "พลัง", "คะแนน") */
  unitKey: string;
}

export const RANKING_CATEGORIES: RankingCategoryDef[] = [
  { key: 'power', labelKey: 'rank.catPower', icon: '⚔️', unitKey: 'rank.unitPower' },
  { key: 'collection', labelKey: 'rank.catCollection', icon: '🃏', unitKey: 'rank.unitScore' },
  { key: 'wins', labelKey: 'rank.catWins', icon: '🏆', unitKey: 'rank.unitWins' },
  { key: 'event', labelKey: 'rank.catEvent', icon: '🌙', unitKey: 'rank.unitPoints' },
  { key: 'coin', labelKey: 'rank.catCoin', icon: '🪙', unitKey: 'rank.unitCoin' },
];

export function normalizeCategory(raw: unknown): RankingCategory {
  const value = typeof raw === 'string' ? raw : '';
  return (RANKING_CATEGORIES.find((c) => c.key === value)?.key ?? 'power') as RankingCategory;
}

export function categoryDef(key: RankingCategory): RankingCategoryDef {
  return RANKING_CATEGORIES.find((c) => c.key === key) ?? RANKING_CATEGORIES[0];
}

/**
 * น้ำหนักคะแนนสะสมการ์ดตามความหายาก (Phase 28)
 * ยิ่งหายากยิ่งมีค่าเป็นทวีคูณ ⇒ การสะสมการ์ดระดับสูงมีความหมายกว่าจำนวนใบเฉย ๆ
 */
export const RARITY_SCORE_WEIGHT: Record<Rarity, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 4,
  EPIC: 8,
  LEGENDARY: 16,
  MYTHIC: 32,
};

export function rarityScoreWeight(rarity: string): number {
  const weight = RARITY_SCORE_WEIGHT[rarity as Rarity];
  return Number.isFinite(weight) && weight > 0 ? weight : RARITY_SCORE_WEIGHT.COMMON;
}

/** คะแนนสะสมการ์ดของทั้งคลัง (rarity × จำนวนใบ) — integer เท่านั้น */
export function collectionScore(cards: Array<{ rarity: string; quantity: number }>): number {
  return cards.reduce((sum, card) => {
    const quantity = Number.isFinite(card.quantity) ? Math.max(0, Math.trunc(card.quantity)) : 0;
    return sum + rarityScoreWeight(card.rarity) * quantity;
  }, 0);
}

/**
 * แปลงค่าที่เรียงจากมากไปน้อยแล้ว → เลขอันดับ (1-based, ค่าเท่ากัน = อันดับเท่ากัน)
 * ตัวอย่าง: [100, 90, 90, 80] → [1, 2, 2, 4]
 */
export function assignRanks(sortedValues: number[]): number[] {
  const ranks: number[] = [];
  let previous: number | null = null;
  let previousRank = 0;
  sortedValues.forEach((value, index) => {
    if (previous !== null && value === previous) {
      ranks.push(previousRank);
      return;
    }
    previousRank = index + 1;
    previous = value;
    ranks.push(previousRank);
  });
  return ranks;
}

/** อันดับของค่าหนึ่งในรายการที่เรียงแล้ว (ไม่พบ = null) */
export function rankOfValue(sortedValues: number[], value: number): number | null {
  const index = sortedValues.findIndex((item) => item === value);
  return index === -1 ? null : index + 1;
}

/** ตัดเฉพาะ N อันดับแรก (ค่า default 50 · กัน 0/ค่าติดลบ) */
export function topEntries<T>(entries: T[], limit = 50): T[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 50;
  return entries.slice(0, safeLimit);
}

/** เหรียญของสามอันดับแรก (อันดับอื่นคืนสตริงว่าง) */
export function medalFor(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}
