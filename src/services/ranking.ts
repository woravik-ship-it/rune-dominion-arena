// Ranking Service (Phase 28) — สร้างตารางจัดอันดับผู้เล่นจากข้อมูลจริงใน DB
//
// ผู้ใช้สั่ง 2026-09-27: "ทำตาราง Ranking ผู้เล่น ให้ด้วย"
//  - 5 หมวด: พลังทีม (บวก Item) · คะแนนสะสมการ์ด (rarity × จำนวน) · ชนะศึก · คะแนนกิจกรรม · Coin
//  - คิดอันดับแบบ "การแข่งขัน" (ค่าเท่ากัน = อันดับเท่ากัน) ผ่าน src/lib/ranking.ts
//  - คืน "อันดับของฉัน" เสมอ แม้ไม่อยู่ใน top ที่แสดง (ให้ผู้เล่นเห็นว่าตัวเองอยู่อันดับไหน)
import { prisma } from '@/lib/prisma';
import { ItemService } from '@/services/item';
import { levelProgress } from '@/lib/level';
import {
  assignRanks,
  collectionScore,
  normalizeCategory,
  rankOfValue,
  topEntries,
  type RankingCategory,
} from '@/lib/ranking';

export interface RankingRow {
  userId: string;
  value: number;
  /** ข้อมูลรอง (เช่น จำนวนใบ · จำนวนศึก · ดาเมจ) */
  secondary?: number;
  secondaryLabel?: 'cards' | 'battles' | 'damage' | 'dungeons' | 'level';
}

export interface RankingEntry {
  rank: number;
  userId: string;
  name: string;
  username: string;
  avatarEmoji: string | null;
  avatarGrid: string | null;
  value: number;
  secondary?: number;
  secondaryLabel?: RankingRow['secondaryLabel'];
  isMe: boolean;
}

export interface RankingBoard {
  category: RankingCategory;
  entries: RankingEntry[];
  /** อันดับของผู้เล่นที่ขอ (null = ยังไม่มีข้อมูลในหมวดนี้) */
  me: { rank: number; value: number; total: number } | null;
  /** จำนวนผู้เล่นที่มีข้อมูลในหมวดนี้ */
  total: number;
  limit: number;
}

