import { NextRequest, NextResponse } from 'next/server';
import { validateRuneSequence } from '@/services/seed';
import { DiscoveryService } from '@/services/discovery';
import { QuestService } from '@/services/quest';
import { ImageService } from '@/services/image';
import { prisma } from '@/lib/prisma';
import { parseJsonBody, discoverSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { antiCheat, recordAction } from '@/lib/anti-cheat';
import { logSecurityEvent } from '@/lib/security-log';
import { getClientIp, getDeviceId } from '@/lib/request-context';

export async function POST(request: NextRequest) {
  try {
    // Phase 10: input validation (Zod)
    const { data, errorResponse } = await parseJsonBody(request, discoverSchema);
    if (errorResponse) return errorResponse;
    const { runes, userId: userIdParam, idempotencyKey } = data;

    // Validate rune sequence (กติกาเชิงเกม — Zod ตรวจชนิด/ช่วงแล้ว)
    const validation = validateRuneSequence(runes);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Phase 10: Rate limit (User → Device → IP)
    const rl = enforceRateLimit(request, 'DISCOVER', { userId: userIdParam });
    if (rl) {
      void logSecurityEvent({
        type: 'RATE_LIMIT_BLOCKED',
        severity: 'LOW',
        userId: userIdParam,
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { endpoint: 'POST /api/discover', scope: 'DISCOVER' },
      });
      return rl;
    }

    // Phase 10: Bot pattern detection (action เร็ว/จังหวะผิดปกติ)
    const botCheck = recordAction(antiCheat, `discover:${userIdParam}`, Date.now());
    if (botCheck.flagged) {
      void logSecurityEvent({
        type: 'BOT_PATTERN',
        severity: 'MEDIUM',
        userId: userIdParam,
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { endpoint: 'POST /api/discover', reason: botCheck.reason, detail: botCheck.detail },
      });
      return NextResponse.json(
        { error: 'ตรวจพบการใช้งานผิดปกติ กรุณาลองใหม่ภายหลัง' },
        { status: 429 }
      );
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

