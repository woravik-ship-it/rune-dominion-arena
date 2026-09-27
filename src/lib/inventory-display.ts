// Inventory Display — Phase 31.1: แปลง "รหัสหลังบ้าน" เป็นข้อความที่ผู้เล่นอ่านรู้เรื่อง
//
// ผู้ใช้แจ้ง 2026-09-27: "ข้อความเทคนิคหลังบ้านไม่ต้องนำมาแสดงให้เห็น"
//   กระเป๋าเดิมพิมพ์ `item.source` ตรง ๆ เช่น `DUNGEON:EMBER_CRYPT:F1` หรือ `EVENT_MILESTONE:PERSONAL:2`
//   ⇒ ที่นี่แปลงเป็นประโยคไทย · รหัสที่ไม่รู้จักคืน null (UI จะซ่อนทิ้ง ไม่โชว์ของดิบ)
import { DUNGEONS } from '@/lib/dungeon-definitions';

/** ที่มาของรางวัลที่รู้จัก (ขึ้นต้นด้วยค่านี้) → ข้อความไทย */
const SOURCE_PREFIX_LABEL: Array<{ prefix: string; labelTh: string }> = [
  { prefix: 'EVENT_MILESTONE', labelTh: 'รางวัลกิจกรรม' },
  { prefix: 'EVENT_SHOP', labelTh: 'ร้านกิจกรรม' },
  { prefix: 'EVENT_QUEST', labelTh: 'ภารกิจกิจกรรม' },
  { prefix: 'ADMIN', labelTh: 'ของขวัญจากผู้ดูแล' },
  { prefix: 'STARTER', labelTh: 'ของเริ่มเกม' },
];

/** แปลงรหัสที่มา → ข้อความผู้เล่น · คืน null เมื่อไม่รู้จัก (ให้ UI ซ่อน) */
export function sourceLabelTh(source: string | null | undefined): string | null {
  const raw = (source ?? '').trim();
  if (!raw) return null;

  const dungeon = /^DUNGEON:([A-Z0-9_]+)(?::F(\d+))?$/.exec(raw);
  if (dungeon) {
    const nameTh = DUNGEONS.find((d) => d.code === dungeon[1])?.nameTh;
    const floor = dungeon[2] ? ` ชั้น ${Number(dungeon[2])}` : '';
    return nameTh ? `ดันเจี้ยน ${nameTh}${floor}` : `รางวัลจากดันเจี้ยน${floor}`;
  }

  const known = SOURCE_PREFIX_LABEL.find((row) => raw.startsWith(row.prefix));
  if (known) return known.labelTh;

  return null;
}
