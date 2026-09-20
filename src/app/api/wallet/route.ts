import { NextRequest, NextResponse } from 'next/server';
import { WalletService } from '@/services/wallet';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/wallet — ยอด Coin ปัจจุบัน (ยึด session cookie ก่อน)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId');
    const userId = await resolveRequestUserId(request, param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const wallet = await WalletService.getWallet(userId);
    return NextResponse.json({ success: true, data: wallet });
  } catch (error) {
    console.error('Get wallet error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
