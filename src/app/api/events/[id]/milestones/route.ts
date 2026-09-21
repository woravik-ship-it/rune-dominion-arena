// GET  /api/events/[id]/milestones — สถานะ milestone (personal + community)
// POST /api/events/[id]/milestones — รับรางวัล milestone (body: { milestoneId })
import { NextRequest, NextResponse } from 'next/server';
import { EventService } from '@/services/event';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await resolveRequestUserId(request, searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    const milestones = await EventService.claimableMilestones(params.id, userId);
    return NextResponse.json({ success: true, data: milestones });
  } catch (error) {
    console.error('Get milestones error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { milestoneId?: string };
    if (!body.milestoneId) {
      return NextResponse.json({ error: 'ต้องระบุ milestoneId' }, { status: 400 });
    }
    const userId = await resolveRequestUserId(request, null);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const result = await EventService.claimMilestone({
      eventId: params.id,
      userId,
      milestoneId: body.milestoneId,
    });
    if (!result.claimed) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Claim milestone error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
