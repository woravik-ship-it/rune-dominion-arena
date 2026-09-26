/**
 * @jest-environment jsdom
 */
import {
  VEIL_SHARDS_CHANGED_EVENT,
  emitVeilShardsChanged,
  subscribeVeilShardsChanged,
} from '@/lib/veil-shard-events';

// Phase 25.1 — ผู้ใช้แจ้ง 2026-09-27: "หลังจากใช้ไปแล้วไม่ลดทันที ต้องรอเปลี่ยนหน้า หรือ Refresh"
describe('เหตุการณ์กลางของยอด Veil Shards (Phase 25.1)', () => {
  test('ชื่อเหตุการณ์คงที่ (หน้าซื้อ/คราฟต์ กับหัวเว็บใช้ค่าเดียวกัน)', () => {
    expect(VEIL_SHARDS_CHANGED_EVENT).toBe('rda:veil-shards-changed');
  });

  test('ส่งยอดใหม่ → ผู้ฟังได้ยอดนั้นทันที (หัวเว็บอัปเดตโดยไม่ต้องรอ)', () => {
    const handler = jest.fn();
    const off = subscribeVeilShardsChanged(handler);
    emitVeilShardsChanged(7);
    expect(handler).toHaveBeenCalledWith(7);
    off();
  });

  test('ไม่ส่งยอด → ผู้ฟังได้ undefined (ให้ไปดึงยอดจริงเอง)', () => {
    const handler = jest.fn();
    const off = subscribeVeilShardsChanged(handler);
    emitVeilShardsChanged();
    expect(handler).toHaveBeenCalledWith(undefined);
    off();
  });

  test('ค่าเพี้ยน (NaN/ติดลบ/ทศนิยม) → ถูกปรับให้ปลอดภัย', () => {
    const handler = jest.fn();
    const off = subscribeVeilShardsChanged(handler);
    emitVeilShardsChanged(Number.NaN);
    emitVeilShardsChanged(-9);
    emitVeilShardsChanged(3.9);
    expect(handler.mock.calls.map(([value]) => value)).toEqual([undefined, 0, 3]);
    off();
  });

  test('Number(undefined) จาก API (ไม่มีฟิลด์ยอด) → ถือว่าไม่รู้ยอด (ไม่ใช่ NaN)', () => {
    const handler = jest.fn();
    const off = subscribeVeilShardsChanged(handler);
    emitVeilShardsChanged(Number(undefined as unknown as number));
    expect(handler).toHaveBeenCalledWith(undefined);
    off();
  });

  test('เลิกรับแล้วไม่ถูกเรียกอีก · หลายผู้ฟังได้พร้อมกัน', () => {
    const first = jest.fn();
    const second = jest.fn();
    const offFirst = subscribeVeilShardsChanged(first);
    const offSecond = subscribeVeilShardsChanged(second);
    emitVeilShardsChanged(12);
    expect(first).toHaveBeenCalledWith(12);
    expect(second).toHaveBeenCalledWith(12);
    offFirst();
    emitVeilShardsChanged(5);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(5);
    offSecond();
  });

  test('ไม่มี window (SSR) → ไม่ throw และคืน unsubscribe ที่เรียกได้', () => {
    const realWindow = globalThis.window;
    const holder = globalThis as { window?: Window };
    delete holder.window;
    try {
      expect(() => emitVeilShardsChanged(3)).not.toThrow();
      const off = subscribeVeilShardsChanged(() => undefined);
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'window', { value: realWindow, configurable: true });
    }
  });
});
