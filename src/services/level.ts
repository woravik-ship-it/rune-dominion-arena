// Level Service — Phase 33: ให้ EXP / ขึ้นเลเวล / จ่ายรางวัล
//
// ผู้ใช้สั่ง 2026-09-27: "Level Up ได้รับรางวัล Item Coin รวมถึงพลังงาน ตาม Level
//   โดยเฉพาะพลังงาน Level 2 ได้ 2 Level 3 ได้ 3 ส่วน Item กับ Coin ก็ตามสมควร"
//
// กติกา
//  - เก็บเฉพาะ `User.exp` ใน DB · เลเวลคำนวณจาก exp ด้วยสูตรบริสุทธิ์ (src/lib/level.ts)
//  - ให้ exp + รางวัลทั้งหมดใน **transaction เดียว** (Coin · พลังงาน · Item · กันให้ซ้ำ)
//  - รางวัลที่ให้: Coin (20+6×เลเวล) · พลังงาน = เลขเลเวล (Level 2 → 2 · Level 3 → 3 · ไม่เกิน MAX_ENERGY)
//    · Item ช่วงเลเวล (ทุก 5/10/25/50/100/350)
//  - แจ้งเตือนผู้เล่นเมื่อขึ้นเลเวล (ทำนอก transaction · ไม่ให้ล้มงานหลัก)
import { prisma } from '@/lib/prisma';
import { MAX_ENERGY } from '@/lib/constants';
import { WalletService } from '@/services/wallet';
import { NotificationService } from '@/services/notification';
import { levelUpSummary, levelProgress, type LevelProgress } from '@/lib/level';

export interface AddExpResult {
  exp: number;
  progress: LevelProgress;
  gainedLevels: number;
  coins: number;
  energy: number;
  items: string[];
}

export class LevelService {
  /** อ่านความคืบหน้าเลเวลของผู้เล่น */
  static async progress(userId: string): Promise<LevelProgress> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { exp: true } });
    return levelProgress(user?.exp ?? 0);
  }

  /**
   * ให้ EXP แล้วจ่ายรางวัลเมื่อขึ้นเลเวล (ถ้ามี)
   * คืนข้อมูลว่าขึ้นกี่เลเวล + ได้รางวัลอะไรไปบ้าง (ให้ route เอาไปบอกผู้เล่น)
   */
  static async addExp(userId: string, amount: number): Promise<AddExpResult> {
    const gained = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { exp: true } });
    const beforeExp = Math.max(0, current?.exp ?? 0);
    if (gained === 0) {
      return { exp: beforeExp, progress: levelProgress(beforeExp), gainedLevels: 0, coins: 0, energy: 0, items: [] };
    }

    const summary = levelUpSummary(beforeExp, beforeExp + gained);
    const afterExp = beforeExp + gained;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { exp: afterExp } });
      if (summary.gainedLevels > 0) {
        // พลังงาน: +เท่าเลขเลเวลที่ไปถึง (ไม่เกินเพดาน)
        const user = await tx.user.findUnique({ where: { id: userId }, select: { discoveryEnergy: true } });
        const energy = Math.min(MAX_ENERGY, (user?.discoveryEnergy ?? 0) + summary.totalEnergy);
        await tx.user.update({ where: { id: userId }, data: { discoveryEnergy: energy } });
      }
    });

    // Coin + Item ทำผ่าน service ที่มี transaction ของตัวเอง (หลัง exp ถูกบันทึกแล้ว)
    if (summary.totalCoins > 0) {
      await WalletService.credit(
        userId,
        summary.totalCoins,
        'REWARD',
        `LEVEL:${summary.toLevel}`,
        'LEVEL_UP',
        `รางวัลขึ้นเลเวล ${summary.fromLevel} → ${summary.toLevel}`,
        `levelup:${userId}:${summary.toLevel}`
      );
    }
    for (const code of summary.items) {
      const item = await prisma.itemDefinition.findUnique({ where: { code } });
      if (!item) continue;
      // Phase 43: ของใหม่ลง "กอง +0" (กองแยกตามระดับตีบวก)
      await prisma.userItem.upsert({
        where: { userId_itemId_enhanceLevel: { userId, itemId: item.id, enhanceLevel: 0 } },
        create: { userId, itemId: item.id, quantity: 1, enhanceLevel: 0 },
        update: { quantity: { increment: 1 } },
      });
    }

    if (summary.gainedLevels > 0) {
      NotificationService.create(userId, {
        type: 'SYSTEM',
        titleKey: 'notif.levelUpTitle',
        bodyKey: 'notif.levelUpBody',
        vars: {
          level: summary.toLevel,
          coins: summary.totalCoins,
          energy: summary.totalEnergy,
          items: summary.items.length,
          bonus: Math.round((summary.toLevel - 1) / (350 - 1) * 20),
        },
        href: '/profile',
        icon: '⭐',
      }).catch(() => undefined);
    }

    return {
      exp: afterExp,
      progress: levelProgress(afterExp),
      gainedLevels: summary.gainedLevels,
      coins: summary.totalCoins,
      energy: summary.totalEnergy,
      items: summary.items,
    };
  }
}
