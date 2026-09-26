import {
  DEFAULT_NOTIFY_PREFS,
  NOTIFY_PREF_OPTIONS,
  parseNotifyPrefs,
  serializeNotifyPrefs,
  wantsNotification,
} from '@/lib/notification-prefs';

describe('ค่าที่ผู้เล่นเลือกเรื่องการแจ้งเตือน (Phase 20)', () => {
  it('ค่าเริ่มต้น = เปิดรับทุกประเภท', () => {
    expect(Object.values(DEFAULT_NOTIFY_PREFS).every(Boolean)).toBe(true);
  });

  it('ค่าที่เพี้ยน/ไม่มี → ใช้ค่าเริ่มต้น (ไม่ throw)', () => {
    expect(parseNotifyPrefs(null)).toEqual({ ...DEFAULT_NOTIFY_PREFS });
    expect(parseNotifyPrefs('x')).toEqual({ ...DEFAULT_NOTIFY_PREFS });
    expect(parseNotifyPrefs([1, 2])).toEqual({ ...DEFAULT_NOTIFY_PREFS });
    expect(parseNotifyPrefs({ image: 'yes', battle: false })).toEqual({
      ...DEFAULT_NOTIFY_PREFS,
      battle: false,
    });
  });

  it('merge ค่าที่ส่งมากับค่าที่มีอยู่', () => {
    const merged = serializeNotifyPrefs({ image: false }, { battle: false });
    expect(merged).toEqual({ ...DEFAULT_NOTIFY_PREFS, image: false, battle: false });
  });

  it('ประเภท image ถูกคุมด้วยค่าของ image (ทั้งสำเร็จและล้มเหลว)', () => {
    const prefs = { ...DEFAULT_NOTIFY_PREFS, image: false };
    expect(wantsNotification(prefs, 'IMAGE_READY')).toBe(false);
    expect(wantsNotification(prefs, 'IMAGE_FAILED')).toBe(false);
    expect(wantsNotification(prefs, 'BATTLE_RESULT')).toBe(true);
  });

  it('ข้อความจากระบบ (SYSTEM) ปิดไม่ได้', () => {
    const allOff = { image: false, battle: false, arena: false, event: false, announcement: false };
    expect(wantsNotification(allOff, 'SYSTEM')).toBe(true);
  });

  it('ไม่ส่งค่า prefs มา → ถือว่าเปิดรับ (ผู้เล่นใหม่)', () => {
    expect(wantsNotification(undefined, 'ANNOUNCEMENT')).toBe(true);
    expect(wantsNotification(null, 'EVENT')).toBe(true);
  });

  it('ตัวเลือกในหน้าตั้งค่าครบทุกประเภท (ยกเว้น SYSTEM)', () => {
    const keys = NOTIFY_PREF_OPTIONS.map((option) => option.key);
    expect(keys).toEqual(['image', 'battle', 'arena', 'event', 'announcement']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
