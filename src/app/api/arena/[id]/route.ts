import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateArenaReward } from '@/services/arena';

// GET /api/arena/:id — รายละเอียดห้อง + leaderboard 10 อันดับ
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const room = await prisma.arenaRoom.findUnique({
      where: { id: params.id },
      include: {
        host: { select: { username: true, displayName: true } },
        participants: {
          include: { user: { select: { username: true, displayName: true } } },
          orderBy: [{ wins: 'desc' }, { joinedAt: 'asc' }],
          take: 10,
        },
      },
    });
    if (!room) return NextResponse.json({ error: 'ไม่พบห้อง' }, { status: 404 });

    const totalCount = await prisma.arenaParticipant.count({
      where: { roomId: room.id },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: room.id,
        name: room.name,
        status: room.status,
        host: room.host,
        entryFee: room.entryFee,
        rewardPool: calculateArenaReward(totalCount),
        participantCount: totalCount,
        maxPlayers: room.maxPlayers,
        championId: room.championId,
        championDeckId: room.championDeckId,
        expiresAt: room.expiresAt,
        settledAt: room.settledAt,
        createdAt: room.createdAt,
        leaderboard: room.participants.map((p, i) => ({
          rank: i + 1,
          userId: p.userId,
          username: p.user.username,
          displayName: p.user.displayName,
          wins: p.wins,
          losses: p.losses,
          prizeAmount: p.prizeAmount,
        })),
      },
    });
  } catch (error) {
    console.error('Get arena error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
