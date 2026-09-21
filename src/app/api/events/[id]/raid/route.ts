// POST /api/events/[id]/raid — เข้า Boss Raid (หัก 10 Veil Shards / 10 ครั้งต่อวัน)
// body: { bossId, deckId, idempotencyKey? } — userId มาจาก session
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EventService } from '@/services/event';
import { enforceRateLimit } from '@/lib/api-guard';
import { resolveRequestUserId } from '@/lib/current-user';
import { z } from 'zod';
import { ElementValue } from '@/services/event-boss';

const raidSchema = z.object({
  bossId: z.string().min(1, 'ต้องระบุ bossId'),
  deckId: z.string().min(1, 'ต้องระบุ deckId'),
  idempotencyKey: z.string().min(1).max(100).optional(),
  // ค่าที่ client ส่งได้มีแค่ "ความตั้งใจ" — ดาเมจจริงคำนวณฝั่ง server
  baseDamage: z.number().int().min(100).max(50_000).optional(),
  won: z.boolean().optional(),
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

    // ดาเมจฐานคำนวณจากเด็คจริง (server-side เท่านั้น) — ใช้พลังทีมเป็นตัวตั้ง
    const deck = await prisma.deck.findUnique({
      where: { id: parsed.data.deckId },
      include: { slots: { include: { card: true } }, user: true },
    });
    if (!deck || deck.userId !== userId) {
      return NextResponse.json({ error: 'เด็คไม่ถูกต้อง' }, { status: 400 });
    }
    const filled = deck.slots.filter((s) => s.card);
    if (filled.length < 5) {
      return NextResponse.json({ error: 'เด็คต้องมี 5 ใบ' }, { status: 400 });
    }

    // พลังโจมตีรวม → ดาเมจฐาน (mantissa คงที่ ต่อให้ client แก้ก็ไม่กระทบรางวัล)
    const teamAtk = filled.reduce((sum, s) => sum + s.card.atk, 0);
    const baseDamage = Math.max(1_000, teamAtk * 12);
    const elementsUsed = [...new Set(filled.map((s) => s.card.element))] as ElementValue[];
    const won = parsed.data.won ?? true;

    const result = await EventService.raid({
      eventId: params.id,
      bossId: parsed.data.bossId,
      userId,
      deckId: parsed.data.deckId,
      idempotencyKey: parsed.data.idempotencyKey,
      baseDamage,
      elementsUsed,
      won,
      turn: parsed.data.turn ?? 1,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์';
    const known = [
      'ไม่พบกิจกรรม', 'กิจกรรมยังไม่เริ่ม', 'กิจกรรมสิ้นสุดแล้ว', 'ไม่พบบอสของกิจกรรม',
      'บอสถูกปราบแล้ว', 'Veil Shards ไม่พอ',
    ].some((m) => message.startsWith(m));
    if (known) return NextResponse.json({ error: message }, { status: 400 });
    if (message.startsWith('เข้า Raid ได้ไม่เกิน')) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    console.error('Event raid error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
