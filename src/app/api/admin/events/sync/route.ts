// POST /api/admin/events/sync — scheduler: เปิด/ปิดกิจกรรมอัตโนมัติตามเวลา
// + seed ข้อมูลกิจกรรม (idempotent) — เรียกจาก cron หรือ admin
import { NextRequest, NextResponse } from 'next/server';
import { EventService } from '@/services/event';
import { seedFullEvent } from '@/services/event-seed';
import { isPrivileged } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    if (!isPrivileged(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบหรือ worker' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { seed?: boolean };
    const synced = await EventService.syncStatuses();

    let seeded = null;
    if (body.seed) {
      const r = await seedFullEvent();
      seeded = { id: r.event.id, status: r.event.status, bossHp: r.boss.maxHp };
    }

    return NextResponse.json({ success: true, data: { updated: synced.updated, seeded } });
  } catch (error) {
    console.error('Event sync error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

// GET — ดูสถานะกิจกรรมทั้งหมด (สำหรับ admin)
export async function GET(request: NextRequest) {
  try {
    if (!isPrivileged(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบหรือ worker' }, { status: 403 });
    }
    await EventService.syncStatuses();
    const { prisma } = await import('@/lib/prisma');
    const events = await prisma.event.findMany({
      orderBy: { startDate: 'desc' },
      include: { bosses: true, community: true, _count: { select: { participations: true, raids: true } } },
    });
    return NextResponse.json({ success: true, data: events });
  } catch (error) {
    console.error('Event admin list error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
