import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  calculateTeamPower,
  formationFromSlots,
  skillsOf,
  validateDeck,
  validatePositions,
  type CardStatRow,
  type CardStatSource,
} from '@/services/deck';
import { ItemService } from '@/services/item';
import type { ItemStats } from '@/lib/item-definitions';
import { resolveRequestUserId } from '@/lib/current-user';

/**
 * แปลงการ์ดจาก Prisma → แถวสำหรับสูตรคะแนน (ไม่ต้องเขียนฟิลด์ซ้ำหลายที่)
 * Phase 25: `bonus` = Status จาก Item ที่ใส่ในการ์ดใบนั้น (บวกเข้าค่าจริง)
 */
function statRow(
  slot: { cardId: string; card: CardStatSource },
  bonus?: ItemStats
): CardStatRow {
  return {
    cardId: slot.cardId,
    name: slot.card.name,
    nameTh: slot.card.nameTh,
    element: slot.card.element,
    rarity: slot.card.rarity,
    role: slot.card.role,
    atk: slot.card.atk + (bonus?.atk ?? 0),
    def: slot.card.def + (bonus?.def ?? 0),
    hp: slot.card.hp + (bonus?.hp ?? 0),
    spd: slot.card.spd + (bonus?.spd ?? 0),
    manaCost: slot.card.manaCost,
    skill1Name: slot.card.skill1Name,
    skill1ManaCost: slot.card.skill1ManaCost,
    skill2Name: slot.card.skill2Name,
    skill2ManaCost: slot.card.skill2ManaCost,
  };
}

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

    // Phase 25: Status จาก Item ของการ์ดในเด็ค (ของเจ้าของเด็ค — ไม่ขึ้นกับผู้เรียก)
    const itemStats = await ItemService.statsByCardIds(
      deck.userId,
      deck.slots.map((s) => s.cardId)
    );
    const rows = deck.slots.map((s) => statRow(s, itemStats.get(s.cardId)));
    const formation = formationFromSlots(
      deck.slots.map((s) => ({ position: s.position, card: statRow(s, itemStats.get(s.cardId)) }))
    );

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
            atk: (rows.find((row) => row.cardId === s.cardId)?.atk ?? s.card.atk),
            def: (rows.find((row) => row.cardId === s.cardId)?.def ?? s.card.def),
            hp: (rows.find((row) => row.cardId === s.cardId)?.hp ?? s.card.hp),
            spd: (rows.find((row) => row.cardId === s.cardId)?.spd ?? s.card.spd),
          }))
        ),
        /** Phase 15: คะแนนตามบทบาทช่อง + แกน 6 เหลี่ยม (สูตรเดียวกับหน้าจัดทีม) */
        formationScore: {
          total: formation.total,
          baseScore: formation.baseScore,
          bonusScore: formation.bonusScore,
          affinityScore: formation.affinityScore,
          axes: formation.axes,
          grade: formation.grade,
          slots: formation.slots.map((slot) => ({
            position: slot.position,
            role: slot.role,
            bonus: slot.bonus,
          })),
        },
        slots: deck.slots.map((s, i) => ({
          position: s.position,
          cardId: s.cardId,
          name: s.card.name,
          nameTh: s.card.nameTh,
          element: s.card.element,
          rarity: s.card.rarity,
          role: s.card.role,
          stats: {
            atk: rows[i]?.atk ?? s.card.atk,
            def: rows[i]?.def ?? s.card.def,
            hp: rows[i]?.hp ?? s.card.hp,
            spd: rows[i]?.spd ?? s.card.spd,
            manaCost: s.card.manaCost,
          },
          /** สกิล (ใช้คิดโบนัสช่องสนับสนุนฝั่งเว็บ + แสดงในอนาคต) */
          skills: skillsOf(rows[i]),
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
      const resolvedId = (await resolveRequestUserId(request, userIdParam)) ?? userIdParam;
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

    const updatedFormation = formationFromSlots(
      updated.slots.map((s) => ({ position: s.position, card: statRow(s) }))
    );

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
        /** Phase 15: คะแนนที่คิดโบนัสช่องแล้ว (ใช้ยืนยันกับที่หน้าจอคำนวณสด) */
        formationScore: {
          total: updatedFormation.total,
          baseScore: updatedFormation.baseScore,
          bonusScore: updatedFormation.bonusScore,
          affinityScore: updatedFormation.affinityScore,
          axes: updatedFormation.axes,
          grade: updatedFormation.grade,
        },
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

