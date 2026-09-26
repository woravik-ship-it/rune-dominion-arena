/**
 * @jest-environment jsdom
 */
import { AVATAR_CHANGED_EVENT, emitAvatarChanged, subscribeAvatarChanged } from '@/lib/avatar-events';
import { AVATAR_EMPTY_CELL } from '@/lib/avatar';

// Phase 26 — ผู้ใช้สั่ง 2026-09-27: "เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
describe('เหตุการณ์กลางของอวตาร (Phase 26)', () => {
  test('ชื่อเหตุการณ์คงที่', () => {
    expect(AVATAR_CHANGED_EVENT).toBe('rda:avatar-changed');
  });

  test('ส่งอิโมจิ → ผู้ฟังได้อิโมจินั้น (หัวเว็บเปลี่ยนทันที)', () => {
    const handler = jest.fn();
    const off = subscribeAvatarChanged(handler);
    emitAvatarChanged({ emoji: '🐉' });
    expect(handler).toHaveBeenCalledWith({ emoji: '🐉' });
    off();
  });

  test('ส่งภาพวาด → รหัสถูกทำความสะอาดก่อนส่ง (36 ช่อง)', () => {
    const handler = jest.fn();
    const off = subscribeAvatarChanged(handler);
    emitAvatarChanged({ grid: 'AB??CD' });
    const detail = handler.mock.calls[0][0];
    expect(detail.grid).toHaveLength(36);
    expect(detail.grid?.startsWith('AB..CD')).toBe(true);
    off();
  });

  test('ส่งแค่ฟิลด์ที่ระบุ (ไม่ทับฟิลด์ที่ไม่ได้ส่ง)', () => {
    const handler = jest.fn();
    const off = subscribeAvatarChanged(handler);
    emitAvatarChanged({ emoji: '🦊' });
    expect(handler.mock.calls[0][0]).toEqual({ emoji: '🦊' });
    off();
  });

  test('ล้างอวตาร (null) → ส่ง null ให้หัวเว็บรู้ว่าต้องกลับไปใช้ค่าเริ่มต้น', () => {
    const handler = jest.fn();
    const off = subscribeAvatarChanged(handler);
    emitAvatarChanged({ emoji: null, grid: null });
    expect(handler).toHaveBeenCalledWith({ emoji: null, grid: null });
    off();
  });

  test('เลิกรับแล้วไม่ถูกเรียกอีก', () => {
    const handler = jest.fn();
    subscribeAvatarChanged(handler)();
    emitAvatarChanged({ emoji: '🐺' });
    expect(handler).not.toHaveBeenCalled();
  });

  test('ไม่มี window (SSR) → ไม่ throw และคืน unsubscribe ที่เรียกได้', () => {
    const realWindow = globalThis.window;
    const holder = globalThis as { window?: Window };
    delete holder.window;
    try {
      expect(() => emitAvatarChanged({ emoji: '🐉' })).not.toThrow();
      const off = subscribeAvatarChanged(() => undefined);
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'window', { value: realWindow, configurable: true });
    }
  });

  test('กริดว่างถูกส่งได้ (ผู้ใช้ล้างช่องทั้งหมดก่อนบันทึก)', () => {
    const handler = jest.fn();
    const off = subscribeAvatarChanged(handler);
    emitAvatarChanged({ grid: AVATAR_EMPTY_CELL.repeat(36) });
    expect(handler.mock.calls[0][0].grid).toBe(AVATAR_EMPTY_CELL.repeat(36));
    off();
  });
});
