import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseJsonBody, cardFavoriteSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';

export async function POST(request: NextRequest) {
  try {
    // Phase 10: input validation + rate limit
    const { data, errorResponse } = await parseJsonBody(request, cardFavoriteSchema);
    if (errorResponse) return errorResponse;
    const { userId: userIdParam, cardId, isFavorite } = data;

    const rl = enforceRateLimit(request, 'CARD_FAVORITE', { userId: userIdParam });
    if (rl) return rl;

    // ยึด session cookie ก่อน — กันสลับ favorite ให้การ์ดของคนอื่น
    const userId = await resolveRequestUserId(request, userIdParam);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const result = await prisma.userCard.updateMany({
      where: { userId, cardId },
      data: { isFavorite },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: 'ไม่พบการ์ดนี้ในคอลเลกชันของคุณ' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      isFavorite: isFavorite,
    });
  } catch (error) {
    console.error('Favorite error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

