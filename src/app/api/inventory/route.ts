// GET /api/inventory — ของสะสมของผู้เล่น (Phase 11.3)
import { NextRequest, NextResponse } from 'next/server';
import { InventoryService } from '@/services/inventory';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await resolveRequestUserId(request, searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }
    const [items, summary] = await Promise.all([
      InventoryService.list(userId),
      InventoryService.summary(userId),
    ]);
    return NextResponse.json({ success: true, data: items, summary });
  } catch (error) {
    console.error('Get inventory error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
