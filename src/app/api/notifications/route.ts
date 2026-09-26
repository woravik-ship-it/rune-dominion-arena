import { NextRequest, NextResponse } from 'next/server';
import { NotificationService } from '@/services/notification';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/notifications — ศูนย์การแจ้งเตือนของผู้เล่น (Phase 20)
// query: ?filter=all|unread  ·  ?limit=30
// คืนข้อความตามภาษาที่ผู้เล่นเลือกไว้ (User.locale) + จำนวนที่ยังไม่อ่าน
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const filter = request.nextUrl.searchParams.get('filter') === 'unread' ? 'unread' : 'all';
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '30');
    const limit = Number.isFinite(limitParam) ? limitParam : 30;

    const data = await NotificationService.list(userId, { filter, limit });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('List notifications error:', error);
    return NextResponse.json({ error: 'อ่านการแจ้งเตือนไม่สำเร็จ' }, { status: 500 });
  }
}
