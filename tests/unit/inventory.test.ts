// Inventory / Event Quest tests — Phase 11.3
import { inventoryCode, inventoryTypeForReward } from '@/services/inventory';
import { dailyKey, metricForQuest, periodKeyFor, weeklyKey } from '@/services/event-quest';

describe('inventoryTypeForReward (ปลายทางรางวัล)', () => {
  test('รางวัลที่เป็นของสะสม → มีประเภทในคลัง', () => {
    expect(inventoryTypeForReward('CARD')).toBe('CARD');
    expect(inventoryTypeForReward('COSMETIC')).toBe('COSMETIC');
    expect(inventoryTypeForReward('TITLE')).toBe('TITLE');
    expect(inventoryTypeForReward('CRAFTING_DUST')).toBe('CRAFTING_DUST');
    expect(inventoryTypeForReward('STORY_CHAPTER')).toBe('STORY_CHAPTER');
  });

  test('COIN / VEIL_SHARDS ไม่ใช่ของสะสม (เข้ากระเป๋าเงิน/กิจกรรม)', () => {
    expect(inventoryTypeForReward('COIN')).toBeNull();
    expect(inventoryTypeForReward('VEIL_SHARDS')).toBeNull();
  });
});

describe('inventoryCode', () => {
  test('สร้าง code คงที่จากชื่อ (อังกฤษ/ตัวเลข/ขีดล่าง)', () => {
    expect(inventoryCode('Avatar Frame: ม่านไร้จันทร์')).toBe(inventoryCode('Avatar Frame: ม่านไร้จันทร์'));
    expect(inventoryCode('Shadow Card Art Variant')).toBe('SHADOW_CARD_ART_VARIANT');
    expect(inventoryCode('Avatar Frame: ม่านไร้จันทร์')).toBe('AVATAR_FRAME');
  });

  test('ชื่อว่าง/สัญลักษณ์ล้วน → ใช้ hash fallback (ไม่ชนกัน)', () => {
    expect(inventoryCode('   ')).toMatch(/^ITEM_[A-F0-9]{8}$/);
    expect(inventoryCode('!!!')).toMatch(/^ITEM_[A-F0-9]{8}$/);
    // ต่างกัน → hash ต่างกัน (ไม่ชนกันแม้ slug จะว่างทั้งคู่)
    expect(inventoryCode('!!!')).not.toBe(inventoryCode('???'));
  });

  test('ชื่อไทยล้วน → hash fallback และคงที่', () => {
    const a = inventoryCode('ผู้สังเกตการณ์รอยแยก');
    expect(a).toMatch(/^ITEM_[A-F0-9]{8}$/);
    expect(inventoryCode('ผู้สังเกตการณ์รอยแยก')).toBe(a);
    expect(inventoryCode('นักรวบฝุ่นเวท')).not.toBe(a);
  });

  test('ตัดความยาวไม่เกิน 40 ตัวอักษร (เมื่อเป็น slug ละติน)', () => {
    expect(inventoryCode('A'.repeat(120)).length).toBeLessThanOrEqual(40);
  });
});

describe('event quest metric + period key (Phase 11.2)', () => {
  test('ตีความ metric จากคำในชื่อ/คำอธิบาย', () => {
    expect(metricForQuest('Rift Scout', 'เข้าร่วม Raid 3 ครั้ง')).toBe('RAID');
    expect(metricForQuest('Gate Breaker', 'สร้างดาเมจรวม 50,000')).toBe('DAMAGE');
    expect(metricForQuest('Shard Collector', 'สะสม Veil Shards 50 ชิ้น')).toBe('SHARDS');
  });

  test('period key: DAILY = วันที่ / WEEKLY = ISO week / อื่น ๆ = ALL', () => {
    const now = new Date(2026, 8, 21, 15, 0, 0); // 21 ก.ย. 2026 (จันทร์)
    expect(periodKeyFor('DAILY', now)).toBe(dailyKey(now));
    expect(periodKeyFor('WEEKLY', now)).toBe(weeklyKey(now));
    expect(periodKeyFor('MILESTONE', now)).toBe('ALL');
    expect(periodKeyFor('COMMUNITY', now)).toBe('ALL');
  });

  test('dailyKey ใช้รูปแบบ YYYY-MM-DD และ weeklyKey ใช้ YYYY-Www', () => {
    const now = new Date(2026, 8, 21);
    expect(dailyKey(now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(weeklyKey(now)).toMatch(/^\d{4}-W\d{2}$/);
  });

  test('วันเดียวกันได้คีย์เดิม (idempotent ต่อวัน)', () => {
    const a = new Date(2026, 8, 21, 1, 0, 0);
    const b = new Date(2026, 8, 21, 23, 59, 0);
    expect(dailyKey(a)).toBe(dailyKey(b));
  });
});
