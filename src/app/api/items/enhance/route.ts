import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ItemService } from '@/services/item';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/items/enhance — ตีบวก Item **ทีละชิ้น** (+0..+15)
// body: { itemCode, enhanceLevel }
//  - enhanceLevel = ระดับของ "กอง" ที่จะดึงชิ้นมาตีบวก (ผู้ใช้สั่ง 2026-10-04: ของ 1 ชิ้นได้บวก ไม่ใช่ทั้งกอง)
//  - ม้วนผลที่เซิร์ฟเวอร์ (randomInt) — client ส่งผล/ระดับใหม่มาไม่ได้
const bodySchema = z.object({
  itemCode: z.string().min(1).max(60),
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
      return NextResponse.json({ error: 'ต้องระบุ itemCode (และ enhanceLevel ของกอง)' }, { status: 400 });
    }

    const result = await ItemService.enhance(userId, parsed.data.itemCode, parsed.data.enhanceLevel ?? 0);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ตีบวก Item ไม่สำเร็จ';
    // ข้อผิดพลาดที่เป็นกติกาเกม (ของ/เงิน/วัสดุไม่พอ ฯลฯ) = 400 ไม่ใช่เซิร์ฟเวอร์ล่ม
    const status = /ไม่พบ|ไม่พอ|ไม่เพียงพอ|Coin|อัญมณี|ฝุ่น|สูงสุด|ในคลัง|ใส่การ์ดอยู่/.test(message) ? 400 : 500;
    if (status === 500) console.error('Enhance item error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}