export class RankingService {
  /**
   * ดึงข้อมูลดิบของแต่ละหมวด → เรียงมากไปน้อย → ตัดอันดับ
   * ทุกหมวดใช้โครงเดียวกัน (rows → sort → rank) ⇒ พฤติกรรมสม่ำเสมอ
   */
  private static async rowsFor(category: RankingCategory): Promise<RankingRow[]> {
    switch (category) {
      case 'power': {
        // พลังทีม = ผลรวม (atk+def+hp+spd) ของการ์ดในเด็ค + Status จาก Item ที่ใส่ (Phase 25)
        const decks = await prisma.deck.findMany({
          include: { slots: { include: { card: true } } },
        });
        const bestByUser = new Map<string, number>();
        for (const deck of decks) {
          if (deck.slots.length === 0) continue;
          // eslint-disable-next-line no-await-in-loop
          const bonuses = await ItemService.statsByCardIds(
            deck.userId,
            deck.slots.map((slot) => slot.cardId)
          );
          const power = deck.slots.reduce((sum, slot) => {
            const bonus = bonuses.get(slot.cardId);
            return (
              sum +
              slot.card.atk + (bonus?.atk ?? 0) +
              slot.card.def + (bonus?.def ?? 0) +
              slot.card.hp + (bonus?.hp ?? 0) +
              slot.card.spd + (bonus?.spd ?? 0)
            );
          }, 0);
          const current = bestByUser.get(deck.userId) ?? 0;
          if (power > current) bestByUser.set(deck.userId, power);
        }
        return [...bestByUser.entries()].map(([userId, value]) => ({ userId, value }));
      }

      case 'collection': {
        const cards = await prisma.userCard.findMany({
          include: { card: { select: { rarity: true } } },
        });
        const byUser = new Map<string, Array<{ rarity: string; quantity: number }>>();
        for (const row of cards) {
          const list = byUser.get(row.userId) ?? [];
          list.push({ rarity: row.card.rarity, quantity: row.quantity });
          byUser.set(row.userId, list);
        }
        return [...byUser.entries()].map(([userId, list]) => ({
          userId,
          value: collectionScore(list),
          secondary: list.reduce((sum, item) => sum + item.quantity, 0),
          secondaryLabel: 'cards' as const,
        }));
      }

      case 'wins': {
        const [won, played] = await Promise.all([
          prisma.battleLog.groupBy({
            by: ['winnerId'],
            where: { winnerId: { not: null } },
            _count: { _all: true },
          }),
          prisma.battleLog.groupBy({ by: ['attackerId'], _count: { _all: true } }),
        ]);
        const playedByUser = new Map(played.map((row) => [row.attackerId, row._count._all]));
        return won
          .filter((row): row is typeof row & { winnerId: string } => Boolean(row.winnerId))
          .map((row) => ({
            userId: row.winnerId,
            value: row._count._all,
            secondary: playedByUser.get(row.winnerId) ?? row._count._all,
            secondaryLabel: 'battles' as const,
          }));
      }

      case 'event': {
        const rows = await prisma.eventParticipation.groupBy({
          by: ['userId'],
          _sum: { eventPoints: true, damageDealt: true },
        });
        return rows
          .map((row) => ({
            userId: row.userId,
            value: row._sum.eventPoints ?? 0,
            secondary: row._sum.damageDealt ?? 0,
            secondaryLabel: 'damage' as const,
          }))
          .filter((row) => row.value > 0);
      }

      case 'level': {
        // Phase 33: อันดับเลเวล (EXP) — เลเวลคำนวณจาก exp ตอนแสดงผล
        const users = await prisma.user.findMany({ select: { id: true, exp: true } });
        // เรียงด้วย exp (ละเอียดที่สุด) แล้วโชว์เลเวลเป็นข้อมูลรอง
        return users
          .filter((row) => row.exp > 0)
          .map((row) => ({
            userId: row.id,
            value: row.exp,
            secondary: levelProgress(row.exp).level,
            secondaryLabel: 'level' as const,
          }));
      }

      case 'dungeon': {
        // Phase 33: อันดับดันเจี้ยน — ผลรวมชั้นสูงสุดที่ผ่านทุกดัน (ตัวรอง = ดันที่ผ่านอย่างน้อย 1 ชั้น)
        const rows = await prisma.dungeonProgress.groupBy({
          by: ['userId'],
          _sum: { bestFloor: true },
          _count: { _all: true },
        });
        return rows
          .map((row) => ({
            userId: row.userId,
            value: row._sum.bestFloor ?? 0,
            secondary: row._count._all,
            secondaryLabel: 'dungeons' as const,
          }))
          .filter((row) => row.value > 0);
      }

      case 'coin':
      default: {
        const wallets = await prisma.wallet.findMany({ select: { userId: true, balance: true } });
        return wallets.map((row) => ({ userId: row.userId, value: row.balance }));
      }
    }
  }

  /** ตารางจัดอันดับของหมวดหนึ่ง (พร้อมอันดับของฉัน) */
  static async board(
    categoryInput: unknown,
    options: { userId?: string | null; limit?: number } = {}
  ): Promise<RankingBoard> {
    const category = normalizeCategory(categoryInput);
    const limit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 50)));

    const rows = (await this.rowsFor(category))
      .filter((row) => Number.isFinite(row.value) && row.value > 0)
      .sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId));

    const total = rows.length;
    const allValues = rows.map((row) => row.value);
    const allRanks = assignRanks(allValues);

    const top = topEntries(rows, limit);
    const myIndex = options.userId ? rows.findIndex((row) => row.userId === options.userId) : -1;
    const myRow = myIndex >= 0 ? rows[myIndex] : null;

    const neededIds = [...new Set([...top.map((row) => row.userId), ...(myRow ? [myRow.userId] : [])])];
    const users = neededIds.length
      ? await prisma.user.findMany({
          where: { id: { in: neededIds } },
          select: {
            id: true, username: true, displayName: true, avatarEmoji: true, avatarGrid: true,
          },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    const toEntry = (row: RankingRow, rank: number): RankingEntry => {
      const user = userById.get(row.userId);
      return {
        rank,
        userId: row.userId,
        name: user?.displayName || user?.username || 'ผู้เล่น',
        username: user?.username ?? '',
        avatarEmoji: user?.avatarEmoji ?? null,
        avatarGrid: user?.avatarGrid ?? null,
        value: row.value,
        secondary: row.secondary,
        secondaryLabel: row.secondaryLabel,
        isMe: row.userId === options.userId,
      };
    };

    const entries = top.map((row, index) => toEntry(row, allRanks[index] ?? index + 1));

    return {
      category,
      entries,
      me: myRow ? { rank: allRanks[myIndex] ?? total, value: myRow.value, total } : null,
      total,
      limit,
    };
  }
}

