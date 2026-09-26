import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/services/notification';
import { resolveRequestUserId } from '@/lib/current-user';

// POST /api/notifications/read — ทำเครื่องหมายว่าอ่านแล้ว (Phase 20)
// body: { ids?: string[] }  ·  ไม่ส่ง ids = อ่านทั้งหมดของผู้เล่นคนนี้
export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : undefined;

    const updated = await NotificationService.markRead(userId, ids);
    const unreadCount = await NotificationService.unreadCount(userId);
    return NextResponse.json({ success: true, data: { updated, unreadCount } });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    return NextResponse.json({ error: 'บันทึกสถานะการอ่านไม่สำเร็จ' }, { status: 500 });
  }
}
