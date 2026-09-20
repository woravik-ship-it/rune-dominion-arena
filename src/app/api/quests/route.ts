import { NextRequest, NextResponse } from 'next/server';
import { QuestService } from '@/services/quest';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/quests — บอร์ดภารกิจของผู้เล่น (งวดปัจจุบัน) — ยึด session cookie ก่อน
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId');
    const userId = await resolveRequestUserId(request, param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const board = await QuestService.getBoard(userId);
    return NextResponse.json({ success: true, data: board });
  } catch (error) {
    console.error('Get quests error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
