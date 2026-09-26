import { NextRequest, NextResponse } from 'next/server';
import { ImageService } from '@/services/image';
import { isPrivileged } from '@/lib/api-auth';
import { getAdminSession } from '@/lib/admin';
import { checkStaffAbility } from '@/lib/admin-users';

// POST /api/admin/images/requeue — ดึงงาน FAILED กลับเข้าคิว / เติมงานให้การ์ดที่ยังไม่มีภาพ
// body: { cardId? } — ไม่ระบุ = ทุกการ์ด
//
// Phase 30: ผู้ใช้สั่ง "ห้ามแตะเรื่องการ์ด" ⇒ session ต้องเป็น **แอดมิน** เท่านั้น
// (worker token สำหรับ cron ยังใช้ได้เหมือนเดิม)
export async function POST(request: NextRequest) {
  try {
    const workerToken = process.env.WORKER_TOKEN;
    const isWorker = Boolean(workerToken) && request.headers.get('x-worker-token') === workerToken;
    if (!isWorker) {
      if (!isPrivileged(request)) {
        return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
      }
      const session = getAdminSession(request);
      if (!session) {
        return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
      }
      const allowed = checkStaffAbility(session.role, 'imageRequeue');
      if (!allowed.ok) {
        return NextResponse.json({ error: allowed.reason }, { status: 403 });
      }
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
