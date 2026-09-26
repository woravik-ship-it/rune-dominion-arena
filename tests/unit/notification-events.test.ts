/**
 * @jest-environment jsdom
 */
import {
  NOTIFICATIONS_CHANGED_EVENT,
  emitNotificationsChanged,
  subscribeNotificationsChanged,
} from '@/lib/notification-events';

describe('เหตุการณ์กลางของการแจ้งเตือน (Phase 24.1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('ชื่อเหตุการณ์คงที่ (หน้า /notifications กับระฆังใช้ค่าเดียวกัน)', () => {
    expect(NOTIFICATIONS_CHANGED_EVENT).toBe('rda:notifications-changed');
  });

  test('ส่งตัวเลข → ผู้ฟังได้ตัวเลขนั้นทันที', () => {
    const handler = jest.fn();
    const off = subscribeNotificationsChanged(handler);
    emitNotificationsChanged(3);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(3);
    off();
  });

  test('ไม่ส่งตัวเลข → ผู้ฟังได้ undefined (ให้ไปโหลดของจริงเอง)', () => {
    const handler = jest.fn();
    const off = subscribeNotificationsChanged(handler);
    emitNotificationsChanged();
    expect(handler).toHaveBeenCalledWith(undefined);
    off();
  });

  test('ค่าติดลบ/ทศนิยม/ไม่ใช่ตัวเลข → ถูกปรับให้ปลอดภัย', () => {
    const handler = jest.fn();
    const off = subscribeNotificationsChanged(handler);
    emitNotificationsChanged(-5);
    emitNotificationsChanged(2.7);
    emitNotificationsChanged(Number.NaN);
    expect(handler.mock.calls.map(([value]) => value)).toEqual([0, 2, undefined]);
    off();
  });

  test('เลิกรับแล้วไม่ถูกเรียกอีก', () => {
    const handler = jest.fn();
    subscribeNotificationsChanged(handler)();
    emitNotificationsChanged(1);
    expect(handler).not.toHaveBeenCalled();
  });

  test('ผู้ฟังหลายตัวได้รับพร้อมกัน', () => {
    const first = jest.fn();
    const second = jest.fn();
    const offFirst = subscribeNotificationsChanged(first);
    const offSecond = subscribeNotificationsChanged(second);
    emitNotificationsChanged(7);
    expect(first).toHaveBeenCalledWith(7);
    expect(second).toHaveBeenCalledWith(7);
    offFirst();
    offSecond();
  });

  test('ไม่มี window (SSR) → ไม่ throw และคืน unsubscribe ที่เรียกได้', () => {
    const realWindow = globalThis.window;
    // จำลองสภาพฝั่งเซิร์ฟเวอร์ (ไม่มี window)
    const holder = globalThis as { window?: Window };
    delete holder.window;
    try {
      expect(() => emitNotificationsChanged(2)).not.toThrow();
      const off = subscribeNotificationsChanged(() => undefined);
      expect(typeof off).toBe('function');
      expect(() => off()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, 'window', { value: realWindow, configurable: true });
    }
  });
});
