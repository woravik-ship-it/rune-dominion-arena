// POST /api/events/[id]/raid — เข้า Boss Raid (หัก 10 Veil Shards / 10 ครั้งต่อวัน)
// body: { bossId, deckId, idempotencyKey? }
// ดาเมจคำนวณจาก combat engine จริง (5v1) ฝั่ง server — client ส่งได้แค่ความตั้งใจ
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EventService } from '@/services/event';
import { EventQuestService } from '@/services/event-quest';
import { assertDeckOwner, simulateRaid } from '@/services/event-raid-engine';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';
import { z } from 'zod';

const raidSchema = z.object({
  bossId: z.string().min(1, 'ต้องระบุ bossId'),
  deckId: z.string().min(1, 'ต้องระบุ deckId'),
  idempotencyKey: z.string().min(1).max(100).optional(),
  turn: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = raidSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const userId = await resolveRequestUserId(request, null);
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const rl = enforceRateLimit(request, 'ARENA_CHALLENGE', { userId });
    if (rl) return rl;

    await assertDeckOwner(parsed.data.deckId, userId);

    const boss = await prisma.eventBoss.findUnique({ where: { id: parsed.data.bossId } });
    if (!boss) return NextResponse.json({ error: 'ไม่พบบอสของกิจกรรม' }, { status: 404 });

    // รันการต่อสู้จริงด้วย combat engine (deterministic จาก seed ของ attempt)
    const attemptKey = parsed.data.idempotencyKey ?? `${params.id}-${userId}-${Date.now()}`;
    const sim = await simulateRaid({
      bossId: boss.id,
      bossNameTh: boss.nameTh,
      bossCurrentHp: boss.currentHp,
      bossMaxHp: boss.maxHp,
      deckId: parsed.data.deckId,
      attemptKey,
    });

    const result = await EventService.raid({
      eventId: params.id,
      bossId: parsed.data.bossId,
      userId,
      deckId: parsed.data.deckId,
      idempotencyKey: parsed.data.idempotencyKey,
      baseDamage: sim.damage,
      elementsUsed: sim.elementsUsed,
      won: sim.won,
      turn: parsed.data.turn ?? sim.roundsPlayed,
    });

    // Hook: นับความคืบหน้า Event Quest จากเหตุการณ์จริง (ไม่กระทบ flow หลักถ้าพลาด)
    try {
      await EventQuestService.recordRaidEvent(userId, params.id, {
        addRaid: 1,
        addDamage: result.damageDealt,
        addShards: result.shardsEarned,
      });
    } catch (questError) {
      console.error('Event quest hook error:', questError);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        simulation: {
          won: sim.won,
          roundsPlayed: sim.roundsPlayed,
          teamHpRemaining: sim.teamHpRemaining,
          bossTeamHpRemaining: sim.bossHpRemaining,
          seed: sim.seed,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์';
    const known = [
      'ไม่พบกิจกรรม', 'กิจกรรมยังไม่เริ่ม', 'กิจกรรมสิ้นสุดแล้ว', 'ไม่พบบอสของกิจกรรม',
      'บอสถูกปราบแล้ว', 'Veil Shards ไม่พอ', 'เด็คต้องมี 5 ใบ', 'เด็คไม่ถูกต้อง',
    ].some((m) => message.startsWith(m));
    if (known) return NextResponse.json({ error: message }, { status: 400 });
    if (message.startsWith('เข้า Raid ได้ไม่เกิน')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    console.error('Event raid error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}

