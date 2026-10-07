import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ItemService } from '@/services/item';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/items/sell — ขาย Item คืนร้าน ได้วัตถุดิบกลับมา 50% (Phase 32)
//
// ผู้ใช้สั่ง 2026-09-27: "เพิ่มระบบขาย Item ได้วัตถุดิบกลับมา 50%"
//  - คืน Veil Shards + ฝุ่นเวท อย่างละ 50% ของสูตรคราฟต์ (ปัดลง) — สูตรอยู่ใน lib/item-definitions (sellQuote)
//  - ของที่ "ใส่อยู่บนการ์ด" ขายไม่ได้ถ้าจะทำให้ของในคลังไม่พอใช้ (ต้องถอดก่อน)
//  - Phase 43 (ผู้ใช้สั่ง "ในกระเป๋าก็แยก Item"): ขายเป็น "กองตามระดับบวก" ด้วย `enhanceLevel`
// body: { code, quantity?, enhanceLevel? }
const bodySchema = z.object({
  code: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(99).optional(),
  enhanceLevel: z.number().int().min(0).max(15).optional(),
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
      return NextResponse.json({ error: 'ต้องระบุ code ของ Item' }, { status: 400 });
    }

    const result = await ItemService.sell(
      userId,
      parsed.data.code,
      parsed.data.quantity ?? 1,
      parsed.data.enhanceLevel ?? 0
    );
    const levelSuffix = result.enhanceLevel > 0 ? ` +${result.enhanceLevel}` : '';
    return NextResponse.json({
      success: true,
      data: {
        ...result,
        message: `ขาย ${result.nameTh}${levelSuffix} ×${result.sold} คืนร้าน — ได้ 💠 ${result.refundShards} + ✨ ${result.refundDust} กลับมา`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ขาย Item ไม่สำเร็จ';
    const status = /ไม่พบ Item|ไม่พอ|ยังไม่มี|ไม่มีของ|ถอดออกก่อน/.test(message) ? 400 : 500;
    if (status === 500) console.error('Sell item error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
