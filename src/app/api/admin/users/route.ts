import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin';
import { normalizeLimit, normalizePage, pagerSummary } from '@/lib/pagination';

// GET /api/admin/users — รายชื่อผู้เล่นพร้อมสถิติเบื้องต้น (pagination + search)
// Phase 27: ใช้กติกาแบ่งหน้าชุดเดียวกับการ์ด (เพดาน 100/หน้า + คืนช่วงข้อมูลให้ UI ทำปุ่มเปลี่ยนหน้า)
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
            { username: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { displayName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const total = await prisma.user.count({ where });
    const page = normalizePage(requestedPage, total, limit);

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        discoveryEnergy: true,
        createdAt: true,
        _count: { select: { cards: true, decks: true, discoveries: true } },
        wallet: { select: { balance: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        isActive: u.isActive,
        discoveryEnergy: u.discoveryEnergy,
        cardCount: u._count.cards,
        deckCount: u._count.decks,
        discoveryCount: u._count.discoveries,
        coinBalance: u.wallet?.balance ?? 0,
        createdAt: u.createdAt,
      })),
      pagination: pagerSummary(total, page, limit),
    });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
