// Level / EXP — Phase 33 (ไฟล์บริสุทธิ์ · เทสต์ได้ · UI/API ใช้ตัวเลขชุดเดียวกัน)
//
// ผู้ใช้สั่ง 2026-09-27: *"เพิ่มระบบ Exp Level สูงสุด 350 · Level สูงเพิ่มโอกาสดรอบ Item สูงสุด +20%
//   · EXP เลเวลสูงยิ่งขึ้นยาก ให้ยากพอที่คนจะต้องเล่นหลักปีถึงจะได้ 300-350
//   · Level Up ได้รับรางวัล Item / Coin / พลังงาน ตาม Level (Level 2 ได้ 2 · Level 3 ได้ 3)"*
//
// หลักการ
//  - **เลเวลคำนวณจาก exp เสมอ** (ไม่เก็บคอลัมน์ level ใน DB) ⇒ ไม่มีทางที่ค่าเลเวลกับ exp จะไม่ตรงกัน
//  - EXP รวมที่ต้องใช้ถึงเลเวลสูงสุด = 6,000,000 และโค้งเป็นกำลัง 2.1
//      ⇒ เลเวลต้น ๆ เร็ว (เล่น 1-2 ศึกก็เลเวล 2) แต่ช่วง 300→350 ใช้ exp ~1.66 ล้าน
//  - โบนัสโอกาสดรอป Item จากดันเจี้ยน: 0% ที่เลเวล 1 → +20% ที่เลเวล 350 (เส้นตรงตามช่วงเลเวล)
import type { Rarity } from '@prisma/client';

/** เลเวลสูงสุดของเกม */
export const MAX_LEVEL = 350;

/** EXP รวมที่ต้องใช้ถึงเลเวล MAX_LEVEL (ใช้กำหนดรูปโค้ง) */
export const TOTAL_EXP_AT_MAX = 6_000_000;

/** เลขยกกำลังของโค้ง EXP (ยิ่งสูง ช่วงท้ายยิ่งหนัก) */
export const EXP_CURVE_POWER = 2.1;

/** โบนัสโอกาสดรอป Item สูงสุด (ที่เลเวล MAX_LEVEL) */
export const MAX_ITEM_DROP_BONUS = 0.2;

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
}

function clampExp(exp: number): number {
  if (!Number.isFinite(exp)) return 0;
  return Math.max(0, Math.trunc(exp));
}

/** EXP รวม (สะสม) ที่ต้องมีเพื่อไปถึงเลเวลนั้น · เลเวล 1 = 0 */
export function expForLevel(level: number): number {
  const target = clampLevel(level);
  if (target <= 1) return 0;
  return Math.round(TOTAL_EXP_AT_MAX * Math.pow(target / MAX_LEVEL, EXP_CURVE_POWER));
}

/** เลเวลจาก exp สะสม (1..MAX_LEVEL) */
export function levelFromExp(exp: number): number {
  const value = clampExp(exp);
  if (value >= TOTAL_EXP_AT_MAX) return MAX_LEVEL;
  // หาเลเวลด้วยการค้นหาแบบทวิภาค (โค้ง monotonic ⇒ ปลอดภัยและเร็ว)
  let low = 1;
  let high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (expForLevel(mid) <= value) low = mid;
    else high = mid - 1;
  }
  return low;
}

export interface LevelProgress {
  level: number;
  /** exp สะสมทั้งหมด */
  exp: number;
  /** exp ที่มีในช่วงเลเวลปัจจุบัน */
  intoLevel: number;
  /** exp ที่ต้องใช้เพื่อขึ้นเลเวลถัดไป (0 เมื่อเต็มเลเวล) */
  levelSpan: number;
  /** exp ที่ยังขาดเพื่อขึ้นเลเวลถัดไป */
  toNext: number;
  /** สัดส่วนความคืบหน้าในเลเวลปัจจุบัน (0..1) */
  ratio: number;
  isMax: boolean;
}

/** สรุปความคืบหน้าของเลเวล (ใช้ทั้ง UI และ API) */
export function levelProgress(exp: number): LevelProgress {
  const value = clampExp(exp);
  const level = levelFromExp(value);
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, exp: value, intoLevel: 0, levelSpan: 0, toNext: 0, ratio: 1, isMax: true };
  }
  const base = expForLevel(level);
  const next = expForLevel(level + 1);
  const span = Math.max(1, next - base);
  const into = Math.max(0, value - base);
  const toNext = Math.max(0, next - value);
  return {
    level, exp: value, intoLevel: into, levelSpan: span, toNext,
    ratio: Math.min(1, Math.max(0, into / span)), isMax: false,
  };
}

/** EXP ที่ต้องใช้เพื่อขึ้นจากเลเวลนี้ไปเลเวลถัดไป (0 = เต็มเลเวล) */
export function expToNextLevel(level: number): number {
  const current = clampLevel(level);
  if (current >= MAX_LEVEL) return 0;
  return expForLevel(current + 1) - expForLevel(current);
}

