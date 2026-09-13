import { generatePlaceholderSvg, isPromptSafe } from '@/lib/image-placeholder';
import { backoffDelayMs, ImageService } from '@/services/image';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    imageJob: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    cardDefinition: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mocked = prisma as unknown as {
  imageJob: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  cardDefinition: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
};

const CARD_BASE = {
  id: 'card-1',
  cardId: 'card-1',
  name: 'Ember Warrior',
  nameTh: 'นักรบเพลิง',
  element: 'EMBERBOUND',
  rarity: 'RARE',
  role: 'WARRIOR',
  loreTh: 'อักษรโบราณเล่าว่า',
  canonicalSeedHash: 'a3f19c8e77b2d4001122334455667788',
};

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.AI_IMAGE_API_URL;
  delete process.env.AI_IMAGE_API_KEY;
});

describe('generatePlaceholderSvg (deterministic placeholder)', () => {
  test('input เดิม → SVG แบบ byte ต่อ byte เหมือนกัน', () => {
    const a = generatePlaceholderSvg(CARD_BASE);
    const b = generatePlaceholderSvg(CARD_BASE);
    expect(a).toBe(b);
  });

  test('เป็น SVG ที่ถูกต้อง + มีชื่อไทยและสีตามธาตุ', () => {
    const svg = generatePlaceholderSvg(CARD_BASE);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('นักรบเพลิง');
    expect(svg).toContain('#c2410c'); // EMBERBOUND from color
    expect(svg).toContain('#60a5fa'); // RARE ring
  });

  test('hash ต่างกัน → ลายภาพต่างกัน', () => {
    const a = generatePlaceholderSvg({ ...CARD_BASE, canonicalSeedHash: 'a3f19c8e77b2d4001122334455667788' });
    const b = generatePlaceholderSvg({ ...CARD_BASE, canonicalSeedHash: 'ff00ff00ff00ff00ff00ff00ff00ff00' });
    expect(a).not.toBe(b);
  });

  test('ธาตุ/ระดับที่ไม่รู้จัก → ยังเจนได้ (fallback palette)', () => {
    const svg = generatePlaceholderSvg({ ...CARD_BASE, element: 'UNKNOWN', rarity: 'UNKNOWN' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('★');
  });

  test('escape อักขระ XML ในชื่อ', () => {
    const svg = generatePlaceholderSvg({ ...CARD_BASE, nameTh: '<script>&"x"' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('isPromptSafe (content moderation)', () => {
  test('prompt ปกติ → ผ่าน', () => {
    expect(isPromptSafe('fantasy warrior with flaming sword')).toBe(true);
  });

  test('คำต้องห้าม (EN/TH) → ไม่ผ่าน', () => {
    expect(isPromptSafe('nude warrior art')).toBe(false);
    expect(isPromptSafe('ภาพโป๊ของฮีโร่')).toBe(false);
  });
});

describe('backoffDelayMs (exponential + cap)', () => {
  test('เพิ่มเป็นเท่าตัวและจำกัดที่ 10 นาที', () => {
    expect(backoffDelayMs(0)).toBe(30_000);
    expect(backoffDelayMs(1)).toBe(60_000);
    expect(backoffDelayMs(2)).toBe(120_000);
    expect(backoffDelayMs(10)).toBe(600_000); // cap
  });
});

describe('ImageService.enqueue (idempotent)', () => {
  test('ยังไม่มีงาน → สร้าง PENDING พร้อม prompt', async () => {
    mocked.imageJob.findFirst.mockResolvedValueOnce(null);
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(CARD_BASE);
    mocked.imageJob.create.mockResolvedValueOnce({ id: 'job-1' });

    const result = await ImageService.enqueue('card-1');

    expect(result).toEqual({ enqueued: true, jobId: 'job-1' });
    expect(mocked.imageJob.create).toHaveBeenCalledWith({
      data: {
        cardId: 'card-1',
        imagePrompt: expect.stringContaining('emberbound warrior'),
      },
    });
  });

  test('มีงาน active อยู่แล้ว → ไม่สร้างซ้ำ', async () => {
    mocked.imageJob.findFirst.mockResolvedValueOnce({ id: 'job-existing' });

    const result = await ImageService.enqueue('card-1');

    expect(result).toEqual({ enqueued: false, jobId: 'job-existing' });
    expect(mocked.imageJob.create).not.toHaveBeenCalled();
  });
});

describe('ImageService.processNext', () => {
  const JOB = {
    id: 'job-1', cardId: 'card-1', status: 'PENDING', priority: 0,
    retryCount: 0, maxRetries: 3, imagePrompt: 'safe prompt',
    createdAt: new Date(), updatedAt: new Date(),
  };

  test('ไม่มี external provider → placeholder route + COMPLETED + อัปเดต imageUrl', async () => {
    mocked.imageJob.findMany.mockResolvedValueOnce([JOB]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(CARD_BASE);
    mocked.imageJob.update.mockResolvedValueOnce({});
    mocked.cardDefinition.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('COMPLETED');
    expect(result?.resultUrl).toBe('/api/cards/card-1/image');
    expect(mocked.cardDefinition.update).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: { imageUrl: '/api/cards/card-1/image' },
    });
  });

  test('ล็อกงานไม่สำเร็จ (worker อื่นแย่ง) → SKIPPED', async () => {
    mocked.imageJob.findMany.mockResolvedValueOnce([JOB]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await ImageService.processNext();

    expect(result?.status).toBe('SKIPPED');
    expect(mocked.imageJob.update).not.toHaveBeenCalled();
  });

  test('พลาดครั้งแรก → กลับเข้าคิว PENDING + retryCount+1 (RETRY)', async () => {
    mocked.imageJob.findMany.mockResolvedValueOnce([{
      ...JOB, retryCount: 1, updatedAt: new Date(Date.now() - 300_000),
    }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(null);
    mocked.imageJob.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('RETRY');
    expect(mocked.imageJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'PENDING', retryCount: 2, errorMessage: 'ไม่พบการ์ดของงานนี้' }),
    });
  });

  test('เกิน maxRetries → FAILED', async () => {
    mocked.imageJob.findMany.mockResolvedValueOnce([{
      ...JOB, retryCount: 2, updatedAt: new Date(Date.now() - 300_000),
    }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(null);
    mocked.imageJob.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('FAILED');
    expect(mocked.imageJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'FAILED', retryCount: 3 }),
    });
  });

  test('งาน retry ยังไม่พ้น backoff → ข้าม', async () => {
    const recentUpdate = new Date(Date.now() - 10_000); // 10 วิก่อน < backoff 30 วิ
    mocked.imageJob.findMany.mockResolvedValueOnce([{ ...JOB, retryCount: 1, updatedAt: recentUpdate }]);

    const result = await ImageService.processNext();

    expect(result).toBeNull();
    expect(mocked.imageJob.updateMany).not.toHaveBeenCalled();
  });

  test('งาน retry พ้น backoff แล้ว → ประมวลผลได้', async () => {
    const oldUpdate = new Date(Date.now() - 120_000); // 2 นาที > backoff 30 วิ
    mocked.imageJob.findMany.mockResolvedValueOnce([{ ...JOB, retryCount: 1, updatedAt: oldUpdate }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(CARD_BASE);
    mocked.imageJob.update.mockResolvedValueOnce({});
    mocked.cardDefinition.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();
    expect(result?.status).toBe('COMPLETED');
  });
});

describe('ImageService.requeueFailed', () => {
  test('FAILED → PENDING และรีเซ็ต retryCount', async () => {
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 4 });

    const count = await ImageService.requeueFailed();

    expect(count).toBe(4);
    expect(mocked.imageJob.updateMany).toHaveBeenCalledWith({
      where: { status: 'FAILED' },
      data: { status: 'PENDING', retryCount: 0, errorMessage: null },
    });
  });
});

