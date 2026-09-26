import { DICT, LOCALES, formatNumber, interpolate, missingKeys, normalizeLocale, t, translator } from '@/lib/i18n';

describe('i18n — ภาษาในเกม (Phase 20)', () => {
  it('ทุกคีย์มีการแปลครบทั้งไทยและอังกฤษ (ไม่มีคีย์ตกหล่น)', () => {
    const { missingInEn, missingInTh } = missingKeys();
    expect(missingInEn).toEqual([]);
    expect(missingInTh).toEqual([]);
  });

  it('พจนานุกรมทั้งสองภาษามีจำนวนคีย์เท่ากัน', () => {
    expect(Object.keys(DICT.th).length).toBe(Object.keys(DICT.en).length);
    expect(Object.keys(DICT.th).length).toBeGreaterThan(100);
  });

  it('รองรับสองภาษาและคืนค่าเริ่มต้นเป็นไทยเมื่อค่าเพี้ยน', () => {
    expect(LOCALES).toEqual(['th', 'en']);
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('th')).toBe('th');
    expect(normalizeLocale('fr')).toBe('th');
    expect(normalizeLocale(undefined)).toBe('th');
  });

  it('แปลตามภาษาที่เลือก', () => {
    expect(t('th', 'settings.title')).toBe('ตั้งค่า');
    expect(t('en', 'settings.title')).toBe('Settings');
    expect(t('en', 'nav.discover')).toBe('Discover');
  });

  it('แทนที่ตัวแปรในข้อความ', () => {
    expect(t('th', 'notif.unread', { n: 3 })).toBe('ยังไม่อ่าน 3');
    expect(t('en', 'notif.minutesAgo', { n: 5 })).toBe('5 min ago');
    // ไม่ส่งค่ามา → คง placeholder เดิมไว้ (เห็นได้ว่าลืมอะไร)
    expect(t('th', 'notif.unread')).toBe('ยังไม่อ่าน {n}');
  });

  it('คีย์ที่ไม่มีในพจนานุกรม → ถอยไปใช้ไทย แล้วค่อยคืน key', () => {
    expect(t('en', 'settings.title')).not.toBe('settings.title');
    expect(t('th', 'key.that.does.not.exist')).toBe('key.that.does.not.exist');
  });

  it('ตัวแปลผูกภาษาทำงานเหมือน t()', () => {
    const tr = translator('en');
    expect(tr('nav.arena')).toBe('Arena');
  });

  it('interpolate ไม่แตะ placeholder ที่ไม่มีค่า', () => {
    expect(interpolate('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
    expect(interpolate('ไม่มีตัวแปร')).toBe('ไม่มีตัวแปร');
  });

  it('จัดรูปแบบตัวเลขตามภาษา', () => {
    expect(formatNumber('en', 12345)).toBe('12,345');
    expect(formatNumber('th', 12345)).toBe('12,345');
  });
});
