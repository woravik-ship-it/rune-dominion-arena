// Admin Event [id] — Phase 44 (ผู้ใช้สั่ง 2026-10-07)
// GET    /api/admin/events/[id] — ดูรายละเอียดกิจกรรมเดียว (มี boss / จำนวนผู้เข้าร่วม)
// PATCH  /api/admin/events/[id] — แก้ไขบางฟิลด์ (รวมปุ่มเปิด/ปิด isActive)
// DELETE /api/admin/events/[id] — ลบกิจกรรม (cascade ลูกทั้งหมด)
//
// สิทธิ์: ไม่ล็อกอิน → 401 · ล็อกอินแล้วแต่ไม่ใช่ ADMIN/MODERATOR → 403
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auditAdminAction } from '@/lib/admin';
import { requireAdmin } from '@/lib/admin-events';
import { eventAdminUpdateSchema, parseJsonBody, validateEventWindow } from '@/lib/validation';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = requireAdmin(request);
    if (guard.response) return guard.response;

    const event = await prisma.event.findUnique({
      where: { id: params.id },
      include: {
        bosses: { orderBy: { createdAt: 'asc' } },
        _count: { select: { participations: true, quests: true, bosses: true } },
      },
    });
    if (!event) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        name: event.name,
        nameTh: event.nameTh,
        description: event.description,
        descriptionTh: event.descriptionTh,
        eventType: event.eventType,
        status: event.status,
        startDate: event.startDate,
        endDate: event.endDate,
        gracePeriodEnd: event.gracePeriodEnd,
        currencyName: event.currencyName,
        maxCurrency: event.maxCurrency,
        isActive: event.isActive,
        participantCount: event._count.participations,
        questCount: event._count.quests,
        bossCount: event._count.bosses,
        bosses: event.bosses,
      },
    });
  } catch (error) {
    console.error('Admin get event error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = requireAdmin(request);
    if (guard.response) return guard.response;

    const { data, errorResponse } = await parseJsonBody(request, eventAdminUpdateSchema);
    if (errorResponse) return errorResponse;

    const existing = await prisma.event.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    }

    // รวมค่าที่จะบันทึกจริง แล้วตรวจช่วงเวลาทั้งก้อน (แก้ start อย่างเดียวก็ยังต้องไม่ชน end เดิม)
    const mergedWindow = {
      startDate: data.startDate ?? existing.startDate,
      endDate: data.endDate ?? existing.endDate,
      gracePeriodEnd:
        data.gracePeriodEnd !== undefined ? data.gracePeriodEnd : existing.gracePeriodEnd,
    };
    const windowError = validateEventWindow(mergedWindow);
    if (windowError) {
      return NextResponse.json({ error: windowError }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.nameTh !== undefined) updateData.nameTh = data.nameTh;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.descriptionTh !== undefined) updateData.descriptionTh = data.descriptionTh;
    if (data.eventType !== undefined) updateData.eventType = data.eventType;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.gracePeriodEnd !== undefined) {
      updateData.gracePeriodEnd = data.gracePeriodEnd ? new Date(data.gracePeriodEnd) : null;
    }
    if (data.currencyName !== undefined) updateData.currencyName = data.currencyName;
    if (data.maxCurrency !== undefined) updateData.maxCurrency = data.maxCurrency;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.event.update({ where: { id: params.id }, data: updateData });

    await auditAdminAction(guard.session, 'UPDATE_EVENT', 'EVENT', updated.id, {
      before: { isActive: existing.isActive, status: existing.status },
      after: { isActive: updated.isActive, status: updated.status },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        isActive: updated.isActive,
        status: updated.status,
        name: updated.name,
        nameTh: updated.nameTh,
      },
    });
  } catch (error) {
    console.error('Admin update event error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const guard = requireAdmin(request);
    if (guard.response) return guard.response;

    const existing = await prisma.event.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรม' }, { status: 404 });
    }

    await prisma.event.delete({ where: { id: params.id } });

    await auditAdminAction(guard.session, 'DELETE_EVENT', 'EVENT', params.id, {
      name: existing.name,
      nameTh: existing.nameTh,
    });

    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Admin delete event error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
