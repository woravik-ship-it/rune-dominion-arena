// Event Service — Phase 11: Seasonal Event (GDD §13)
// Lifecycle: UPCOMING → ACTIVE → GRACE_PERIOD → ENDED (คำนวณจากเวลา = lazy, ไม่ต้อง cron)
// Raid: ค่าเข้า 10 Veil Shards / cap 10 ครั้งต่อวัน / แพ้ได้ participation / ชนะได้ clear bonus
import { prisma } from '@/lib/prisma';
import { WalletService } from '@/services/wallet';
import { InventoryService } from '@/services/inventory';
import {
  EVENT_GRACE_HOURS,
  RAID_CLEAR_BONUS_SHARDS,
  RAID_DAILY_CAP,
  RAID_ENTRY_COST,
  RAID_PARTICIPATION_SHARDS,
  applyBossMechanics,
  applyElementBonus,
  bossPhaseForHp,
  ElementValue,
} from '@/services/event-boss';

export type EventStatusValue = 'UPCOMING' | 'ACTIVE' | 'GRACE_PERIOD' | 'ENDED';

/** สถานะที่คำนวณจากเวลาจริง (deterministic — server เป็นคนตัดสิน) */
export function eventStatusAt(
  window: { startDate: Date; endDate: Date; gracePeriodEnd: Date | null },
  now: Date = new Date()
): EventStatusValue {
  const t = now.getTime();
  if (t < window.startDate.getTime()) return 'UPCOMING';
  if (t < window.endDate.getTime()) return 'ACTIVE';
  const graceEnd = window.gracePeriodEnd ?? graceEndFor(window.endDate);
  if (t < graceEnd.getTime()) return 'GRACE_PERIOD';
  return 'ENDED';
}

/** เวลาสิ้นสุดรวม grace period (24 ชม. ตาม GDD) */
export function graceEndFor(endDate: Date): Date {
  return new Date(endDate.getTime() + EVENT_GRACE_HOURS * 3600_000);
}

export interface RaidResult {
  attemptId: string;
  damageDealt: number;
  eventPoints: number;
  shardsSpent: number;
  shardsEarned: number;
  won: boolean;
  elementBonus: boolean;
  bossPhaseBefore: number;
  bossPhaseAfter: number;
  mechanics: Array<{ noteTh: string; damageMultiplier: number }>;
  boss: { currentHp: number; maxHp: number; percent: number; isDefeated: boolean };
  participation: { veilShards: number; eventPoints: number; damageDealt: number };
}

export class EventService {
  /** เปิด/ปิด event อัตโนมัติตามเวลา (idempotent — เรียกซ้ำได้) */
  static async syncStatuses(now: Date = new Date()): Promise<{ updated: number }> {
    const events = await prisma.event.findMany({
      where: { isActive: true },
      select: { id: true, status: true, startDate: true, endDate: true, gracePeriodEnd: true },
    });

    let updated = 0;
    for (const e of events) {
      const next = eventStatusAt(
        { startDate: e.startDate, endDate: e.endDate, gracePeriodEnd: e.gracePeriodEnd },
        now
      );
      if (next !== e.status) {
        await prisma.event.update({ where: { id: e.id }, data: { status: next } });
        updated += 1;
      }
    }
    return { updated };
  }

