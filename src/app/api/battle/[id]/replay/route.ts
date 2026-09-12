import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/battle/:id/replay — ข้อมูลสำหรับเล่นซ้ำ (deterministic: seed เดียวกัน render ใหม่ได้)
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
    return NextResponse.json({
      success: true,
      data: {
        battleId: battle.id,
        replay: battle.battleData,
        createdAt: battle.createdAt,
      },
    });
  } catch (error) {
    console.error('Get replay error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
