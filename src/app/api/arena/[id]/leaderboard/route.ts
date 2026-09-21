// GET /api/arena/[id]/leaderboard — จัดอันดับผู้เข้าร่วมในห้อง (Phase 6)
// เรียงตาม: ชนะก่อน → จำนวนชัยชนะ → เวลาที่เข้าร่วมก่อน — ไม่เปิดเผยข้อมูลส่วนตัวเกินจำเป็น
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const room = await prisma.arenaRoom.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, expiresAt: true, championId: true },
    });
    if (!room) {
      return NextResponse.json({ error: 'ไม่พบห้อง' }, { status: 404 });
    }

    const participants = await prisma.arenaParticipant.findMany({
      where: { roomId: room.id },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: [{ wins: 'desc' }, { joinedAt: 'asc' }],
      take: 10,
    });

    const leaderboard = participants.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      displayName: p.user.displayName ?? p.user.username,
      wins: p.wins,
      losses: p.losses,
      joinedAt: p.joinedAt,
      isChampion: p.userId === room.championId,
    }));

    return NextResponse.json({
      success: true,
      data: {
        roomId: room.id,
        status: room.status,
        expiresAt: room.expiresAt,
        leaderboard,
      },
    });
  } catch (error) {
    console.error('Get arena leaderboard error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
