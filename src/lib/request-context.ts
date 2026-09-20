// Request context — ดึง identity (User/IP/Device) จาก request — Phase 10
// ใช้โดย Rate Limit, Anti-cheat และการ fingerprint บัญชีแฝง
import { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession, SessionPayload } from '@/lib/session';

/** IP ของ client — รองรับ reverse proxy ผ่าน x-forwarded-for / x-real-ip */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim().slice(0, 64);
  return 'unknown';
}

/** Device id ที่ client ส่งมา (header x-device-id) — fingerprint สำหรับตรวจ Alt-account */
export function getDeviceId(request: NextRequest): string | null {
  const deviceId = request.headers.get('x-device-id');
  if (!deviceId) return null;
  const trimmed = deviceId.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return trimmed;
}

/** Session จาก cookie (null ถ้าไม่ได้ล็อกอิน / token ไม่ถูกต้อง) */
export function getSessionUser(request: NextRequest): SessionPayload | null {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}

/** userId จาก session cookie (null ถ้าไม่ได้ล็อกอิน) */
export function getSessionUserId(request: NextRequest): string | null {
  return getSessionUser(request)?.sub ?? null;
}

/** identity ทั้ง 3 ระดับ (User → Device → IP) สำหรับใช้กับ rate limit / audit */
export interface RequestIdentity {
  userId: string | null;
  deviceId: string | null;
  ip: string;
}

export function getRequestIdentity(
  request: NextRequest,
  knownUserId?: string | null
): RequestIdentity {
  return {
    userId: knownUserId ?? getSessionUserId(request),
    deviceId: getDeviceId(request),
    ip: getClientIp(request),
  };
}
