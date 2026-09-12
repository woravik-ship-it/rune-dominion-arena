import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'temp-user';

    // Resolve userId - support username lookup
    let resolvedUserId = userId;
    if (userId === 'temp-user' || !userId.match(/^c[a-z0-9]+$/)) {
      const user = await prisma.user.findUnique({
        where: { username: userId },
        select: { id: true },
      });
      if (user) {
        resolvedUserId = user.id;
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: resolvedUserId },
      select: { discoveryEnergy: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      energy: {
        remaining: user.discoveryEnergy,
        max: 5,
      },
    });
  } catch (error) {
    console.error('Get energy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
