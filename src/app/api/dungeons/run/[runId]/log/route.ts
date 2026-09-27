import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { teamCardIds } from '@/services/battle-display';
import { findDungeon } from '@/lib/dungeon-definitions';
import { dungeonEnemyInfo, parseDungeonCardId } from '@/lib/dungeon-art';

// GET /api/dungeons/run/[runId]/log — ประวัติ + replay การลุยดัน (ใช้หน้า battle เดิมได้)
export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const run = await prisma.dungeonRun.findUnique({ where: { runId: params.runId } });
    if (!run) return NextResponse.json({ error: 'ไม่พบการลุยดันครั้งนี้' }, { status: 404 });
    const data = run.battleData as {
      log?: unknown[]; seed?: string; rewardEligible?: boolean; teams?: { A?: { cardId: string }[]; B?: { cardId: string }[] };
      teamA?: { cardId: string }[]; teamB?: { cardId: string }[];
    } | null;
    // dungeon เก็บ teamB ตรงๆ + teamA อยู่ใน teams.A (compat ทั้งสองแบบ)
    const teams = data?.teams ?? { A: data?.teamA ?? [], B: data?.teamB ?? [] };
    const dungeon = findDungeon(run.dungeonCode);
    const cardIds = teamCardIds(teams);
    const realCards = cardIds.length
      ? await prisma.cardDefinition.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, imageUrl: true, imageStatus: true, rarity: true },
        })
      : [];
    const meta: Record<string, { cardId: string; imageUrl: string | null; imageStatus: string | null; rarity: string | null }> = {};
    for (const c of realCards) {
      meta[c.id] = { cardId: c.id, imageUrl: c.imageUrl, imageStatus: c.imageStatus, rarity: c.rarity };
    }
    // การ์ดศัตรู (dungeon:*) ไม่มีใน CardDefinition → ภาพ/กรอบถูกสร้างจากนิยามดันเจี้ยน
    // (Phase 31.1: ภาพยืมจากการ์ดจริงในคลังผ่าน /api/cards/<dungeon id>/art · กรอบผ่าน .../image)
    for (const c of [...(teams.A ?? []), ...(teams.B ?? [])]) {
      const ref = parseDungeonCardId(c.cardId);
      if (!meta[c.cardId] && ref) {
        const enemy = dungeon ? dungeonEnemyInfo(dungeon, ref) : null;
        meta[c.cardId] = {
          cardId: c.cardId,
          imageUrl: `/api/cards/${encodeURIComponent(c.cardId)}/art`,
          imageStatus: 'READY',
          rarity: enemy?.rarity ?? (ref.kind === 'boss' ? 'LEGENDARY' : 'RARE'),
        };
      }
    }
    const deck = await prisma.deck.findUnique({ where: { id: run.deckId }, select: { id: true, name: true } });
    return NextResponse.json({
      success: true,
      data: {
        battleId: run.runId,
        winner: run.won ? 'A' : 'B',
        roundsPlayed: run.roundsPlayed,
        seed: data?.seed ?? null,
        battleData: { ...(data ?? {}), teams, winner: run.won ? 'A' : 'B', roundsPlayed: run.roundsPlayed },
        teamNames: { A: deck?.name ?? 'ทีมของฉัน', B: `${dungeon?.nameTh ?? run.dungeonCode} ชั้น ${run.floor}` },
        decks: { A: deck ? { id: deck.id, name: deck.name } : null, B: null },
        isBotBattle: false,
        isDungeon: true,
        dungeon: { code: run.dungeonCode, nameTh: dungeon?.nameTh ?? run.dungeonCode, floor: run.floor, icon: dungeon?.icon ?? '🏰' },
        reward: {
          dust: run.dustEarned, shards: run.shardsEarned,
          itemDropped: run.itemDropped, itemNameTh: run.itemNameTh,
          // false = ชั้นนี้เคยชนะแล้ว → รอบนี้เป็นรอบซ้อม ไม่มีรางวัล
          eligible: data?.rewardEligible !== false,
        },
        cardMeta: meta,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.error('Get dungeon log error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
