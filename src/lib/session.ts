// Session — JWT HS256 (Node crypto) + Cookie config
// ไม่พึ่ง dependency ภายนอก / เก็บข้อมูลน้อยที่สุดใน token
import crypto from 'crypto';

export const SESSION_COOKIE = 'rda_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 วัน

export interface SessionPayload {
  sub: string;       // userId
  username: string;
  role: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('ต้องตั้งค่า AUTH_SECRET ใน production');
  }
  return secret || 'dev-secret-change-me';
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function hmac(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/** ลงนาม session token (JWT HS256) */
export function signSession(
  payload: Pick<SessionPayload, 'sub' | 'username' | 'role'>,
  now: Date = new Date()
): string {
  const secret = getSecret();
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body: SessionPayload = {
    ...payload,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS,
  };
  const bodyPart = b64urlJson(body);
  const signature = hmac(`${header}.${bodyPart}`, secret);
  return `${header}.${bodyPart}.${signature}`;
}

/** ตรวจ session token — คืน payload เมื่อถูกต้องและไม่หมดอายุ ไม่เช่นนั้นคืน null */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, bodyPart, signature] = parts;

    // alg ต้องเป็น HS256 เท่านั้น (กัน alg:none)
    const parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    if (parsedHeader?.alg !== 'HS256' || parsedHeader?.typ !== 'JWT') return null;

    const secret = getSecret();
    const expected = hmac(`${header}.${bodyPart}`, secret);
    const given = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (given.length !== expectedBuf.length || !crypto.timingSafeEqual(given, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(bodyPart, 'base64url').toString()) as SessionPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** ตัวเลือก cookie สำหรับ session */
export function sessionCookieOptions(maxAge: number = SESSION_TTL_SECONDS) {
  // Secure เฉพาะเมื่อ deploy บน HTTPS จริง — ไม่งั้น browser จะไม่เก็บ cookie ตอนเข้าผ่าน http://<ip>
  const isHttps = (process.env.NEXT_PUBLIC_APP_URL || '').startsWith('https');
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && isHttps,
    path: '/',
    maxAge,
  };
}
