import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MapFarmService } from '@/services/map-farm';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/map/refill — เติม Stamina ด้วยพลังค้นหา { points } (1 จุด → +20)
const bodySchema = z.object({ points: z.number().int().min(1).max(5).optional() });

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    const points = parsed.success ? parsed.data.points : undefined;

    const result = await MapFarmService.refill(userId, points ?? 1);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เติม Stamina ไม่สำเร็จ';
    const status = /พลังค้นหา|ไม่พอ|ไม่พบ/.test(message) ? 400 : 500;
    if (status === 500) console.error('Map refill error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}