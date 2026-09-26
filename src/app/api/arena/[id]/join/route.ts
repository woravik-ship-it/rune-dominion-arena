import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  ARENA_JOIN_COST,
  ARENA_JOIN_DAILY_LIMIT,
  ARENA_JOIN_REFERENCE_TYPE,
  arenaJoinPlan,
  isArenaExpired,
} from '@/services/arena';
import { WalletService } from '@/services/wallet';
import { parseJsonBody, arenaChallengeSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { NotificationService } from '@/services/notification';
import { resolveRequestUserId } from '@/lib/current-user';

// POST /api/arena/:id/join — ส่งทีมเข้าห้อง (10 Coin)
// body: { userId, deckId, idempotencyKey? }
//
// ผู้ใช้สั่ง 2026-09-25: "การเพิ่มทีมเข้ามาในห้อง เก็บค่าเข้า จะจัดเข้ามากี่ครั้งก็ได้"
// → เข้าซ้ำได้ (เพื่อเปลี่ยนทีม) และ **คิดค่าเข้าทุกครั้ง** · เพดานเดิม 20 ครั้ง/วัน นับจากรายการหัก Coin จริง
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

    // คำขอเดิมยิงซ้ำ (idempotency) → ไม่หักซ้ำ ไม่แตะข้อมูล
    const idempotentDuplicate = idempotencyKey
      ? Boolean(
          await prisma.arenaChallenge.findUnique({
            where: { idempotencyKey: `join:${idempotencyKey}` },
          })
        )
      : false;

    const existing = room.participants.find((p) => p.userId === userId);
    const plan = arenaJoinPlan({ alreadyJoined: Boolean(existing), idempotentDuplicate });
    if (plan.mode === 'skip') {
      return NextResponse.json({ success: true, data: { alreadyJoined: true, idempotent: true } });
    }

    // ห้องเต็มมีผลเฉพาะ "ผู้เข้าใหม่" — ส่งทีมเข้าซ้ำของเดิมทำได้เสมอ (ไม่เพิ่มจำนวนคน)
    if (!existing && room.participants.length >= room.maxPlayers) {
      return NextResponse.json({ error: 'ห้องเต็มแล้ว' }, { status: 400 });
    }

    // เพดานรายวัน 20 ครั้ง — นับจาก "รายการจ่ายค่าเข้าจริง" เพื่อให้การเข้าซ้ำถูกนับด้วย
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const paidJoinsToday = await prisma.walletTransaction.count({
      where: {
        referenceType: ARENA_JOIN_REFERENCE_TYPE,
        createdAt: { gte: startOfDay },
        wallet: { userId },
      },
    });
    if (paidJoinsToday >= ARENA_JOIN_DAILY_LIMIT) {
      return NextResponse.json(
        { error: `เข้าร่วมได้สูงสุด ${ARENA_JOIN_DAILY_LIMIT} ครั้งต่อวัน` },
        { status: 429 }
      );
    }

    // เด็คต้องเป็นของตัวเอง + 5 ใบ
    const deck = await prisma.deck.findUnique({
      where: { id: deckId },
      include: { slots: true },
    });
    if (!deck || deck.userId !== userId || deck.slots.length !== 5) {
      return NextResponse.json({ error: 'เด็คต้องเป็นของคุณที่มี 5 ใบ' }, { status: 400 });
    }

    // หักค่าเข้าทุกครั้ง (เข้าซ้ำ = เปลี่ยนทีม ก็คิดใหม่)
    try {
      await WalletService.debit(
        userId, ARENA_JOIN_COST, 'SPEND', room.id, ARENA_JOIN_REFERENCE_TYPE,
        `${plan.mode === 'update' ? 'เปลี่ยนทีมในห้อง' : 'เข้าร่วมห้อง'} ${room.name}`,
        idempotencyKey ? `arena-join:${idempotencyKey}` : `arena-join:${room.id}:${userId}:${Date.now()}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('ไม่เพียงพอ')) {
        return NextResponse.json(
          { error: `Coin ไม่พอเข้าร่วม (ต้องใช้ ${ARENA_JOIN_COST} Coin)` },
          { status: 400 }
        );
      }
      throw e;
    }

    if (plan.mode === 'update' && existing) {
      // อัปเดตเด็คของผู้เข้าร่วมเดิม (ไม่สร้างแถวซ้ำ) — สถิติชนะ/แพ้เดิมยังอยู่
      await prisma.arenaParticipant.update({
        where: { roomId_userId: { roomId: room.id, userId } },
        data: { deckId },
      });
    } else {
      await prisma.arenaParticipant.create({
        data: { roomId: room.id, userId, deckId, wins: 0, losses: 0 },
      });
    }

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

    // Phase 20: แจ้งเจ้าของห้องว่ามีผู้เล่นส่งทีมเข้าห้อง (ผู้ท้าคนละคนกับเจ้าของห้องเท่านั้น)
    if (room.hostId !== userId) {
      const challenger = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, displayName: true },
      });
      await NotificationService.notifyArenaChallenge({
        hostId: room.hostId,
        challengerName: challenger?.displayName || challenger?.username || 'ผู้เล่น',
        roomName: room.name,
        roomId: room.id,
      }).catch(() => undefined);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          joined: true,
          rejoined: plan.mode === 'update',
          deckId,
          entryFee: ARENA_JOIN_COST,
          paidJoinsToday: paidJoinsToday + 1,
          dailyLimit: ARENA_JOIN_DAILY_LIMIT,
        },
      },
      { status: plan.mode === 'update' ? 200 : 201 }
    );
  } catch (error) {
    console.error('Join arena error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
