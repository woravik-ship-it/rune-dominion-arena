import {
  analyzeIntervals,
  recordAction,
  createAntiCheatStore,
  BOT_FAST_STREAK,
  BOT_UNIFORM_WINDOW,
} from '@/lib/anti-cheat';

describe('Bot Pattern Detection (Phase 10)', () => {
  test('การใช้งานปกติ (interval สุ่มมี jitter) ไม่ถูกตั้งธง', () => {
    const timestamps = [0, 3_200, 6_100, 9_800, 14_000, 17_100, 22_400, 26_000, 31_900];
    const result = analyzeIntervals(timestamps);
    expect(result.flagged).toBe(false);
  });

  test('action ติดกันเร็วผิดปกติ → FAST_ACTIONS', () => {
    // ทุก 50ms ติดกัน BOT_FAST_STREAK ครั้ง
    const timestamps = Array.from({ length: BOT_FAST_STREAK + 1 }, (_, i) => i * 50);
    const result = analyzeIntervals(timestamps);
    expect(result.flagged).toBe(true);
    expect(result.reason).toBe('FAST_ACTIONS');
  });

  test('เร็วแต่น้อยกว่าเกณฑ์ streak → ยังไม่ตั้งธง (กัน false positive จาก double-click)', () => {
    const timestamps = [0, 100, 200, 350, 2_000];
    expect(analyzeIntervals(timestamps).flagged).toBe(false);
  });

  test('จังหวะคงที่เป๊ะ (jitter ~ 0) → UNIFORM_CADENCE', () => {
    const step = 800; // < 2500ms ถือว่าสั้น
    const timestamps = Array.from({ length: BOT_UNIFORM_WINDOW + 1 }, (_, i) => i * step);
    const result = analyzeIntervals(timestamps);
    expect(result.flagged).toBe(true);
    expect(result.reason).toBe('UNIFORM_CADENCE');
  });

  test('จังหวะคงที่แต่ interval ยาว (เช่น cron ทุก 5 นาที) → ไม่ตั้งธง', () => {
    const step = 300_000; // 5 นาที
    const timestamps = Array.from({ length: BOT_UNIFORM_WINDOW + 1 }, (_, i) => i * step);
    expect(analyzeIntervals(timestamps).flagged).toBe(false);
  });

  test('recordAction แยก key อิสระ + reset ทำงานถูกต้อง', () => {
    const store = createAntiCheatStore();
    for (let i = 0; i <= BOT_FAST_STREAK; i++) {
      recordAction(store, 'key1', i * 50);
    }
    expect(recordAction(store, 'key1', (BOT_FAST_STREAK + 1) * 50).flagged).toBe(true);
    // key อื่นไม่ได้รับผล
    expect(recordAction(store, 'key2', (BOT_FAST_STREAK + 1) * 50).flagged).toBe(false);
    // reset → เริ่มนับใหม่
    const after = recordAction(store, 'key1', (BOT_FAST_STREAK + 2) * 50, { reset: true });
    expect(after.flagged).toBe(false);
  });

  test('timestamps เกินขีดจำนวนสูงสุด → ตัดของเก่าออก (ไม่บวม memory)', () => {
    const store = createAntiCheatStore();
    for (let i = 0; i < 200; i++) {
      recordAction(store, 'key', i * 1_000); // ปกติ ห่าง 1 วินาที
    }
    expect(store.entries.get('key')?.length).toBeLessThanOrEqual(64);
  });
});
