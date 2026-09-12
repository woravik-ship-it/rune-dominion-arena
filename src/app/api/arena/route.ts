import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ARENA_CREATE_COST,
  ARENA_JOIN_COST,
  ARENA_JOIN_DAILY_LIMIT,
  arenaExpiryFrom,
  calculateArenaReward,
  validateRoomName,
  countTodayJoins,
  isArenaExpired,
} from '@/services/arena';
import { WalletService } from '@/services/wallet';

async function resolveUserId(param: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(param)) {
    const e = await prisma.user.findUnique({ where: { id: param }, select: { id: true } });
    if (e) return e.id;
  }
  const u = await prisma.user.findUnique({ where: { username: param }, select: { id: true } });
  return u?.id ?? null;
}
void resolveUserId;
void ARENA_CREATE_COST;
void ARENA_JOIN_COST;
void ARENA_JOIN_DAILY_LIMIT;
void arenaExpiryFrom;
void validateRoomName;
void countTodayJoins;
void isArenaExpired;
void WalletService;

// GET /api/arena?filter=active|all — รายการห้อง
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

