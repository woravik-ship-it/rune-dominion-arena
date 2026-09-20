import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ARENA_JOIN_COST, ARENA_JOIN_DAILY_LIMIT, countTodayJoins, isArenaExpired } from '@/services/arena';
import { WalletService } from '@/services/wallet';
import { parseJsonBody, arenaChallengeSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';

// POST /api/arena/:id/join — เข้าร่วมห้อง (10 Coin)
// body: { userId, deckId, idempotencyKey? }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Phase 10: input validation + rate limit
    const { data, errorResponse } = await parseJsonBody(request, arenaChallengeSchema);
    if (errorResponse) return errorResponse;
    const { userId: param, deckId, idempotencyKey } = data;

    const rl = enforceRateLimit(request, 'ARENA_JOIN', { userId: param });
    if (rl) return rl;

    const userId = await resolveRequestUserId(request, param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const room = await prisma.arenaRoom.findUnique({
      where: { id: params.id },
      include: { participants: true },
    });
    if (!room) return NextResponse.json({ error: 'ไม่พบห้อง' }, { status: 404 });
    if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
      return NextResponse.json({ error: 'ห้องนี้ปิดรับผู้เข้าร่วมแล้ว' }, { status: 400 });
    }
    if (isArenaExpired(room.expiresAt)) {
      return NextResponse.json({ error: 'ห้องหมดอายุแล้ว' }, { status: 400 });
    }
    if (room.participants.length >= room.maxPlayers) {
      return NextResponse.json({ error: 'ห้องเต็มแล้ว' }, { status: 400 });
    }

    // ซ้ำ: เคยเข้าร่วมแล้ว → คืนข้อมูลเดิม (idempotent)
    const existing = room.participants.find((p) => p.userId === userId);
    if (existing) {
      return NextResponse.json({ success: true, data: { alreadyJoined: true } });
    }

    // Idempotency key ซ้ำ → คืนสำเร็จโดยไม่หักซ้ำ
    if (idempotencyKey) {
      const dup = await prisma.arenaChallenge.findUnique({
        where: { idempotencyKey: `join:${idempotencyKey}` },
      });
      if (dup) {
        return NextResponse.json({ success: true, data: { alreadyJoined: true } });
      }
    }

    // Daily cap 20 ครั้ง
    const myJoins = await prisma.arenaParticipant.findMany({
      where: { userId },
      select: { joinedAt: true },
    });
    if (countTodayJoins(myJoins.map((j) => j.joinedAt)) >= ARENA_JOIN_DAILY_LIMIT) {
      return NextResponse.json({ error: 'เข้าร่วมได้สูงสุด 20 ครั้งต่อวัน' }, { status: 429 });
    }

    // เด็คต้องเป็นของตัวเอง + 5 ใบ
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: { slots: true },
    });
    if (!deck || deck.userId !== userId || deck.slots.length !== 5) {
      return NextResponse.json({ error: 'เด็คต้องเป็นของคุณที่มี 5 ใบ' }, { status: 400 });
    }

    // หัก 10 Coin
    try {
      await WalletService.debit(
        userId, ARENA_JOIN_COST, 'SPEND', room.id, 'ARENA_JOIN',
        `เข้าร่วมห้อง ${room.name}`,
        idempotencyKey ? `arena-join:${idempotencyKey}` : `arena-join:${room.id}:${userId}:${Date.now()}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ไม่เพียงพอ')) {
        return NextResponse.json({ error: 'Coin ไม่พอเข้าร่วม (ต้องใช้ 10 Coin)' }, { status: 400 });
      }
      throw e;
    }

    await prisma.arenaParticipant.create({
      data: { roomId: room.id, userId, deckId, wins: 0, losses: 0 },
    });

    if (idempotencyKey) {
      await prisma.arenaChallenge.create({
        data: {
          roomId: room.id,
          challengerId: userId,
          challengerDeckId: deckId,
          defenderId: room.hostId,
          defenderDeckId: room.championDeckId ?? deckId,
          idempotencyKey: `join:${idempotencyKey}`,
        },
      }).catch(() => undefined);
    }

    return NextResponse.json({ success: true, data: { joined: true } }, { status: 201 });
  } catch (error) {
    console.error('Join arena error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
