import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ItemService } from '@/services/item';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/items/buy — ซื้อ Item ด้วย Veil Shards (Phase 25)
// body: { code } · Item ที่ตั้ง buyCost = null จะซื้อไม่ได้ (ต้องคราฟต์)
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

    const result = await ItemService.buy(userId, parsed.data.code);
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message: `ซื้อ ${result.nameTh} สำเร็จ (มีทั้งหมด ${result.quantity} ชิ้น)`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ซื้อ Item ไม่สำเร็จ';
    const status = /ไม่พบ Item|ไม่พอ|ซื้อตรงไม่ได้/.test(message) ? 400 : 500;
    if (status === 500) console.error('Buy item error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
