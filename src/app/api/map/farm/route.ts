import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MapFarmService } from '@/services/map-farm';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/map/farm — เดินทางไปจุดถัดไป + สู้ (สุ่มศัตรู 1-5) + รับรางวัลเมื่อชนะ
// body: { deckId, nodeId, runId? } · ม้วนผลที่เซิร์ฟเวอร์
const bodySchema = z.object({
  deckId: z.string().min(1).max(60),
  nodeId: z.string().min(1).max(20),
  runId: z.string().min(1).max(80).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'ต้องระบุ deckId + nodeId' }, { status: 400 });
    }

    const result = await MapFarmService.farm(userId, parsed.data.deckId, parsed.data.nodeId, parsed.data.runId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ฟาร์มไม่สำเร็จ';
    // กติกาเกม (Stamina/เด็ค/จุด/พลัง) = 400 · ผิดพลาดจริง = 500
    const status = /Stamina|เด็ค|จุดนี้|พลังค้นหา|ไม่พอ|ไม่พบ/.test(message) ? 400 : 500;
    if (status === 500) console.error('Map farm error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}