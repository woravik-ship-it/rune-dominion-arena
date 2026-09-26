import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ItemService } from '@/services/item';

/** Phase 25: Status การ์ดในเด็ค = พื้นฐาน + Item ที่ใส่ (ช่องโจมตี/ป้องกัน/สนับสนุน) */
function cardStatsWithItems(
  card: { atk: number; def: number; hp: number; spd: number },
  bonus?: { atk: number; def: number; hp: number; spd: number }
): { atk: number; def: number; hp: number; spd: number } {
  return {
    atk: card.atk + (bonus?.atk ?? 0),
    def: card.def + (bonus?.def ?? 0),
    hp: card.hp + (bonus?.hp ?? 0),
    spd: card.spd + (bonus?.spd ?? 0),
  };
}
import { calculateTeamPower, validateDeck, validatePositions, formationFromSlots, skillsOf } from '@/services/deck';
import { parseJsonBody, deckCreateSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/decks — รายการเด็คของฉัน (ยึด session cookie ก่อน, param ใช้สำหรับ CLI/admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const userId = await resolveRequestUserId(request, userIdParam);

    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const decks = await prisma.deck.findMany({
      where: { userId },
      include: {
        slots: { include: { card: true }, orderBy: { position: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Phase 25: Item ที่ใส่ไว้ในการ์ดของทุกเด็ค (หาทีเดียวทั้งชุด)
    const itemStats = await ItemService.statsByCardIds(
      userId,
      decks.flatMap((deck) => deck.slots.map((slot) => slot.cardId))
    );

    return NextResponse.json({
      success: true,
      data: decks.map((deck) => {
        // Phase 15: คะแนนตามบทบาทช่อง (โจมตี/ป้องกัน/สนับสนุน) + แกน 6 เหลี่ยม — สูตรชุดเดียวกับหน้าจัดทีม
        const formation = formationFromSlots(
          deck.slots.map((s) => ({
            position: s.position,
            card: {
              cardId: s.cardId,
              name: s.card.name,
              nameTh: s.card.nameTh,
              element: s.card.element,
              rarity: s.card.rarity,
              role: s.card.role,
              ...cardStatsWithItems(s.card, itemStats.get(s.cardId)),
              manaCost: s.card.manaCost,
              skill1Name: s.card.skill1Name,
              skill1ManaCost: s.card.skill1ManaCost,
              skill2Name: s.card.skill2Name,
              skill2ManaCost: s.card.skill2ManaCost,
            },
          }))
        );
        return {
          id: deck.id,
          name: deck.name,
          description: deck.description,
          isActive: deck.isActive,
          /** @deprecated ใช้ formationScore.total (คะแนนที่คิดโบนัสช่องแล้ว) สำหรับการแสดงผลผู้เล่น */
          teamPower: calculateTeamPower(
            deck.slots.map((s) => ({
              cardId: s.cardId,
              element: s.card.element,
              ...cardStatsWithItems(s.card, itemStats.get(s.cardId)),
            }))
          ),
          formationScore: {
            total: formation.total,
            baseScore: formation.baseScore,
            bonusScore: formation.bonusScore,
            affinityScore: formation.affinityScore,
            axes: formation.axes,
            grade: formation.grade,
          },
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
              ...cardStatsWithItems(s.card, itemStats.get(s.cardId)),
              manaCost: s.card.manaCost,
            },
            skills: skillsOf(s.card),
            imageUrl: s.card.imageUrl,
            imageStatus: s.card.imageStatus,
          })),
        };
      }),
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
    // Phase 10: input validation + rate limit
    const { data, errorResponse } = await parseJsonBody(request, deckCreateSchema);
    if (errorResponse) return errorResponse;
    const { userId: userIdParam, name, description, slots } = data;

    const rl = enforceRateLimit(request, 'DECK_WRITE', { userId: userIdParam });
    if (rl) return rl;

    // ยึด session cookie ก่อน (กันเขียนเด็คแทนคนอื่น) → fallback param สำหรับเทสต์/CLI
    const userId = await resolveRequestUserId(request, userIdParam);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
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
