import { NextRequest, NextResponse } from 'next/server';
import { ImageService } from '@/services/image';
import { isPrivileged } from '@/lib/api-auth';

// POST /api/admin/images/process — worker tick: ประมวลผลงานในคิวสูงสุด max งาน
// body: { max? } (default 5) — เรียกจาก cron/scheduler ด้วย x-worker-token หรือ admin session
export async function POST(request: NextRequest) {
  try {
    if (!isPrivileged(request)) {
      return NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบหรือ worker' }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const { max } = body as { max?: number };
    const limit = Math.min(20, Math.max(1, Number.isInteger(max) ? (max as number) : 5));

    const results = await ImageService.processBatch(limit);
    return NextResponse.json({
      success: true,
      data: {
        processed: results.length,
        completed: results.filter((r) => r.status === 'COMPLETED').length,
        retrying: results.filter((r) => r.status === 'RETRY').length,
        failed: results.filter((r) => r.status === 'FAILED').length,
        results,
      },
    });
  } catch (error) {
    console.error('Image process error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
