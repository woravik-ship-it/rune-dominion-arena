import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

// POST /api/auth/logout — ออกจากระบบ (ล้าง cookie)
export async function POST() {
  const res = NextResponse.json({ success: true, message: 'ออกจากระบบแล้ว' });
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return res;
}
