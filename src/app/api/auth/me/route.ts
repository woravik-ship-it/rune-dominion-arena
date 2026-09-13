import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SESSION_COOKIE, verifySession } from '@/lib/session';
import { WalletService } from '@/services/wallet';

// GET /api/auth/me — ข้อมูลผู้ใช้ปัจจุบันจาก session cookie
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    const session = verifySession(token);
    if (!session) {
      return NextResponse.json({ success: false, error: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true, username: true, email: true, displayName: true,
        avatarUrl: true, role: true, discoveryEnergy: true, isActive: true, createdAt: true,
      },
    });
    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: 'ไม่ได้เข้าสู่ระบบ' }, { status: 401 });
    }

    const wallet = await WalletService.getWallet(user.id);
    return NextResponse.json({ success: true, data: { user, wallet } });
  } catch (error) {
    console.error('Me error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
