import { NextRequest, NextResponse } from 'next/server';
import { ImageService } from '@/services/image';
import { getAdminSession, auditAdminAction } from '@/lib/admin';
import { aiImageEnabled } from '@/lib/ai-image';
import { checkStaffAbility } from '@/lib/admin-users';

// POST /api/admin/cards/[id]/regenerate — สั่งสร้างภาพการ์ดใบนี้ใหม่ (Phase 14.4)
// ใช้จากแผงแอดมิน → ตั้งสถานะ PROCESSING (UI แสดง "กำลังสร้างภาพ") แล้ว worker สร้างให้
//
// Phase 30: ผู้ใช้สั่ง "ห้ามแตะเรื่องการ์ด เช่น Gen รูปใหม่"
// ⇒ **แอดมินเท่านั้น** (ผู้ดูแลดูรายการการ์ดได้ แต่สั่งสร้างภาพใหม่ไม่ได้)
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = getAdminSession(request);
    if (!session) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
    }
    const allowed = checkStaffAbility(session.role, 'cardRegenerate');
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.reason }, { status: 403 });
    }

    const result = await ImageService.regenerateCard(params.id);
    if (!result.enqueued) {
      return NextResponse.json({ error: 'ไม่พบการ์ดใบนี้' }, { status: 404 });
    }

    await auditAdminAction(session, 'CARD_IMAGE_REGENERATE', 'IMAGE', params.id, { jobId: result.jobId });

    return NextResponse.json({
      success: true,
      data: {
        jobId: result.jobId,
        provider: aiImageEnabled() ? (process.env.AI_IMAGE_MODEL ?? 'ai') : 'placeholder',
        message: 'สั่งสร้างภาพใหม่แล้ว — การ์ดจะแสดง "กำลังสร้างภาพ" จนภาพใหม่พร้อม',
      },
    });
  } catch (error) {
    console.error('Regenerate card image error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
