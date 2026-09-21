// Image webhook tests — Phase 8 (แจ้งเมื่อภาพพร้อม/ล้มเหลว)
import { sendImageWebhook, shouldNotify, signWebhookPayload } from '@/lib/image-webhook';

const PAYLOAD = {
  event: 'image.completed' as const,
  jobId: 'job-1',
  cardId: 'card-1',
  status: 'COMPLETED' as const,
  resultUrl: '/api/cards/card-1/image',
  retryCount: 0,
  occurredAt: '2026-09-21T03:00:00.000Z',
};

describe('shouldNotify', () => {
  test('COMPLETED และ FAILED ต้องแจ้ง', () => {
    expect(shouldNotify('COMPLETED')).toBe(true);
    expect(shouldNotify('FAILED')).toBe(true);
  });

  test('RETRY/SKIPPED ยังไม่จบงาน → ไม่แจ้ง', () => {
    expect(shouldNotify('RETRY')).toBe(false);
    expect(shouldNotify('SKIPPED')).toBe(false);
  });
});

describe('signWebhookPayload', () => {
  test('signature คงที่สำหรับ body+secret เดิม และเปลี่ยนเมื่อ secret ต่าง', () => {
    const a = signWebhookPayload('{"a":1}', 'secret-1');
    expect(a).toBe(signWebhookPayload('{"a":1}', 'secret-1'));
    expect(a).not.toBe(signWebhookPayload('{"a":1}', 'secret-2'));
    expect(a).toMatch(/^[a-f0-9]{64}$/); // HMAC-SHA256 hex
  });
});

describe('sendImageWebhook', () => {
  const originalUrl = process.env.AI_IMAGE_WEBHOOK_URL;
  const originalSecret = process.env.AI_IMAGE_WEBHOOK_SECRET;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.AI_IMAGE_WEBHOOK_URL;
    else process.env.AI_IMAGE_WEBHOOK_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.AI_IMAGE_WEBHOOK_SECRET;
    else process.env.AI_IMAGE_WEBHOOK_SECRET = originalSecret;
    jest.restoreAllMocks();
  });

  test('ไม่ได้ตั้ง AI_IMAGE_WEBHOOK_URL → ข้าม (ไม่ยิง)', async () => {
    delete process.env.AI_IMAGE_WEBHOOK_URL;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await sendImageWebhook(PAYLOAD);
    expect(result).toEqual({ sent: false, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('ตั้ง URL + สถานะ COMPLETED → ยิง POST พร้อม header', async () => {
    process.env.AI_IMAGE_WEBHOOK_URL = 'https://example.test/hook';
    process.env.AI_IMAGE_WEBHOOK_SECRET = 'topsecret';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 })
    );

    const result = await sendImageWebhook(PAYLOAD);

    expect(result.sent).toBe(true);
    expect(result.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/hook');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-rda-event']).toBe('image.completed');
    expect(headers['x-rda-signature']).toBe(
      signWebhookPayload(init.body as string, 'topsecret')
    );
  });

  test('สถานะ RETRY → ไม่ยิง แม้ตั้ง URL แล้ว', async () => {
    process.env.AI_IMAGE_WEBHOOK_URL = 'https://example.test/hook';
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await sendImageWebhook({ ...PAYLOAD, status: 'RETRY' });
    expect(result.skipped).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('ปลายทางล่ม → คืน sent:false ไม่ throw (flow หลักไม่พัง)', async () => {
    process.env.AI_IMAGE_WEBHOOK_URL = 'https://example.test/hook';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await sendImageWebhook(PAYLOAD);
    expect(result.sent).toBe(false);
    expect(result.error).toBeDefined();
  });
});
