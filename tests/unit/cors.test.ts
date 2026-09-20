import { NextRequest } from 'next/server';
import { isOriginAllowed, corsGuard } from '@/lib/cors';

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/cards', { headers });
}

describe('CORS (Phase 10)', () => {
  const ORIGINAL = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = ORIGINAL;
  });

  test('ไม่ส่ง Origin header (same-origin ตรงๆ / CLI) → อนุญาต', () => {
    expect(isOriginAllowed(null, makeRequest())).toBe(true);
  });

  test('Origin ตรงกับ host ของ request (same-origin) → อนุญาต', () => {
    const origin = 'http://localhost:3000';
    expect(isOriginAllowed(origin, makeRequest({ origin }))).toBe(true);
    expect(corsGuard(makeRequest({ origin }))).toBeNull();
  });

  test('Origin แปลกปลอม → ปฏิเสธด้วย 403', () => {
    const r = makeRequest({ origin: 'http://evil.example' });
    expect(isOriginAllowed('http://evil.example', r)).toBe(false);
    const blocked = corsGuard(r);
    expect(blocked?.status).toBe(403);
  });

  test('Origin ฟอร์แมตเพี้ยน → ปฏิเสธ', () => {
    const r = makeRequest({ origin: ':::not-a-url' });
    expect(isOriginAllowed(':::not-a-url', r)).toBe(false);
  });

  test('CORS_ALLOWED_ORIGINS เพิ่ม origin ที่เชื่อใจได้', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://partner.example, https://other.example';
    const r = makeRequest({ origin: 'https://partner.example' });
    expect(isOriginAllowed('https://partner.example', r)).toBe(true);
    expect(isOriginAllowed('https://stranger.example', makeRequest({ origin: 'https://stranger.example' }))).toBe(false);
  });

  // เข้าจากมือถือผ่าน IP วง LAN — IP เปลี่ยนทุกวัน จึงอนุญาตทุก private range ในโหมด dev
  test('dev: Origin เป็น IP ในวง LAN (192.168.x.x / 10.x.x.x / 172.16-31.x.x) → อนุญาต', () => {
    for (const o of [
      'http://192.168.1.57:3000',
      'http://192.168.0.9:3000',
      'http://10.0.0.25:3000',
      'http://172.20.5.4:3000',
      'http://100.101.102.103:3000',
      'http://e2sv.local:3000',
    ]) {
      expect(isOriginAllowed(o, makeRequest({ origin: o }))).toBe(true);
    }
  });

  test('dev: Origin สาธารณะยังถูกปฏิเสธ (ไม่เปิดช่องให้เว็บนอก)', () => {
    for (const o of ['https://evil.example', 'http://203.0.113.9:3000', 'http://192.168.1.57.evil.example']) {
      expect(isOriginAllowed(o, makeRequest({ origin: o }))).toBe(false);
    }
  });

  test('production: Origin LAN ถูกปฏิเสธ (ต้องตั้ง CORS_ALLOWED_ORIGINS เท่านั้น)', () => {
    const original = process.env.NODE_ENV;
    // @ts-expect-error — สลับ NODE_ENV ชั่วคราวสำหรับเทส
    process.env.NODE_ENV = 'production';
    try {
      // host header ไม่ตรง + origin เป็น IP LAN → ปฏิเสธ
      expect(
        isOriginAllowed('http://192.168.1.57:3000', makeRequest({ origin: 'http://192.168.1.57:3000' }))
      ).toBe(false);
      // same-origin จริง (host header ตรงกับ origin) → ยังอนุญาตได้ตามปกติ
      expect(
        isOriginAllowed(
          'http://192.168.1.57:3000',
          makeRequest({ origin: 'http://192.168.1.57:3000', host: '192.168.1.57:3000' })
        )
      ).toBe(true);
    } finally {
      // @ts-expect-error — คืนค่าเดิม
      process.env.NODE_ENV = original;
    }
  });

  test('same-origin เทียบจาก host header จริง (รองรับกรณีอยู่หลัง proxy)', () => {
    const r = makeRequest({ origin: 'http://192.168.1.57:3000', host: '192.168.1.57:3000' });
    expect(isOriginAllowed('http://192.168.1.57:3000', r)).toBe(true);
  });
});
