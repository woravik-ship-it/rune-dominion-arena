import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieOptions, signSession } from '@/lib/session';
import { WalletService } from '@/services/wallet';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toSafeUser(user: {
  id: string; username: string; email: string; displayName: string | null;
  avatarUrl: string | null; role: string; discoveryEnergy: number; createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    discoveryEnergy: user.discoveryEnergy,
    createdAt: user.createdAt,
  };
}

// POST /api/auth/register — สมัครสมาชิก (username + email + password)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { username, email, password, displayName } = body as {
      username?: string; email?: string; password?: string; displayName?: string;
    };

    if (!username || !USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข/ขีดล่าง 3-20 ตัวอักษร' }, { status: 400 });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });
    if (existing) {
      const conflict = existing.username === username ? 'ชื่อผู้ใช้' : 'อีเมล';
      return NextResponse.json({ error: `${conflict}นี้ถูกใช้แล้ว` }, { status: 409 });
    }

    const passwordHash = hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: displayName?.trim() || null,
      },
    });

    // สร้างกระเป๋าเริ่มต้น (โบนัสสมัคร)
    await WalletService.getWallet(user.id);

    const token = signSession({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    const res = NextResponse.json({ success: true, data: { user: toSafeUser(user) } }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_TTL_SECONDS));
    return res;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
