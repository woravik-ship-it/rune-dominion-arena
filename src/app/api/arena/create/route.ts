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
import { parseJsonBody, arenaCreateSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';

// POST /api/arena/create — เปิดห้องใหม่ (30 Coin)
// body: { name, deckId } — เจ้าของห้องมาจาก session cookie
export async function POST(request: NextRequest) {
  try {
    // Phase 10: input validation (ความยาวชื่อห้อง) + rate limit
    // หมายเหตุ: กรองคำไม่เหมาะสมอยู่ใน validateRoomName (services/arena)
    const { data, errorResponse } = await parseJsonBody(request, arenaCreateSchema);
    if (errorResponse) return errorResponse;
    const { userId: param, name, deckId } = data;

    const rl = enforceRateLimit(request, 'ARENA_CREATE', { userId: param });
    if (rl) return rl;

    const check = validateRoomName(name);
    if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });

    const userId = await resolveRequestUserId(request, param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const lastRoom = await prisma.arenaRoom.findFirst({
      where: { hostId: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRoom && Date.now() - lastRoom.createdAt.getTime() < 5 * 60 * 1000) {
      return NextResponse.json({ error: 'เปิดห้องได้ทุก 5 นาที กรุณารอสักครู่' }, { status: 429 });
    }

    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: { slots: true },
    });
    if (!deck || deck.userId !== userId || deck.slots.length !== 5) {
      return NextResponse.json({ error: 'ทีมป้องกันต้องเป็นเด็คของคุณที่มี 5 ใบ' }, { status: 400 });
    }

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
        name: name.trim().slice(0, 60),
        status: 'ACTIVE',
        entryFee: ARENA_JOIN_COST,
        rewardPool: calculateArenaReward(1),
        championId: userId,
        championDeckId: deckId,
        expiresAt: arenaExpiryFrom(now),
      },
    });

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
