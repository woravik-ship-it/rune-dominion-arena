import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';
import { ItemService } from '@/services/item';
import { ITEM_SLOTS, applyItemStats, sumItemStats, type ItemStats } from '@/lib/item-definitions';
import { cardSellValue } from '@/lib/veil-shards';
import { ItemSlot } from '@prisma/client';

// /api/cards/[id]/equipment — "ช่างใส่ Item" ของการ์ดใบหนึ่ง (Phase 25)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำในส่วนของช่างใส่ Item เพิ่ม Status ให้ 3 ช่อง Item โจมตี, ป้องกัน, สนับสนุน"
//  - GET    → 3 ช่อง + Status พื้นฐาน/จาก Item/รวม + ของในคลังที่ใส่ช่องนั้นได้ + มูลค่าขายการ์ด
//  - POST   → ใส่ Item (body: { slot, itemCode })
//  - DELETE → ถอด Item (query: ?slot=ATTACK)
// [id] = CardDefinition id (ผู้เล่นต้องมีการ์ดใบนี้ในคลัง)

const equipSchema = z.object({
  slot: z.enum(['ATTACK', 'DEFENSE', 'SUPPORT']),
  itemCode: z.string().min(1).max(60),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const userCard = await prisma.userCard.findUnique({
      where: { userId_cardId: { userId, cardId: params.id } },
      include: { card: true },
    });
    if (!userCard) {
      return NextResponse.json({ error: 'คุณไม่มีการ์ดใบนี้ในคลัง' }, { status: 404 });
    }

    await ItemService.ensureCatalog();
    const [equipped, ownedRows, equippedGroups, user] = await Promise.all([
      ItemService.equipmentForCard(userId, params.id),
      prisma.userItem.findMany({ where: { userId }, include: { item: true } }),
      prisma.cardItemSlot.groupBy({
        by: ['itemId'],
        where: { userCard: { userId } },
        _count: { _all: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { veilShards: true } }),
    ]);

    const equippedCountByItem = new Map(equippedGroups.map((row) => [row.itemId, row._count._all]));

    const baseStats: ItemStats = {
      atk: userCard.card.atk,
      def: userCard.card.def,
      hp: userCard.card.hp,
      spd: userCard.card.spd,
    };
    const bonusStats = sumItemStats(equipped.map((row) => row.stats));

    // ของในคลังที่ใส่ได้ในแต่ละช่อง (พร้อมจำนวนที่ยังว่างให้ใส่)
    const available: Record<
      ItemSlot,
      Array<{ itemCode: string; nameTh: string; icon: string; rarity: string; stats: ItemStats; free: number }>
    > = { ATTACK: [], DEFENSE: [], SUPPORT: [] };
    for (const row of ownedRows) {
      if (row.quantity <= 0) continue;
      const used = equippedCountByItem.get(row.itemId) ?? 0;
      available[row.item.slot].push({
        itemCode: row.item.code,
        nameTh: row.item.nameTh,
        icon: row.item.icon,
        rarity: row.item.rarity,
        stats: { atk: row.item.atk, def: row.item.def, hp: row.item.hp, spd: row.item.spd },
        free: Math.max(0, row.quantity - used),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        cardId: params.id,
        cardName: userCard.card.nameTh ?? userCard.card.name,
        rarity: userCard.card.rarity,
        quantity: userCard.quantity,
        sellValue: cardSellValue(userCard.card.rarity),
        veilShards: Math.max(0, user?.veilShards ?? 0),
        slots: ITEM_SLOTS,
        equipped,
        available,
        baseStats,
        bonusStats,
        effectiveStats: applyItemStats(baseStats, bonusStats),
      },
    });
  } catch (error) {
    console.error('Get card equipment error:', error);
    return NextResponse.json({ error: 'อ่านช่องใส่ Item ไม่สำเร็จ' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const body = await request.json().catch(() => ({}));
    const parsed = equipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'ต้องระบุ slot (ATTACK/DEFENSE/SUPPORT) และ itemCode' },
        { status: 400 }
      );
    }

    const result = await ItemService.equip({
      userId,
      cardId: params.id,
      slot: parsed.data.slot,
      itemCode: parsed.data.itemCode,
    });
    const stats = await ItemService.statsForCard(userId, params.id);
    return NextResponse.json({ success: true, data: { ...result, bonusStats: stats } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ใส่ Item ไม่สำเร็จ';
    const status = /ไม่มีการ์ด|ไม่พบ Item|ใส่ช่องนี้ไม่ได้|ยังไม่มี Item|ถูกใส่บนการ์ดอื่น/.test(message) ? 400 : 500;
    if (status === 500) console.error('Equip item error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const slot = request.nextUrl.searchParams.get('slot');
    if (slot !== 'ATTACK' && slot !== 'DEFENSE' && slot !== 'SUPPORT') {
      return NextResponse.json({ error: 'ต้องระบุ slot (ATTACK/DEFENSE/SUPPORT)' }, { status: 400 });
    }

    const result = await ItemService.unequip({ userId, cardId: params.id, slot });
    const stats = await ItemService.statsForCard(userId, params.id);
    return NextResponse.json({ success: true, data: { ...result, bonusStats: stats } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ถอด Item ไม่สำเร็จ';
    const status = /ไม่มีการ์ด|ว่างอยู่แล้ว/.test(message) ? 400 : 500;
    if (status === 500) console.error('Unequip item error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
