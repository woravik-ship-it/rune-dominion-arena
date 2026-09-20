// Middleware — Logger + Security Headers (Phase 0) + CORS + Rate Limit (Phase 10)
// หมายเหตุ: middleware รันบน edge runtime — ห้าม import module ที่ใช้ node:crypto (เช่น session.ts)
// จึง import เฉพาะ pure core จาก @/lib/rate-limit และ parse IP เอง
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, rateLimitConfig } from '@/lib/rate-limit';
import { corsGuard, corsPreflightResponse } from '@/lib/cors';

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

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    res.headers.set(key, value);
  }
  res.headers.set('Content-Security-Policy', contentSecurityPolicy());
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

  // ===== API: CORS + Rate limit ชั้นแรก (per IP) =====
  if (pathname.startsWith('/api')) {
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(request);
    }
    const corsBlocked = corsGuard(request);
    if (corsBlocked) {
      return applySecurityHeaders(corsBlocked);
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
      return applySecurityHeaders(res);
    }
  }

  const res = NextResponse.next();

  // Request log (ข้าม static)
  if (!pathname.startsWith('/_next')) {
    console.log(
      `[${new Date().toISOString()}] ${request.method} ${pathname} -> ${res.status} (${Date.now() - start}ms)`
    );
  }
  return applySecurityHeaders(res);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

