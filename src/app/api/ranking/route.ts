import { NextRequest, NextResponse } from 'next/server';
import { RankingService } from '@/services/ranking';
import { resolveRequestUserId } from '@/lib/current-user';
import { RANKING_CATEGORIES, normalizeCategory } from '@/lib/ranking';

// GET /api/ranking — ตาราง Ranking ผู้เล่น (Phase 28)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำตาราง Ranking ผู้เล่น ให้ด้วย"
// query: ?category=power|collection|wins|event|coin · ?limit=50 (สูงสุด 200)
// คืน: รายชื่อผู้เล่นพร้อมอันดับ + "อันดับของฉัน" (ยึด session) + รายชื่อหมวดทั้งหมด
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = normalizeCategory(searchParams.get('category'));
    const limitParam = Number(searchParams.get('limit') ?? '50');
    const limit = Number.isFinite(limitParam) ? limitParam : 50;

    // ไม่บังคับล็อกอิน: ดูตารางได้ แต่ "อันดับของฉัน" จะมีเมื่อล็อกอิน
    const userId = await resolveRequestUserId(request).catch(() => null);

    const board = await RankingService.board(category, { userId, limit });

    return NextResponse.json({
      success: true,
      data: {
        ...board,
        categories: RANKING_CATEGORIES.map((item) => ({
          key: item.key,
          labelKey: item.labelKey,
          icon: item.icon,
          unitKey: item.unitKey,
        })),
        signedIn: Boolean(userId),
      },
    });
  } catch (error) {
    console.error('Get ranking error:', error);
    return NextResponse.json({ error: 'อ่านตารางจัดอันดับไม่สำเร็จ' }, { status: 500 });
  }
}
