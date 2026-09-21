// GET /api/events — กิจกรรมที่กำลังเปิด (Event Hub data)
// ยึด session cookie สำหรับข้อมูลส่วนตัว (veil shards / milestones / raid วันนี้)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EventService } from '@/services/event';
import { bossPhaseDef, bossPhaseForHp } from '@/services/event-boss';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('userId');
    const userId = await resolveRequestUserId(request, param);

    const event = await EventService.getActiveEvent();
    if (!event) {
      return NextResponse.json({ success: true, data: null, message: 'ยังไม่มีกิจกรรมที่เปิดอยู่' });
    }

    const boss = event.bosses[0] ?? null;
    const now = new Date();
    const msLeft = Math.max(0, event.endDate.getTime() - now.getTime());

    let me: {
      veilShards: number;
      eventPoints: number;
      damageDealt: number;
      raidsToday: number;
      raidDailyCap: number;
    } | null = null;

    if (userId) {
      const participation = await prisma.eventParticipation.findUnique({
        where: { eventId_userId: { eventId: event.id, userId } },
      });
      const raidsToday = await EventService.countTodayRaids(userId, event.id);
      me = {
        veilShards: participation ? participation.currencyEarned - participation.currencySpent : 0,
        eventPoints: participation?.eventPoints ?? 0,
        damageDealt: participation?.damageDealt ?? 0,
        raidsToday,
        raidDailyCap: 10,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        id: event.id,
        name: event.name,
        nameTh: event.nameTh,
        descriptionTh: event.descriptionTh,
        status: event.status,
        currencyName: event.currencyName,
        startDate: event.startDate,
        endDate: event.endDate,
        gracePeriodEnd: event.gracePeriodEnd,
        msLeft,
        boss: boss
          ? {
              id: boss.id,
              name: boss.name,
              nameTh: boss.nameTh,
              maxHp: boss.maxHp,
              currentHp: boss.currentHp,
              percent: boss.maxHp > 0 ? Math.round((boss.currentHp / boss.maxHp) * 100) : 0,
              isDefeated: boss.isDefeated,
              phase: bossPhaseForHp(boss.currentHp, boss.maxHp),
              phaseNameTh: bossPhaseDef(bossPhaseForHp(boss.currentHp, boss.maxHp)).nameTh,
            }
          : null,
        community: event.community
          ? { totalDamage: event.community.totalDamage, participantCount: event.community.participantCount }
          : { totalDamage: 0, participantCount: 0 },
        quests: await prisma.eventQuest.findMany({
          where: { eventId: event.id, isActive: true },
          orderBy: { type: 'asc' },
        }),
        shopItems: await prisma.eventShopItem.findMany({
          where: { eventId: event.id, isActive: true },
          orderBy: { price: 'asc' },
        }),
        me,
      },
    });
  } catch (error) {
    console.error('Get events error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
