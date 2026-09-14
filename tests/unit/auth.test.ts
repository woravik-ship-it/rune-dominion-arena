import {
  hashPassword,
  verifyPassword,
} from '@/lib/password';
import {
  signSession,
  verifySession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from '@/lib/session';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, AUTH_SECRET: 'test-secret-for-jest-1234567890' };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('password hashing (scrypt)', () => {
  test('hash → verify ด้วยรหัสผ่านถูกต้อง', () => {
    const hash = hashPassword('s3curePass!');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(verifyPassword('s3curePass!', hash)).toBe(true);
  });

  test('รหัสผ่านผิด → ปฏิเสธ', () => {
    const hash = hashPassword('correct-horse-8');
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  test('salt สุ่ม → hash เดิมสองครั้งให้ผลลัพธ์ต่างกัน แต่ verify ได้ทั้งคู่', () => {
    const h1 = hashPassword('same-password');
    const h2 = hashPassword('same-password');
    expect(h1).not.toBe(h2);
    expect(verifyPassword('same-password', h1)).toBe(true);
    expect(verifyPassword('same-password', h2)).toBe(true);
  });

  test('hash ที่ถูกแก้ไข → ปฏิเสธ', () => {
    const hash = hashPassword('trustno1pass');
    const tampered = hash.replace(/\$[\w-]+$/, '$AAAAAAAAAA');
    expect(verifyPassword('trustno1pass', tampered)).toBe(false);
  });

  test('รหัสผ่านสั้นเกิน 8 ตัว → throw', () => {
    expect(() => hashPassword('short')).toThrow('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    expect(verifyPassword('short', 'anything')).toBe(false);
  });

  test('hash รูปแบบผิด → ปฏิเสธอย่างปลอดภัย (ไม่ throw)', () => {
    expect(verifyPassword('whatever-123', '')).toBe(false);
    expect(verifyPassword('whatever-123', 'garbage')).toBe(false);
    expect(verifyPassword('whatever-123', 'bcrypt$2a$10$xyz')).toBe(false);
  });
});

describe('session (JWT HS256)', () => {
  const payload = { sub: 'user-1', username: 'warrior99', role: 'PLAYER' };

  test('sign → verify ได้ payload ครบ + iat/exp ถูกต้อง', () => {
    const now = new Date(); // ใช้เวลาจริง เพราะ verify เทียบกับ Date.now()
    const token = signSession(payload, now);
    const decoded = verifySession(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe('user-1');
    expect(decoded?.username).toBe('warrior99');
    expect(decoded?.role).toBe('PLAYER');
    expect(decoded?.iat).toBe(Math.floor(now.getTime() / 1000));
    expect(decoded?.exp).toBe(Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS);
    expect(token.split('.')).toHaveLength(3);
  });

  test('secret ต่างกัน → ปฏิเสธ (signature mismatch)', () => {
    const token = signSession(payload);
    process.env.AUTH_SECRET = 'another-secret-entirely-987654321';
    expect(verifySession(token)).toBeNull();
  });

  test('token ถูกแก้ payload → ปฏิเสธ', () => {
    const token = signSession(payload);
    const [header, , sig] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ ...payload, sub: 'victim-user', role: 'ADMIN' })
    ).toString('base64url');
    expect(verifySession(`${header}.${forgedBody}.${sig}`)).toBeNull();
  });

  test('alg:none attack → ปฏิเสธ', () => {
    const forgedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 9999 })).toString('base64url');
    expect(verifySession(`${forgedHeader}.${body}.`)).toBeNull();
  });

  test('token หมดอายุ → ปฏิเสธ', () => {
    const past = new Date(Date.now() - (SESSION_TTL_SECONDS + 60) * 1000);
    const token = signSession(payload, past);
    expect(verifySession(token)).toBeNull();
  });

  test('token รูปแบบเสีย / ค่าว่าง → ปฏิเสธอย่างปลอดภัย', () => {
    expect(verifySession(null)).toBeNull();
    expect(verifySession('')).toBeNull();
    expect(verifySession('abc.def')).toBeNull();
    expect(verifySession('a.b.c.d')).toBeNull();
  });

  test('cookie options: httpOnly + sameSite lax + secure เฉพาะ production บน HTTPS', () => {
    expect(SESSION_COOKIE).toBe('rda_session');
    const devOpts = sessionCookieOptions();
    expect(devOpts.httpOnly).toBe(true);
    expect(devOpts.sameSite).toBe('lax');
    expect(devOpts.path).toBe('/');
    expect(devOpts.maxAge).toBe(SESSION_TTL_SECONDS);

    const env = process.env as { NODE_ENV?: string; NEXT_PUBLIC_APP_URL?: string };
    const savedUrl = env.NEXT_PUBLIC_APP_URL;

    // production + HTTPS → secure
    env.NODE_ENV = 'production';
    env.NEXT_PUBLIC_APP_URL = 'https://game.example.com';
    expect(sessionCookieOptions().secure).toBe(true);

    // production แต่เข้าผ่าน http (LAN IP) → ไม่ secure (browser ไม่งั้นจะไม่เก็บ cookie)
    env.NEXT_PUBLIC_APP_URL = 'http://192.168.1.52:3000';
    expect(sessionCookieOptions().secure).toBe(false);

    // development → ไม่ secure เสมอ
    env.NODE_ENV = 'development';
    env.NEXT_PUBLIC_APP_URL = 'https://game.example.com';
    expect(sessionCookieOptions().secure).toBe(false);

    if (savedUrl === undefined) delete env.NEXT_PUBLIC_APP_URL;
    else env.NEXT_PUBLIC_APP_URL = savedUrl;
  });
});
