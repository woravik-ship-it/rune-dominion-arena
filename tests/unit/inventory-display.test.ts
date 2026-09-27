// Inventory Display (Phase 31.1) — แปลงรหัสที่มาหลังบ้านเป็นข้อความผู้เล่น
// ผู้ใช้สั่ง: "ข้อความเทคนิคหลังบ้านไม่ต้องนำมาแสดงให้เห็น"
import { sourceLabelTh } from '@/lib/inventory-display';

describe('sourceLabelTh — ที่มาของรางวัล', () => {
  test('รางวัลจากดันเจี้ยน → ชื่อดัน + ชั้น (ไม่โชว์รหัส)', () => {
    expect(sourceLabelTh('DUNGEON:EMBER_CRYPT:F1')).toBe('ดันเจี้ยน สุสานเพลิง ชั้น 1');
    expect(sourceLabelTh('DUNGEON:GILDED_ABYSS:F4')).toBe('ดันเจี้ยน เหวลึกทองคำ ชั้น 4');
    expect(sourceLabelTh('DUNGEON:UNKNOWN_CODE:F2')).toBe('รางวัลจากดันเจี้ยน ชั้น 2');
  });

  test('รางวัลกิจกรรม/ร้าน/ของเริ่มเกม → ข้อความไทย', () => {
    expect(sourceLabelTh('EVENT_MILESTONE:PERSONAL:2')).toBe('รางวัลกิจกรรม');
    expect(sourceLabelTh('EVENT_SHOP:SHARD_CRAFTING_DUST')).toBe('ร้านกิจกรรม');
    expect(sourceLabelTh('EVENT_QUEST:DAILY:1')).toBe('ภารกิจกิจกรรม');
    expect(sourceLabelTh('STARTER:DECK')).toBe('ของเริ่มเกม');
  });

  test('รหัสที่ไม่รู้จัก/ว่าง → null (UI ซ่อน ไม่โชว์ของดิบ)', () => {
    expect(sourceLabelTh('SOME_INTERNAL_CODE_XYZ')).toBeNull();
    expect(sourceLabelTh('')).toBeNull();
    expect(sourceLabelTh(null)).toBeNull();
    expect(sourceLabelTh(undefined)).toBeNull();
  });
});
