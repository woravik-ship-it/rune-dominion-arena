// อวตารในเกม (Phase 26) — เลือกอิโมจิ หรือวาดเองในช่อง 6×6
//
// ผู้ใช้สั่ง 2026-09-27: "Profile ก็ยังไม่มีข้อมูล ทำให้ด้วย เพิ่ม เลือก Emoji แทนตัว
//   หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
//
// เก็บใน DB เป็น 2 ฟิลด์: `avatarEmoji` (ตัวอักษรอิโมจิ) และ `avatarGrid` (รหัส 36 ตัวอักษร)
//   - `avatarGrid` = 6 แถว × 6 ช่อง ต่อกันเป็นเส้นเดียว (แถวบน → ล่าง · ซ้าย → ขวา)
//   - '.' = ช่องโปร่งใส · ตัวอักษรอื่น = สีในพาเลตต์ (AVATAR_PALETTE)
// ไฟล์นี้บริสุทธิ์ (ไม่แตะ DOM/DB) ⇒ เทสต์ได้ตรง ๆ และเป็นแหล่งความจริงเดียวของขนาด/สี
export const AVATAR_GRID_SIZE = 6;
export const AVATAR_GRID_CELLS = AVATAR_GRID_SIZE * AVATAR_GRID_SIZE; // 36
export const AVATAR_EMPTY_CELL = '.';

export interface AvatarColor {
  /** ตัวอักษรที่ใช้เก็บในรหัสกริด */
  key: string;
  /** สี CSS */
  color: string;
  nameTh: string;
}

/** พาเลตต์ 8 สี (ตัวอักษร A–H) — ใช้ทั้งช่องวาดและตอนเรนเดอร์ */
export const AVATAR_PALETTE: AvatarColor[] = [
  { key: 'A', color: '#f87171', nameTh: 'แดง' },
  { key: 'B', color: '#fbbf24', nameTh: 'เหลือง' },
  { key: 'C', color: '#4ade80', nameTh: 'เขียว' },
  { key: 'D', color: '#38bdf8', nameTh: 'ฟ้า' },
  { key: 'E', color: '#a78bfa', nameTh: 'ม่วง' },
  { key: 'F', color: '#f472b6', nameTh: 'ชมพู' },
  { key: 'G', color: '#e5e7eb', nameTh: 'ขาว' },
  { key: 'H', color: '#111827', nameTh: 'ดำ' },
];

const PALETTE_BY_KEY = new Map(AVATAR_PALETTE.map((entry) => [entry.key, entry.color]));

/** สีของช่องหนึ่ง (null = โปร่งใส/ไม่รู้จัก) */
export function cellColor(char: string): string | null {
  return PALETTE_BY_KEY.get(char.toUpperCase()) ?? null;
}

/** อิโมจิให้เลือก (ใช้เป็นอวตารแทนรูป) */
export const AVATAR_EMOJIS = [
  '🐉', '🦊', '🐺', '🦉', '🐢', '🐍', '🦅', '🐲',
  '⚔️', '🛡️', '🏹', '🔮', '📜', '🧪', '🗡️', '🔱',
  '🌙', '⭐', '🔥', '🌊', '🌪️', '🪨', '✨', '☀️',
  '👑', '💎', '🎭', '🎲', '🕯️', '🍀', '🌸', '❄️',
];

export function isValidAvatarEmoji(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_EMOJIS.includes(value);
}

/**
 * ทำรหัสกริดให้ปลอดภัย: รับได้ทั้งสตริง 36 ตัว หรืออาร์เรย์ของแถว (6 แถว)
 *  - อักขระที่ไม่รู้จัก → '.' (โปร่งใส)
 *  - สั้นเกิน → เติม '.' ให้ครบ 36 · ยาวเกิน → ตัดทิ้ง
 *  - รับค่าที่ไม่ใช่สตริง/อาร์เรย์ → คืนกริดว่าง (ไม่ throw)
 */
export function sanitizeAvatarGrid(input: unknown): string {
  let raw = '';
  if (typeof input === 'string') {
    raw = input;
  } else if (Array.isArray(input)) {
    raw = input.filter((row) => typeof row === 'string').join('');
  } else {
    return AVATAR_EMPTY_CELL.repeat(AVATAR_GRID_CELLS);
  }

  const cleaned = raw
    .replace(/\s+/g, '')
    .toUpperCase()
    .split('')
    .map((char) => (PALETTE_BY_KEY.has(char) ? char : AVATAR_EMPTY_CELL))
    .join('');

  return cleaned.slice(0, AVATAR_GRID_CELLS).padEnd(AVATAR_GRID_CELLS, AVATAR_EMPTY_CELL);
}

/** แยกรหัสกริดเป็น 6 แถว (แถวละ 6 ช่อง) */
export function gridRows(code: string | null | undefined): string[] {
  const safe = sanitizeAvatarGrid(code ?? '');
  return Array.from({ length: AVATAR_GRID_SIZE }, (_, row) =>
    safe.slice(row * AVATAR_GRID_SIZE, (row + 1) * AVATAR_GRID_SIZE)
  );
}

/** รวมแถวกลับเป็นรหัสเดียว */
export function gridFromRows(rows: string[]): string {
  return sanitizeAvatarGrid(rows);
}

/** จำนวนช่องที่มีสี (0 = ยังไม่ได้วาด) */
export function paintedCells(code: string | null | undefined): number {
  return sanitizeAvatarGrid(code ?? '').replace(new RegExp(`\\${AVATAR_EMPTY_CELL}`, 'g'), '').length;
}

export type AvatarKind = 'emoji' | 'grid' | 'default';

export interface AvatarState {
  emoji?: string | null;
  grid?: string | null;
}

/** อวตารที่จะแสดงจริง: เลือกอิโมจิมาก่อน ถ้าไม่มีจึงใช้ภาพวาด (ถ้าวาดไว้) */
export function avatarKind(avatar: AvatarState): AvatarKind {
  if (isValidAvatarEmoji(avatar.emoji)) return 'emoji';
  if (paintedCells(avatar.grid) > 0) return 'grid';
  return 'default';
}
