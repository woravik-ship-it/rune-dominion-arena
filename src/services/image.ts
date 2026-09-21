// Image Generation Service — Phase 8
// Queue แบบ DB-backed (ตาราง ImageJob) แทน BullMQ (ยังไม่ติดตั้ง Redis)
// Rules: deterministic placeholder / idempotent enqueue / retry + exponential backoff
import { prisma } from '@/lib/prisma';
import { isPromptSafe } from '@/lib/image-placeholder';
import { sendImageWebhook } from '@/lib/image-webhook';

const BACKOFF_BASE_MS = 30_000; // 30 วิ
const BACKOFF_MAX_MS = 10 * 60_000; // 10 นาที

/** Delay ก่อนลองใหม่ครั้งถัดไป (exponential backoff พร้อม cap) */
export function backoffDelayMs(retryCount: number): number {
  const clamped = Math.max(0, Math.floor(retryCount));
  return Math.min(BACKOFF_BASE_MS * 2 ** clamped, BACKOFF_MAX_MS);
}

/** สร้าง prompt จากข้อมูลการ์ด — deterministic และ safe โดยการสร้าง */
function buildImagePrompt(card: {
  name: string; element: string; rarity: string; role: string; loreTh?: string | null;
}): string {
  const lore = (card.loreTh || '').slice(0, 80).replace(/\s+/g, ' ').trim();
  return [
    'fantasy trading card game art,',
    `${card.element.toLowerCase()} ${card.role.toLowerCase()} creature,`,
    `${card.rarity.toLowerCase()} quality, mystical rune background, digital painting`,
    lore ? `— ${lore}` : '',
  ].join(' ');
}

export interface ProcessResult {
  jobId: string;
  status: 'COMPLETED' | 'RETRY' | 'FAILED' | 'SKIPPED';
  resultUrl?: string;
  error?: string;
}


