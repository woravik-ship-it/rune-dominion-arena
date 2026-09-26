import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ImageService } from '@/services/image';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/images/status — สถานะการสร้างภาพการ์ด + เวลาที่ต้องรอ (Phase 20)
//
// ผู้ใช้สั่ง 2026-09-26: "ตอน Gen รูปการ์ด ให้บอกว่าใช้เวลาประมาณเท่าไร และสามารถกลับมาดูได้ภายหลัง"
// query: ?cardId=<id>  หรือ ?cardIds=a,b,c  (ไม่ส่ง = การ์ดของผู้เล่นที่ยังไม่มีภาพจำนวนสูงสุด 60 ใบ)
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const single = request.nextUrl.searchParams.get('cardId');
    const many = request.nextUrl.searchParams.get('cardIds');
    let cardIds: string[] = [];

    if (single) cardIds = [single];
    else if (many) cardIds = many.split(',').map((id) => id.trim()).filter(Boolean);

    if (cardIds.length === 0) {
      const owned = await prisma.userCard.findMany({
        where: { userId, card: { imageUrl: null } },
        select: { cardId: true },
        take: 60,
        orderBy: { obtainedAt: 'desc' },
      });
      cardIds = owned.map((row) => row.cardId);
    }

    const [items, queue] = await Promise.all([
      ImageService.statusForCards(cardIds),
      ImageService.queueSnapshot(),
    ]);

    return NextResponse.json({
      success: true,
      data: { items: items.filter((item) => item.status !== 'READY' && item.status !== 'NONE'), queue },
    });
  } catch (error) {
    console.error('Image status error:', error);
    return NextResponse.json({ error: 'อ่านสถานะภาพไม่สำเร็จ' }, { status: 500 });
  }
}
