// Middleware — Logger + Security Headers (Phase 0) + CORS + Rate Limit (Phase 10) + Request ID (Phase 12)
// หมายเหตุ: middleware รันบน edge runtime — ห้าม import module ที่ใช้ node:crypto (เช่น session.ts)
// จึง import เฉพาะ pure core จาก @/lib/rate-limit และ parse IP เอง
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitConfig } from '@/lib/rate-limit';
import { corsGuard, corsPreflightResponse } from '@/lib/cors';

const REQUEST_ID_HEADER = 'x-request-id';

/** request id สำหรับ correlate log (edge-safe — ใช้ Web Crypto) */
function makeRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID().slice(0, 18);
    }
  } catch {
    // fallthrough
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ===== Security Headers =====

const SECURITY_HEADERS: Array<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['X-DNS-Prefetch-Control', 'off'],
];

/** CSP — Next.js ต้องมี 'unsafe-inline' (hydration) / dev ต้องมี 'unsafe-eval' (HMR) */
function contentSecurityPolicy(): string {
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function applySecurityHeaders(res: NextResponse, requestId?: string): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    res.headers.set(key, value);
  }
  res.headers.set('Content-Security-Policy', contentSecurityPolicy());
  if (requestId) res.headers.set(REQUEST_ID_HEADER, requestId);
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return res;
}

function getClientIpFromRequest(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim().slice(0, 64);
  return 'unknown';
}

export function middleware(request: NextRequest) {
  const start = Date.now();
  const { pathname } = request.nextUrl;
  // Phase 12: request id เดียวตลอดเส้นทาง (client ส่งมาได้เพื่อ correlate ข้ามระบบ)
  const requestId = request.headers.get(REQUEST_ID_HEADER) || makeRequestId();

  // ===== API: CORS + Rate limit ชั้นแรก (per IP) =====
  if (pathname.startsWith('/api')) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request);
    }
    const corsBlocked = corsGuard(request);
    if (corsBlocked) {
      logRequestLine(request, 403, start, requestId, pathname);
      return applySecurityHeaders(corsBlocked, requestId);
    }

    const burst = checkRateLimit(
      'API_BURST',
      `ip:${getClientIpFromRequest(request)}`,
      rateLimitConfig('API_BURST')
    );
    if (!burst.allowed) {
      const res = NextResponse.json(
        { error: 'คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(burst.retryAfterMs / 1000)),
            'X-RateLimit-Limit': String(burst.limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
      logRequestLine(request, 429, start, requestId, pathname);
      return applySecurityHeaders(res, requestId);
    }
  }

  const res = NextResponse.next();
  if (!pathname.startsWith('/_next')) {
    logRequestLine(request, res.status, start, requestId, pathname);
  }
  return applySecurityHeaders(res, requestId);
}

/** log 1 บรรทัดแบบ structured (edge-safe — ไม่พึ่ง node API) */
function logRequestLine(
  request: NextRequest,
  status: number,
  start: number,
  requestId: string,
  pathname: string
): void {
  const durationMs = Date.now() - start;
  const slowMs = Number(process.env.SLOW_REQUEST_MS) || 1000;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: durationMs >= slowMs ? 'warn' : 'info',
      msg: durationMs >= slowMs ? 'slow_request' : 'request',
      requestId,
      method: request.method,
      path: pathname,
      status,
      durationMs,
    })
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

