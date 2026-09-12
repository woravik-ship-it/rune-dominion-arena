import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    };
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
        createdAt: battle.createdAt,
      },
    });
  } catch (error) {
    console.error('Get battle error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
