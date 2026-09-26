// Notification Service — Phase 20
//
// ผู้ใช้สั่ง 2026-09-26: "ทำระบบแจ้งเตือนต่างๆ เช่นทำรูปเสร็จ, ต่อสู้จบ รายงานผล หรือประกาศต่างๆ
// สำหรับของแต่ละ User"
//
// หลักการ
//  - 1 แถว = 1 การแจ้งเตือนของ 1 ผู้เล่น (ตาราง notifications) → อ่าน/อ่านแล้ว/นับ unread ต่อ user
//  - เก็บข้อความสองภาษา (titleTh/titleEn) แล้วให้ API เลือกตาม User.locale ⇒ สลับภาษาได้ทีหลัง
//  - เคารพค่าที่ผู้เล่นเลือก (notifyPrefs) — ประเภทที่ปิดไว้จะไม่ถูกสร้างตั้งแต่ต้น
//  - ทุกฟังก์ชันกลืน error แล้ว log (การแจ้งเตือนต้องไม่ทำให้ธุรกรรมหลักอย่างการต่อสู้ล้ม)
import { prisma } from '@/lib/prisma';
import { t, normalizeLocale, type Locale } from '@/lib/i18n';
import { parseNotifyPrefs, wantsNotification, type NotificationKind } from '@/lib/notification-prefs';

export interface NotificationMessage {
  type: NotificationKind;
  titleKey: string;
  bodyKey: string;
  vars?: Record<string, string | number>;
  href?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  icon: string | null;
  isRead: boolean;
  createdAt: string;
}

/** สร้างข้อความสองภาษาจาก key เดียว (ใช้ตอนสร้างแถว) */
export function buildLocalized(message: NotificationMessage): {
  titleTh: string; titleEn: string; bodyTh: string; bodyEn: string;
} {
  return {
    titleTh: t('th', message.titleKey, message.vars),
    titleEn: t('en', message.titleKey, message.vars),
    bodyTh: t('th', message.bodyKey, message.vars),
    bodyEn: t('en', message.bodyKey, message.vars),
  };
}

/** เลือกภาษาเดียวจากแถวที่เก็บสองภาษา */
export function pickLocalized(
  row: { titleTh: string; titleEn: string; bodyTh: string; bodyEn: string },
  locale: Locale
): { title: string; body: string } {
  const useEn = normalizeLocale(locale) === 'en';
  return { title: useEn ? row.titleEn : row.titleTh, body: useEn ? row.bodyEn : row.bodyTh };
}

const MAX_OWNER_FANOUT = 50; // การ์ดหนึ่งใบมีเจ้าของได้หลายคน แต่ไม่ควรยิงไม่จำกัด

