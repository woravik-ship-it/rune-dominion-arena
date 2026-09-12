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

// GET /api/wallet/transactions?userId=&page=&limit=&filter=ALL|IN|OUT
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId') || 'temp-user';
    const userId = await resolveUserId(param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const filter = (searchParams.get('filter') || 'ALL') as 'ALL' | 'IN' | 'OUT';

    const result = await WalletService.getTransactions(userId, { page, limit, filter });
    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
