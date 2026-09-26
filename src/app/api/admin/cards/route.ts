import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';
import { normalizeLimit, normalizePage, pagerSummary } from '@/lib/pagination';

// GET /api/admin/cards — รายการการ์ดทั้งหมด (search + pagination)
//
// Phase 27: ผู้ใช้แจ้ง "การ์ดใน Admin ไม่ครบทุกใบ" — เดิมจำกัด limit ไว้ 50 และหน้าเว็บขอครั้งเดียว
// ⇒ เพิ่มเพดานเป็น 100/หน้า และคืนข้อมูลสรุปช่วง (from/to) ให้ UI ทำปุ่มเปลี่ยนหน้า/โหลดทั้งหมดได้
export async function GET(request: NextRequest) {
  try {
    if (!getAdminSession(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const limit = normalizeLimit(searchParams.get('limit'));
    const requestedPage = Math.max(1, Number(searchParams.get('page')) || 1);

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { nameTh: { contains: search } },
          ],
        }
      : {};

    const total = await prisma.cardDefinition.count({ where });
    const page = normalizePage(requestedPage, total, limit);

    const cards = await prisma.cardDefinition.findMany({
      where,
      select: {
        id: true, name: true, nameTh: true, element: true,
        rarity: true, role: true, imageUrl: true, imageStatus: true, discoveryCount: true,
        _count: { select: { userCards: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: cards.map((c) => ({ ...c, ownerCount: c._count.userCards })),
      pagination: pagerSummary(total, page, limit),
    });
  } catch (error) {
    console.error('Admin cards error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