/**
 * โบนัสโอกาสดรอป Item จากดันเจี้ยน (เป็นสัดส่วน 0..0.2)
 * ผู้ใช้สั่ง: "Level สูงเพิ่มโอกาสดรอบ Item สูงสุด +20%"
 */
export function itemDropBonus(level: number): number {
  const current = clampLevel(level);
  if (current <= 1) return 0;
  const ratio = (current - 1) / (MAX_LEVEL - 1);
  return Number((ratio * MAX_ITEM_DROP_BONUS).toFixed(4));
}

/** โบนัสเป็นเปอร์เซ็นต์แบบปัดเป็นจำนวนเต็ม (ไว้โชว์ใน UI) */
export function itemDropBonusPercent(level: number): number {
  return Math.round(itemDropBonus(level) * 100);
}
export interface LevelReward {
  /** Coin ที่ได้เมื่อขึ้นมาเลเวลนี้ */
  coins: number;
  /** พลังงานที่ได้ = เลขเลเวลนั้น (Level 2 → 2 · Level 3 → 3) */
  energy: number;
  /** Item ที่ได้ (null = เลเวลนี้ไม่ได้ของ) */
  itemCode: string | null;
}

/**
 * โบนัส Item ตามช่วงเลเวล (ของยิ่งสูงยิ่งหายาก) — ใช้รหัส "ไอเทมช่าง" จาก item-definitions
 * จังหวะ: ทุก 5 เลเวลได้ของพื้นฐาน · ทุก 10/25/50/100 ได้ของหายากขึ้นตามลำดับ
 */
export function levelRewardItem(level: number): string | null {
  const target = clampLevel(level);
  if (target >= MAX_LEVEL) return 'SUP_ORIGIN_RELIC'; // รางวัลสูงสุดของเกม (เลเวล 350)
  if (target % 100 === 0) return 'ATK_STORMFANG';
  if (target % 50 === 0) return 'DEF_VEILGUARD';
  if (target % 25 === 0) return 'ATK_MOONLESS_BLADE';
  if (target % 10 === 0) return 'DEF_TIDEWALL';
  if (target % 5 === 0) return 'ATK_WHETSTONE';
  return null;
}

/** รางวัลเมื่อ "ขึ้นมาเลเวลนี้" (Coin + พลังงาน + Item) */
export function levelReward(level: number): LevelReward {
  const target = clampLevel(level);
  // Coin เพิ่มแบบนุ่มมาก (Phase 37 กันเงินเฟ้อ): 12 + 2×เลเวล ⇒ L350 ได้ 712 (เดิม 2,120)
  const coins = 12 + target * 2;
  return { coins, energy: target, itemCode: levelRewardItem(target) };
}

export interface LevelUpSummary {
  fromLevel: number;
  toLevel: number;
  gainedLevels: number;
  totalCoins: number;
  totalEnergy: number;
  items: string[];
}

/** รวมรางวัลของการขึ้นหลายเลเวลพร้อมกัน (เช่น เก็บ exp ทีเดียวหลายพัน) */
export function levelUpSummary(fromExp: number, toExp: number): LevelUpSummary {
  const fromLevel = levelFromExp(fromExp);
  const toLevel = levelFromExp(toExp);
  let totalCoins = 0;
  let totalEnergy = 0;
  const items: string[] = [];
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    const reward = levelReward(level);
    totalCoins += reward.coins;
    totalEnergy += reward.energy;
    if (reward.itemCode) items.push(reward.itemCode);
  }
  return {
    fromLevel, toLevel, gainedLevels: Math.max(0, toLevel - fromLevel),
    totalCoins, totalEnergy, items,
  };
}

/** ระดับความหายากของรางวัลตามช่วงเลเวล (ไว้โชว์/เทสต์ความก้าวหน้า) */
export function levelRewardRarityTier(level: number): Rarity | null {
  const target = clampLevel(level);
  if (target >= MAX_LEVEL || target % 100 === 0) return 'MYTHIC';
  if (target % 50 === 0) return 'LEGENDARY';
  if (target % 25 === 0) return 'EPIC';
  if (target % 10 === 0) return 'RARE';
  if (target % 5 === 0) return 'COMMON';
  return null;
}

/** EXP ที่ได้จากการชนะ/แพ้ (ใช้ร่วมกันทุกโหมด เพื่อไม่ให้ตัวเลขแตกกัน) */
export const EXP_REWARD = {
  /** ศึกปกติ (PvP/บอท) ชนะ */
  battleWin: 30,
  /** ศึกปกติ แพ้ */
  battleLose: 10,
  /** ดันเจี้ยน: ฐาน + ต่อชั้น (ยิ่งลึกยิ่งคุ้ม) — เฉพาะชั้นที่ยังไม่เคยผ่าน */
  dungeonBase: 12,
  dungeonPerFloor: 4,
} as const;

