// POST /api/events/[id]/shop — ซื้อของใน Event Shop ด้วย Veil Shards
// body: { itemId, idempotencyKey? }
import { NextRequest, NextResponse } from 'next/server';
import { EventService } from '@/services/event';
import { resolveRequestUserId } from '@/lib/current-user';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      itemId?: string;
      idempotencyKey?: string;
    };
    if (!body.itemId) {
      return NextResponse.json({ error: 'ต้องระบุ itemId' }, { status: 400 });
    }

    const userId = await resolveRequestUserId(request, null);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const result = await EventService.purchase({
      eventId: params.id,
      userId,
      itemId: body.itemId,
      idempotencyKey: body.idempotencyKey,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Event shop error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