export class ImageService {
  /** เข้าคิวสร้างภาพให้การ์ดใบเดียว — idempotent (มีงาน active อยู่แล้วไม่สร้างซ้ำ) */
  static async enqueue(cardId: string): Promise<{ enqueued: boolean; jobId?: string }> {
    const active = await prisma.imageJob.findFirst({
      where: { cardId, status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });
    if (active) return { enqueued: false, jobId: active.id };

    const card = await prisma.cardDefinition.findUnique({
      where: { id: cardId },
      select: { id: true, name: true, element: true, rarity: true, role: true, loreTh: true, imageUrl: true },
    });
    if (!card) return { enqueued: false };

    const job = await prisma.imageJob.create({
      data: {
        cardId: card.id,
        imagePrompt: buildImagePrompt(card),
      },
    });
    return { enqueued: true, jobId: job.id };
  }

  /** เข้าคิวให้ทุกการ์ดที่ยังไม่มีภาพและไม่มีงาน active (ใช้ตอน admin requeue) */
  static async enqueueMissing(limit = 50): Promise<number> {
    const cards = await prisma.cardDefinition.findMany({
      where: {
        imageUrl: null,
        imageJobs: { none: { status: { in: ['PENDING', 'PROCESSING'] } } },
      },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
    let count = 0;
    for (const card of cards) {
      const result = await this.enqueue(card.id);
      if (result.enqueued) count += 1;
    }
    return count;
  }

  /** เรียก external AI provider (ถ้าตั้งค่าไว้) — คืน URL ของภาพ */
  private static async callExternalProvider(prompt: string): Promise<string> {
    const apiUrl = process.env.AI_IMAGE_API_URL;
    const apiKey = process.env.AI_IMAGE_API_KEY;
    if (!apiUrl || !apiKey) throw new Error('ไม่ได้ตั้งค่า AI provider');

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ prompt, n: 1, size: '512x640' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`AI provider ตอบ ${res.status}`);
    const json = (await res.json()) as { url?: string; data?: Array<{ url?: string }> };
    const url = json.url ?? json.data?.[0]?.url;
    if (!url || typeof url !== 'string') throw new Error('AI provider ไม่ส่ง URL ภาพกลับมา');
    return url;
  }

  /**
   * ประมวลผลงาน 1 งานจากคิว (เรียกซ้ำเป็นรอบจาก worker/cron หรือหลัง enqueue)
   * - ไม่มี external provider → ใช้ deterministic placeholder (route /api/cards/[id]/image)
   */
  static async processNext(now: Date = new Date()): Promise<ProcessResult | null> {
    // เลือกงานที่พร้อม — งาน retry ต้องผ่าน backoff แล้ว
    const candidates = await prisma.imageJob.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 10,
    });
    const eligible = candidates.find((job) => {
      if (job.retryCount === 0) return true;
      return new Date(job.updatedAt).getTime() + backoffDelayMs(job.retryCount - 1) <= now.getTime();
    });
    if (!eligible) return null;

    // ล็อกงาน (กัน worker หลายตัวชนกัน)
    const locked = await prisma.imageJob.updateMany({
      where: { id: eligible.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (locked.count !== 1) return { jobId: eligible.id, status: 'SKIPPED' };

    let card: { id: string; name: string; nameTh: string | null; element: string; rarity: string; role: string; loreTh: string | null; canonicalSeedHash: string } | null = null;
    try {
      card = await prisma.cardDefinition.findUnique({
        where: { id: eligible.cardId },
        select: {
          id: true, name: true, nameTh: true, element: true, rarity: true,
          role: true, loreTh: true, canonicalSeedHash: true,
        },
      });
      if (!card) throw new Error('ไม่พบการ์ดของงานนี้');

      const prompt = eligible.imagePrompt ?? buildImagePrompt(card);
      if (!isPromptSafe(prompt)) throw new Error('prompt ไม่ผ่านการตรวจเนื้อหา');

      const hasProvider = Boolean(process.env.AI_IMAGE_API_URL && process.env.AI_IMAGE_API_KEY);
      const resultUrl = hasProvider
        ? await this.callExternalProvider(prompt)
        : `/api/cards/${card.id}/image`;

      await prisma.imageJob.update({
        where: { id: eligible.id },
        data: { status: 'COMPLETED', resultUrl, processedAt: now, errorMessage: null },
      });
      await prisma.cardDefinition.update({
        where: { id: card.id },
        data: { imageUrl: resultUrl, imageStatus: 'READY' },
      });
      // Phase 8: แจ้งปลายทางเมื่องานเสร็จ (ไม่กระทบ flow แม้ webhook ล้มเหลว)
      await sendImageWebhook({
        event: 'image.completed',
        jobId: eligible.id,
        cardId: card.id,
        cardNameTh: card.nameTh,
        status: 'COMPLETED',
        resultUrl,
        retryCount: eligible.retryCount,
        occurredAt: now.toISOString(),
      }).catch(() => undefined);
      return { jobId: eligible.id, status: 'COMPLETED', resultUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const nextRetry = eligible.retryCount + 1;
      const failed = nextRetry >= eligible.maxRetries;
      await prisma.imageJob.update({
        where: { id: eligible.id },
        data: failed
          ? { status: 'FAILED', retryCount: nextRetry, errorMessage: message, processedAt: now }
          : { status: 'PENDING', retryCount: nextRetry, errorMessage: message },
      });
      // งานล้มเหลวถาวร → การ์ดยังใช้ placeholder ได้ แต่บอกสถานะตามจริง
      if (failed && card) {
        await prisma.cardDefinition.update({
          where: { id: card.id },
          data: { imageStatus: 'FAILED' },
        });
        // Phase 8: แจ้งปลายทางเมื่องานล้มเหลวถาวร (ให้ ops ตรวจได้)
        await sendImageWebhook({
          event: 'image.failed',
          jobId: eligible.id,
          cardId: card.id,
          cardNameTh: card.nameTh,
          status: 'FAILED',
          error: message,
          retryCount: nextRetry,
          occurredAt: now.toISOString(),
        }).catch(() => undefined);
      }
      return { jobId: eligible.id, status: failed ? 'FAILED' : 'RETRY', error: message };
    }
  }

  /** ประมวลผลหลายงานติดต่อกัน (worker tick) */
  static async processBatch(max = 5): Promise<ProcessResult[]> {
    const results: ProcessResult[] = [];
    for (let i = 0; i < max; i += 1) {
      const result = await this.processNext();
      if (!result) break;
      if (result.status !== 'SKIPPED') results.push(result);
    }
    return results;
  }

  /** Admin requeue: งาน FAILED กลับเข้าคิว (เริ่มนับ retry ใหม่) */
  static async requeueFailed(cardId?: string): Promise<number> {
    const where = { status: 'FAILED' as const, ...(cardId ? { cardId } : {}) };
    // การ์ดที่เคย FAILED ต้องกลับเป็น PENDING ให้ UI แสดง "รอสร้างภาพ" ตามจริง
    const cards = await prisma.imageJob.findMany({
      where,
      select: { cardId: true },
    });
    const result = await prisma.imageJob.updateMany({
      where,
      data: { status: 'PENDING', retryCount: 0, errorMessage: null },
    });
    if (cards.length > 0) {
      await prisma.cardDefinition.updateMany({
        where: { id: { in: cards.map((c) => c.cardId) } },
        data: { imageStatus: 'PENDING' },
      });
    }
    return result.count;
  }
}