export class NotificationService {
  /** สร้างการแจ้งเตือน 1 ใบ (ข้ามถ้าผู้เล่นปิดประเภทนั้นไว้) */
  static async create(userId: string, message: NotificationMessage): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, notifyPrefs: true },
      });
      if (!user) return false;
      if (!wantsNotification(parseNotifyPrefs(user.notifyPrefs), message.type)) return false;

      const text = buildLocalized(message);
      await prisma.notification.create({
        data: {
          userId,
          type: message.type,
          ...text,
          href: message.href ?? null,
          icon: message.icon ?? null,
          metadata: (message.metadata ?? undefined) as never,
        },
      });
      return true;
    } catch (error) {
      console.error('NotificationService.create error:', error);
      return false;
    }
  }

  /** สร้างให้หลายผู้เล่นพร้อมกัน (คืนจำนวนที่สร้างจริง) */
  static async createMany(userIds: string[], message: NotificationMessage): Promise<number> {
    let created = 0;
    for (const userId of [...new Set(userIds)].slice(0, MAX_OWNER_FANOUT)) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.create(userId, message)) created += 1;
    }
    return created;
  }

  /** เจ้าของการ์ดใบนี้ทั้งหมด (ใช้ยิงแจ้งเตือนตอนภาพเสร็จ) */
  private static async cardOwners(cardId: string): Promise<string[]> {
    const owners = await prisma.userCard.findMany({
      where: { cardId },
      select: { userId: true },
      take: MAX_OWNER_FANOUT,
    });
    return owners.map((o) => o.userId);
  }

  /** แจ้งเจ้าของการ์ดทุกคนว่าภาพสร้างเสร็จแล้ว */
  static async notifyImageReady(cardId: string, cardNameTh: string): Promise<number> {
    try {
      return await this.createMany(await this.cardOwners(cardId), {
        type: 'IMAGE_READY',
        titleKey: 'notify.imageReadyTitle',
        bodyKey: 'notify.imageReadyBody',
        vars: { name: cardNameTh },
        href: `/cards/${cardId}`,
        icon: '🎨',
      });
    } catch (error) {
      console.error('notifyImageReady error:', error);
      return 0;
    }
  }

  /** แจ้งเจ้าของการ์ดว่าสร้างภาพไม่สำเร็จ (หลังลองครบแล้ว) */
  static async notifyImageFailed(cardId: string, cardNameTh: string): Promise<number> {
    try {
      return await this.createMany(await this.cardOwners(cardId), {
        type: 'IMAGE_FAILED',
        titleKey: 'notify.imageFailedTitle',
        bodyKey: 'notify.imageFailedBody',
        vars: { name: cardNameTh },
        href: `/cards/${cardId}`,
        icon: '⚠️',
      });
    } catch (error) {
      console.error('notifyImageFailed error:', error);
      return 0;
    }
  }

  /**
   * แจ้งผลการต่อสู้
   *  - ผู้โจมตี: สรุปผลของตัวเอง (ชนะ/แพ้/เสมอ + จำนวนรอบ + Coin)
   *  - ผู้ป้องกัน (ถ้าเป็นการท้าจริง): บอกว่ามีคนส่งทีมมาท้า และผลออกมาเป็นอย่างไร
   */
  static async notifyBattleResult(params: {
    attackerId: string;
    defenderId?: string | null;
    winnerId?: string | null;
    roundsPlayed: number;
    hpRemaining: number;
    rewardCoins?: number;
    battleId: string;
  }): Promise<void> {
    const { attackerId, defenderId, winnerId, battleId } = params;
    const isDraw = !winnerId;
    const attackerWon = winnerId === attackerId;

    await this.create(attackerId, {
      type: 'BATTLE_RESULT',
      titleKey: isDraw ? 'notify.battleDrawTitle' : attackerWon ? 'notify.battleWinTitle' : 'notify.battleLoseTitle',
      bodyKey: 'notify.battleBody',
      vars: {
        rounds: params.roundsPlayed,
        hp: Math.max(0, Math.round(params.hpRemaining)),
        coins: Math.max(0, Math.round(params.rewardCoins ?? 0)),
      },
      href: `/battle/${battleId}`,
      icon: '⚔️',
      metadata: { battleId, winnerId: winnerId ?? null },
    });

    if (defenderId && defenderId !== attackerId) {
      const resultTh = isDraw ? 'เสมอ' : attackerWon ? 'ทีมของคุณแพ้' : 'ทีมของคุณชนะ';
      await this.create(defenderId, {
        type: 'BATTLE_RESULT',
        titleKey: 'notify.battleDefenderBody',
        bodyKey: 'notify.battleDefenderBody',
        vars: { result: resultTh },
        href: `/battle/${battleId}`,
        icon: '🛡️',
        metadata: { battleId, winnerId: winnerId ?? null },
      });
    }
  }

  /** แจ้งเจ้าของห้องว่ามีผู้เล่นส่งทีมเข้าห้อง */
  static async notifyArenaChallenge(params: {
    hostId: string;
    challengerName: string;
    roomName: string;
    roomId: string;
  }): Promise<void> {
    await this.create(params.hostId, {
      type: 'ARENA_RESULT',
      titleKey: 'notify.arenaChallengeTitle',
      bodyKey: 'notify.arenaChallengeBody',
      vars: { name: params.challengerName, room: params.roomName },
      href: `/arena/${params.roomId}`,
      icon: '🏟️',
      metadata: { roomId: params.roomId },
    });
  }

  /** แจ้งแชมป์อารีน่าว่าได้รับรางวัลแล้ว */
  static async notifyArenaChampion(params: {
    userId: string;
    roomName: string;
    roomId: string;
    coins: number;
  }): Promise<void> {
    await this.create(params.userId, {
      type: 'ARENA_RESULT',
      titleKey: 'notify.arenaChampionTitle',
      bodyKey: 'notify.arenaChampionBody',
      vars: { room: params.roomName, coins: params.coins },
      href: `/arena/${params.roomId}`,
      icon: '🏆',
      metadata: { roomId: params.roomId, coins: params.coins },
    });
  }

  /** ถึงเป้าคะแนนกิจกรรม (Milestone) */
  static async notifyEventMilestone(params: {
    userId: string;
    points: number;
    eventId?: string;
  }): Promise<void> {
    await this.create(params.userId, {
      type: 'EVENT',
      titleKey: 'notify.eventMilestoneTitle',
      bodyKey: 'notify.eventMilestoneBody',
      vars: { points: params.points },
      href: params.eventId ? `/events/${params.eventId}` : '/events',
      icon: '🌙',
    });
  }

  /**
   * ประกาศจากทีมงาน → fan-out เป็นการแจ้งเตือน "ของแต่ละ user"
   * (คืนจำนวนผู้เล่นที่ได้รับการแจ้งเตือนจริง — ผู้ที่ปิดประกาศไว้จะไม่ได้รับ)
   */
  static async announce(params: {
    titleTh: string; titleEn: string; bodyTh: string; bodyEn: string;
    href?: string | null;
    createdBy?: string | null;
  }): Promise<{ announcementId: string; recipients: number }> {
    const announcement = await prisma.announcement.create({
      data: {
        titleTh: params.titleTh,
        titleEn: params.titleEn,
        bodyTh: params.bodyTh,
        bodyEn: params.bodyEn,
        href: params.href ?? null,
        createdBy: params.createdBy ?? null,
      },
      select: { id: true },
    });

    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, notifyPrefs: true },
    });

    let recipients = 0;
    for (const user of users) {
      if (!wantsNotification(parseNotifyPrefs(user.notifyPrefs), 'ANNOUNCEMENT')) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'ANNOUNCEMENT',
            titleTh: params.titleTh,
            titleEn: params.titleEn,
            bodyTh: params.bodyTh,
            bodyEn: params.bodyEn,
            href: params.href ?? null,
            icon: '📣',
            metadata: { announcementId: announcement.id } as never,
          },
        });
        recipients += 1;
      } catch (error) {
        console.error('announce fan-out error:', error);
      }
    }

    await prisma.announcement.update({ where: { id: announcement.id }, data: { recipients } });
    return { announcementId: announcement.id, recipients };
  }

  /** รายการแจ้งเตือนของผู้เล่น (แปลตามภาษาที่ผู้เล่นเลือกไว้) */
  static async list(
    userId: string,
    options: { filter?: 'all' | 'unread'; limit?: number } = {}
  ): Promise<{ items: NotificationView[]; unreadCount: number }> {
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 30)));
    const where = { userId, ...(options.filter === 'unread' ? { isRead: false } : {}) };

    const [user, rows, unreadCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { locale: true } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, type: true, titleTh: true, titleEn: true, bodyTh: true, bodyEn: true,
          href: true, icon: true, isRead: true, createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const locale = normalizeLocale(user?.locale);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        ...pickLocalized(row, locale),
        href: row.href,
        icon: row.icon,
        isRead: row.isRead,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount,
    };
  }

  static async unreadCount(userId: string): Promise<number> {
    try {
      return await prisma.notification.count({ where: { userId, isRead: false } });
    } catch {
      return 0;
    }
  }

  /** อ่านแล้ว (ระบุ ids หรือไม่ระบุ = อ่านทั้งหมด) */
  static async markRead(userId: string, ids?: string[]): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        ...(ids && ids.length > 0 ? { id: { in: ids.slice(0, 200) } } : {}),
      },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }
}
