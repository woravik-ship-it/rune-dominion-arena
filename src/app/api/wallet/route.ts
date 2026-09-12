import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WalletService } from '@/services/wallet';

async function resolveUserId(param: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(param)) {
    const e = await prisma.user.findUnique({ where: { id: param }, select: { id: true } });
    if (e) return e.id;
  }
  const u = await prisma.user.findUnique({ where: { username: param }, select: { id: true } });
  return u?.id ?? null;
}

// GET /api/wallet?userId=xxx — ยอด Coin ปัจจุบัน
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId') || 'temp-user';
    const userId = await resolveUserId(param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const wallet = await WalletService.getWallet(userId);
    return NextResponse.json({ success: true, data: wallet });
  } catch (error) {
    console.error('Get wallet error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
