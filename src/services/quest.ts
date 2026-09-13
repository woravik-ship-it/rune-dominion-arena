// Quest & Mission Service — Phase 7
// Rules: Deterministic period key / Idempotent claim / Integer reward เท่านั้น
import { prisma } from '@/lib/prisma';
import { WalletService } from '@/services/wallet';

export type QuestTypeValue = 'DAILY' | 'WEEKLY' | 'ACHIEVEMENT' | 'EVENT';
export type QuestMetricValue = 'DISCOVERY' | 'BATTLE' | 'BATTLE_WIN' | 'ARENA_WIN' | 'SPEND';

export interface QuestProgressView {
  questId: string;
  code: string;
  nameTh: string;
  descriptionTh: string | null;
  type: QuestTypeValue;
  metric: QuestMetricValue;
  targetValue: number;
  currentValue: number;
  isCompleted: boolean;
  rewardClaimed: boolean;
  rewardAmount: number;
  periodKey: string;
}

export interface QuestBoard {
  daily: QuestProgressView[];
  weekly: QuestProgressView[];
  achievement: QuestProgressView[];
  event: QuestProgressView[];
  resets: { dailyAt: string; weeklyAt: string };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** คีย์งวดรายวัน เที่ยงคืนเวลาเซิร์ฟเวอร์ เช่น "2025-09-13" */
export function dailyPeriodKey(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** คีย์งวดรายสัปดาห์ วันจันทร์เป็นวันเริ่ม เช่น "2025-W37" (มาตรฐาน ISO week) */
export function weeklyPeriodKey(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = (d.getDay() + 6) % 7; // จ=0 .. อา=6
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum + 3);
  const weekOf = (thursdayOfTarget: Date): number => {
    const jan4 = new Date(thursdayOfTarget.getFullYear(), 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const weekOneThursday = new Date(jan4.getFullYear(), 0, 4 - jan4Day + 3);
    return Math.round((thursdayOfTarget.getTime() - weekOneThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  };
  let week = weekOf(thursday);
  let year = thursday.getFullYear();
  if (week < 1) {
    // สัปดาห์แรกยังไม่เริ่ม → เป็นสัปดาห์ท้ายของปีก่อน
    year -= 1;
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const weekOneThursday = new Date(year, 0, 4 - jan4Day + 3);
    week = Math.round((thursday.getTime() - weekOneThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  } else if (week > 52) {
    // ตรวจว่าเป็นสัปดาห์แรกของปีถัดไปหรือไม่ (เช่น 29 ธ.ค. ปีที่ Jan 1 ตกวันพฤหัส)
    const nextJan4 = new Date(year + 1, 0, 4);
    const nextDay = (nextJan4.getDay() + 6) % 7;
    const nextWeekOneThursday = new Date(year + 1, 0, 4 - nextDay + 3);
    if (nextWeekOneThursday.getTime() === thursday.getTime()) {
      year += 1;
      week = 1;
    }
  }
  return `${year}-W${pad(week)}`;
}

/** คีย์งวดตามประเภทเควส */
export function periodKeyFor(type: QuestTypeValue, now: Date): string {
  if (type === 'DAILY') return dailyPeriodKey(now);
  if (type === 'WEEKLY') return weeklyPeriodKey(now);
  return 'ALL';
}

/** เวลารีเซ็ตงวดถัดไป (ISO string) */
export function nextResets(now: Date): { dailyAt: string; weeklyAt: string } {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffToMonday = (d.getDay() || 7) - 1;
  const nextMonday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - diffToMonday), 0, 0, 0, 0);
  return { dailyAt: nextMidnight.toISOString(), weeklyAt: nextMonday.toISOString() };
}

function questWhereActive(now: Date) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: now } }] },
      { OR: [{ endDate: null }, { endDate: { gte: now } }] },
    ],
  };
}

function toView(
  quest: {
    id: string; code: string; nameTh: string; descriptionTh: string | null;
    type: string; metric: string; targetValue: number; rewardAmount: number;
  },
  progress: { currentValue: number; isCompleted: boolean; rewardClaimed: boolean } | null,
  periodKey: string
): QuestProgressView {
  const currentValue = progress?.currentValue ?? 0;
  return {
    questId: quest.id,
    code: quest.code,
    nameTh: quest.nameTh,
    descriptionTh: quest.descriptionTh,
    type: quest.type as QuestTypeValue,
    metric: quest.metric as QuestMetricValue,
    targetValue: quest.targetValue,
    currentValue: Math.min(currentValue, quest.targetValue),
    isCompleted: progress?.isCompleted ?? false,
    rewardClaimed: progress?.rewardClaimed ?? false,
    rewardAmount: quest.rewardAmount,
    periodKey,
  };
}


