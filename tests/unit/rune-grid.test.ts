// เทสต์การเลื่อนมุมมองกระดานรูนแบบ "วนไม่สิ้นสุด" (Phase 24)
// คำสั่งผู้ใช้ 2026-09-26: "แก้ไขตารางรูนทำให้เวลากดมันวน เอามาต่อกัน ให้กดได้ไม่สิ้นสุด"
// เดิม (Phase 23): ปุ่ม ▲▼◀▶ ปิดตัวเองที่ขอบ (disabled) ⇒ มีจุดตัน กดต่อไม่ได้
// ใหม่: offset วนกลับอีกฝั่งเสมอ + หัวเว็บ Desktop โชว์ตัวเลขจริง (พลังงาน/Coin)

import { readFileSync } from 'node:fs';
import {
  RUNE_GRID_SIZE,
  RUNE_MAX_OFFSET,
  RUNE_OFFSET_COUNT,
  RUNE_VIEW_SIZE,
  runeIndexAt,
  wrapRuneOffset,
} from '@/lib/rune-grid';

describe('rune-grid — มุมมอง 10×10 บนกระดาน 100×100', () => {
  it('ค่าคงที่ของกระดาน/มุมมองตรงกับที่ RuneCanvas ใช้', () => {
    expect(RUNE_GRID_SIZE).toBe(100);
    expect(RUNE_VIEW_SIZE).toBe(10);
    expect(RUNE_MAX_OFFSET).toBe(90);
    expect(RUNE_OFFSET_COUNT).toBe(91);
    // offset ที่ใช้ได้ต้องไม่ทำให้มุมมองล้นออกนอกกระดาน
    expect(RUNE_MAX_OFFSET + RUNE_VIEW_SIZE).toBe(RUNE_GRID_SIZE);
  });

  it('wrapRuneOffset: ค่าในช่วงเดิมไม่เปลี่ยน', () => {
    expect(wrapRuneOffset(0)).toBe(0);
    expect(wrapRuneOffset(45)).toBe(45);
    expect(wrapRuneOffset(90)).toBe(90);
  });

  it('wrapRuneOffset: เลยขวา/ล่างสุด → วนกลับซ้าย/บนสุด', () => {
    expect(wrapRuneOffset(91)).toBe(0);
    expect(wrapRuneOffset(92)).toBe(1);
    expect(wrapRuneOffset(181)).toBe(90);
    expect(wrapRuneOffset(1000)).toBe(1000 % 91);
  });

  it('wrapRuneOffset: ก่อนซ้าย/บนสุด (ค่าติดลบ) → วนไปขวา/ล่างสุด', () => {
    expect(wrapRuneOffset(-1)).toBe(90);
    expect(wrapRuneOffset(-2)).toBe(89);
    expect(wrapRuneOffset(-91)).toBe(0);
    expect(wrapRuneOffset(-92)).toBe(90);
  });

  it('กดปุ่มขวารัว ๆ 300 ครั้ง → ไม่มีจุดตัน และวนครบรอบทุก 91 ครั้ง', () => {
    let offset = 0;
    const visited: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      offset = wrapRuneOffset(offset + 1);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(RUNE_MAX_OFFSET);
      if (i < RUNE_OFFSET_COUNT) visited.push(offset);
    }
    // 91 ครั้งแรก = เยี่ยมทุก offset พอดี 1 ครั้ง แล้วกลับมาเริ่มที่ 0
    expect(new Set(visited).size).toBe(RUNE_OFFSET_COUNT);
    expect(offset).toBe(wrapRuneOffset(300));
  });

  it('กดปุ่มซ้ายรัว ๆ จาก 0 → ยืนยันว่าไม่มีขอบตัน (0 → 90 ทันที)', () => {
    let offset = 0;
    offset = wrapRuneOffset(offset - 1);
    expect(offset).toBe(90);
    // กดต่ออีก 91 ครั้ง = กลับมาที่เดิม
    for (let i = 0; i < RUNE_OFFSET_COUNT; i += 1) offset = wrapRuneOffset(offset - 1);
    expect(offset).toBe(90);
  });

  it('runeIndexAt: มุมซ้ายบน = 0 และมุมขวาล่าง = 9999', () => {
    expect(runeIndexAt(0, 0, 0, 0)).toBe(0);
    // มุมขวาล่างของ "หน้าต่าง" ที่ offset (0,0) = ช่องที่ (9,9) ของกระดาน
    expect(runeIndexAt(0, 0, RUNE_VIEW_SIZE - 1, RUNE_VIEW_SIZE - 1)).toBe(909);
    expect(runeIndexAt(RUNE_MAX_OFFSET, RUNE_MAX_OFFSET, RUNE_VIEW_SIZE - 1, RUNE_VIEW_SIZE - 1)).toBe(9999);
    // ทุก offset ที่วนได้ ต้องให้ index อยู่ในช่วงกระดานเสมอ
    for (const ox of [0, 45, 90]) {
      for (const oy of [0, 45, 90]) {
        const index = runeIndexAt(ox, oy, 9, 9);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThanOrEqual(RUNE_GRID_SIZE * RUNE_GRID_SIZE - 1);
      }
    }
  });
});

describe('RuneCanvas — ปุ่มลูกศรกดได้ไม่สิ้นสุด (ไม่มี disabled ที่ขอบ)', () => {
  const src = readFileSync('src/components/rune/RuneCanvas.tsx', 'utf8');

  it('ไม่มี disabled ที่ผูกกับขอบมุมมองอีกแล้ว', () => {
    expect(src).not.toMatch(/disabled=\{view[XY]/);
  });

  it('การเลื่อนมุมมองทุกทางผ่าน wrapRuneOffset (ปุ่ม + ลาก + สุ่ม)', () => {
    expect(src).toMatch(/wrapRuneOffset\(prev \+ dx\)/);
    expect(src).toMatch(/wrapRuneOffset\(prev \+ dy\)/);
    expect(src).toMatch(/wrapRuneOffset\(pan\.baseX/);
    expect(src).toMatch(/wrapRuneOffset\(pan\.baseY/);
    expect(src).toMatch(/wrapRuneOffset\(first % GRID_SIZE/);
    // ไม่เหลือการ clamp มุมมองที่ทำให้ติดขอบ
    expect(src).not.toMatch(/clamp\([^)]*MAX_VIEW/);
  });
});

describe('หัวเว็บ — Desktop โชว์ตัวเลขพลังงาน/Coin (คำสั่งผู้ใช้ 2026-09-26)', () => {
  const src = readFileSync('src/components/layout/TopHeader.tsx', 'utf8');

  it('ค่าพลังงาน/Coin ไม่ถูกซ่อนด้วย md:hidden อีก', () => {
    expect(src).not.toMatch(/md:hidden/);
    expect(src).not.toMatch(/hidden md:inline">\.\.\./);
  });

  it('ยังแสดง "..." เฉพาะตอนโหลดไม่เสร็จ (ค่า null)', () => {
    expect(src).toMatch(/energy === null \? '\.\.\.' : energy/);
    expect(src).toMatch(/balance === null \? '\.\.\.' : formatNumber\(locale, balance\)/);
  });
});
