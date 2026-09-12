import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTeamPower, validateDeck, validatePositions } from '@/services/deck';

// GET /api/decks/:id — รายละเอียดเด็ค
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deck = await prisma.deck.findUnique({
      where: { id: params.id },
      include: {
        slots: { include: { card: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!deck) {
      return NextResponse.json({ error: 'ไม่พบเด็ค' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: deck.id,
        userId: deck.userId,
        name: deck.name,
        description: deck.description,
        isActive: deck.isActive,
        teamPower: calculateTeamPower(
          deck.slots.map((s) => ({
            cardId: s.cardId,
            element: s.card.element,
            atk: s.card.atk,
            def: s.card.def,
            hp: s.card.hp,
            spd: s.card.spd,
          }))
        ),
        slots: deck.slots.map((s) => ({
          position: s.position,
          cardId: s.cardId,
          name: s.card.name,
          nameTh: s.card.nameTh,
          element: s.card.element,
          rarity: s.card.rarity,
          role: s.card.role,
          stats: {
            atk: s.card.atk,
            def: s.card.def,
            hp: s.card.hp,
            spd: s.card.spd,
            manaCost: s.card.manaCost,
          },
          imageUrl: s.card.imageUrl,
          imageStatus: s.card.imageStatus,
        })),
      },
    });
  } catch (error) {
    console.error('Get deck error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

// PUT /api/decks/:id — อัปเดตเด็ค
// body: { userId, name?, description?, isActive?, slots?: [{ cardId, position }] }
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId: userIdParam, name, description, isActive, slots } = body as {
      userId?: string;
      name?: string;
      description?: string;
      isActive?: boolean;
      slots?: Array<{ cardId: string; position: number }>;
    };

    const deck = await prisma.deck.findUnique({ where: { id: params.id } });
    if (!deck) {
      return NextResponse.json({ error: 'ไม่พบเด็ค' }, { status: 404 });
    }

    if (userIdParam) {
      let resolvedId = userIdParam;
      if (!/^c[a-z0-9]+$/i.test(userIdParam)) {
        const u = await prisma.user.findUnique({
          where: { username: userIdParam },
          select: { id: true },
        });
        resolvedId = u?.id ?? userIdParam;
      }
      if (resolvedId !== deck.userId) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขเด็คนี้' }, { status: 403 });
      }
    }

    let newSlots: Array<{ cardId: string; position: number }> | undefined;
    if (slots !== undefined) {
      if (!Array.isArray(slots)) {
        return NextResponse.json({ error: 'slots ต้องเป็น array' }, { status: 400 });
      }
      const posCheck = validatePositions(slots.map((s) => s.position));
      if (!posCheck.valid) {
        return NextResponse.json(
          { error: 'ตำแหน่งไม่ถูกต้อง', details: posCheck.errors },
          { status: 400 }
        );
      }
      const cardIds = slots.map((s) => s.cardId);
      const owned = await prisma.userCard.findMany({
        where: { userId: deck.userId, cardId: { in: cardIds } },
        include: { card: true },
      });
      if (owned.length !== cardIds.length) {
        return NextResponse.json(
          { error: 'มีการ์ดที่ไม่ได้เป็นเจ้าของอยู่ในทีม' },
          { status: 400 }
        );
      }
      const ownedById = new Map(owned.map((o) => [o.cardId, o.card]));
      const deckCards = cardIds.map((cardId) => {
        const card = ownedById.get(cardId);
        if (!card) throw new Error('Card not owned');
        return {
          cardId,
          element: card.element,
          atk: card.atk,
          def: card.def,
          hp: card.hp,
          spd: card.spd,
        };
      });
      const validation = validateDeck(deckCards);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'ทีมไม่ผ่านกติกา', details: validation.errors },
          { status: 400 }
        );
      }
      newSlots = slots;
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json({ error: 'ชื่อเด็คไม่ถูกต้อง' }, { status: 400 });
    }
    if (name !== undefined && name.trim().length > 60) {
      return NextResponse.json({ error: 'ชื่อเด็คยาวเกิน 60 ตัวอักษร' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (newSlots) {
        await tx.deckSlot.deleteMany({ where: { deckId: deck.id } });
        await tx.deckSlot.createMany({
          data: newSlots.map((s) => ({
            deckId: deck.id,
            cardId: s.cardId,
            position: s.position,
          })),
        });
      }
      return tx.deck.update({
        where: { id: deck.id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(description !== undefined
            ? { description: description?.slice(0, 500) ?? null }
            : {}),
          ...(typeof isActive === 'boolean' ? { isActive } : {}),
        },
        include: { slots: { include: { card: true } } },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        teamPower: calculateTeamPower(
          updated.slots.map((s) => ({
            cardId: s.cardId,
            element: s.card.element,
            atk: s.card.atk,
            def: s.card.def,
            hp: s.card.hp,
            spd: s.card.spd,
          }))
        ),
      },
    });
  } catch (error) {
    console.error('Update deck error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}


// DELETE /api/decks/:id — ลบเด็ค (?userId= หรือ body.userId)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const userIdParam =
      (body as { userId?: string }).userId ?? searchParams.get('userId');

    const deck = await prisma.deck.findUnique({ where: { id: params.id } });
    if (!deck) {
      return NextResponse.json({ error: 'ไม่พบเด็ค' }, { status: 404 });
    }

    if (userIdParam) {
      let resolvedId = userIdParam;
      if (!/^c[a-z0-9]+$/i.test(userIdParam)) {
        const u = await prisma.user.findUnique({
          where: { username: userIdParam },
          select: { id: true },
        });
        resolvedId = u?.id ?? userIdParam;
      }
      if (resolvedId !== deck.userId) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบเด็คนี้' }, { status: 403 });
      }
    }

    await prisma.deck.delete({ where: { id: deck.id } });
    return NextResponse.json({ success: true, message: 'ลบเด็คแล้ว' });
  } catch (error) {
    console.error('Delete deck error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

