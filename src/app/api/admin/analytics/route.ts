import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';

// GET /api/admin/analytics — สถิติภาพรวมระบบ
export async function GET(request: NextRequest) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalCards,
      totalDiscoveries,
      todayDiscoveries,
      totalBattles,
      totalDecks,
      walletAgg,
      imageJobsByStatus,
      questsActive,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.cardDefinition.count(),
      prisma.discoveryLog.count(),
      prisma.discoveryLog.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.battleLog.count(),
      prisma.deck.count(),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.imageJob.groupBy({ by: ['status'], _count: true }),
      prisma.quest.count({ where: { isActive: true } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        totalCards,
        totalDiscoveries,
        todayDiscoveries,
        totalBattles,
        totalDecks,
        totalCoinsInCirculation: walletAgg._sum.balance ?? 0,
        imageJobs: Object.fromEntries(imageJobsByStatus.map((s) => [s.status, s._count])),
        activeQuests: questsActive,
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
