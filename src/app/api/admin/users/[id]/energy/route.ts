import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession, auditAdminAction } from '@/lib/admin';

const MAX_ENERGY = 5;

// POST /api/admin/users/[id]/energy — เติมพลังค้นหาให้ผู้เล่นกลับเป็นค่าเต็ม
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = getAdminSession(request);
    if (!session) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, username: true, discoveryEnergy: true, isActive: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    // Atomic: เติมเฉพาะเมื่อยังไม่เต็ม (idempotent)
    const result = await prisma.user.updateMany({
      where: { id: params.id, discoveryEnergy: { lt: MAX_ENERGY } },
      data: { discoveryEnergy: MAX_ENERGY, lastEnergyResetAt: new Date() },
    });

    const updated = await prisma.user.findUnique({
      where: { id: params.id },
      select: { discoveryEnergy: true },
    });

    await auditAdminAction(session, 'REFILL_ENERGY', 'USER', params.id, {
      username: user.username,
      before: user.discoveryEnergy,
      after: updated?.discoveryEnergy ?? MAX_ENERGY,
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        energy: updated?.discoveryEnergy ?? MAX_ENERGY,
        max: MAX_ENERGY,
        refilled: result.count === 1,
      },
      message: `เติมพลังค้นหาให้ ${user.username} แล้ว (⚡ ${updated?.discoveryEnergy ?? MAX_ENERGY}/${MAX_ENERGY})`,
    });
  } catch (error) {
    console.error('Admin refill energy error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
