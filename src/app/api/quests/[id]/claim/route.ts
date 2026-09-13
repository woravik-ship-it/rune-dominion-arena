import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { QuestService } from '@/services/quest';

async function resolveUserId(param: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(param)) {
    const byId = await prisma.user.findUnique({ where: { id: param }, select: { id: true } });
    if (byId) return byId.id;
  }
  const byName = await prisma.user.findUnique({ where: { username: param }, select: { id: true } });
  return byName?.id ?? null;
}

// POST /api/quests/[id]/claim — รับรางวัลภารกิจ (Idempotent)
// body: { userId }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId: userIdParam } = body as { userId?: string };
    if (!userIdParam) return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });

    const userId = await resolveUserId(userIdParam);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const result = await QuestService.claim(userId, params.id);
    if (!result.claimed) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      data: { rewardAmount: result.rewardAmount, message: result.message },
    });
  } catch (error) {
    console.error('Claim quest error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
