// Image Webhook — Phase 8: แจ้งปลายทางเมื่องานสร้างภาพเสร็จ/ล้มเหลว
// หลักการ: ไม่ block flow หลัก (fire-and-forget ได้), มี timeout, ลงชื่อ payload ด้วย HMAC
//   - ตั้ง AI_IMAGE_WEBHOOK_URL เพื่อเปิดใช้ (ไม่ตั้ง = ปิด, คืน skipped)
//   - ตั้ง AI_IMAGE_WEBHOOK_SECRET เพื่อให้ปลายทางตรวจ signature ได้ (header x-rda-signature)
import { createHmac } from 'node:crypto';

export type WebhookEvent = 'image.completed' | 'image.failed';

export interface WebhookPayload {
  event: WebhookEvent;
  jobId: string;
  cardId: string;
  cardNameTh?: string | null;
  status: ProcessResultStatus;
  resultUrl?: string | null;
  error?: string | null;
  retryCount: number;
  occurredAt: string;
}

export type ProcessResultStatus = 'COMPLETED' | 'FAILED' | 'RETRY' | 'SKIPPED';

export interface WebhookResult {
  sent: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

const TIMEOUT_MS = 8000;

/** สร้าง signature สำหรับตรวจสอบที่ปลายทาง (hex HMAC-SHA256 ของ body) */
export function signWebhookPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** ควรยิง webhook สำหรับสถานะนี้หรือไม่ — SKIPPED/RETRY ไม่ต้องแจ้ง (ยังไม่จบงาน) */
export function shouldNotify(status: ProcessResultStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

/**
 * ส่ง webhook (ไม่ throw — คืนผลลัพธ์ให้ผู้เรียกตัดสินใจ)
 * ความล้มเหลวของ webhook ต้องไม่ทำให้งานสร้างภาพถือว่าล้มเหลว
 */
export async function sendImageWebhook(payload: WebhookPayload): Promise<WebhookResult> {
  const url = process.env.AI_IMAGE_WEBHOOK_URL;
  if (!url) return { sent: false, skipped: true };
  if (!shouldNotify(payload.status)) return { sent: false, skipped: true };

  const body = JSON.stringify(payload);
  const secret = process.env.AI_IMAGE_WEBHOOK_SECRET;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-rda-event': payload.event,
  };
  if (secret) headers['x-rda-signature'] = signWebhookPayload(body, secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    return { sent: true, status: res.status };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.name : 'unknown error',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** ยิง webhook โดยไม่รอผล (ใช้เมื่อไม่ต้องการให้ช้า flow) */
export function sendImageWebhookInBackground(payload: WebhookPayload): void {
  void sendImageWebhook(payload).catch(() => undefined);
}
