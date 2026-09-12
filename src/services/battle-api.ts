import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildBattleSeed, battlePrng, CombatCard } from '@/services/combat';
import { simulateBattle as runBattle } from '@/services/combat-engine';

export async function deckToCombatCards(deckId: string): Promise<CombatCard[] | null> {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    include: { slots: { include: { card: true }, orderBy: { position: 'asc' } } },
  });
  if (!deck || deck.slots.length !== 5) return null;
  return deck.slots.map((s) => ({
    cardId: s.cardId,
    name: s.card.name,
    nameTh: s.card.nameTh,
    element: s.card.element,
    atk: s.card.atk,
    def: s.card.def,
    hp: s.card.hp,
    spd: s.card.spd,
  }));
}

export async function resolveBattleUserId(userIdParam: string): Promise<string | null> {
  if (/^c[a-z0-9]+$/i.test(userIdParam)) {
    const exists = await prisma.user.findUnique({
      where: { id: userIdParam },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  const user = await prisma.user.findUnique({
    where: { username: userIdParam },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function buildBotTeam(botSeed: string): Promise<{ cards: CombatCard[]; cardIds: string[] }> {
  const allCards = await prisma.cardDefinition.findMany({
    select: {
      id: true, name: true, nameTh: true, element: true,
      atk: true, def: true, hp: true, spd: true,
    },
    take: 200,
    orderBy: { createdAt: 'asc' },
  });
  if (allCards.length < 5) throw new Error('การ์ดในระบบไม่พอสร้างบอท');
  const picked: typeof allCards = [];
  const used = new Set<number>();
  let i = 0;
  while (picked.length < 5 && i < 1000) {
    const idx = Math.floor(battlePrng(botSeed, 900 + i) * allCards.length);
    if (!used.has(idx)) {
      used.add(idx);
      picked.push(allCards[idx]);
    }
    i++;
  }
  return {
    cards: picked.map((c) => ({
      cardId: c.id, name: c.name, nameTh: c.nameTh, element: c.element,
      atk: c.atk, def: c.def, hp: c.hp, spd: c.spd,
    })),
    cardIds: picked.map((c) => c.id),
  };
}

export { buildBattleSeed, runBattle };
