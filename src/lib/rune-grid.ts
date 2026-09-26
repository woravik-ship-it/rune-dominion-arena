// กระดานรูน 100×100 + มุมมอง 10×10 — ตรรกะการเลื่อนมุมมองแบบ "วนไม่สิ้นสุด"
//
// ผู้ใช้สั่ง 2026-09-26: "แก้ไขตารางรูนทำให้เวลากดมันวน เอามาต่อกัน ให้กดได้ไม่สิ้นสุด"
// — เดิม (Phase 23): ปุ่มลูกศร ▲▼◀▶ ปิดตัวเองเมื่อสุดขอบ (disabled) ⇒ กดต่อไม่ได้ มีจุดตัน
// — ใหม่: offset ของมุมมอง "วนกลับไปอีกฝั่ง" เสมอ (ขวาสุด → ซ้ายสุด) ⇒ กด/ลากได้เรื่อย ๆ
//
// แยกเป็นฟังก์ชันบริสุทธิ์ เพื่อเทสต์ตรรกะได้โดยไม่ต้องเรนเดอร์ canvas
// (ใช้ร่วมกับ `src/components/rune/RuneCanvas.tsx`)

/** จำนวนรูนต่อแถว (และต่อคอลัมน์) ของกระดาน */
export const RUNE_GRID_SIZE = 100;
/** จำนวนช่องที่มองเห็นต่อแถว/คอลัมน์ (มุมมอง 10×10) */
export const RUNE_VIEW_SIZE = 10;
/** offset สูงสุดของมุมมอง (มุมขวาล่าง) = 90 */
export const RUNE_MAX_OFFSET = RUNE_GRID_SIZE - RUNE_VIEW_SIZE;
/** จำนวน offset ที่ใช้ได้ทั้งหมด = 0..90 (91 ตำแหน่ง) */
export const RUNE_OFFSET_COUNT = RUNE_MAX_OFFSET + 1;

/**
 * ห่อ offset ของมุมมองให้วนกลับอีกฝั่งเสมอ
 * 0 = ซ้าย/บนสุด · 90 = ขวา/ล่างสุด · 91 → 0 · -1 → 90
 */
export function wrapRuneOffset(offset: number): number {
  const rounded = Math.round(offset);
  return ((rounded % RUNE_OFFSET_COUNT) + RUNE_OFFSET_COUNT) % RUNE_OFFSET_COUNT;
}

/** ตำแหน่งช่องในมุมมอง (คอลัมน์/แถว) → index ของรูนบนกระดาน (0..9999) */
export function runeIndexAt(viewX: number, viewY: number, col: number, row: number): number {
  return (viewY + row) * RUNE_GRID_SIZE + (viewX + col);
}