export class QuestService {
  /** บอร์ดเควสของผู้เล่น (งวดปัจจุบันทั้งหมด) */
  static async getBoard(userId: string, now: Date = new Date()): Promise<QuestBoard> {
    const quests = await prisma.quest.findMany({ where: questWhereActive(now) });
    const keys = new Map<string, string>();
    for (const q of quests) keys.set(q.id, periodKeyFor(q.type as QuestTypeValue, now));

    const progresses = await prisma.questProgress.findMany({
      where: { userId, periodKey: { in: Array.from(new Set(keys.values())) } },
    });
    const byQuest = new Map(progresses.map((p) => [p.questId, p]));

    const board: QuestBoard = { daily: [], weekly: [], achievement: [], event: [], resets: nextResets(now) };
    for (const q of quests) {
      const key = keys.get(q.id) as string;
      const view = toView(q, byQuest.get(q.id) ?? null, key);
      if (q.type === 'DAILY') board.daily.push(view);
      else if (q.type === 'WEEKLY') board.weekly.push(view);
      else if (q.type === 'ACHIEVEMENT') board.achievement.push(view);
      else board.event.push(view);
    }
    return board;
  }

  /**
   * บันทึกความคืบหน้าจากเหตุการณ์ในเกม (เรียกจาก hook ของระบบอื่น ควร try/catch ที่ caller)
   */
  static async recordEvent(
    userId: string,
    metric: QuestMetricValue,
    amount = 1,
    now: Date = new Date()
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) return;
    const quests = await prisma.quest.findMany({
      where: { ...questWhereActive(now), metric },
    });
    for (const q of quests) {
      const key = periodKeyFor(q.type as QuestTypeValue, now);
      const uniqueKey = { questId_userId_periodKey: { questId: q.id, userId, periodKey: key } };
      const existing = await prisma.questProgress.findUnique({ where: uniqueKey });
      if (!existing) {
        await prisma.questProgress.create({
          data: {
            questId: q.id,
            userId,
            periodKey: key,
            currentValue: amount,
            isCompleted: amount >= q.targetValue,
            completedAt: amount >= q.targetValue ? now : null,
          },
        });
        continue;
      }
      if (existing.isCompleted) continue; // ทำเกินเป้าไม่ต้องนับเพิ่ม
      const nextValue = existing.currentValue + amount;
      const completed = nextValue >= q.targetValue;
      await prisma.questProgress.update({
        where: { id: existing.id },
        data: {
          currentValue: nextValue,
          isCompleted: completed,
          completedAt: completed ? now : null,
        },
      });
    }
  }

  /**
   * เคลมรางวัล — Idempotent: ล็อกสิทธิ์ด้วย updateMany(rewardClaimed=false)
   * และคุ้มกันซ้ำอีกชั้นด้วย idempotencyKey ของกระเป๋า
   */
  static async claim(
    userId: string,
    questId: string,
    now: Date = new Date()
  ): Promise<{ claimed: boolean; rewardAmount: number; message: string }> {
    const quest = await prisma.quest.findUnique({ where: { id: questId } });
    if (!quest || !quest.isActive) {
      return { claimed: false, rewardAmount: 0, message: 'ไม่พบภารกิจนี้' };
    }

    const key = periodKeyFor(quest.type as QuestTypeValue, now);
    const progress = await prisma.questProgress.findUnique({
      where: { questId_userId_periodKey: { questId, userId, periodKey: key } },
    });
    if (!progress || !progress.isCompleted) {
      return { claimed: false, rewardAmount: 0, message: 'ยังทำภารกิจไม่สำเร็จ' };
    }
    if (progress.rewardClaimed) {
      return { claimed: false, rewardAmount: 0, message: 'รับรางวัลนี้ไปแล้ว' };
    }

    // ล็อกสิทธิ์เคลม (กัน race) — สำเร็จเมื่ออัปเดตได้แถวเดียว
    const locked = await prisma.questProgress.updateMany({
      where: { id: progress.id, rewardClaimed: false },
      data: { rewardClaimed: true },
    });
    if (locked.count !== 1) {
      return { claimed: false, rewardAmount: 0, message: 'รับรางวัลนี้ไปแล้ว' };
    }

    const idempotencyKey = `quest-claim:${quest.id}:${userId}:${key}`;
    await WalletService.credit(
      userId,
      quest.rewardAmount,
      'REWARD',
      quest.id,
      'QUEST_REWARD',
      `รางวัลภารกิจ ${quest.nameTh}`,
      idempotencyKey
    );

    return { claimed: true, rewardAmount: quest.rewardAmount, message: 'รับรางวัลสำเร็จ' };
  }
}

