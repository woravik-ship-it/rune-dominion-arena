// Event Quest Service — Phase 11.2
// Hook ความคืบหน้าของ Event Quest ให้ผูกกับเหตุการณ์จริง (raid / damage / shards)
// หลักการ: งวดรายวัน/รายสัปดาห์ (period key เดียวกับ QuestService), idempotent, integer เท่านั้น
import { prisma } from '@/lib/prisma';
import { WalletService } from '@/services/wallet';

export interface EventQuestProgressView {
  questId: string;
  nameTh: string;
  descriptionTh: string | null;
  type: string;
  metric: EventQuestMetric;
  targetValue: number;
  currentValue: number;
  isCompleted: boolean;
  rewardClaimed: boolean;
  currencyReward: number;
  coinReward: number;
  periodKey: string;
}

export type EventQuestMetric = 'RAID' | 'DAMAGE' | 'SHARDS';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** คีย์งวดรายวัน (เที่ยงคืนเวลาเซิร์ฟเวอร์) */
export function dailyKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** คีย์งวดรายสัปดาห์ ISO (วันจันทร์เป็นวันเริ่ม) */
export function weeklyKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = (d.getDay() + 6) % 7; // จ=0 .. อา=6
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const weekOneThursday = new Date(jan4.getFullYear(), 0, 4 - jan4Day + 3);
  const week = Math.round((thursday.getTime() - weekOneThursday.getTime()) / (7 * 24 * 3600_000)) + 1;
  return `${thursday.getFullYear()}-W${pad(week)}`;
}

export function periodKeyFor(type: string, now: Date = new Date()): string {
  if (type === 'DAILY') return dailyKey(now);
  if (type === 'WEEKLY') return weeklyKey(now);
  return 'ALL';
}

/** แปลงชื่อ/คำอธิบาย → metric ที่ต้องนับ (ตีความฝั่ง server เท่านั้น) */
export function metricForQuest(name: string, descriptionTh: string | null): EventQuestMetric {
  const text = `${name} ${descriptionTh ?? ''}`.toLowerCase();
  if (text.includes('raid') || text.includes('เข้าร่วม')) return 'RAID';
  if (text.includes('ดาเมจ') || text.includes('damage')) return 'DAMAGE';
  if (text.includes('shard') || text.includes('เศษ')) return 'SHARDS';
  return 'RAID';
}

export class EventQuestService {
  /**
   * บันทึกเหตุการณ์จริงจาก raid → อัปเดตความคืบหน้า event quest ที่ตรง metric
   * เรียกฝั่ง server หลัง raid สำเร็จเท่านั้น
   */
  static async recordRaidEvent(
    userId: string,
    eventId: string,
    payload: { addRaid?: number; addDamage?: number; addShards?: number },
    now: Date = new Date()
  ): Promise<number> {
    const quests = await prisma.eventQuest.findMany({
      where: { eventId, isActive: true },
      select: { id: true, name: true, descriptionTh: true, type: true, targetValue: true },
    });

    let updated = 0;
    for (const q of quests) {
      const metric = metricForQuest(q.name, q.descriptionTh);
      const add =
        metric === 'RAID' ? payload.addRaid ?? 0
          : metric === 'DAMAGE' ? payload.addDamage ?? 0
            : payload.addShards ?? 0;
      if (add <= 0) continue;

      const periodKey = periodKeyFor(q.type, now);
      const existing = await prisma.eventQuestProgress.findUnique({
        where: { eventQuestId_userId_periodKey: { eventQuestId: q.id, userId, periodKey } },
      });

      const next = Math.min((existing?.currentValue ?? 0) + add, q.targetValue);
      const completed = next >= q.targetValue;

      await prisma.eventQuestProgress.upsert({
        where: { eventQuestId_userId_periodKey: { eventQuestId: q.id, userId, periodKey } },
        create: {
          eventQuestId: q.id,
          userId,
          periodKey,
          currentValue: next,
          isCompleted: completed,
          completedAt: completed ? now : null,
        },
        update: {
          currentValue: next,
          isCompleted: completed,
          completedAt: completed && !existing?.isCompleted ? now : existing?.completedAt ?? null,
        },
      });
      updated += 1;
    }
    return updated;
  }

  /** บอร์ด Event Quest ของผู้เล่น (พร้อมความคืบหน้าจริง) */
  static async getBoard(
    eventId: string,
    userId: string,
    now: Date = new Date()
  ): Promise<EventQuestProgressView[]> {
    const quests = await prisma.eventQuest.findMany({
      where: { eventId, isActive: true },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });

    const views: EventQuestProgressView[] = [];
    for (const q of quests) {
      const periodKey = periodKeyFor(q.type, now);
      const progress = await prisma.eventQuestProgress.findUnique({
        where: { eventQuestId_userId_periodKey: { eventQuestId: q.id, userId, periodKey } },
      });
      views.push({
        questId: q.id,
        nameTh: q.nameTh,
        descriptionTh: q.descriptionTh,
        type: q.type,
        metric: metricForQuest(q.name, q.descriptionTh),
        targetValue: q.targetValue,
        currentValue: progress?.currentValue ?? 0,
        isCompleted: progress?.isCompleted ?? false,
        rewardClaimed: progress?.rewardClaimed ?? false,
        currencyReward: q.currencyReward,
        coinReward: q.rewardAmount,
        periodKey,
      });
    }
    return views;
  }

  /** รับรางวัล event quest (idempotent — ต้องครบเป้าก่อน) */
  static async claim(
    eventId: string,
    userId: string,
    eventQuestId: string,
    now: Date = new Date()
  ): Promise<{ claimed: boolean; message: string; veilShards: number; coin: number }> {
    const quest = await prisma.eventQuest.findUnique({ where: { id: eventQuestId } });
    if (!quest || quest.eventId !== eventId || !quest.isActive) {
      return { claimed: false, message: 'ไม่พบภารกิจนี้', veilShards: 0, coin: 0 };
    }

    const periodKey = periodKeyFor(quest.type, now);
    const progress = await prisma.eventQuestProgress.findUnique({
      where: { eventQuestId_userId_periodKey: { eventQuestId, userId, periodKey } },
    });

    if (!progress || !progress.isCompleted) {
      return { claimed: false, message: 'ยังทำภารกิจไม่ครบ', veilShards: 0, coin: 0 };
    }
    if (progress.rewardClaimed) {
      return { claimed: false, message: 'รับรางวัลนี้ไปแล้ว', veilShards: 0, coin: 0 };
    }

    await prisma.eventQuestProgress.update({
      where: { id: progress.id },
      data: { rewardClaimed: true },
    });

    // Coin เข้ากระเป๋าจริง (integer เท่านั้น)
    if (quest.rewardAmount > 0) {
      await WalletService.credit(
        userId,
        quest.rewardAmount,
        'REWARD',
        undefined,
        'EVENT_QUEST',
        `ภารกิจกิจกรรม: ${quest.nameTh}`
      );
    }

    // Veil Shards เข้า participation ของกิจกรรม
    let veilShards = 0;
    if (quest.currencyReward > 0) {
      const part = await prisma.eventParticipation.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (part) {
        const updated = await prisma.eventParticipation.update({
          where: { id: part.id },
          data: { currencyEarned: { increment: quest.currencyReward } },
        });
        veilShards = updated.currencyEarned - updated.currencySpent;
      }
    }

    return {
      claimed: true,
      message: `รับรางวัล "${quest.nameTh}" สำเร็จ`,
      veilShards,
      coin: quest.rewardAmount,
    };
  }
}
