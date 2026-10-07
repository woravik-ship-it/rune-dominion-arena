import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { enforceRateLimit } from '@/lib/api-guard';

// POST /api/profile/equip — ใส่/ถอดเครื่องประดับ (COSMETIC) หรือฉายา (TITLE)
// body: { kind: 'COSMETIC'|'TITLE', code } · code = '' = ถอด
// หน้าตาล้วน — ไม่มีผลต่อ Status/การต่อสู้ (ผู้ใช้สั่ง 2026-10-03)
const bodySchema = z.object({
  kind: z.enum(['COSMETIC', 'TITLE']),
  code: z.string().max(80),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const rl = enforceRateLimit(request, 'SHOP_WRITE', { userId });
    if (rl) return rl;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    const { kind, code } = parsed.data;

    if (code) {
      const item = await prisma.userInventoryItem.findUnique({
        where: {
          userId_itemType_code: {
            userId,
            itemType: kind,
            code,
          },
        },
        select: { nameTh: true },
      });
      if (!item) return NextResponse.json({ error: 'ไม่มีของชิ้นนี้ในคลัง' }, { status: 400 });
      await prisma.user.update({
        where: { id: userId },
        data:
          kind === 'TITLE'
            ? { titleCode: code, titleTh: item.nameTh ?? code }
            : { avatarFrameCode: code },
      });
    } else {
      await prisma.user.update({
        where: { id: userId },
        data:
          kind === 'TITLE'
            ? { titleCode: null, titleTh: null }
            : { avatarFrameCode: null },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarFrameCode: true, titleCode: true, titleTh: true },
    });
    return NextResponse.json({ success: true, data: { user } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ใส่เครื่องประดับไม่สำเร็จ';
    const status = /ไม่มี|ไม่พบ|คลัง/.test(message) ? 400 : 500;
    if (status === 500) console.error('Equip cosmetic error:', error);
    return NextResponse.json({ error: message }, { status });
  }
}