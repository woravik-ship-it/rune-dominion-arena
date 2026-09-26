import { NextRequest, NextResponse } from 'next/server';
import { ItemService } from '@/services/item';
import { resolveRequestUserId } from '@/lib/current-user';

// GET /api/items — ร้านช่าง: แคตตาล็อก Item + ยอด Veil Shards/ฝุ่นเวทของผู้เล่น (Phase 25)
// ยึด session cookie; ไม่ส่งข้อมูลของผู้เล่นคนอื่น
export async function GET(request: NextRequest) {
  try {
    const userId = await resolveRequestUserId(request);
    if (!userId) return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 });

    const data = await ItemService.catalog(userId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('List items error:', error);
    return NextResponse.json({ error: 'อ่านรายการ Item ไม่สำเร็จ' }, { status: 500 });
  }
}
