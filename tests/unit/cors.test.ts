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
});
