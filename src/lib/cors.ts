// CORS — Phase 10 (Security & Anti-Cheat)
// ค่าเริ่มต้น: same-origin เท่านั้น (แอปใช้ session cookie แบบ same-site)
// อนุญาต origin เพิ่มได้ผ่าน env CORS_ALLOWED_ORIGINS (คั่นด้วย comma)
// หมายเหตุ: pure ต่อ middleware (ไม่ import node:crypto)
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_METHODS = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Idempotency-Key, X-Device-Id, X-Worker-Token';

// dev เท่านั้น: เข้าผ่าน IP ในวง LAN (IP เปลี่ยนได้ทุกวัน) / ชื่อเครื่อง .local
const DEV_LAN_ORIGIN_RE =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|[a-zA-Z0-9-]+(?:\.local|\.lan|\.home))(?::\d{1,5})?$/;

function parseAllowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** origin ของ dev/LAN ที่ปลอดภัย — อนุญาตเฉพาะโหมด development */
function isDevLanOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return DEV_LAN_ORIGIN_RE.test(origin.toLowerCase());
}

/** origin นี้อนุญาตหรือไม่ (ไม่ส่ง Origin header = same-origin/เครื่องมือ CLI → อนุญาต) */
export function isOriginAllowed(origin: string | null, request: NextRequest): boolean {
  if (!origin) return true;
  if (parseAllowedOrigins().includes(origin)) return true;
  // dev/LAN: เข้าจากมือถือด้วย IP ของเครื่อง (IP เปลี่ยนทุกวัน) หรือชื่อเครื่อง .local
  if (isDevLanOrigin(origin)) return true;
  try {
    const originHost = new URL(origin).host;
    // same-origin: เทียบกับ origin ของ request เอง หรือ host header (กรณีอยู่หลัง proxy)
    const requestHost =
      request.headers.get('x-forwarded-host') ||
      request.headers.get('host') ||
      request.nextUrl?.host;
    if (requestHost && originHost === requestHost) return true;
  } catch {
    // origin ฟอร์แมตเพี้ยน → ปฏิเสธ
  }
  return false;
}

/** Guard สำหรับ API route — คืน null ถ้าผ่าน / NextResponse (403) ถ้า origin ต้องห้าม */
export function corsGuard(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  if (isOriginAllowed(origin, request)) return null;
  return NextResponse.json({ error: 'Origin นี้ไม่ได้รับอนุญาต' }, { status: 403 });
}

/** ตอบ preflight (OPTIONS) — 204 เมื่อ origin ผ่าน / 403 เมื่อไม่ผ่าน */
export function corsPreflightResponse(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  const allowed = isOriginAllowed(origin, request);
  const res = new NextResponse(null, { status: allowed ? 204 : 403 });
  if (allowed && origin) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
    res.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    res.headers.set('Access-Control-Max-Age', '600');
  }
  return res;
}
