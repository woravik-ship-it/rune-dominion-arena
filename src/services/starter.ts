// Starter Cards — Phase 13
// ผู้เล่นใหม่ต้อง "ลงทีมได้ตั้งแต่แรก" จึงมอบการ์ดเริ่มต้น 5 ใบให้อัตโนมัติตอนสมัคร
// หลักการ: deterministic ต่อผู้ใช้ (ผู้ใช้เดิมสมัครซ้ำ/รันสคริปต์ซ้ำได้ผลเดิม) + ไม่ซ้ำใบที่มีอยู่แล้ว
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { DECK_SIZE, MAX_SAME_ELEMENT } from '@/lib/constants';
import { buildCanonicalString, createCardFromSeed, hashSeed } from './seed';

export interface StarterPoolCard {
  id: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
}

export interface StarterCardResult {
  cardId: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
}

export class StarterService {
  /**
   * เลือกการ์ดเริ่มต้นแบบ deterministic — เรียงด้วย sha256(seed|cardId) แล้วเลือกแบบ greedy
   * โดยไม่ให้ธาตุเดียวกันเกิน MAX_SAME_ELEMENT เพื่อให้จัดทีมได้จริง
   */
  static pickStarterCards<T extends { id: string; element: string }>(
    pool: T[],
    seed: string,
    count: number = DECK_SIZE
  ): T[] {
    const ranked = pool
      .map((card, index) => ({
        card,
        index,
        rank: crypto.createHash('sha256').update(`${seed}|${card.id}`).digest('hex'),
      }))
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.index - b.index))
      .map((entry) => entry.card);

    const chosen: T[] = [];
    const elementCount: Record<string, number> = {};
    for (const card of ranked) {
      if (chosen.length >= count) break;
      const used = elementCount[card.element] ?? 0;
      if (used >= MAX_SAME_ELEMENT) continue;
      chosen.push(card);
      elementCount[card.element] = used + 1;
    }

    // คลังบางเกินไป (ธาตุน้อย) → เติมให้ครบจำนวนโดยไม่สนใจข้อธาตุ (ผู้เล่นจัดทีมเองได้อยู่แล้ว)
    if (chosen.length < count) {
      for (const card of ranked) {
        if (chosen.length >= count) break;
        if (chosen.some((c) => c.id === card.id)) continue;
        chosen.push(card);
      }
    }

    return chosen;
  }

  /** เตรียมคลังการ์ดให้มีพอใช้ (สร้างการ์ด deterministic เพิ่มถ้าฐานข้อมูลยังว่าง) */
  private static async ensurePool(minCount: number): Promise<StarterPoolCard[]> {
    const pool = await prisma.cardDefinition.findMany({
      select: { id: true, name: true, nameTh: true, element: true, rarity: true },
      orderBy: { createdAt: 'asc' },
    });

    let index = 0;
    while (pool.length < minCount && index < 40) {
      const runes = Array.from({ length: 8 }, (_, i) => (index * 617 + i * 97 + 11) % 10000);
      const hash = hashSeed(buildCanonicalString(runes));
      const generated = createCardFromSeed(hash);
      const saved = await prisma.cardDefinition.upsert({
        where: { canonicalSeedHash: hash },
        create: {
          canonicalSeedHash: hash,
          name: generated.name,
          nameTh: generated.nameTh,
          description: generated.description,
          descriptionTh: generated.descriptionTh,
          lore: generated.lore,
          loreTh: generated.loreTh,
          element: generated.element,
          rarity: generated.rarity,
          role: generated.role,
          atk: generated.atk,
          def: generated.def,
          hp: generated.hp,
          spd: generated.spd,
          manaCost: generated.manaCost,
          skill1Name: generated.skills[0]?.name,
          skill1Desc: generated.skills[0]?.description,
          skill1ManaCost: generated.skills[0]?.manaCost,
          skill2Name: generated.skills[1]?.name,
          skill2Desc: generated.skills[1]?.description,
          skill2ManaCost: generated.skills[1]?.manaCost,
          imageStatus: 'PENDING',
        },
        update: {},
      });
      if (!pool.some((c) => c.id === saved.id)) {
        pool.push({
          id: saved.id,
          name: saved.name,
          nameTh: saved.nameTh,
          element: saved.element,
          rarity: saved.rarity,
        });
      }
      index += 1;
    }

    return pool;
  }

  /**
   * มอบการ์ดเริ่มต้น 5 ใบให้ผู้เล่น (ข้ามใบที่มีอยู่แล้ว) — เรียกตอนสมัคร หรือรันสคริปต์ย้อนหลัง
   */
  static async grantStarterCards(
    userId: string,
    count: number = DECK_SIZE
  ): Promise<StarterCardResult[]> {
    const owned = await prisma.userCard.findMany({ where: { userId }, select: { cardId: true } });
    const ownedIds = new Set(owned.map((o) => o.cardId));

    let pool = await this.ensurePool(count * 2);
    let candidates = pool.filter((c) => !ownedIds.has(c.id));

    let guard = 0;
    while (candidates.length < count && guard < 4) {
      pool = await this.ensurePool(pool.length + count);
      candidates = pool.filter((c) => !ownedIds.has(c.id));
      guard += 1;
    }

    if (candidates.length === 0) return [];

    const picked = this.pickStarterCards(candidates, `starter:${userId}`, Math.min(count, candidates.length));

    await prisma.userCard.createMany({
      data: picked.map((card) => ({
        userId,
        cardId: card.id,
        obtainedMethod: 'STARTER',
        quantity: 1,
      })),
      skipDuplicates: true,
    });

    return picked.map((card) => ({
      cardId: card.id,
      name: card.name,
      nameTh: card.nameTh ?? card.name,
      element: card.element,
      rarity: card.rarity,
    }));
  }
}
