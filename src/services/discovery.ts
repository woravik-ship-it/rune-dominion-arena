import { prisma } from '@/lib/prisma';
import { buildCanonicalString, hashSeed, createCardFromSeed } from './seed';

const MAX_ENERGY = 5;
const ENERGY_REGEN_PER_DAY = MAX_ENERGY;

export interface DiscoveryResult {
  card: {
    id: string;
    name: string;
    nameTh: string;
    description: string;
    descriptionTh: string;
    lore: string;
    loreTh: string;
    element: string;
    rarity: string;
    role: string;
    stats: {
      atk: number;
      def: number;
      hp: number;
      spd: number;
      manaCost: number;
    };
    skills: Array<{ name: string; nameEn: string; description: string; manaCost: number }>;
  };
  discovery: {
    isFirstDiscovery: boolean;
    seedHash: string;
    canonicalString: string;
  };
  energy: {
    remaining: number;
    max: number;
  };
}

export class DiscoveryService {
  /**
   * คำนวณพลังงานค้นหาที่เหลืออยู่
   */
  static async getEnergy(userId: string): Promise<{ remaining: number; max: number }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discoveryEnergy: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      remaining: user.discoveryEnergy,
      max: MAX_ENERGY,
    };
  }

  /**
   * เติมพลังงานค้นหา (รันทุกวัน)
   */
  static async regenerateEnergy(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { discoveryEnergy: MAX_ENERGY },
    });
  }

  /**
   * ทำการค้นหาการ์ด
   */
  static async discover(
    userId: string,
    runes: number[],
    idempotencyKey?: string
  ): Promise<DiscoveryResult> {
    // 1. ตรวจสอบพลังงาน
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.discoveryEnergy <= 0) {
      throw new Error('พลังค้นหาไม่เพียงพอ');
    }

    // 2. สร้าง Seed แบบ Deterministic
    const canonicalString = buildCanonicalString(runes);
    const seedHash = hashSeed(canonicalString);

    // 3. ตรวจสอบ Idempotency (ถ้ามี key)
    if (idempotencyKey) {
      const existingDiscovery = await prisma.discoveryLog.findUnique({
        where: { idempotencyKey },
      });

      if (existingDiscovery) {
        const card = await prisma.cardDefinition.findUnique({
          where: { id: existingDiscovery.cardId },
        });
        if (card) {
          return {
            card: this.mapCardToResponse(card),
            discovery: {
              isFirstDiscovery: false,
              seedHash,
              canonicalString,
            },
            energy: await this.getEnergy(userId),
          };
        }
      }
    }

    // 4. ค้นหาการ์ดจาก Hash
    let card = await prisma.cardDefinition.findUnique({
      where: { canonicalSeedHash: seedHash },
    });

    const isFirstDiscovery = !card;

    // 5. ถ้ายังไม่เคยมีการ์ดนี้ ให้สร้างใหม่
    if (!card) {
      const newCard = createCardFromSeed(seedHash);

      card = await prisma.cardDefinition.create({
        data: {
          canonicalSeedHash: seedHash,
          name: newCard.name,
          nameTh: newCard.nameTh,
          description: newCard.description,
          descriptionTh: newCard.descriptionTh,
          lore: newCard.lore,
          loreTh: newCard.loreTh,
          element: newCard.element,
          rarity: newCard.rarity,
          role: newCard.role,
          atk: newCard.atk,
          def: newCard.def,
          hp: newCard.hp,
          spd: newCard.spd,
          manaCost: newCard.manaCost,
          skill1Name: newCard.skills[0]?.name,
          skill1Desc: newCard.skills[0]?.description,
          skill1ManaCost: newCard.skills[0]?.manaCost,
          skill2Name: newCard.skills[1]?.name,
          skill2Desc: newCard.skills[1]?.description,
          skill2ManaCost: newCard.skills[1]?.manaCost,
          imageStatus: 'PENDING',
          discoveryCount: 1,
          firstDiscovererId: userId,
          firstDiscoveredAt: new Date(),
        },
      });
    } else {
      // 6. อัปเดตจำนวนการค้นพบ
      await prisma.cardDefinition.update({
        where: { id: card.id },
        data: { discoveryCount: { increment: 1 } },
      });
    }

    // 7. หักพลังงาน
    await prisma.user.update({
      where: { id: userId },
      data: { discoveryEnergy: { decrement: 1 } },
    });

    // 8. บันทึก Discovery Log
    await prisma.discoveryLog.create({
      data: {
        userId,
        cardId: card.id,
        runeSequence: JSON.stringify(runes),
        canonicalString,
        seedHash,
        isFirstDiscovery,
        idempotencyKey,
      },
    });

    // 9. เพิ่มการ์ดเข้า Collection ของผู้เล่น
    await prisma.userCard.create({
      data: {
        userId,
        cardId: card.id,
        obtainedMethod: 'DISCOVERY',
      },
    });

    const energy = await this.getEnergy(userId);

    return {
      card: this.mapCardToResponse(card),
      discovery: {
        isFirstDiscovery,
        seedHash,
        canonicalString,
      },
      energy,
    };
  }

  private static mapCardToResponse(card: any) {
    return {
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
      stats: {
        atk: card.atk,
        def: card.def,
        hp: card.hp,
        spd: card.spd,
        manaCost: card.manaCost,
      },
      skills: [
        card.skill1Name && {
          name: card.skill1Name,
          nameEn: card.skill1Name,
          description: card.skill1Desc,
          manaCost: card.skill1ManaCost,
        },
        card.skill2Name && {
          name: card.skill2Name,
          nameEn: card.skill2Name,
          description: card.skill2Desc,
          manaCost: card.skill2ManaCost,
        },
      ].filter(Boolean),
    };
  }
}
