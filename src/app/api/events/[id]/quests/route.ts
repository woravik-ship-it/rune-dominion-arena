// GET  /api/events/[id]/quests  — บอร์ด Event Quest + ความคืบหน้าจริง
// POST /api/events/[id]/quests  — รับรางวัล (body: { eventQuestId })
import { NextRequest, NextResponse } from 'next/server';
import { EventQuestService } from '@/services/event-quest';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await resolveRequestUserId(request, searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    const board = await EventQuestService.getBoard(params.id, userId);
    return NextResponse.json({ success: true, data: board });
  } catch (error) {
    console.error('Get event quests error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { eventQuestId?: string };
    if (!body.eventQuestId) {
      return NextResponse.json({ error: 'ต้องระบุ eventQuestId' }, { status: 400 });
    }
    const userId = await resolveRequestUserId(request, null);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const result = await EventQuestService.claim(params.id, userId, body.eventQuestId);
    if (!result.claimed) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Claim event quest error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
