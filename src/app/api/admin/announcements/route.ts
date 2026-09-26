import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';
import { NotificationService } from '@/services/notification';

// POST /api/admin/announcements — ประกาศจากทีมงาน (Phase 20)
// body: { titleTh, titleEn, bodyTh, bodyEn, href? }
// สร้างเป็น "การแจ้งเตือนของแต่ละ user" (fan-out) → ผู้เล่นที่ปิดประกาศไว้จะไม่ได้รับ
export async function POST(request: NextRequest) {
  try {
    const session = getAdminSession(request);
    if (!session) return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pick = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
    const titleTh = pick('titleTh');
    const titleEn = pick('titleEn') || titleTh;
    const bodyTh = pick('bodyTh');
    const bodyEn = pick('bodyEn') || bodyTh;
    const href = pick('href');

    if (!titleTh || !bodyTh) {
      return NextResponse.json({ error: 'ต้องมีหัวข้อและเนื้อหา (ภาษาไทยอย่างน้อย)' }, { status: 400 });
    }

    const result = await NotificationService.announce({
      titleTh, titleEn, bodyTh, bodyEn,
      href: href || null,
      createdBy: session.sub,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Create announcement error:', error);
    return NextResponse.json({ error: 'สร้างประกาศไม่สำเร็จ' }, { status: 500 });
  }
}

// GET /api/admin/announcements — รายการประกาศล่าสุด (ให้ทีมงานตรวจย้อนหลัง)
export async function GET(request: NextRequest) {
  try {
    const session = getAdminSession(request);
    if (!session) return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });

    const rows = await prisma.announcement.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ success: true, data: { announcements: rows } });
  } catch (error) {
    console.error('List announcements error:', error);
    return NextResponse.json({ error: 'อ่านประกาศไม่สำเร็จ' }, { status: 500 });
  }
}
