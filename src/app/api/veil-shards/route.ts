import { NextRequest, NextResponse } from 'next/server';
import { VeilShardService } from '@/services/veil-shard';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/veil-shards — ยอด Veil Shards ของผู้เล่น + ประวัติล่าสุด (Phase 25)
// ผู้ใช้สั่ง 2026-09-27: "ได้จากการขายการ์ดคืนร้าน ... บางส่วนก็ได้จากกิจกรรม"
// → ยอดเดียวใช้ทั้งร้านช่าง/ร้านกิจกรรม; ประวัติบอกที่มาของทุกครั้ง
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '20');
    const limit = Number.isFinite(limitParam) ? limitParam : 20;

    const [balance, history] = await Promise.all([
      VeilShardService.balance(userId),
      VeilShardService.history(userId, limit),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        balance,
        history: history.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      },
    });
  } catch (error) {
    console.error('Get veil shards error:', error);
    return NextResponse.json({ error: 'อ่านยอด Veil Shards ไม่สำเร็จ' }, { status: 500 });
  }
}
