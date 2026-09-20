import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { QuestService } from '@/services/quest';
import { parseJsonBody, questClaimSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';

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
    // Phase 10: input validation + rate limit
    const { data, errorResponse } = await parseJsonBody(request, questClaimSchema);
    if (errorResponse) return errorResponse;
    const { userId: userIdParam } = data;

    const rl = enforceRateLimit(request, 'QUEST_CLAIM', { userId: userIdParam });
    if (rl) return rl;

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
