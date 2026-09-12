import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, cardId, isFavorite } = body;

    const userCard = await prisma.userCard.updateMany({
      where: { userId, cardId },
      data: { isFavorite: isFavorite },
    });

    return NextResponse.json({
      success: true,
      isFavorite: isFavorite,
    });
  } catch (error) {
    console.error('Favorite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
