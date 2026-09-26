// Veil Shards — กฎของสกุลเงินกลาง (Phase 25)
//
// ผู้ใช้สั่ง 2026-09-27: "ได้จากการขายการ์ดคืนร้าน จำนวนขึ้นกับความหายากของการ์ด บางส่วนก็ได้จากกิจกรรม"
//  - ขายการ์ดคืนร้าน → ได้ Veil Shards ตามความหายาก (ตารางด้านล่าง)
//  - กิจกรรม (Boss Raid / ภารกิจกิจกรรม / Milestone ชุมชน) → ได้/ใช้ Veil Shards
//  - ร้านช่าง (ซื้อ/คราฟต์ Item) → ใช้ Veil Shards (+ ฝุ่นเวทสำหรับคราฟต์)
//
// ไฟล์นี้เป็น "กฎบริสุทธิ์" (ไม่แตะ DB) ⇒ เทสต์ได้ตรง ๆ และใช้ร่วมกันทั้ง UI และ API
// (ตัวเลขในเกมต้องมาจากที่เดียว — UI ห้ามคำนวณเอง)
import type { Rarity } from '@prisma/client';

/**
 * มูลค่าการขายการ์ดคืนร้าน แยกตามความหายาก (Veil Shards ต่อ 1 ใบ)
 * ออกแบบให้ "ขายการ์ดไม่ใช่ทางรวย" แต่เป็นทางออกของผู้เล่นใหม่ที่ยังไม่ติดกิจกรรม:
 *   ขายการ์ด COMMON 3 ใบ = 6 shards · ขายการ์ด MYTHIC 1 ใบ = 200 shards (คุ้มกว่ามาก)
 */
export const CARD_SELL_VALUE: Record<Rarity, number> = {
  COMMON: 2,
  UNCOMMON: 5,
  RARE: 12,
  EPIC: 30,
  LEGENDARY: 80,
  MYTHIC: 200,
};

/** มูลค่าขายการ์ด 1 ใบ (rarity ที่ไม่รู้จัก → ถือเป็น COMMON ไม่ให้พัง) */
export function cardSellValue(rarity: string): number {
  const value = CARD_SELL_VALUE[rarity as Rarity];
  return Number.isFinite(value) && value > 0 ? value : CARD_SELL_VALUE.COMMON;
}

/** มูลค่ารวมเมื่อขายหลายใบ (quantity ≥ 1) */
export function cardSellTotal(rarity: string, quantity: number): number {
  const count = Math.max(1, Math.trunc(Number.isFinite(quantity) ? quantity : 1));
  return cardSellValue(rarity) * count;
}

/** ที่มาของ Veil Shards — ใช้บันทึกใน ledger + แสดงใน UI */
export const VEIL_SHARD_SOURCES = {
  CARD_SELL: 'CARD_SELL',
  EVENT_RAID: 'EVENT_RAID',
  EVENT_QUEST: 'EVENT_QUEST',
  EVENT_MILESTONE: 'EVENT_MILESTONE',
  ITEM_BUY: 'ITEM_BUY',
  ITEM_CRAFT: 'ITEM_CRAFT',
} as const;

export type VeilShardSource = keyof typeof VEIL_SHARD_SOURCES;

/** เงินพอหรือไม่ (ใช้ทั้งฝั่ง UI—ปุ่ม disabled—และฝั่งเซิร์ฟเวอร์) */
export function canAfford(balance: number, cost: number): boolean {
  return Number.isFinite(balance) && Number.isFinite(cost) && balance >= cost && cost >= 0;
}
