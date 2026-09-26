import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { AVATAR_EMOJIS, isValidAvatarEmoji, paintedCells, sanitizeAvatarGrid } from '@/lib/avatar';

// POST /api/profile/avatar — ตั้งอวตาร (Phase 26)
//
// ผู้ใช้สั่ง 2026-09-27: "เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
//  body: { emoji } | { grid } | { clear: true }
//   - emoji: ต้องอยู่ในรายการที่เกมมีให้ (กันข้อความแปลกปลอม)
//   - grid : รหัส 36 ตัวอักษร (6×6) — อักขระที่ไม่รู้จักถูกทำให้เป็นช่องโปร่งใส
//   - clear: ล้างอวตารกลับเป็นค่าเริ่มต้น
const bodySchema = z.object({
  emoji: z.string().max(8).nullish(),
  grid: z.union([z.string().max(200), z.array(z.string().max(20)).max(20)]).nullish(),
  clear: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'ข้อมูลอวตารไม่ถูกต้อง' }, { status: 400 });
    }
    const { emoji, grid, clear } = parsed.data;

    // ล้างอวตาร
    if (clear) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { avatarEmoji: null, avatarGrid: null },
        select: { avatarEmoji: true, avatarGrid: true },
      });
      return NextResponse.json({ success: true, data: { ...user, message: 'ล้างอวตารแล้ว' } });
    }

    const wantsEmoji = emoji !== undefined && emoji !== null && emoji !== '';
    const wantsGrid = grid !== undefined && grid !== null && grid !== '';

    if (!wantsEmoji && !wantsGrid) {
      return NextResponse.json({ error: 'ต้องเลือกอิโมจิหรือส่งภาพวาด 6×6 มาด้วย' }, { status: 400 });
    }
    if (wantsEmoji && !isValidAvatarEmoji(emoji)) {
      return NextResponse.json(
        { error: `อิโมจิไม่ถูกต้อง — เลือกจากรายการที่เกมมีให้ (${AVATAR_EMOJIS.length} แบบ)` },
        { status: 400 }
      );
    }

    const nextGrid = wantsGrid ? sanitizeAvatarGrid(grid) : null;
    if (wantsGrid && paintedCells(nextGrid) === 0) {
      return NextResponse.json({ error: 'ภาพวาดว่างเปล่า — ระบายสีอย่างน้อย 1 ช่องก่อนบันทึก' }, { status: 400 });
    }

    // เลือกอิโมจิ = ล้างภาพวาด (แสดงอิโมจิ) · ส่งภาพวาด = ล้างอิโมจิ
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        avatarEmoji: wantsEmoji ? emoji : null,
        avatarGrid: wantsEmoji ? null : nextGrid,
      },
      select: { avatarEmoji: true, avatarGrid: true },
    });

    return NextResponse.json({
      success: true,
      data: { ...user, message: wantsEmoji ? 'ตั้งอวตารเป็นอิโมจิแล้ว' : 'บันทึกภาพวาดแล้ว' },
    });
  } catch (error) {
    console.error('Set avatar error:', error);
    return NextResponse.json({ error: 'บันทึกอวตารไม่สำเร็จ' }, { status: 500 });
  }
}
