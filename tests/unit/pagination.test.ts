// เทสต์กติกาการแบ่งหน้า (Phase 27)
// ผู้ใช้แจ้ง 2026-09-27: "เหมือนการ์ด ใน Admin จะแสดงการ์ดไม่ครบทุกใบ"
// (สาเหตุ: หน้าเว็บขอครั้งเดียว limit=50 และ API จำกัดไม่เกิน 50 ⇒ ในคลัง 167 ใบ เห็นแค่ 50)
import {
  DEFAULT_PAGER_LIMITS,
  normalizeLimit,
  normalizePage,
  pageCount,
  pageWindow,
  pagerSummary,
} from '@/lib/pagination';

describe('normalizeLimit (เพดานต่อหน้า)', () => {
  test('ค่าเริ่มต้นเมื่อไม่ระบุ/ค่าเพี้ยน', () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_PAGER_LIMITS.defaultLimit);
    expect(normalizeLimit('')).toBe(DEFAULT_PAGER_LIMITS.defaultLimit);
    expect(normalizeLimit('abc')).toBe(DEFAULT_PAGER_LIMITS.defaultLimit);
    expect(normalizeLimit(0)).toBe(DEFAULT_PAGER_LIMITS.defaultLimit);
    expect(normalizeLimit(-10)).toBe(DEFAULT_PAGER_LIMITS.defaultLimit);
  });

  test('ไม่เกินเพดาน (เดิมเพดาน 50 ทำให้ดูได้ไม่ครบ)', () => {
    expect(normalizeLimit(500)).toBe(DEFAULT_PAGER_LIMITS.maxLimit);
    expect(normalizeLimit(100)).toBe(100);
    expect(normalizeLimit('50')).toBe(50);
  });

  test('ใช้เพดานของหน้านั้น ๆ ได้', () => {
    expect(normalizeLimit(999, { defaultLimit: 50, maxLimit: 200 })).toBe(200);
    expect(normalizeLimit('x', { defaultLimit: 50, maxLimit: 200 })).toBe(50);
  });
});

describe('pageCount / normalizePage', () => {
  test('167 ใบ แบ่ง 50 ต่อหน้า = 4 หน้า', () => {
    expect(pageCount(167, 50)).toBe(4);
    expect(pageCount(100, 50)).toBe(2);
    expect(pageCount(1, 50)).toBe(1);
    expect(pageCount(0, 50)).toBe(1);
  });

  test('เลขหน้าเกินขอบถูกดึงกลับช่วงที่ถูกต้อง', () => {
    expect(normalizePage(99, 167, 50)).toBe(4);
    expect(normalizePage(0, 167, 50)).toBe(1);
    expect(normalizePage(-5, 167, 50)).toBe(1);
    expect(normalizePage('3', 167, 50)).toBe(3);
  });
});

describe('pagerSummary (ข้อความ "แสดง 51–100 จาก 167")', () => {
  test('หน้าปกติ', () => {
    expect(pagerSummary(167, 2, 50)).toEqual({
      page: 2, limit: 50, total: 167, totalPages: 4, from: 51, to: 100,
    });
  });

  test('หน้าสุดท้ายไม่ครบหน้า', () => {
    const last = pagerSummary(167, 4, 50);
    expect(last.from).toBe(151);
    expect(last.to).toBe(167);
  });

  test('ไม่มีข้อมูล → 0–0 (ไม่โชว์เลขมั่ว)', () => {
    const empty = pagerSummary(0, 1, 50);
    expect(empty.from).toBe(0);
    expect(empty.to).toBe(0);
  });

  test('หน้าเกินขอบถูก clamp แล้วคำนวณช่วงใหม่', () => {
    const clamped = pagerSummary(167, 99, 50);
    expect(clamped.page).toBe(4);
    expect(clamped.to).toBe(167);
  });
});

describe('pageWindow (ปุ่มเลขหน้า)', () => {
  test('หน้าอยู่ต้น: เห็นหน้าปัจจุบัน ±2 และหน้าสุดท้ายเสมอ', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 10]);
  });

  test('หน้าอยู่กลาง', () => {
    expect(pageWindow(5, 10)).toEqual([1, 3, 4, 5, 6, 7, 10]);
  });

  test('หน้าอยู่ท้าย', () => {
    expect(pageWindow(10, 10)).toEqual([1, 8, 9, 10]);
  });

  test('มีหน้าเดียว → ปุ่มเดียว ไม่ซ้ำ', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});
