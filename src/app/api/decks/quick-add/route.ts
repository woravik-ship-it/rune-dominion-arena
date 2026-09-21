import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { parseJsonBody } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';
import { planQuickAdd, DeckCardInput } from '@/services/deck';

const quickAddSchema = z.object({
  cardId: z.string().min(1, 'ต้องระบุ cardId').max(100),
});

// ข้อมูลการ์ดที่ต้องใช้คิดกติกาทีม
type CardRow = {
  id: string; element: string; atk: number; def: number; hp: number; spd: number;
};

const toInput = (card: CardRow): DeckCardInput => ({
  cardId: card.id,
  element: card.element,
  atk: card.atk,
  def: card.def,
  hp: card.hp,
  spd: card.spd,
});

/**
 * POST /api/decks/quick-add — "เพิ่มลงทีม" จากการ์ดที่เพิ่งได้
 * body: { cardId }
 *
 * พฤติกรรม (Phase 13): ทำให้ปุ่ม "เพิ่มลงทีม" ใช้งานได้จริง
 *   1) ถ้าการ์ดอยู่ในทีมอยู่แล้ว → บอกว่าแล้ว (ไม่สร้างซ้ำ)
 *   2) ถ้ามีทีมที่ยังไม่ครบ 5 ใบและเพิ่มได้โดยไม่ผิดกติกา → เติมเข้าทีมนั้น
 *   3) ถ้าไม่มี → สร้างทีมใหม่ 5 ใบจากคลัง (บังคับให้การ์ดใบนี้อยู่ในทีม)
 *   4) ถ้าการ์ดในคลังไม่พอจัดทีม → ตอบ 400 พร้อมเหตุผล
 */
export async function POST(request: NextRequest) {
  try {
    const { data, errorResponse } = await parseJsonBody(request, quickAddSchema);
    if (errorResponse) return errorResponse;

    const rl = enforceRateLimit(request, 'DECK_WRITE');
    if (rl) return rl;

    const userId = await resolveRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const card = await prisma.cardDefinition.findUnique({
      where: { id: data.cardId },
      select: { id: true, name: true, nameTh: true, element: true, atk: true, def: true, hp: true, spd: true },
    });
    if (!card) {
      return NextResponse.json({ error: 'ไม่พบการ์ดใบนี้' }, { status: 404 });
    }

    const ownership = await prisma.userCard.findUnique({
      where: { userId_cardId: { userId, cardId: card.id } },
      select: { quantity: true },
    });
    if (!ownership) {
      return NextResponse.json(
        { error: 'ยังไม่มีการ์ดใบนี้ในคลัง — ถอดรหัสรูนก่อนแล้วค่อยลงทีม' },
        { status: 400 }
      );
    }

    const [decks, ownedCards] = await Promise.all([
      prisma.deck.findMany({
        where: { userId },
        include: { slots: { include: { card: true }, orderBy: { position: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.userCard.findMany({ where: { userId }, include: { card: true } }),
    ]);

    const plan = planQuickAdd({
      card: toInput(card),
      decks: decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        positions: deck.slots.map((s) => s.position),
        slots: deck.slots.map((s) => toInput(s.card)),
      })),
      owned: ownedCards.map((uc) => toInput(uc.card)),
    });

    if (plan.action === 'impossible') {
      return NextResponse.json({ success: false, error: plan.reason }, { status: 400 });
    }

    if (plan.action === 'already-in-deck') {
      return NextResponse.json({
        success: true,
        data: {
          deckId: plan.deckId,
          deckName: plan.deckName,
          added: false,
          created: false,
          reason: 'alreadyInDeck',
          message: `การ์ดใบนี้อยู่ในทีม "${plan.deckName}" แล้ว`,
        },
      });
    }

    if (plan.action === 'add-to-deck') {
      await prisma.deckSlot.create({
        data: { deckId: plan.deckId, cardId: card.id, position: plan.position },
      });
      await prisma.deck.update({
        where: { id: plan.deckId },
        data: { updatedAt: new Date() },
      });
      return NextResponse.json(
        {
          success: true,
          data: {
            deckId: plan.deckId,
            deckName: plan.deckName,
            added: true,
            created: false,
            filled: plan.filled,
            message: `เพิ่มลงทีม "${plan.deckName}" แล้ว (${plan.filled}/5)`,
          },
        },
        { status: 201 }
      );
    }

    // create-deck — สร้างทีมใหม่ให้เลยเพื่อให้ลงทีมได้ตั้งแต่การ์ดใบแรกๆ
    const deckName = `ทีมด่วน ${existingDeckNumber(decks.length)}`;
    const created = await prisma.deck.create({
      data: {
        userId,
        name: deckName,
        description: 'สร้างอัตโนมัติจากปุ่ม "เพิ่มลงทีม"',
        isActive: true,
        slots: {
          create: plan.slots.map((c, index) => ({ cardId: c.cardId, position: index })),
        },
      },
      include: { slots: true },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          deckId: created.id,
          deckName: created.name,
          added: true,
          created: true,
          filled: created.slots.length,
          message: `สร้างทีม "${created.name}" ให้แล้ว (${created.slots.length}/5)`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Quick add to deck error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

/** ตั้งชื่อทีมใหม่ให้อ่านง่าย (ทีมด่วน 1, 2, 3, ...) */
function existingDeckNumber(deckCount: number): number {
  return deckCount + 1;
}
