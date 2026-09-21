// Seed กิจกรรม Phase 11 — สร้าง event "Call of the Moonless Gate" + boss + milestones + shop + story
// idempotent: รันซ้ำได้ ไม่สร้างซ้ำ (upsert ตาม unique key)
import { prisma } from '@/lib/prisma';
import { EVENT_DURATION_DAYS, RAID_BOSS_MAX_HP } from '@/services/event-boss';
import {
  COMMUNITY_MILESTONES,
  EVENT_QUESTS,
  PERSONAL_MILESTONES,
  SHOP_ITEMS,
  STORY_CHAPTERS,
} from '@/services/event-definitions';
import { EventService, graceEndFor } from '@/services/event';

export const EVENT_CODE = 'CALL_OF_THE_MOONLESS_GATE';

/** สร้าง/รีเฟรชข้อมูลกิจกรรม — คืน event พร้อม boss */
export async function seedEvent(now: Date = new Date()) {
  const startDate = new Date(now.getTime() - 60 * 60 * 1000); // เริ่มไปแล้ว 1 ชม.
  const endDate = new Date(startDate.getTime() + EVENT_DURATION_DAYS * 24 * 3600_000);

  const existing = await prisma.event.findFirst({ where: { name: EVENT_CODE } });

  const baseData = {
    nameTh: 'เสียงเรียกจากประตูไร้จันทร์',
    description: 'Call of the Moonless Gate',
    descriptionTh: 'รอยแยกธาตุ Shadow ปรากฏขึ้นทั่ว Aetherra — 14 วันแห่งการต่อสู้',
    eventType: 'SEASONAL' as const,
    startDate,
    endDate,
    gracePeriodEnd: graceEndFor(endDate),
    currencyName: 'Veil Shards',
  };

  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data: baseData })
    : await prisma.event.create({
        data: { name: EVENT_CODE, status: 'UPCOMING', ...baseData },
      });

  // Boss
  const bossName = 'Veil of the Moonless Gate';
  const boss = await prisma.eventBoss.findFirst({ where: { eventId: event.id, name: bossName } });
  const savedBoss = boss
    ? await prisma.eventBoss.update({
        where: { id: boss.id },
        data: { nameTh: 'ม่านประตูไร้จันทร์', maxHp: RAID_BOSS_MAX_HP },
      })
    : await prisma.eventBoss.create({
        data: {
          eventId: event.id,
          name: bossName,
          nameTh: 'ม่านประตูไร้จันทร์',
          maxHp: RAID_BOSS_MAX_HP,
          currentHp: RAID_BOSS_MAX_HP,
        },
      });
  return { event, boss: savedBoss, startDate, endDate };
}

/** สร้าง milestones / shop / story / quests ของ event (idempotent) */
export async function seedEventContent(eventId: string): Promise<void> {
  for (const m of [...PERSONAL_MILESTONES, ...COMMUNITY_MILESTONES]) {
    const data = {
      threshold: m.threshold,
      title: m.title,
      titleTh: m.titleTh,
      rewardType: m.rewardType,
      rewardAmount: m.rewardAmount,
      rewardLabel: m.rewardLabel ?? null,
    };
    await prisma.eventMilestone.upsert({
      where: { eventId_scope_tier: { eventId, scope: m.scope, tier: m.tier } },
      create: { eventId, scope: m.scope, tier: m.tier, ...data },
      update: data,
    });
  }

  for (const q of EVENT_QUESTS) {
    const dup = await prisma.eventQuest.findFirst({ where: { eventId, name: q.name } });
    const data = {
      nameTh: q.nameTh,
      descriptionTh: q.descriptionTh,
      type: q.type,
      targetValue: q.targetValue,
      rewardAmount: q.rewardAmount,
      currencyReward: q.currencyReward,
    };
    if (dup) {
      await prisma.eventQuest.update({ where: { id: dup.id }, data });
    } else {
      await prisma.eventQuest.create({ data: { eventId, name: q.name, ...data } });
    }
  }

  for (const s of SHOP_ITEMS) {
    const data = {
      name: s.name,
      nameTh: s.nameTh,
      descriptionTh: s.descriptionTh,
      price: s.price,
      rewardType: s.rewardType,
      rewardAmount: s.rewardAmount,
      perUserLimit: s.perUserLimit,
      isActive: true,
    };
    await prisma.eventShopItem.upsert({
      where: { eventId_code: { eventId, code: s.code } },
      create: { eventId, code: s.code, ...data },
      update: data,
    });
  }

  for (const c of STORY_CHAPTERS) {
    const data = {
      title: c.title,
      titleTh: c.titleTh,
      bodyTh: c.bodyTh,
      unlockAtDamage: c.unlockAtDamage,
    };
    await prisma.eventStoryChapter.upsert({
      where: { eventId_chapterNo: { eventId, chapterNo: c.chapterNo } },
      create: { eventId, chapterNo: c.chapterNo, ...data },
      update: data,
    });
  }

  await prisma.eventCommunityProgress.upsert({
    where: { eventId },
    create: { eventId },
    update: {},
  });
}

/** เรียกใช้จาก API/สคริปต์: seed ทั้ง event + เนื้อหา + sync สถานะ */
export async function seedFullEvent(now: Date = new Date()) {
  const { event, boss, startDate, endDate } = await seedEvent(now);
  await seedEventContent(event.id);
  await EventService.syncStatuses(now);
  const fresh = await prisma.event.findUnique({ where: { id: event.id } });
  return { event: fresh ?? event, boss, startDate, endDate };
}

async function main() {
  const { event, boss } = await seedFullEvent();
  console.log('✅ event seeded:', event.name, '| status:', event.status, '| boss HP:', boss.maxHp);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('seed event error:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
