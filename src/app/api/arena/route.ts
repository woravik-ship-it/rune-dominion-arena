import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateArenaReward } from '@/services/arena';

// GET /api/arena?filter=active|all — รายการห้อง
// (ทำความสะอาด dead code ตาม CODE_REVIEW.md ข้อ 7 — ลบ imports/ฟังก์ชัน/`void` ที่ไม่ได้ใช้)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'active';

    const where =
      filter === 'all'
        ? {}
        : { status: { in: ['ACTIVE', 'WAITING'] as never[] }, expiresAt: { gt: new Date() } };

    const rooms = await prisma.arenaRoom.findMany({
      where,
      include: {
        host: { select: { username: true, displayName: true } },
        participants: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        host: r.host,
        participantCount: r.participants.length,
        maxPlayers: r.maxPlayers,
        entryFee: r.entryFee,
        rewardPool: calculateArenaReward(r.participants.length),
        championId: r.championId,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('List arena error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

