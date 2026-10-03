import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isArenaExpired } from '@/services/arena';
import { deckToCombatCards } from '@/services/battle-api';
import { buildBattleSeed } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { parseJsonBody, arenaChallengeSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';

// POST /api/arena/:id/challenge — ท้าทายแชมป์
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

    const rl = enforceRateLimit(request, 'ARENA_CHALLENGE', { userId: param });
    if (rl) return rl;

    const userId = await resolveRequestUserId(request, param);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });

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

    // TS: หลัง guard ข้างบน room.championId/championDeckId ถูก narrow เป็น string แล้ว
    // แต่ narrowing จะ "หาย" เมื่อเข้า closure ของ $transaction → หนีบเป็น const ก่อนใช้ใน tx
    const campId = room.championId;
    const campDeckId = room.championDeckId;

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

    // รวมทุกการเขียนเป็น transaction + ตั้งแชมป์แบบมีเงื่อนไข ⇒ ไม่มีทางที่ 2 คนท้าทายพร้อมกัน
    // แล้ว "ชนะแชมป์" พร้อมกัน (ตาม CODE_REVIEW.md ข้อ 2 — race condition):
    //   arenaRoom.updateMany WHERE championId = คนเก่า → ถ้าแชมป์เปลี่ยนไปกลางคันจะได้ 0 แถว
    //   ⇒ คนแรกที่เรียบร้อยได้เป็นแชมป์จริง ฝ่ายที่เหลือยังอัด battle/challenge ไว้ พร้อมข้อความให้ลองใหม่
    const txn = await prisma.$transaction(async (tx) => {
      const battle = await tx.battleLog.create({
        data: {
          attackerId: userId,
          defenderId: campId,
          attackerDeckId: deckId,
          defenderDeckId: campDeckId,
          winnerId,
          battleData: {
            seed,
            combatVersion: result.combatVersion,
            winner: result.winner,
            roundsPlayed: result.roundsPlayed,
            teamAHpRemaining: result.teamAHpRemaining,
            teamBHpRemaining: result.teamBHpRemaining,
            // Phase 10: snapshot ทีมสำหรับ replay verification (คำนวณซ้ำเทียบได้)
            teams: { A: teamA, B: teamB },
            log: JSON.parse(JSON.stringify(result.log)),
          } as never,
          rewardAmount: 0,
        },
      });

      await tx.arenaParticipant.updateMany({
        where: { roomId: room.id, userId },
        data: challengerWins ? { wins: { increment: 1 } } : { losses: { increment: 1 } },
      });
      if (!challengerWins) {
        await tx.arenaParticipant.updateMany({
          where: { roomId: room.id, userId: campId },
          data: { wins: { increment: 1 } },
        });
      }

      // ตั้งแชมป์แบบมีเงื่อนไข (เดิมใช้ arenaRoom.update —— แทนที่ด้วย updateMany กัน overwrite ซ้อน)
      let championUpdated = true;
      if (challengerWins) {
        const res = await tx.arenaRoom.updateMany({
          where: { id: room.id, championId: campId },
          data: { championId: userId, championDeckId: deckId },
        });
        championUpdated = res.count === 1;
      }

      let challengeId: string;
      try {
        const challenge = await tx.arenaChallenge.create({
          data: {
            roomId: room.id,
            challengerId: userId,
            challengerDeckId: deckId,
            defenderId: campId,
            defenderDeckId: campDeckId,
            winnerId,
            battleLogId: battle.id,
            idempotencyKey: idempotencyKey ?? null,
          },
        });
        challengeId = challenge.id;
      } catch {
        if (idempotencyKey) {
          const dup = await tx.arenaChallenge.findUniqueOrThrow({
            where: { idempotencyKey },
          });
          challengeId = dup.id;
        } else {
          throw new Error('สร้าง challenge ไม่สำเร็จ');
        }
      }

      return { battleLogId: battle.id, challengeId, championUpdated };
    });

    const becameChampion = challengerWins && txn.championUpdated;

    return NextResponse.json({
      success: true,
      data: {
        challengeId: txn.challengeId,
        battleLogId: txn.battleLogId,
        winner: result.winner,
        becameChampion,
        roundsPlayed: result.roundsPlayed,
        ...(challengerWins && !txn.championUpdated
          ? { message: 'แชมป์ถูกยึดโดยผู้ท้าทายคนอื่นก่อนแล้ว — ยังนับเป็นประวัติการต่อสู้ แต่ต้องท้าทายใหม่เพื่อเป็นแชมป์' }
          : {}),
      },
    });
  } catch (error) {
    console.error('Challenge error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
