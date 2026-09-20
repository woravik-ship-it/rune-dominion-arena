// API Guard — Rate limit ระดับ route (ฝั่ง Node runtime) — Phase 10
// middleware (edge) ใช้เฉพาะ core จาก @/lib/rate-limit เพื่อเลี่ยง node:crypto
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RateLimitScope, rateLimitConfig } from '@/lib/rate-limit';
import { getClientIp, getDeviceId, getSessionUserId } from '@/lib/request-context';

function rateLimitResponse(retryAfterMs: number, limit: number): NextResponse {
  return NextResponse.json(
    { error: 'คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

/**
 * บังคับ rate limit ตามลำดับความสำคัญ User → Device → IP
 * คืน null ถ้าผ่าน / NextResponse (429) ถ้าเกินโควตา
 */
export function enforceRateLimit(
  request: NextRequest,
  scope: RateLimitScope,
  opts: { userId?: string | null } = {}
): NextResponse | null {
  const userId = opts.userId ?? getSessionUserId(request);
  const deviceId = getDeviceId(request);
  const ip = getClientIp(request);
  const identifier = userId
    ? `user:${userId}`
    : deviceId
      ? `device:${deviceId}`
      : `ip:${ip}`;

  const result = checkRateLimit(scope, identifier, rateLimitConfig(scope));
  if (result.allowed) return null;
  return rateLimitResponse(result.retryAfterMs, result.limit);
}

/**
 * Rate limit แบบกำหนด key เอง (เช่น ต่อบัญชีเป้าหมายตอนล็อกอิน)
 * คืน null ถ้าผ่าน / NextResponse (429) ถ้าเกินโควตา
 */
export function enforceRateLimitForKey(
  request: NextRequest,
  scope: RateLimitScope,
  key: string
): NextResponse | null {
  const result = checkRateLimit(scope, key, rateLimitConfig(scope));
  if (result.allowed) return null;
  return rateLimitResponse(result.retryAfterMs, result.limit);
}
