// คอลเลคชั่นการ์ด — GET /api/collection
//
// ผู้ใช้สั่ง 2026-10-07: "เอาเมนู คอลเลคชั่นการ์ด กลับมา และทำให้สมบูรณ์กว่าเดิม"
// ต่างจาก /api/cards (ที่คืนเฉพาะการ์ดที่ผู้เล่น "มี") ตัวนี้คืน **การ์ดทุกใบในเกม**
// พร้อมธง owned/quantity/isFavorite + สรุปความคืบหน้าของคอลเลคชั่น
//
// Query: ?page=1&limit=24&tab=all|owned|missing&element=&rarity=&role=&search=&sort=power|atk|def|hp|spd|rarity|newest|name
// สิทธิ์: ต้องมี session (401 ถ้าไม่มี) — ใช้ session cookie เป็นหลัก ไม่เชื่อ userId จาก query
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveRequestUserId } from '@/lib/current-user';
import {
  COLLECTION_SORTS,
  COLLECTION_TABS,
  collectionSummary,
  filterCollection,
  sortCollection,
  type CollectionCard,
  type CollectionSort,
  type CollectionTab,
} from '@/lib/collection';

const MAX_LIMIT = 60;

function pick<T extends string>(allowed: readonly T[], value: string | null, fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await resolveRequestUserId(request, searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '24', 10) || 24));
    const tab = pick<CollectionTab>(COLLECTION_TABS, searchParams.get('tab'), 'all');
    const sort = pick<CollectionSort>(COLLECTION_SORTS, searchParams.get('sort'), 'power');

    // ดึงการ์ดทั้งเกมมากรอง/เรียงในหน่วยความจำ (จำนวนหลักร้อย) — เพราะ "พลังการ์ด" และลำดับ
    // ระดับความหายากเป็นกติกาของเกมเอง Prisma จัดลำดับให้ตรงไม่ได้
    const [cards, ownedRows] = await Promise.all([
      prisma.cardDefinition.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.userCard.findMany({
        where: { userId },
        select: { cardId: true, quantity: true, isFavorite: true, obtainedAt: true },
      }),
    ]);

    const ownedMap = new Map(ownedRows.map((row) => [row.cardId, row]));

    const all: CollectionCard[] = cards.map((card) => {
      const own = ownedMap.get(card.id);
      return {
        cardId: card.id,
        name: card.name,
        nameTh: card.nameTh,
        element: card.element,
        rarity: card.rarity,
        role: card.role,
        stats: {
          atk: card.atk,
          def: card.def,
          hp: card.hp,
          spd: card.spd,
          manaCost: card.manaCost,
        },
        // สกิล (ใช้โชว์ในหน้ารายละเอียด/ป้ายบอกในการ์ด) — เหมือนที่ /api/cards ส่ง
        skills: [
          card.skill1Name && {
            name: card.skill1Name,
            description: card.skill1Desc ?? '',
            manaCost: card.skill1ManaCost ?? 0,
          },
          card.skill2Name && {
            name: card.skill2Name,
            description: card.skill2Desc ?? '',
            manaCost: card.skill2ManaCost ?? 0,
          },
        ].filter(Boolean) as CollectionCard['skills'],
        imageUrl: card.imageUrl,
        imageStatus: card.imageStatus,
        owned: Boolean(own),
        quantity: own?.quantity ?? 0,
        isFavorite: own?.isFavorite ?? false,
        obtainedAt: own?.obtainedAt ? own.obtainedAt.toISOString() : null,
      };
    });

    // สรุป = ความคืบหน้าของ "การ์ดทั้งเกม" ไม่ขึ้นกับตัวกรองที่กำลังดูอยู่
    const summary = collectionSummary(all);

    const filtered = sortCollection(
      filterCollection(all, {
        tab,
        element: searchParams.get('element'),
        rarity: searchParams.get('rarity'),
        role: searchParams.get('role'),
        search: searchParams.get('search'),
      }),
      sort
    );

    const start = (page - 1) * limit;
    const rows = filtered.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      data: rows,
      summary,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      },
    });
  } catch (error) {
    console.error('Get collection error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
