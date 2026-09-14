import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DiscoveryService } from '@/services/discovery';

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

    // ผ่าน Service เพื่อให้ lazy daily refill ทำงานด้วย
    const energy = await DiscoveryService.getEnergy(resolvedUserId);

    return NextResponse.json({
      success: true,
      energy,
    });
  } catch (error) {
    console.error('Get energy error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
