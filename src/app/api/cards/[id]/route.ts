import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { ItemService } from '@/services/item';
import { applyItemStats, sumItemStats, type ItemStats } from '@/lib/item-definitions';
import { cardSellValue } from '@/lib/veil-shards';

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

    // จำนวนใบที่ผู้เล่นคนนี้ถือครอง (ค้นพบซ้ำ = อีกใบ)
    const userId = await resolveRequestUserId(request);
    const ownership = userId
      ? await prisma.userCard.findUnique({
          where: { userId_cardId: { userId, cardId: card.id } },
          select: { quantity: true, isFavorite: true },
        })
      : null;

    const ownerCount = await prisma.userCard.count({ where: { cardId: card.id } });

    // Phase 25: ของที่ใส่ในช่อง 3 ช่อง + Status ที่ได้จาก Item (เฉพาะผู้ที่ล็อกอินและมี "การ์ดใบนี้" ในคลัง)
    const equipped = userId && ownership ? await ItemService.equipmentForCard(userId, card.id) : [];
    const itemBonus: ItemStats = sumItemStats(equipped.map((row) => row.stats));

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
        /** Status พื้นฐานของการ์ด (ตัวการ์ดเอง) */
        stats: {
          atk: card.atk,
          def: card.def,
          hp: card.hp,
          spd: card.spd,
          manaCost: card.manaCost,
        },
        /** Phase 25: Status จาก Item ที่ใส่ + Status รวมจริง (พื้นฐาน + Item) */
        itemStats: {
          bonus: itemBonus,
          effective: applyItemStats(
            { atk: card.atk, def: card.def, hp: card.hp, spd: card.spd },
            itemBonus
          ),
        },
        /** Phase 25: ของที่ใส่ในช่องทั้ง 3 (ว่าง = ไม่มี) */
        equipment: equipped,
        /** Phase 25: ขายคืนร้านได้เท่าไร (ตามความหายาก) */
        sellValue: cardSellValue(card.rarity),
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
        /** จำนวนใบที่ผู้เล่นคนนี้ถือครอง (0 = ยังไม่มี) */
        quantity: ownership?.quantity ?? 0,
        isFavorite: ownership?.isFavorite ?? false,
        /** จำนวนผู้เล่นที่ถือการ์ดใบนี้ */
        ownerCount,
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
