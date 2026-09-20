import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBattleReplay } from '@/services/battle-verify';
import { enforceRateLimit } from '@/lib/api-guard';
import { logSecurityEvent } from '@/lib/security-log';
import { getClientIp, getDeviceId } from '@/lib/request-context';

// GET /api/battle/:id/replay — ข้อมูลสำหรับเล่นซ้ำ + ตรวจสอบความถูกต้อง (Phase 10)
// ตรวจด้วยการ re-simulate จาก seed + team snapshot ที่เก็บไว้ — ไม่ตรง = ถูกแก้ (TAMPERED)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Phase 10: rate limit (ไม่มี session — ใช้ Device/IP)
    const rl = enforceRateLimit(request, 'REPLAY');
    if (rl) return rl;

    const battle = await prisma.battleLog.findUnique({
      where: { id: params.id },
    });
    if (!battle) {
      return NextResponse.json({ error: 'ไม่พบการต่อสู้' }, { status: 404 });
    }

    // Phase 10: Battle Replay Verification
    const verification = verifyBattleReplay(battle.battleData);
    if (verification.status === 'TAMPERED') {
      void logSecurityEvent({
        type: 'REPLAY_TAMPERED',
        severity: 'HIGH',
        userId: battle.attackerId,
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { battleId: battle.id, mismatches: verification.mismatches },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        battleId: battle.id,
        replay: battle.battleData,
        verification,
        createdAt: battle.createdAt,
      },
    });
  } catch (error) {
    console.error('Get replay error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

