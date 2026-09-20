import { NextRequest, NextResponse } from 'next/server';
import { WalletService } from '@/services/wallet';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/wallet/transactions?page=&limit=&filter=ALL|IN|OUT — ยึด session cookie ก่อน
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId');
    const userId = await resolveRequestUserId(request, param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

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
