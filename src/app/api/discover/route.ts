import { NextRequest, NextResponse } from 'next/server';
import { validateRuneSequence } from '@/services/seed';
import { DiscoveryService } from '@/services/discovery';
import { QuestService } from '@/services/quest';
import { ImageService } from '@/services/image';
import { aiImageEnabled } from '@/lib/ai-image';
import { parseJsonBody, discoverSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/api-guard';
import { antiCheat, recordAction } from '@/lib/anti-cheat';
import { logSecurityEvent } from '@/lib/security-log';
import { getClientIp, getDeviceId, getSessionUserId } from '@/lib/request-context';
import { resolveRequestUserId } from '@/lib/current-user';

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

    // ยึด session cookie ก่อน (client ปลอม userId ไม่ได้) แล้วค่อย fallback param
    const sessionUserId = getSessionUserId(request);
    const rateLimitUserId = sessionUserId ?? userIdParam;

    // Phase 10: Rate limit (User → Device → IP)
    const rl = enforceRateLimit(request, 'DISCOVER', { userId: rateLimitUserId });
    if (rl) {
      void logSecurityEvent({
        type: 'RATE_LIMIT_BLOCKED',
        severity: 'LOW',
        userId: rateLimitUserId,
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { endpoint: 'POST /api/discover', scope: 'DISCOVER' },
      });
      return rl;
    }

    // Phase 10: Bot pattern detection (action เร็ว/จังหวะผิดปกติ)
    const botCheck = recordAction(antiCheat, `discover:${rateLimitUserId}`, Date.now());
    if (botCheck.flagged) {
      void logSecurityEvent({
        type: 'BOT_PATTERN',
        severity: 'MEDIUM',
        userId: rateLimitUserId,
        ip: getClientIp(request),
        deviceId: getDeviceId(request),
        detail: { endpoint: 'POST /api/discover', reason: botCheck.reason, detail: botCheck.detail },
      });
      return NextResponse.json(
        { error: 'ตรวจพบการใช้งานผิดปกติ กรุณาลองใหม่ภายหลัง' },
        { status: 429 }
      );
    }

    // Resolve userId (session → param; รองรับ username อย่าง player1 ด้วย)
    const userId = await resolveRequestUserId(request, userIdParam);
    if (!userId) {
      return NextResponse.json(
        { error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบก่อนค้นหารูน' },
        { status: 401 }
      );
    }

    const result = await DiscoveryService.discover(userId, runes as number[], idempotencyKey);

    // Quest hook: นับความคืบหน้าภารกิจ "ค้นพบการ์ด" (ไม่ให้กระทบ flow หลัก)
    try {
      await QuestService.recordEvent(userId, 'DISCOVERY', 1);
    } catch (questError) {
      console.error('Quest DISCOVERY hook error:', questError);
    }

    // Image hook: การ์ดใหม่เข้าคิวสร้างภาพอัตโนมัติ
    // หมายเหตุ: ถ้าเปิด AI อยู่ ปล่อยให้ worker (rune-dominion-images) เป็นคนสร้างเท่านั้น
    // เพราะผู้ให้บริการฟรีกักคิว 1 งาน/IP — ยิงพร้อมกันจะโดน 429 ทั้งคู่
    try {
      const img = await ImageService.enqueue(result.card.id);
      if (img.enqueued && !aiImageEnabled()) {
        // โหมดไม่ใช้ AI (วาดเอง) → สร้างทันทีได้ ไม่ต้องพึ่ง worker
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

