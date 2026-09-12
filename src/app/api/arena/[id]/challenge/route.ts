import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isArenaExpired } from '@/services/arena';
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

// POST /api/arena/:id/challenge — ท้าทายแชมป์
// body: { userId, deckId, idempotencyKey? }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId: param, deckId, idempotencyKey } = body as {
      userId?: string;
      deckId?: string;
      idempotencyKey?: string;
    };

    if (!param) return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    if (!deckId) return NextResponse.json({ error: 'ต้องระบุ deckId' }, { status: 400 });

    const userId = await resolveUserId(param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    if (idempotencyKey) {
      const dup = await prisma.arenaChallenge.findUnique({ where: { idempotencyKey } });
      if (dup?.battleLogId) {
        const prev = await prisma.battleLog.findUnique({ where: { id: dup.battleLogId } });
        if (prev) {
          const bd = prev.battleData as { winner?: string };
          return NextResponse.json({
            success: true,
            data: {
              challengeId: dup.id, battleLogId: prev.id,
              winner: bd.winner, becameChampion: dup.winnerId === userId,
            },
          });
        }
      }
    }

    const room = await prisma.arenaRoom.findUnique({ where: { id: params.id } });
    if (!room) return NextResponse.json({ error: 'ไม่พบห้อง' }, { status: 404 });
    if (room.status !== 'ACTIVE' && room.status !== 'WAITING') {
      return NextResponse.json({ error: 'ห้องนี้ปิดแล้ว' }, { status: 400 });
    }
    if (isArenaExpired(room.expiresAt)) {
      return NextResponse.json({ error: 'ห้องหมดอายุแล้ว' }, { status: 400 });
    }

    const member = await prisma.arenaParticipant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });
    if (!member) {
      return NextResponse.json({ error: 'ต้องเข้าร่วมห้องก่อนท้าทาย (10 Coin)' }, { status: 400 });
    }


    const myDeck = await prisma.deck.findUnique({ where: { id: deckId } });
    if (!myDeck || myDeck.userId !== userId) {
      return NextResponse.json({ error: 'เด็คไม่ถูกต้อง' }, { status: 400 });
    }
    if (!room.championId || !room.championDeckId) {
      return NextResponse.json({ error: 'ห้องยังไม่มีแชมป์' }, { status: 400 });
    }
    if (room.championId === userId) {
      return NextResponse.json({ error: 'คุณเป็นแชมป์อยู่แล้ว' }, { status: 400 });
    }

    const teamA = await deckToCombatCards(deckId);
    const teamB = await deckToCombatCards(room.championDeckId);
    if (!teamA || !teamB) {
      return NextResponse.json({ error: 'เด็คต้องมี 5 ใบทั้งสองฝ่าย' }, { status: 400 });
    }

    const serverSecret = process.env.SERVER_PEPPER || 'default-pepper-change-me';
    const seed = buildBattleSeed(
      `arena-${room.id}-${Date.now()}`,
      teamA.map((c) => c.cardId),
      teamB.map((c) => c.cardId),
      serverSecret
    );
    const result = simulateBattle(teamA, teamB, seed);
    const challengerWins = result.winner === 'A';
    const winnerId = challengerWins ? userId : room.championId;

    const battle = await prisma.battleLog.create({
      data: {
        attackerId: userId,
        defenderId: room.championId,
        attackerDeckId: deckId,
        defenderDeckId: room.championDeckId,
        winnerId,
        battleData: {
          seed,
          combatVersion: result.combatVersion,
          winner: result.winner,
          roundsPlayed: result.roundsPlayed,
          teamAHpRemaining: result.teamAHpRemaining,
          teamBHpRemaining: result.teamBHpRemaining,
          log: JSON.parse(JSON.stringify(result.log)),
        } as never,
        rewardAmount: 0,
      },
    });

    await prisma.arenaParticipant.updateMany({
      where: { roomId: room.id, userId },
      data: challengerWins ? { wins: { increment: 1 } } : { losses: { increment: 1 } },
    });
    if (!challengerWins) {
      await prisma.arenaParticipant.updateMany({
        where: { roomId: room.id, userId: room.championId },
        data: { wins: { increment: 1 } },
      });
    } else {
      await prisma.arenaRoom.update({
        where: { id: room.id },
        data: { championId: userId, championDeckId: deckId },
      });
    }

    let challengeId: string;
    try {
      const challenge = await prisma.arenaChallenge.create({
        data: {
          roomId: room.id,
          challengerId: userId,
          challengerDeckId: deckId,
          defenderId: room.championId,
          defenderDeckId: room.championDeckId,
          winnerId,
          battleLogId: battle.id,
          idempotencyKey: idempotencyKey ?? null,
        },
      });
      challengeId = challenge.id;
    } catch {
      if (idempotencyKey) {
        const dup = await prisma.arenaChallenge.findUniqueOrThrow({
          where: { idempotencyKey },
        });
        challengeId = dup.id;
      } else {
        throw new Error('สร้าง challenge ไม่สำเร็จ');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        challengeId,
        battleLogId: battle.id,
        winner: result.winner,
        becameChampion: challengerWins,
        roundsPlayed: result.roundsPlayed,
      },
    });
  } catch (error) {
    console.error('Challenge error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
