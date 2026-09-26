// เทสต์กฎ Veil Shards (Phase 25) — สกุลเงินกลางที่ได้จาก "ขายการ์ดคืนร้าน" + กิจกรรม
// ผู้ใช้สั่ง 2026-09-27: "ได้จากการขายการ์ดคืนร้าน จำนวนขึ้นกับความหายากของการ์ด"
import {
  CARD_SELL_VALUE,
  canAfford,
  cardSellTotal,
  cardSellValue,
  VEIL_SHARD_SOURCES,
} from '@/lib/veil-shards';

describe('มูลค่าขายการ์ดคืนร้าน (ตามความหายาก)', () => {
  test('ความหายากสูง → ขายได้ Veil Shards มากขึ้น (เรียงขึ้นทุกขั้น)', () => {
    const order = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;
    const values = order.map((rarity) => cardSellValue(rarity));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  test('ค่าทุกขั้นเป็นจำนวนเต็มบวก', () => {
    for (const value of Object.values(CARD_SELL_VALUE)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  test('การ์ดทั่วไปขายได้เล็กน้อย · การ์ดระดับสูงคุ้มกว่ามาก', () => {
    expect(cardSellValue('COMMON')).toBeLessThanOrEqual(5);
    expect(cardSellValue('MYTHIC')).toBeGreaterThanOrEqual(100);
  });

  test('rarity ที่ไม่รู้จัก → ใช้ค่าของ COMMON (ไม่ throw/ไม่เป็น NaN)', () => {
    expect(cardSellValue('UNKNOWN')).toBe(CARD_SELL_VALUE.COMMON);
    expect(cardSellValue('')).toBe(CARD_SELL_VALUE.COMMON);
  });

  test('ขายหลายใบ = มูลค่าต่อใบ × จำนวน', () => {
    expect(cardSellTotal('RARE', 3)).toBe(cardSellValue('RARE') * 3);
  });

  test('จำนวนเพี้ยน (0/ติดลบ/ทศนิยม/NaN) → นับเป็นอย่างน้อย 1 ใบ', () => {
    expect(cardSellTotal('RARE', 0)).toBe(cardSellValue('RARE'));
    expect(cardSellTotal('RARE', -5)).toBe(cardSellValue('RARE'));
    expect(cardSellTotal('RARE', 2.7)).toBe(cardSellValue('RARE') * 2);
    expect(cardSellTotal('RARE', Number.NaN)).toBe(cardSellValue('RARE'));
  });
});

describe('ที่มา + การเช็คยอด', () => {
  test('มีที่มาครบทั้ง 2 ทางที่ผู้เล่นได้ Veil Shards + การใช้จ่าย', () => {
    expect(VEIL_SHARD_SOURCES.CARD_SELL).toBe('CARD_SELL');
    expect(VEIL_SHARD_SOURCES.EVENT_RAID).toBe('EVENT_RAID');
    expect(VEIL_SHARD_SOURCES.EVENT_QUEST).toBe('EVENT_QUEST');
    expect(VEIL_SHARD_SOURCES.EVENT_MILESTONE).toBe('EVENT_MILESTONE');
    expect(VEIL_SHARD_SOURCES.ITEM_BUY).toBe('ITEM_BUY');
    expect(VEIL_SHARD_SOURCES.ITEM_CRAFT).toBe('ITEM_CRAFT');
  });

  test('canAfford: พอ/ไม่พอ/ค่าเพี้ยน', () => {
    expect(canAfford(30, 12)).toBe(true);
    expect(canAfford(12, 12)).toBe(true);
    expect(canAfford(11, 12)).toBe(false);
    expect(canAfford(Number.NaN, 12)).toBe(false);
    expect(canAfford(100, -1)).toBe(false);
  });
});
