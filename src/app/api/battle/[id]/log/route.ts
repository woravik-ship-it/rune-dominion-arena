import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cardMetaMap, teamCardIds, teamName } from '@/services/battle-display';

// GET /api/battle/:id/log — ดู Battle Log
// GET /api/battle/:id/replay — ดู Replay (ข้อมูลเดียวกับ log + metadata)
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const battle = await prisma.battleLog.findUnique({
      where: { id: params.id },
    });
    if (!battle) {
      return NextResponse.json({ error: 'ไม่พบการต่อสู้' }, { status: 404 });
    }
    const data = battle.battleData as {
      log?: unknown;
      seed?: string;
      combatVersion?: string;
      winner?: string;
      roundsPlayed?: number;
      teams?: { A?: { cardId: string }[]; B?: { cardId: string }[] };
      botCardIds?: string[];
    };

    // ── ข้อมูลสำหรับ "แสดงผล" (ผู้ใช้สั่ง: วาดการ์ดเต็มใบ + ชื่อทีม = ชื่อ Deck)
    //    - cardMeta: imageUrl/imageStatus/rarity ของการ์ดทุกใบใน snapshot ทีม
    //    - teamNames: ชื่อ Deck ของฝ่าย A (ผู้ท้า) / B (ผู้รับคำท้า) — บอท = "บอท (สุ่มการ์ด)"
    const deckIds = [battle.attackerDeckId, battle.defenderDeckId].filter(
      (id): id is string => Boolean(id)
    );
    const cardIds = teamCardIds(data.teams);
    const [decks, cards] = await Promise.all([
      deckIds.length
        ? prisma.deck.findMany({ where: { id: { in: deckIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      cardIds.length
        ? prisma.cardDefinition.findMany({
            where: { id: { in: cardIds } },
            select: { id: true, imageUrl: true, imageStatus: true, rarity: true },
          })
        : Promise.resolve([]),
    ]);
    const deckName = (deckId?: string | null) =>
      decks.find((d) => d.id === deckId)?.name ?? null;
    const isBot = !battle.defenderDeckId && (data.botCardIds?.length ?? 0) > 0;

    return NextResponse.json({
      success: true,
      data: {
        battleId: battle.id,
        attackerId: battle.attackerId,
        defenderId: battle.defenderId,
        winnerId: battle.winnerId,
        winner: data.winner,
        roundsPlayed: data.roundsPlayed,
        seed: data.seed,
        combatVersion: data.combatVersion,
        battleData: battle.battleData,
        /** ชื่อทีมที่แสดงบนหน้าสนามรบ (ใช้ชื่อ Deck จริง) */
        teamNames: {
          A: teamName('A', deckName(battle.attackerDeckId)),
          B: teamName('B', deckName(battle.defenderDeckId), isBot),
        },
        /**
         * เด็คของแต่ละฝ่าย (ใช้ปุ่ม "ต่อสู้อีกครั้ง" — ยิง /api/battle/simulate ด้วยเด็คเดิม)
         * ฝ่าย B ของศึกกับบอทจะไม่มีเด็ค (isBotBattle = true → ใช้ bot: true)
         */
        decks: {
          A: battle.attackerDeckId
            ? { id: battle.attackerDeckId, name: deckName(battle.attackerDeckId) }
            : null,
          B: battle.defenderDeckId
            ? { id: battle.defenderDeckId, name: deckName(battle.defenderDeckId) }
            : null,
        },
        isBotBattle: isBot,
        /** ข้อมูลการ์ดที่ต้องใช้วาดการ์ดเต็มใบ (key = cardId) */
        cardMeta: cardMetaMap(cards),
        createdAt: battle.createdAt,
      },
    });
  } catch (error) {
    console.error('Get battle error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
