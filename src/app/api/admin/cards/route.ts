import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';

// GET /api/admin/cards — รายการการ์ดทั้งหมด (search + pagination)
export async function GET(request: NextRequest) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20));
    const search = (searchParams.get('search') || '').trim();

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { nameTh: { contains: search } },
          ],
        }
      : {};

    const [cards, total] = await Promise.all([
      prisma.cardDefinition.findMany({
        where,
        select: {
          id: true, name: true, nameTh: true, element: true,
          rarity: true, role: true, imageUrl: true, discoveryCount: true,
          _count: { select: { userCards: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cardDefinition.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: cards.map((c) => ({ ...c, ownerCount: c._count.userCards })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin cards error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
