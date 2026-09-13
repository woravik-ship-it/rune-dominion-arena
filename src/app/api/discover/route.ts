import { NextRequest, NextResponse } from 'next/server';
import { validateRuneSequence } from '@/services/seed';
import { DiscoveryService } from '@/services/discovery';
import { QuestService } from '@/services/quest';
import { ImageService } from '@/services/image';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { runes, userId: userIdParam, idempotencyKey } = body as {
      runes?: number[];
      userId?: string;
      idempotencyKey?: string;
    };

    // Validate rune sequence
    const validation = validateRuneSequence(runes as number[]);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    if (!userIdParam) {
      return NextResponse.json({ error: 'ต้องระบุ userId' }, { status: 400 });
    }

    // Resolve userId (รองรับ username อย่าง temp-user)
    let userId = userIdParam;
    if (!/^c[a-z0-9]+$/i.test(userIdParam)) {
      const user = await prisma.user.findUnique({
        where: { username: userIdParam },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 });
      }
      userId = user.id;
    }

    const result = await DiscoveryService.discover(userId, runes as number[], idempotencyKey);

    // Quest hook: นับความคืบหน้าภารกิจ "ค้นพบการ์ด" (ไม่ให้กระทบ flow หลัก)
    try {
      await QuestService.recordEvent(userId, 'DISCOVERY', 1);
    } catch (questError) {
      console.error('Quest DISCOVERY hook error:', questError);
    }

    // Image hook: การ์ดใหม่เข้าคิวสร้างภาพอัตโนมัติ + ลองประมวลผลทันที (ไม่กระทบ flow หลัก)
    try {
      const img = await ImageService.enqueue(result.card.id);
      if (img.enqueued) {
        void ImageService.processBatch(1).catch((e) =>
          console.error('Image process error:', e)
        );
      }
    } catch (imageError) {
      console.error('Image enqueue error:', imageError);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Discovery error:', error);
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์';
    const status = message === 'พลังค้นหาไม่เพียงพอ' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

