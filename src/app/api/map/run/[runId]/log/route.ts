import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { teamCardIds } from '@/services/battle-display';
import { findMapNode, mapZone } from '@/lib/map-zones';
import type { MapRewards } from '@/services/map-farm';

// GET /api/map/run/[runId]/log — ประวัติ + replay การฟาร์มแผนที่ (ใช้หน้า battle เดิมได้)
// ศึกแผนที่จะถูกเปิดผ่าน /battle/map-run:<runId> (ดู lib/battle-route)
export async function GET(
  _request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const run = await prisma.mapFarmLog.findUnique({ where: { runId: params.runId } });
    if (!run) return NextResponse.json({ error: 'ไม่พบการฟาร์มครั้งนี้' }, { status: 404 });

    const data = run.battleData as {
      log?: unknown[];
      seed?: string;
      roundsPlayed?: number;
      teams?: { A?: { cardId: string }[]; B?: { cardId: string }[] };
    } | null;
    const teams = data?.teams ?? { A: [], B: [] };
    const node = findMapNode(run.nodeId);
    const zone = node ? mapZone(node.zone) : null;

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

    const deck = run.deckId
      ? await prisma.deck.findUnique({ where: { id: run.deckId }, select: { id: true, name: true } })
      : null;
    const rewards = (run.rewards ?? {}) as Partial<MapRewards>;
    const roundsPlayed = data?.roundsPlayed ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        battleId: run.runId,
        winner: run.won ? 'A' : 'B',
        roundsPlayed,
        seed: data?.seed ?? null,
        battleData: { ...(data ?? {}), teams, winner: run.won ? 'A' : 'B', roundsPlayed },
        teamNames: {
          A: deck?.name ?? 'ทีมของฉัน',
          B: `${zone?.icon ?? '🗺️'} ${node?.nameTh ?? 'จุดแผนที่'}`,
        },
        decks: { A: deck ? { id: deck.id, name: deck.name } : null, B: null },
        isBotBattle: false,
        isDungeon: false,
        isMap: true,
        map: {
          nodeId: run.nodeId,
          nodeNameTh: node?.nameTh ?? run.nodeId,
          zone: zone?.id ?? null,
          zoneNameTh: zone?.nameTh ?? '',
          icon: zone?.icon ?? '🗺️',
        },
        reward: {
          dust: rewards.dust ?? 0,
          shards: rewards.shards ?? 0,
          itemDropped: rewards.itemCode ?? null,
          itemNameTh: rewards.itemNameTh ?? null,
          jewel: rewards.jewel ?? 0,
        },
        cardMeta: meta,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.error('Get map run log error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}