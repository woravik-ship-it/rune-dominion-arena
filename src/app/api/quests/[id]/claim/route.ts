import { NextRequest, NextResponse } from 'next/server';
import { QuestService } from '@/services/quest';
import { parseJsonBody, questClaimSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';

// POST /api/quests/[id]/claim — รับรางวัลภารกิจ (Idempotent) — ยึด session cookie ก่อน
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Phase 10: input validation + rate limit
    const { data, errorResponse } = await parseJsonBody(request, questClaimSchema);
    if (errorResponse) return errorResponse;
    const { userId: userIdParam } = data;

    const rl = enforceRateLimit(request, 'QUEST_CLAIM', { userId: userIdParam });
    if (rl) return rl;

    const userId = await resolveRequestUserId(request, userIdParam);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

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
