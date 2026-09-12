import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateDeck, validatePositions, calculateTeamPower } from '@/services/deck';

async function resolveUserId(userId: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(userId)) {
    const exists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  const user = await prisma.user.findUnique({
    where: { username: userId },
    select: { id: true },
  });
  return user?.id ?? null;
}

// GET /api/decks?userId=xxx — รายการเด็คของฉัน
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId') || 'temp-user';
    const userId = await resolveUserId(userIdParam);

    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    const decks = await prisma.deck.findMany({
      where: { userId },
      include: {
        slots: { include: { card: true }, orderBy: { position: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: decks.map((deck) => ({
        id: deck.id,
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
        cardCount: deck.slots.length,
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
      })),
    });
  } catch (error) {
    console.error('List decks error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

// POST /api/decks — สร้างเด็คใหม่
// body: { userId, name, description?, slots: [{ cardId, position }] }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: userIdParam, name, description, slots } = body as {
      userId?: string;
      name?: string;
      description?: string;
      slots?: Array<{ cardId: string; position: number }>;
    };

    if (!userIdParam) {
      return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'ต้องระบุชื่อเด็ค' }, { status: 400 });
    }
    if (name.trim().length > 60) {
      return NextResponse.json({ error: 'ชื่อเด็คยาวเกิน 60 ตัวอักษร' }, { status: 400 });
    }
    if (!Array.isArray(slots)) {
      return NextResponse.json({ error: 'ต้องระบุ slots เป็น array' }, { status: 400 });
    }

    const userId = await resolveUserId(userIdParam);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
    }

    // Validate positions
    const posCheck = validatePositions(slots.map((s) => s.position));
    if (!posCheck.valid) {
      return NextResponse.json(
        { error: 'ตำแหน่งไม่ถูกต้อง', details: posCheck.errors },
        { status: 400 }
      );
    }

    const cardIds = slots.map((s) => s.cardId);

    // 1) ต้องเป็นการ์ดที่ตัวเองเป็นเจ้าของทั้งหมด
    const owned = await prisma.userCard.findMany({
      where: { userId, cardId: { in: cardIds } },
      include: { card: true },
    });
    if (owned.length !== cardIds.length) {
      return NextResponse.json(
        { error: 'มีการ์ดที่ไม่ได้เป็นเจ้าของอยู่ในทีม' },
        { status: 400 }
      );
    }
    const ownedById = new Map(owned.map((o) => [o.cardId, o.card]));

    // 2) Validate กฎทีม
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

    // 3) สร้างเด็ค + slots ใน transaction
    const deck = await prisma.deck.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.slice(0, 500) ?? null,
        isActive: true,
        slots: {
          create: slots.map((s) => ({ cardId: s.cardId, position: s.position })),
        },
      },
      include: { slots: true },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: deck.id,
          name: deck.name,
          teamPower: calculateTeamPower(deckCards),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create deck error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
