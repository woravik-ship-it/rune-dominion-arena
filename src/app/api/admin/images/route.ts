import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';

// GET /api/admin/images — สถิติคิวภาพ + งานล่าสุด
export async function GET(request: NextRequest) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const [byStatus, recent, cardsWithoutImage] = await Promise.all([
      prisma.imageJob.groupBy({ by: ['status'], _count: true }),
      prisma.imageJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, cardId: true, status: true, retryCount: true,
          errorMessage: true, createdAt: true, processedAt: true,
          card: { select: { name: true, nameTh: true } },
        },
      }),
      prisma.cardDefinition.count({ where: { imageUrl: null } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
        cardsWithoutImage,
        recent,
      },
    });
  } catch (error) {
    console.error('Admin images error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
