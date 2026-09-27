import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ItemService } from '@/services/item';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/items/craft — คราฟต์ Item ด้วย Veil Shards + ฝุ่นเวท (Phase 25)
// body: { code }
const bodySchema = z.object({ code: z.string().min(1).max(60) });

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'ต้องระบุ code ของ Item' }, { status: 400 });
    }

    const result = await ItemService.craft(userId, parsed.data.code);
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message: `คราฟต์ ${result.nameTh} สำเร็จ (มีทั้งหมด ${result.quantity} ชิ้น)`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'คราฟต์ Item ไม่สำเร็จ';
    // Phase 39: คราฟต์ต้องใช้ Coin ด้วย ⇒ เงินไม่พอ = กติกาเกม (400) ไม่ใช่ข้อผิดพลาดเซิร์ฟเวอร์
    const status = /ไม่พบ Item|ไม่พอ|ไม่เพียงพอ|Coin|คราฟต์ไม่ได้|ฝุ่นเวท/.test(message) ? 400 : 500;
    if (status === 500) console.error('Craft item error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
