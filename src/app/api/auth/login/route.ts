import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions, signSession } from '@/lib/session';

// POST /api/auth/login — เข้าสู่ระบบ (username หรือ email + password)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { identifier, password } = body as { identifier?: string; password?: string };

    if (!identifier || !password) {
      return NextResponse.json({ error: 'ต้องระบุชื่อผู้ใช้/อีเมล และรหัสผ่าน' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    // ตอบข้อความเดียวกันทั้งกรณี "ไม่พบผู้ใช้" และ "รหัสผ่านผิด" (กัน user enumeration)
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }, { status: 401 });
    }

    const token = signSession({ sub: user.id, username: user.username, role: user.role });
    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
          discoveryEnergy: user.discoveryEnergy,
        },
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_SECONDS));
    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