  /** event ที่กำลังเปิดอยู่ (ACTIVE หรือ GRACE_PERIOD) */
  static async getActiveEvent(now: Date = new Date()) {
    await this.syncStatuses(now);
    return prisma.event.findFirst({
      where: { status: { in: ['ACTIVE', 'GRACE_PERIOD'] }, isActive: true },
      include: {
        bosses: true,
        milestones: { orderBy: [{ scope: 'asc' }, { tier: 'asc' }] },
        shopItems: { where: { isActive: true }, orderBy: { price: 'asc' } },
        storyChapters: { orderBy: { chapterNo: 'asc' } },
        community: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /** เข้าร่วม event (idempotent) */
  static async join(eventId: string, userId: string) {
    const existing = await prisma.eventParticipation.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (existing) return existing;

    const participation = await prisma.eventParticipation.create({
      data: { eventId, userId },
    });
    await prisma.eventCommunityProgress.upsert({
      where: { eventId },
      create: { eventId, participantCount: 1 },
      update: { participantCount: { increment: 1 } },
    });
    return participation;
  }

  /** จำนวน raid ที่ทำวันนี้ (จำกัด 10 ครั้ง/วัน) */
  static async countTodayRaids(userId: string, eventId: string, now: Date = new Date()): Promise<number> {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return prisma.eventRaidAttempt.count({
      where: { userId, eventId, createdAt: { gte: startOfDay } },
    });
  }

  /**
   * เข้า Boss Raid 1 ครั้ง — หัก Veil Shards, คำนวณดาเมจ, อัปเดต HP บอส + community
   * idempotent ด้วย idempotencyKey
   */
  static async raid(params: {
    eventId: string;
    bossId: string;
    userId: string;
    deckId: string;
    idempotencyKey?: string;
    baseDamage: number;
    elementsUsed: ElementValue[];
    won: boolean;
    turn?: number;
    now?: Date;
  }): Promise<RaidResult> {
    const now = params.now ?? new Date();

    if (params.idempotencyKey) {
      const dup = await prisma.eventRaidAttempt.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (dup) {
        const [boss, part] = await Promise.all([
          prisma.eventBoss.findUnique({ where: { id: dup.bossId } }),
          prisma.eventParticipation.findUnique({ where: { id: dup.participationId } }),
        ]);
        return {
          attemptId: dup.id,
          damageDealt: dup.damageDealt,
          eventPoints: dup.eventPoints,
          shardsSpent: dup.shardsSpent,
          shardsEarned: dup.shardsEarned,
          won: dup.won,
          elementBonus: dup.elementBonus,
          bossPhaseBefore: dup.bossPhaseBefore,
          bossPhaseAfter: dup.bossPhaseAfter,
          mechanics: [],
          boss: {
            currentHp: boss?.currentHp ?? 0,
            maxHp: boss?.maxHp ?? 0,
            percent: boss && boss.maxHp > 0 ? Math.round((boss.currentHp / boss.maxHp) * 100) : 0,
            isDefeated: boss?.isDefeated ?? false,
          },
          participation: {
            veilShards: part ? part.currencyEarned - part.currencySpent : 0,
            eventPoints: part?.eventPoints ?? 0,
            damageDealt: part?.damageDealt ?? 0,
          },
        };
      }
    }

    const event = await prisma.event.findUnique({ where: { id: params.eventId } });
    if (!event) throw new Error('ไม่พบกิจกรรม');
    const status = eventStatusAt(
      { startDate: event.startDate, endDate: event.endDate, gracePeriodEnd: event.gracePeriodEnd },
      now
    );
    if (status === 'UPCOMING') throw new Error('กิจกรรมยังไม่เริ่ม');
    if (status === 'ENDED') throw new Error('กิจกรรมสิ้นสุดแล้ว');

    const boss = await prisma.eventBoss.findUnique({ where: { id: params.bossId } });
    if (!boss) throw new Error('ไม่พบบอสของกิจกรรม');
    if (boss.isDefeated) throw new Error('บอสถูกปราบแล้ว');

    const participation = await this.join(params.eventId, params.userId);

    const todayRaids = await this.countTodayRaids(params.userId, params.eventId, now);
    if (todayRaids >= RAID_DAILY_CAP) {
      throw new Error(`เข้า Raid ได้ไม่เกิน ${RAID_DAILY_CAP} ครั้งต่อวัน`);
    }

    const shardsAvailable = participation.currencyEarned - participation.currencySpent;
    if (shardsAvailable < RAID_ENTRY_COST) {
      throw new Error(`Veil Shards ไม่พอ (ต้องใช้ ${RAID_ENTRY_COST} ชิ้น)`);
    }

    const phaseBefore = bossPhaseForHp(boss.currentHp, boss.maxHp);
    const { damage, effects } = applyBossMechanics({
      baseDamage: Math.max(1, Math.trunc(params.baseDamage)),
      phase: phaseBefore,
      elementsUsed: params.elementsUsed,
      turn: params.turn ?? 1,
    });

    const hpAfter = Math.max(0, boss.currentHp - damage);
    const phaseAfter = bossPhaseForHp(hpAfter, boss.maxHp);
    const defeated = hpAfter <= 0;

    const eventPoints = applyElementBonus(damage, params.elementsUsed);
    const elementBonus = eventPoints > damage;
    const shardsEarned = RAID_PARTICIPATION_SHARDS + (params.won ? RAID_CLEAR_BONUS_SHARDS : 0);

    const attempt = await prisma.eventRaidAttempt.create({
      data: {
        eventId: params.eventId,
        bossId: params.bossId,
        userId: params.userId,
        participationId: participation.id,
        deckId: params.deckId,
        idempotencyKey: params.idempotencyKey ?? null,
        damageDealt: damage,
        eventPoints,
        shardsSpent: RAID_ENTRY_COST,
        shardsEarned,
        won: params.won,
        elementBonus,
        bossPhaseBefore: phaseBefore,
        bossPhaseAfter: phaseAfter,
        elementsUsed: params.elementsUsed,
        battleData: { effects, baseDamage: params.baseDamage, turn: params.turn ?? 1 } as unknown as object,
      },
    });

    await prisma.eventBoss.update({
      where: { id: boss.id },
      data: {
        currentHp: hpAfter,
        totalDamage: { increment: damage },
        isDefeated: defeated,
        defeatedAt: defeated ? now : null,
      },
    });

    const updatedPart = await prisma.eventParticipation.update({
      where: { id: participation.id },
      data: {
        currencyEarned: { increment: shardsEarned },
        currencySpent: { increment: RAID_ENTRY_COST },
        eventPoints: { increment: eventPoints },
        damageDealt: { increment: damage },
      },
    });

    await prisma.eventCommunityProgress.upsert({
      where: { eventId: params.eventId },
      create: { eventId: params.eventId, totalDamage: damage, totalPoints: eventPoints, raidCount: 1 },
      update: {
        totalDamage: { increment: damage },
        totalPoints: { increment: eventPoints },
        raidCount: { increment: 1 },
      },
    });

    return {
      attemptId: attempt.id,
      damageDealt: damage,
      eventPoints,
      shardsSpent: RAID_ENTRY_COST,
      shardsEarned,
      won: params.won,
      elementBonus,
      bossPhaseBefore: phaseBefore,
      bossPhaseAfter: phaseAfter,
      mechanics: effects.map((e) => ({ noteTh: e.noteTh, damageMultiplier: e.damageMultiplier })),
      boss: {
        currentHp: hpAfter,
        maxHp: boss.maxHp,
        percent: boss.maxHp > 0 ? Math.round((hpAfter / boss.maxHp) * 100) : 0,
        isDefeated: defeated,
      },
      participation: {
        veilShards: updatedPart.currencyEarned - updatedPart.currencySpent,
        eventPoints: updatedPart.eventPoints,
        damageDealt: updatedPart.damageDealt,
      },
    };
  }

  /** milestone ที่ถึงเกณฑ์แล้วแต่ยังไม่รับรางวัล */
  static async claimableMilestones(eventId: string, userId: string) {
    const [milestones, participation, community] = await Promise.all([
      prisma.eventMilestone.findMany({ where: { eventId }, orderBy: [{ scope: 'asc' }, { tier: 'asc' }] }),
      prisma.eventParticipation.findUnique({ where: { eventId_userId: { eventId, userId } } }),
      prisma.eventCommunityProgress.findUnique({ where: { eventId } }),
    ]);

    const claimed = new Set(participation?.milestonesReached ?? []);
    const personalPoints = participation?.eventPoints ?? 0;
    const communityDamage = community?.totalDamage ?? 0;

    return milestones.map((m) => {
      const progress = m.scope === 'PERSONAL' ? personalPoints : communityDamage;
      const key = `${m.scope}:${m.tier}`;
      return {
        id: m.id,
        scope: m.scope as 'PERSONAL' | 'COMMUNITY',
        tier: m.tier,
        threshold: m.threshold,
        titleTh: m.titleTh,
        rewardType: m.rewardType,
        rewardAmount: m.rewardAmount,
        rewardLabel: m.rewardLabel,
        progress,
        reached: progress >= m.threshold,
        claimed: claimed.has(key),
      };
    });
  }

  /** รับรางวัล milestone (idempotent — รับซ้ำไม่ได้) */
  static async claimMilestone(params: {
    eventId: string;
    userId: string;
    milestoneId: string;
  }): Promise<{ claimed: boolean; message: string; rewardType: string; rewardAmount: number }> {
    const [milestone, participation, community] = await Promise.all([
      prisma.eventMilestone.findUnique({ where: { id: params.milestoneId } }),
      prisma.eventParticipation.findUnique({
        where: { eventId_userId: { eventId: params.eventId, userId: params.userId } },
      }),
      prisma.eventCommunityProgress.findUnique({ where: { eventId: params.eventId } }),
    ]);

    if (!milestone || milestone.eventId !== params.eventId) {
      return { claimed: false, message: 'ไม่พบรางวัลนี้', rewardType: '', rewardAmount: 0 };
    }
    if (!participation) {
      return { claimed: false, message: 'ต้องเข้าร่วมกิจกรรมก่อน', rewardType: '', rewardAmount: 0 };
    }

    const key = `${milestone.scope}:${milestone.tier}`;
    if (participation.milestonesReached.includes(key)) {
      return {
        claimed: false,
        message: 'รับรางวัลนี้ไปแล้ว',
        rewardType: milestone.rewardType,
        rewardAmount: milestone.rewardAmount,
      };
    }

    const progress =
      milestone.scope === 'PERSONAL' ? participation.eventPoints : community?.totalDamage ?? 0;
    if (progress < milestone.threshold) {
      return {
        claimed: false,
        message: 'ยังไม่ถึงเกณฑ์',
        rewardType: milestone.rewardType,
        rewardAmount: milestone.rewardAmount,
      };
    }

    // รางวัล COIN เข้ากระเป๋าจริง (integer เท่านั้น) — ที่เหลือเข้าคลังผู้เล่น
    if (milestone.rewardType === 'COIN' && milestone.rewardAmount > 0) {
      await WalletService.credit(
        params.userId,
        milestone.rewardAmount,
        'REWARD',
        undefined,
        'EVENT_MILESTONE',
        `กิจกรรม: ${milestone.titleTh}`
      );
    } else {
      // การ์ดพิเศษ / เครื่องประดับ / ฉายา / วัตถุดิบ / บทเนื้อเรื่อง → ของสะสมผู้เล่น
      await InventoryService.grantEventReward({
        userId: params.userId,
        rewardType: milestone.rewardType,
        rewardAmount: milestone.rewardAmount,
        rewardLabel: milestone.rewardLabel,
        titleTh: milestone.titleTh,
        source: `EVENT_MILESTONE:${milestone.scope}:${milestone.tier}`,
        eventId: params.eventId,
      });
    }

    await prisma.eventParticipation.update({
      where: { id: participation.id },
      data: {
        milestonesReached: { push: key },
        currencyEarned:
          milestone.rewardType === 'VEIL_SHARDS' ? { increment: milestone.rewardAmount } : undefined,
      },
    });

    return {
      claimed: true,
      message: `รับรางวัล "${milestone.titleTh}" สำเร็จ`,
      rewardType: milestone.rewardType,
      rewardAmount: milestone.rewardAmount,
    };
  }

  /** ซื้อของใน Event Shop ด้วย Veil Shards (idempotent + จำกัดต่อผู้ใช้) */
  static async purchase(params: {
    eventId: string;
    userId: string;
    itemId: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; message: string; veilShards: number }> {
    if (params.idempotencyKey) {
      const dup = await prisma.eventShopPurchase.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (dup) {
        const part = await prisma.eventParticipation.findUnique({
          where: { eventId_userId: { eventId: params.eventId, userId: params.userId } },
        });
        return {
          success: true,
          message: 'คำสั่งซื้อนี้ถูกบันทึกแล้ว',
          veilShards: part ? part.currencyEarned - part.currencySpent : 0,
        };
      }
    }

    const [item, participation] = await Promise.all([
      prisma.eventShopItem.findUnique({ where: { id: params.itemId } }),
      prisma.eventParticipation.findUnique({
        where: { eventId_userId: { eventId: params.eventId, userId: params.userId } },
      }),
    ]);

    if (!item || item.eventId !== params.eventId || !item.isActive) {
      return { success: false, message: 'ไม่พบสินค้านี้', veilShards: 0 };
    }
    if (!participation) {
      return { success: false, message: 'ต้องเข้าร่วมกิจกรรมก่อน', veilShards: 0 };
    }

    const shards = participation.currencyEarned - participation.currencySpent;
    if (shards < item.price) {
      return {
        success: false,
        message: `Veil Shards ไม่พอ (ต้องใช้ ${item.price} ชิ้น)`,
        veilShards: shards,
      };
    }

    if (item.perUserLimit > 0) {
      const bought = await prisma.eventShopPurchase.count({
        where: { itemId: item.id, userId: params.userId },
      });
      if (bought >= item.perUserLimit) {
        return {
          success: false,
          message: `ซื้อได้ไม่เกิน ${item.perUserLimit} ชิ้น`,
          veilShards: shards,
        };
      }
    }

    if (item.rewardType === 'COIN' && item.rewardAmount > 0) {
      await WalletService.credit(
        params.userId,
        item.rewardAmount,
        'PURCHASE',
        undefined,
        'EVENT_SHOP',
        `ร้านค้ากิจกรรม: ${item.nameTh}`
      );
    } else {
      // ของประดับ/ฉายา/วัตถุดิบ → เข้าคลังผู้เล่นจริง
      await InventoryService.grantEventReward({
        userId: params.userId,
        rewardType: item.rewardType,
        rewardAmount: item.rewardAmount,
        rewardLabel: item.nameTh,
        titleTh: item.nameTh,
        source: `EVENT_SHOP:${item.code}`,
        eventId: params.eventId,
      });
    }

    await prisma.eventShopPurchase.create({
      data: {
        eventId: params.eventId,
        itemId: item.id,
        userId: params.userId,
        idempotencyKey: params.idempotencyKey ?? null,
        pricePaid: item.price,
      },
    });

    const updated = await prisma.eventParticipation.update({
      where: { id: participation.id },
      data: { currencySpent: { increment: item.price } },
    });

    return {
      success: true,
      message: `ซื้อ "${item.nameTh}" สำเร็จ`,
      veilShards: updated.currencyEarned - updated.currencySpent,
    };
  }

  /** Story chapters ที่ปลดล็อกตาม community damage */
  static async storyState(eventId: string) {
    const [chapters, community] = await Promise.all([
      prisma.eventStoryChapter.findMany({ where: { eventId }, orderBy: { chapterNo: 'asc' } }),
      prisma.eventCommunityProgress.findUnique({ where: { eventId } }),
    ]);
    const damage = community?.totalDamage ?? 0;
    return chapters.map((c) => ({
      chapterNo: c.chapterNo,
      title: c.title,
      titleTh: c.titleTh,
      bodyTh: c.bodyTh,
      unlockAtDamage: c.unlockAtDamage,
      unlocked: damage >= c.unlockAtDamage,
    }));
  }
}

