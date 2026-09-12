import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ARENA_CREATE_COST,
  ARENA_JOIN_COST,
  arenaExpiryFrom,
  calculateArenaReward,
  validateRoomName,
} from '@/services/arena';
import { WalletService } from '@/services/wallet';
import { deckToCombatCards } from '@/services/battle-api';
import { buildBattleSeed } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';

async function resolveUserId(param: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(param)) {
    const e = await prisma.user.findUnique({ where: { id: param }, select: { id: true } });
    if (e) return e.id;
  }
  const u = await prisma.user.findUnique({ where: { username: param }, select: { id: true } });
  return u?.id ?? null;
}

// GET /api/arena?filter=active|all — รายการห้อง
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'active';

    const where =
      filter === 'all'
        ? {}
        : { status: { in: ['WAITING', 'ACTIVE'] as never[] }, expiresAt: { gt: new Date() } };

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

// POST /api/arena/create — เปิดห้องใหม่ (30 Coin)
// body: { userId, name, deckId }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: param, name, deckId } = body as {
      userId?: string;
      name?: string;
      deckId?: string;
    };

    if (!param) return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    const check = validateRoomName(name ?? '');
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });
    if (!deckId) return NextResponse.json({ error: 'ต้องระบุ deckId (ทีมป้องกัน)' }, { status: 400 });

    const userId = await resolveUserId(param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    // Cooldown 5 นาทีระหว่างเปิดห้อง
    const lastRoom = await prisma.arenaRoom.findFirst({
      where: { hostId: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRoom && Date.now() - lastRoom.createdAt.getTime() < 5 * 60 * 1000) {
      return NextResponse.json({ error: 'เปิดห้องได้ทุก 5 นาที กรุณารอสักครู่' }, { status: 429 });
    }

    // เด็คต้องเป็นของตัวเอง + มี 5 ใบ
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: { slots: true },
    });
    if (!deck || deck.userId !== userId || deck.slots.length !== 5) {
      return NextResponse.json({ error: 'ทีมป้องกันต้องเป็นเด็คของคุณที่มี 5 ใบ' }, { status: 400 });
    }

    // หัก 30 Coin แบบ idempotent
    const idemKey = `arena-create:${userId}:${Date.now()}`;
    try {
      await WalletService.debit(userId, ARENA_CREATE_COST, 'SPEND', undefined, 'ARENA_CREATE', `เปิดห้อง ${name}`, idemKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ไม่เพียงพอ')) {
        return NextResponse.json({ error: 'Coin ไม่พอเปิดห้อง (ต้องใช้ 30 Coin)' }, { status: 400 });
      }
      throw e;
    }

    const now = new Date();
    const room = await prisma.arenaRoom.create({
      data: {
        hostId: userId,
        name: (name as string).trim().slice(0, 60),
        status: 'ACTIVE',
        entryFee: ARENA_JOIN_COST,
        rewardPool: calculateArenaReward(1),
        championId: userId,
        championDeckId: deckId,
        expiresAt: arenaExpiryFrom(now),
      },
    });

    // host เข้าร่วมอัตโนมัติ
    await prisma.arenaParticipant.create({
      data: { roomId: room.id, userId, deckId, wins: 0, losses: 0 },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: room.id,
          name: room.name,
          expiresAt: room.expiresAt,
          rewardPool: room.rewardPool,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create arena error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
