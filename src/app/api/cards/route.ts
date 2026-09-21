import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const element = searchParams.get('element');
    const rarity = searchParams.get('rarity');
    const search = searchParams.get('search');

    // ยึด session cookie ก่อน → fallback param (username/cuid)
    const resolvedUserId = await resolveRequestUserId(request, param);
    if (!resolvedUserId) {
      return NextResponse.json(
        { error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' },
        { status: 401 }
      );
    }

    const where: any = { userId: resolvedUserId };

    if (element) {
      where.card = { element };
    }

    if (rarity) {
      where.card = { ...where.card, rarity };
    }

    if (search) {
      where.card = {
        ...where.card,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { nameTh: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [userCards, total] = await Promise.all([
      prisma.userCard.findMany({
        where,
        include: {
          card: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: {
          obtainedAt: 'desc',
        },
      }),
      prisma.userCard.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: userCards.map((uc) => ({
        id: uc.id,
        cardId: uc.cardId,
        name: uc.card.name,
        nameTh: uc.card.nameTh,
        element: uc.card.element,
        rarity: uc.card.rarity,
        role: uc.card.role,
        stats: {
          atk: uc.card.atk,
          def: uc.card.def,
          hp: uc.card.hp,
          spd: uc.card.spd,
          manaCost: uc.card.manaCost,
        },
        imageUrl: uc.card.imageUrl,
        imageStatus: uc.card.imageStatus,
        /** จำนวนใบที่ถือครอง — ค้นพบซ้ำจะได้อีกใบ (x2, x3, ...) */
        quantity: uc.quantity ?? 1,
        isFavorite: uc.isFavorite,
        obtainedAt: uc.obtainedAt,
        obtainedMethod: uc.obtainedMethod,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get cards error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
