import { NextRequest, NextResponse } from 'next/server';
import { ImageService } from '@/services/image';
import { isPrivileged } from '@/lib/api-auth';

// POST /api/admin/images/requeue — ดึงงาน FAILED กลับเข้าคิว / เติมงานให้การ์ดที่ยังไม่มีภาพ
// body: { cardId? } — ไม่ระบุ = ทุกการ์ด
export async function POST(request: NextRequest) {
  try {
    if (!isPrivileged(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const { cardId } = body as { cardId?: string };

    const requeued = await ImageService.requeueFailed(cardId);
    const newlyQueued = await ImageService.enqueueMissing();

    return NextResponse.json({
      success: true,
      data: { requeuedFailed: requeued, newlyQueued },
      message: `ดึงกลับเข้าคิว ${requeued} งาน, เพิ่มงานใหม่ ${newlyQueued} งาน`,
    });
  } catch (error) {
    console.error('Image requeue error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
