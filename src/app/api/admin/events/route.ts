// Admin Events — Phase 44: จัดการกิจกรรม (ผู้ใช้สั่ง 2026-10-07)
// GET  /api/admin/events — รายการกิจกรรมทั้งหมด (รวมที่ปิด) สำหรับ Admin
// POST /api/admin/events — สร้างกิจกรรมใหม่ (ค่าเริ่มต้น isActive = false เสมอ)
//
// สิทธิ์: ไม่ล็อกอิน → 401 · ล็อกอินแล้วแต่ไม่ใช่ ADMIN/MODERATOR → 403
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auditAdminAction } from '@/lib/admin';
import { mapAdminEvent, requireAdmin } from '@/lib/admin-events';
import { eventAdminCreateSchema, parseJsonBody } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const guard = requireAdmin(request);
    if (guard.response) return guard.response;

    const events = await prisma.event.findMany({
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
      include: {
        _count: { select: { participations: true, quests: true, bosses: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: events.map((e) =>
        mapAdminEvent(e, {
          participantCount: e._count.participations,
          questCount: e._count.quests,
          bossCount: e._count.bosses,
        })
      ),
    });
  } catch (error) {
    console.error('Admin events list error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = requireAdmin(request);
    if (guard.response) return guard.response;

    const { data, errorResponse } = await parseJsonBody(request, eventAdminCreateSchema);
    if (errorResponse) return errorResponse;

    const created = await prisma.event.create({
      data: {
        name: data.name,
        nameTh: data.nameTh,
        description: data.description ?? null,
        descriptionTh: data.descriptionTh ?? null,
        eventType: data.eventType,
        status: data.status ?? 'UPCOMING',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        gracePeriodEnd: data.gracePeriodEnd ? new Date(data.gracePeriodEnd) : null,
        currencyName: data.currencyName,
        maxCurrency: data.maxCurrency ?? null,
        // ค่าเริ่มต้น = ปิด (isActive false) — กันเปิดกิจกรรมให้ผู้เล่นจริงโดยไม่ตั้งใจ
        isActive: data.isActive ?? false,
      },
    });

    await auditAdminAction(guard.session, 'CREATE_EVENT', 'EVENT', created.id, {
      name: created.name,
      isActive: created.isActive,
      eventType: created.eventType,
    });

    return NextResponse.json({ success: true, data: mapAdminEvent(created) }, { status: 201 });
  } catch (error) {
    console.error('Admin create event error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
