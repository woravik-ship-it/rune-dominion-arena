// GET /api/cards/[id]/owners — เจ้าของการ์ดนี้ (Phase 2: ดูว่ามีใครถืออยู่บ้าง)
// ค่าเริ่มต้นปิดการเปิดเผยชื่อผู้เล่นอื่น: ส่งเฉพาะจำนวน + ชื่อผู้เล่นที่ยินยอม (มาจากการค้นพบครั้งแรก)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const card = await prisma.cardDefinition.findUnique({
      where: { id: params.id },
      select: { id: true, discoveryCount: true, firstDiscovererId: true },
    });
    if (!card) {
      return NextResponse.json({ error: 'ไม่พบการ์ดนี้' }, { status: 404 });
    }

    const [ownerCount, firstDiscoverer] = await Promise.all([
      prisma.userCard.count({ where: { cardId: card.id } }),
      card.firstDiscovererId
        ? prisma.user.findUnique({
            where: { id: card.firstDiscovererId },
            select: { username: true, displayName: true },
          })
        : null,
    ]);

    return NextResponse.json({
      success: true,
      data: {
        cardId: card.id,
        ownerCount,
        discoveryCount: card.discoveryCount,
        // ไม่เปิดเผยรายชื่อผู้เล่นทั้งหมด (ความเป็นส่วนตัว) — เปิดเฉพาะผู้ค้นพบคนแรก
        firstDiscoverer: firstDiscoverer
          ? { displayName: firstDiscoverer.displayName ?? firstDiscoverer.username }
          : null,
      },
    });
  } catch (error) {
    console.error('Get card owners error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
