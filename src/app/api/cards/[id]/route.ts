import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const card = await prisma.cardDefinition.findUnique({
      where: { id: params.id },
      include: {
        firstDiscoverer: {
          select: { username: true, displayName: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: card.id,
        name: card.name,
        nameTh: card.nameTh,
        description: card.description,
        descriptionTh: card.descriptionTh,
        lore: card.lore,
        loreTh: card.loreTh,
        element: card.element,
        rarity: card.rarity,
        role: card.role,
        stats: {
          atk: card.atk,
          def: card.def,
          hp: card.hp,
          spd: card.spd,
          manaCost: card.manaCost,
        },
        skills: [
          card.skill1Name && {
            name: card.skill1Name,
            description: card.skill1Desc,
            manaCost: card.skill1ManaCost,
          },
          card.skill2Name && {
            name: card.skill2Name,
            description: card.skill2Desc,
            manaCost: card.skill2ManaCost,
          },
        ].filter(Boolean),
        imageUrl: card.imageUrl,
        imageStatus: card.imageStatus,
        discoveryCount: card.discoveryCount,
        firstDiscoverer: card.firstDiscoverer,
        firstDiscoveredAt: card.firstDiscoveredAt,
        createdAt: card.createdAt,
      },
    });
  } catch (error) {
    console.error('Get card error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
