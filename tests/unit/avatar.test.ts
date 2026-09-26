// เทสต์อวตาร (Phase 26) — เลือกอิโมจิ หรือวาดเองในช่อง 6×6
// ผู้ใช้สั่ง 2026-09-27: "เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
import {
  AVATAR_EMOJIS,
  AVATAR_EMPTY_CELL,
  AVATAR_GRID_CELLS,
  AVATAR_GRID_SIZE,
  AVATAR_PALETTE,
  avatarKind,
  cellColor,
  gridFromRows,
  gridRows,
  isValidAvatarEmoji,
  paintedCells,
  sanitizeAvatarGrid,
} from '@/lib/avatar';

describe('กริดอวตาร 6×6', () => {
  test('ขนาดกริด = 6×6 = 36 ช่อง', () => {
    expect(AVATAR_GRID_SIZE).toBe(6);
    expect(AVATAR_GRID_CELLS).toBe(36);
  });

  test('ทำรหัสให้ปลอดภัย: อักขระแปลก → ช่องโปร่งใส', () => {
    const result = sanitizeAvatarGrid('AA??BB!!CC##DD$$EE%%FF@@GG');
    expect(result).toHaveLength(36);
    // อักขระที่ไม่รู้จักกลายเป็น '.' แล้วเติม '.' ให้ครบ 36 ช่อง
    expect(result).toBe(`AA..BB..CC..DD..EE..FF..GG${AVATAR_EMPTY_CELL.repeat(10)}`);
  });

  test('สั้นเกิน → เติมช่องโปร่งใสให้ครบ 36 · ยาวเกิน → ตัดทิ้ง', () => {
    expect(sanitizeAvatarGrid('AB')).toBe(`AB${AVATAR_EMPTY_CELL.repeat(34)}`);
    expect(sanitizeAvatarGrid('A'.repeat(50))).toBe('A'.repeat(36));
  });

  test('รับอาร์เรย์ของแถวได้ (6 แถว) + ตัวพิมพ์เล็กถูกทำเป็นตัวใหญ่', () => {
    const rows = ['aa....', '......', '......', '......', '......', '......'];
    const code = sanitizeAvatarGrid(rows);
    expect(code.slice(0, 8)).toBe('AA......');
    expect(gridRows(code)[0]).toBe('AA....');
  });

  test('ค่าที่ไม่ใช่สตริง/อาร์เรย์ → กริดว่าง (ไม่ throw)', () => {
    expect(sanitizeAvatarGrid(null)).toBe(AVATAR_EMPTY_CELL.repeat(36));
    expect(sanitizeAvatarGrid(123)).toBe(AVATAR_EMPTY_CELL.repeat(36));
    expect(sanitizeAvatarGrid({})).toBe(AVATAR_EMPTY_CELL.repeat(36));
  });

  test('แยกเป็น 6 แถว แถวละ 6 ช่อง เสมอ', () => {
    const rows = gridRows('A'.repeat(36));
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row).toHaveLength(6);
  });

  test('รวมแถวกลับเป็นรหัสเดียวได้ (ไป-กลับไม่เพี้ยน)', () => {
    const code = 'A'.repeat(6) + '.'.repeat(30);
    expect(gridFromRows(gridRows(code))).toBe(code);
  });

  test('นับช่องที่ระบายแล้ว', () => {
    expect(paintedCells(AVATAR_EMPTY_CELL.repeat(36))).toBe(0);
    expect(paintedCells('AB' + AVATAR_EMPTY_CELL.repeat(34))).toBe(2);
    expect(paintedCells(null)).toBe(0);
  });
});

describe('พาเลตต์สี', () => {
  test('มี 8 สี · key ไม่ซ้ำ · เป็นตัวอักษรเดียว', () => {
    const keys = AVATAR_PALETTE.map((entry) => entry.key);
    expect(AVATAR_PALETTE).toHaveLength(8);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[A-H]$/);
  });

  test('สีทุกตัวเป็นค่า CSS + ไม่ชนกับช่องโปร่งใส', () => {
    for (const entry of AVATAR_PALETTE) {
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(entry.key).not.toBe(AVATAR_EMPTY_CELL);
      expect(cellColor(entry.key)).toBe(entry.color);
    }
    expect(cellColor(AVATAR_EMPTY_CELL)).toBeNull();
    expect(cellColor('Z')).toBeNull();
  });
});

describe('อิโมจิอวตาร', () => {
  test('มีให้เลือกหลายแบบ · ไม่ซ้ำ', () => {
    expect(AVATAR_EMOJIS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(AVATAR_EMOJIS).size).toBe(AVATAR_EMOJIS.length);
  });

  test('ตรวจอิโมจิ: ต้องอยู่ในรายการที่เกมมีให้', () => {
    expect(isValidAvatarEmoji(AVATAR_EMOJIS[0])).toBe(true);
    expect(isValidAvatarEmoji('🙂')).toBe(false);
    expect(isValidAvatarEmoji('')).toBe(false);
    expect(isValidAvatarEmoji(null)).toBe(false);
    expect(isValidAvatarEmoji(123)).toBe(false);
  });
});

describe('อวตารที่จะแสดงจริง', () => {
  test('อิโมจิมาก่อนภาพวาด (ถ้าตั้งทั้งคู่)', () => {
    expect(avatarKind({ emoji: '🐉', grid: 'A'.repeat(36) })).toBe('emoji');
  });

  test('ไม่มีอิโมจิ แต่มีภาพวาด → แสดงภาพวาด', () => {
    expect(avatarKind({ emoji: null, grid: 'B'.repeat(36) })).toBe('grid');
  });

  test('ภาพวาดว่าง → ใช้ค่าเริ่มต้น (👤)', () => {
    expect(avatarKind({ emoji: null, grid: AVATAR_EMPTY_CELL.repeat(36) })).toBe('default');
    expect(avatarKind({})).toBe('default');
  });

  test('อิโมจิที่ไม่รู้จักไม่ถูกนับ (กันข้อมูลเพี้ยนจากภายนอก)', () => {
    expect(avatarKind({ emoji: '🚀', grid: null })).toBe('default');
  });
});
