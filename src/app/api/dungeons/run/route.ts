import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DungeonRuleError, runDungeon } from '@/services/dungeon';
import { DUNGEON_MAX_FLOOR } from '@/lib/dungeon-definitions';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/dungeons/run — ลุยดัน 1 ครั้ง { dungeonCode, floor, deckId, runId? }
const bodySchema = z.object({
  dungeonCode: z.string().min(1).max(40),
  floor: z.number().int().min(1).max(DUNGEON_MAX_FLOOR),
  deckId: z.string().min(1),
  runId: z.string().min(1).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });
    const rl = enforceRateLimit(request, 'BATTLE', { userId });
    if (rl) return rl;
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }
    const result = await runDungeon({ userId, ...parsed.data });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // กติกาเกม (ชั้นยังล็อก/ยังไม่ถึงเวลาฟรี/Coin ไม่พอ) → 400 พร้อมข้อความที่ผู้เล่นอ่านรู้เรื่อง
    const message = error instanceof Error ? error.message : 'ลุยดันเจี้ยนไม่สำเร็จ';
    const isRule = error instanceof DungeonRuleError
      || /ไม่พบ|ต้องผ่าน|ไม่พอ|Coin|เข้าฟรี|ปิดอยู่|เด็ค/.test(message);
    if (!isRule) console.error('Run dungeon error:', error);
    return NextResponse.json({ error: message }, { status: isRule ? 400 : 500 });
  }
}
