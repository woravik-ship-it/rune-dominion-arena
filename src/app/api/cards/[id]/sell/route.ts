import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';
import { creditVeilShards } from '@/services/veil-shard';
import { cardSellTotal, cardSellValue } from '@/lib/veil-shards';

// POST /api/cards/[id]/sell — ขายการ์ดคืนร้าน ได้ Veil Shards ตามความหายาก (Phase 25)
//
// ผู้ใช้สั่ง 2026-09-27: "ได้จากการขายการ์ดคืนร้าน จำนวนขึ้นกับความหายากของการ์ด"
//  - [id] = CardDefinition id (การ์ด 1 ชนิดที่ผู้เล่นถืออยู่)
//  - body: { quantity } (ไม่ส่ง = 1)
//  - การ์ดที่ยังอยู่ในเด็คต้องเหลืออย่างน้อย 1 ใบ (ไม่งั้นเด็คพัง — ต่อสู้ไม่ได้)
const bodySchema = z.object({ quantity: z.number().int().min(1).max(99).optional() });

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'จำนวนที่ขายไม่ถูกต้อง' }, { status: 400 });
    }
    const quantity = parsed.data.quantity ?? 1;

    const result = await prisma.$transaction(async (tx) => {
      const userCard = await tx.userCard.findUnique({
        where: { userId_cardId: { userId, cardId: params.id } },
        include: { card: true },
      });
      if (!userCard) throw new Error('คุณไม่มีการ์ดใบนี้ในคลัง');
      if (userCard.quantity < quantity) {
        throw new Error(`มี ${userCard.quantity} ใบ — ขาย ${quantity} ใบไม่ได้`);
      }

      // การ์ดที่อยู่ในเด็คต้องเหลืออย่างน้อย 1 ใบ (ไม่งั้นเด็คจะไม่มีใบให้ต่อสู้)
      const inDeck = await tx.deckSlot.count({ where: { cardId: params.id, deck: { userId } } });
      if (inDeck > 0 && userCard.quantity - quantity < 1) {
        throw new Error('การ์ดใบนี้อยู่ในเด็ค — ต้องเหลือไว้อย่างน้อย 1 ใบ (เอาออกจากเด็คก่อน)');
      }

      const unit = cardSellValue(userCard.card.rarity);
      const total = cardSellTotal(userCard.card.rarity, quantity);

      if (userCard.quantity === quantity) {
        await tx.userCard.delete({ where: { id: userCard.id } });
      } else {
        await tx.userCard.update({
          where: { id: userCard.id },
          data: { quantity: { decrement: quantity } },
        });
      }

      const credited = await creditVeilShards(tx, {
        userId,
        amount: total,
        source: 'CARD_SELL',
        description: `ขาย ${userCard.card.nameTh} ×${quantity}`,
      });

      return {
        soldQuantity: quantity,
        rarity: userCard.card.rarity,
        unitValue: unit,
        gained: total,
        veilShards: credited.balance,
        remaining: userCard.quantity - quantity,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message: `ขายการ์ด ${result.soldQuantity} ใบ · ได้ ${result.gained} Veil Shards`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ขายการ์ดไม่สำเร็จ';
    const status = /ไม่มีการ์ด|ขาย|อยู่ในเด็ค/.test(message) ? 400 : 500;
    if (status === 500) console.error('Sell card error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
