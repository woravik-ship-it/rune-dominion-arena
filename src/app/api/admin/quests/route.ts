import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';

// GET /api/admin/quests — รายการเควสทั้งหมด (รวม inactive) สำหรับ Admin
export async function GET(request: NextRequest) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const quests = await prisma.quest.findMany({
      orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { progress: true } } },
    });

    return NextResponse.json({
      success: true,
      data: quests.map((q) => ({
        id: q.id,
        code: q.code,
        name: q.name,
        nameTh: q.nameTh,
        descriptionTh: q.descriptionTh,
        type: q.type,
        metric: q.metric,
        targetValue: q.targetValue,
        rewardAmount: q.rewardAmount,
        isActive: q.isActive,
        startDate: q.startDate,
        endDate: q.endDate,
        participantCount: q._count.progress,
      })),
    });
  } catch (error) {
    console.error('Admin quests error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
