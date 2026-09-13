// Password Hashing — scrypt (Node built-in) ไม่พึ่ง dependency ภายนอก
// Format: scrypt$N$r$p$<saltB64url>$<hashB64url>
import crypto from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function assertValidPassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
  }
  if (password.length > 128) {
    throw new Error('รหัสผ่านยาวเกินไป');
  }
}

/** เข้ารหัสรหัสผ่านแบบ scrypt พร้อม salt สุ่ม */
export function hashPassword(password: string): string {
  assertValidPassword(password);
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64url(salt)}$${b64url(hash)}`;
}

/** ตรวจรหัสผ่านกับ hash — ปลอดภัยต่อ timing attack */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    assertValidPassword(password);
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
