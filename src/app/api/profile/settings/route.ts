import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import { normalizeLocale } from '@/lib/i18n';
import { serializeNotifyPrefs, type NotifyPrefs } from '@/lib/notification-prefs';

// PATCH /api/profile/settings — บันทึกค่าส่วนตัวของผู้เล่น (Phase 20)
// body: { locale?: 'th'|'en', notifyPrefs?: Partial<NotifyPrefs> }
// ทำไมต้องเก็บฝั่งเซิร์ฟเวอร์: การแจ้งเตือนถูกสร้างจากฝั่งเซิร์ฟเวอร์ จึงต้องรู้ภาษาของผู้เล่น
export async function PATCH(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      locale?: unknown;
      notifyPrefs?: Partial<NotifyPrefs>;
    };

    // ใช้ Record<string, boolean> เพื่อให้ตรงกับชนิด JSON ของ Prisma (InputJsonObject)
    const patch: { locale?: string; notifyPrefs?: Record<string, boolean> } = {};
    if (body.locale !== undefined) patch.locale = normalizeLocale(body.locale);

    if (body.notifyPrefs && typeof body.notifyPrefs === 'object') {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { notifyPrefs: true },
      });
      patch.notifyPrefs = { ...serializeNotifyPrefs(body.notifyPrefs, current?.notifyPrefs) };
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'ไม่มีค่าที่จะบันทึก' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: patch,
      select: { locale: true, notifyPrefs: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        locale: normalizeLocale(updated.locale),
        notifyPrefs: serializeNotifyPrefs({}, updated.notifyPrefs),
      },
    });
  } catch (error) {
    console.error('Update profile settings error:', error);
    return NextResponse.json({ error: 'บันทึกค่าไม่สำเร็จ' }, { status: 500 });
  }
}

// GET /api/profile/settings — อ่านค่าปัจจุบัน (ใช้ตอนโหลดหน้าเว็บเพื่อซิงก์ภาษาจากบัญชี)
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { locale: true, notifyPrefs: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        locale: normalizeLocale(user?.locale),
        notifyPrefs: serializeNotifyPrefs({}, user?.notifyPrefs),
      },
    });
  } catch (error) {
    console.error('Read profile settings error:', error);
    return NextResponse.json({ error: 'อ่านค่าไม่สำเร็จ' }, { status: 500 });
  }
}
