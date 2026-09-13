// Middleware — Logger + Security Headers (Phase 0)
// หมายเหตุ: Auth guard แบบบังคับจะเปิดหลังจาก frontend login พร้อมใช้งานเต็มรูปแบบ
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const start = Date.now();
  const res = NextResponse.next();

  // Security headers
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Request log (ข้าม static)
  if (!request.nextUrl.pathname.startsWith('/_next')) {
    console.log(
      `[${new Date().toISOString()}] ${request.method} ${request.nextUrl.pathname} -> ${res.status} (${Date.now() - start}ms)`
    );
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
