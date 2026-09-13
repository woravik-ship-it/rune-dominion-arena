import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildBattleSeed } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { deckToCombatCards, resolveBattleUserId, buildBotTeam } from '@/services/battle-api';
import { QuestService } from '@/services/quest';

// POST /api/battle/simulate — ทดสอบเด็ค (สู้กับบอทหรือเด็คอื่น)
// body: { userId, attackerDeckId, defenderDeckId?, bot?: boolean }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: userIdParam, attackerDeckId, defenderDeckId, bot } = body as {
      userId?: string;
      attackerDeckId?: string;
      defenderDeckId?: string;
      bot?: boolean;
    };

    if (!userIdParam) return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    if (!attackerDeckId) {
      return NextResponse.json({ error: 'ต้องระบุ attackerDeckId' }, { status: 400 });
    }

    const userId = await resolveBattleUserId(userIdParam);
    if (!userId) return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });

    const attackerDeck = await prisma.deck.findUnique({ where: { id: attackerDeckId } });
    if (!attackerDeck || attackerDeck.userId !== userId) {
      return NextResponse.json({ error: 'เด็คผู้โจมตีไม่ถูกต้อง' }, { status: 400 });
    }

    const teamA = await deckToCombatCards(attackerDeckId);
    if (!teamA) {
      return NextResponse.json({ error: 'เด็คผู้โจมตีต้องมี 5 ใบ' }, { status: 400 });
    }

    let teamB;
    let defenderUserId: string | null = null;
    let defenderDeckIdFinal: string | null = null;
    let botCardIds: string[] = [];

    if (bot) {
      const built = await buildBotTeam(`bot-${attackerDeckId}`);
      teamB = built.cards;
      botCardIds = built.cardIds;
    } else {
      if (!defenderDeckId) {
        return NextResponse.json({ error: 'ต้องระบุ defenderDeckId หรือ bot=true' }, { status: 400 });
      }
      const b = await deckToCombatCards(defenderDeckId);
      if (!b) return NextResponse.json({ error: 'เด็คผู้ป้องกันต้องมี 5 ใบ' }, { status: 400 });
      teamB = b;
      const defDeck = await prisma.deck.findUnique({
        where: { id: defenderDeckId },
        select: { userId: true },
      });
      defenderUserId = defDeck?.userId ?? null;
      defenderDeckIdFinal = defenderDeckId;
    }

    if (!defenderUserId) {
      const botUser =
        (await prisma.user.findUnique({ where: { username: 'battle-bot' }, select: { id: true } })) ??
        (await prisma.user.findFirst({ select: { id: true } }));
      defenderUserId = botUser?.id ?? userId;
    }


    const serverSecret = process.env.SERVER_PEPPER || 'default-pepper-change-me';
    const seed = buildBattleSeed(
      `tmp-${Date.now()}`,
      teamA.map((c) => c.cardId),
      teamB.map((c) => c.cardId),
      serverSecret
    );
    const result = simulateBattle(teamA, teamB, seed);

    let winnerId: string | null = null;
    if (result.winner === 'A') winnerId = userId;
    else if (result.winner === 'B') winnerId = defenderUserId;

    const saved = await prisma.battleLog.create({
      data: {
        attackerId: userId,
        defenderId: defenderUserId,
        attackerDeckId,
        defenderDeckId: defenderDeckIdFinal,
        winnerId,
        battleData: {
          seed,
          combatVersion: result.combatVersion,
          winner: result.winner,
          roundsPlayed: result.roundsPlayed,
          teamAHpRemaining: result.teamAHpRemaining,
          teamBHpRemaining: result.teamBHpRemaining,
          botCardIds,
          log: JSON.parse(JSON.stringify(result.log)),
        },
        rewardAmount: 0,
      },
    });

    // Quest hook: นับการต่อสู้ + ชนะ (ไม่ให้กระทบ flow หลัก)
    try {
      await QuestService.recordEvent(userId, 'BATTLE', 1);
      if (result.winner === 'A') {
        await QuestService.recordEvent(userId, 'BATTLE_WIN', 1);
      }
    } catch (questError) {
      console.error('Quest BATTLE hook error:', questError);
    }

    return NextResponse.json({
      success: true,
      data: {
        battleId: saved.id,
        winner: result.winner,
        roundsPlayed: result.roundsPlayed,
        teamAHpRemaining: result.teamAHpRemaining,
        teamBHpRemaining: result.teamBHpRemaining,
        log: result.log,
        seed,
      },
    });
  } catch (error) {
    console.error('Battle simulate error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
