import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, auditAdminAction } from '@/lib/admin';

// PATCH /api/admin/quests/[id] — แก้ไขเควส (เปิด/ปิด, เป้าหมาย, รางวัล)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getAdminSession(request);
    if (!session) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { isActive, targetValue, rewardAmount } = body as {
      isActive?: boolean;
      targetValue?: number;
      rewardAmount?: number;
    };

    const quest = await prisma.quest.findUnique({ where: { id: params.id } });
    if (!quest) {
      return NextResponse.json({ error: 'ไม่พบเควส' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (targetValue !== undefined) {
      if (!Number.isInteger(targetValue) || targetValue < 1) {
        return NextResponse.json({ error: 'targetValue ต้องเป็นจำนวนเต็มบวก' }, { status: 400 });
      }
      data.targetValue = targetValue;
    }
    if (rewardAmount !== undefined) {
      if (!Number.isInteger(rewardAmount) || rewardAmount < 0) {
        return NextResponse.json({ error: 'rewardAmount ต้องเป็นจำนวนเต็ม ≥ 0' }, { status: 400 });
      }
      data.rewardAmount = rewardAmount;
    }

    const updated = await prisma.quest.update({ where: { id: params.id }, data });

    await auditAdminAction(session, 'UPDATE_QUEST', 'QUEST', params.id, {
      before: { isActive: quest.isActive, targetValue: quest.targetValue, rewardAmount: quest.rewardAmount },
      after: { isActive: updated.isActive, targetValue: updated.targetValue, rewardAmount: updated.rewardAmount },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, isActive: updated.isActive, targetValue: updated.targetValue, rewardAmount: updated.rewardAmount },
    });
  } catch (error) {
    console.error('Admin update quest error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
