import { generatePlaceholderSvg, isPromptSafe } from '@/lib/image-placeholder';
import { aiImageEnabled, buildCardImagePrompt, describeCardPrompt } from '@/lib/ai-image';
import { saveCardArt } from '@/lib/card-art-store';
import { backoffDelayMs, ImageService } from '@/services/image';
import { prisma } from '@/lib/prisma';

jest.mock('@/lib/card-art-store', () => ({
  saveCardArt: jest.fn(async (cardId: string) => `/api/cards/${cardId}/art`),
  cardArtUrl: (cardId: string) => `/api/cards/${cardId}/art`,
  readCardArt: jest.fn(async () => null),
  hasCardArt: jest.fn(async () => false),
}));

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
      updateMany: jest.fn(),
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
    updateMany: jest.Mock;
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
  delete process.env.AI_IMAGE_PROVIDER;
  // เทสต์ต้องไม่ยิงไปผู้ให้บริการจริง → ปิด AI เป็นค่าเริ่มต้น
  process.env.AI_IMAGE_DISABLED = '1';
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

// Phase 13: งานศิลป์ต้องหลากหลายจริง ไม่ใช่รูปเดิมเปลี่ยนแต่ชื่อ
describe('generatePlaceholderSvg (ความหลากหลายของงานศิลป์)', () => {
  const hashOf = (seed: string) => require('crypto').createHash('sha256').update(seed).digest('hex');

  test('การ์ด 20 ใบ (hash ต่างกัน) → ภาพไม่ซ้ำกันเลย', () => {
    const svgs = new Set(
      Array.from({ length: 20 }, (_, i) =>
        generatePlaceholderSvg({ ...CARD_BASE, canonicalSeedHash: hashOf(`variety-${i}`) })
      )
    );
    expect(svgs.size).toBe(20);
  });

  test('มีฉากหลายแบบ (style archetype) อย่างน้อย 4 แบบใน 20 ใบ', () => {
    const styles = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const svg = generatePlaceholderSvg({ ...CARD_BASE, canonicalSeedHash: hashOf(`style-${i}`) });
      const match = svg.match(/ฉาก(วงแหวนออร่า|ฟ้าดารา|ภูมิทัศน์|พายุคลั่ง|มันดาลารูน|สุริยุปราคา)/);
      if (match) styles.add(match[1]);
    }
    expect(styles.size).toBeGreaterThanOrEqual(4);
  });

  test('ธาตุต่างกัน → ใช้สีคนละชุด', () => {
    const ember = generatePlaceholderSvg({ ...CARD_BASE, element: 'EMBERBOUND', canonicalSeedHash: hashOf('e') });
    const tide = generatePlaceholderSvg({ ...CARD_BASE, element: 'TIDEBORN', canonicalSeedHash: hashOf('e') });
    expect(ember).toContain('#c2410c');
    expect(tide).toContain('#0369a1');
    expect(ember).not.toBe(tide);
  });

  test('ส่ง role มา → ใช้ตราประจำบทบาทนั้น', () => {
    const tank = generatePlaceholderSvg({ ...CARD_BASE, role: 'TANK', canonicalSeedHash: hashOf('role-tank') });
    const assassin = generatePlaceholderSvg({ ...CARD_BASE, role: 'ASSASSIN', canonicalSeedHash: hashOf('role-tank') });
    expect(tank).toContain('M0,-30 L24,-20 L24,4'); // shield (TANK)
    expect(assassin).toContain('M0,-32 L5,-6 L3,26'); // dagger (ASSASSIN)
  });

  test('ไม่ส่ง role → ยังเจนได้ (เลือกตราจาก hash)', () => {
    const svg = generatePlaceholderSvg({ ...CARD_BASE, canonicalSeedHash: hashOf('no-role') });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/<path d="M/);
  });

  test('การ์ดมีองค์ประกอบครบ (กรอบ/ช่องภาพ/กล่องคำบรรยาย/แถบสเตตัส)', () => {
    const svg = generatePlaceholderSvg({
      ...CARD_BASE,
      role: 'MAGE',
      canonicalSeedHash: hashOf('rich'),
      stats: { atk: 120, def: 90, hp: 300, spd: 22, manaCost: 3 },
      skills: [{ name: 'แสงศักดิ์สิทธิ์', description: 'สร้างดาเมจแก่ Veilmarked เป็นพิเศษ', manaCost: 3 }],
      descriptionTh: 'นักรบจากดินแดนเพลิง',
      loreTh: 'อักษรแรกเริ่มถูกเผาไว้บนเถ้าถ่าน',
    });
    // กรอบ + ช่องภาพ + ฉาก + ลายธาตุ + ตัวแบบ + กล่องข้อความ + แถบสเตตัส
    expect(svg).toContain('url(#cardFrame)');
    expect(svg).toContain('url(#cardArt)');
    expect(svg).toContain('clip-path="url(#cardArtClip)"');
    expect(svg).toContain('url(#cardMotif)');
    expect(svg).toContain('url(#cardText)');
    expect(svg).toContain('คุณสมบัติ / EFFECT');
    expect(svg).toContain('ATK');
    expect(svg).toContain('DEF');
    expect(svg).toContain('แสงศักดิ์สิทธิ์');
    expect(svg).toContain('นักรบเพลิง');
    // รายละเอียดมากพอที่จะดู "อลังการ" (เดิม ~1.5KB)
    expect(svg.length).toBeGreaterThan(6000);
  });

  test('ระดับความหายากกำหนดสีกรอบ — ทอง (MYTHIC) ต่างจากเทา (COMMON)', () => {
    // ใช้ธาตุน้ำเพื่อไม่ให้ปนกับสีทองของธาตุเพลิง
    const base = { ...CARD_BASE, element: 'TIDEBORN' };
    const common = generatePlaceholderSvg({ ...base, rarity: 'COMMON', canonicalSeedHash: hashOf('frame') });
    const mythic = generatePlaceholderSvg({ ...base, rarity: 'MYTHIC', canonicalSeedHash: hashOf('frame') });
    expect(common).toContain('stop-color="#9ca3af"'); // กรอบเทาเหล็ก
    expect(mythic).toContain('stop-color="#fbbf24"'); // กรอบทองคำ
    expect(mythic).not.toContain('stop-color="#9ca3af"');
  });

  test('การ์ดระดับสูงมีเอฟเฟกต์โฮโลแกรม ส่วนระดับล่างไม่มี', () => {
    const common = generatePlaceholderSvg({ ...CARD_BASE, rarity: 'COMMON', canonicalSeedHash: hashOf('holo') });
    const epic = generatePlaceholderSvg({ ...CARD_BASE, rarity: 'EPIC', canonicalSeedHash: hashOf('holo') });
    expect(common).not.toContain('url(#cardHolo)');
    expect(epic).toContain('url(#cardHolo)');
  });

  test('โหมด overlay: เว้นช่องภาพโปร่งใส + ยังมีกรอบ/ข้อความครบ', () => {
    const card = {
      ...CARD_BASE,
      role: 'WARRIOR' as const,
      canonicalSeedHash: hashOf('overlay'),
      stats: { atk: 100, def: 70, hp: 220, spd: 20, manaCost: 3 },
      skills: [{ name: 'คมดาบเถ้าร้อน', description: 'ฟันกว้างและติด Burn', manaCost: 3 }],
      descriptionTh: 'นักรบจากดินแดนเถ้าถ่าน',
      loreTh: 'อักษรแรกเริ่มถูกเผาไว้บนเถ้าถ่าน',
    };
    const overlay = generatePlaceholderSvg(card, { mode: 'overlay' });
    const full = generatePlaceholderSvg(card, { mode: 'full' });

    // โหมด overlay ต้องไม่มีฉาก/ตัวแบบที่วาดเอง (ให้ภาพ AI เป็นเลเยอร์ล่าง)
    expect(overlay).not.toContain('url(#cardArt)');
    expect(overlay).toContain('url(#cardVig)');

    // ทั้งสองโหมดต้องมีส่วนประกอบการ์ดครบเหมือนกัน
    for (const svg of [overlay, full]) {
      expect(svg).toContain('url(#cardFrame)');
      expect(svg).toContain('คุณสมบัติ / EFFECT');
      expect(svg).toContain('คมดาบเถ้าร้อน');
      expect(svg).toContain('ATK');
      expect(svg).toContain('★');
    }
    expect(overlay.length).toBeLessThan(full.length);
  });

  // Regression: เดิม overlay วาด <rect> กรอบแบบ "ทึบเต็มใบ" ทับภาพ AI → รูปการ์ดไม่แสดงเลย
  test('โหมด overlay: กรอบเป็นวงแหวนโปร่งกลาง (ห้ามมี rect ทึบเต็มใบ)', () => {
    const card = {
      ...CARD_BASE,
      role: 'TANK' as const,
      canonicalSeedHash: hashOf('ring'),
    };
    const overlay = generatePlaceholderSvg(card, { mode: 'overlay' });
    const full = generatePlaceholderSvg(card, { mode: 'full' });

    // ต้องมีกรอบวงแหวน (path + evenodd) ไม่ใช่ rect ทึบ
    expect(overlay).toContain('fill-rule="evenodd"');
    expect(overlay).not.toMatch(/<rect[^>]*x="8"[^>]*y="8"[^>]*width="404"[^>]*height="584"[^>]*fill="#03040a"/);
    expect(overlay).not.toMatch(/<rect[^>]*width="404"[^>]*height="584"[^>]*fill="url\(#cardFrame\)"/);

    // โหมด full ยังคงมีพื้นหลังการ์ดทึบ (ไม่ต้องโปร่ง)
    expect(full).toMatch(/<rect[^>]*width="404"[^>]*height="584"[^>]*fill="#03040a"/);
  });

  test('พิมพ์คำบรรยายคุณสมบัติลงในกรอบการ์ด (สกิล + คำอธิบาย + lore)', () => {
    const svg = generatePlaceholderSvg({
      ...CARD_BASE,
      role: 'HEALER',
      canonicalSeedHash: hashOf('text'),
      stats: { atk: 88, def: 60, hp: 240, spd: 18, manaCost: 4 },
      skills: [
        { name: 'วังวนแห่งความทรงจำ', description: 'ฟื้นฟูหลายเป้าหมายและล้าง Weaken', manaCost: 3 },
        { name: 'โล่เกลียวคลื่น', description: 'สร้างโล่ให้แนวหน้าและล้าง debuff', manaCost: 4 },
      ],
      descriptionTh: 'ผู้รักษาจากห้วงน้ำแห่งความทรงจำ',
      loreTh: 'สายน้ำใน Aetherra จดจำเรื่องนี้ไว้ว่า',
    });
    expect(svg).toContain('วังวนแห่งความทรงจำ');
    expect(svg).toContain('ฟื้นฟูหลายเป้าหมายและล้าง Weaken');
    expect(svg).toContain('โล่เกลียวคลื่น');
    expect(svg).toContain('ผู้รักษาจากห้วงน้ำแห่งความทรงจำ');
    expect(svg).toContain('จดจำเรื่องนี้ไว้ว่า');
    expect(svg).toContain('88'); // ATK ถูกพิมพ์ในแถบสเตตัส
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
        // prompt ต้องบอกธาตุ/บทบาทของการ์ด (ธีม Aetherra)
        imagePrompt: expect.stringContaining('warrior'),
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
      data: { imageUrl: '/api/cards/card-1/image', imageStatus: 'READY' },
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

  test('เกิน maxRetries → FAILED + มาร์กการ์ดเป็น FAILED', async () => {
    // การ์ดมีจริง แต่ prompt ที่ผูกกับงานไม่ผ่าน moderation → ล้มเหลวถาวรเมื่อเกิน maxRetries
    mocked.imageJob.findMany.mockResolvedValueOnce([{
      ...JOB, retryCount: 2, updatedAt: new Date(Date.now() - 300_000),
      imagePrompt: 'ภาพโป๊ของฮีโร่',
    }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(CARD_BASE);
    mocked.imageJob.update.mockResolvedValueOnce({});
    mocked.cardDefinition.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('FAILED');
    expect(mocked.imageJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({ status: 'FAILED', retryCount: 3 }),
    });
    // การ์ดต้องถูกทำเครื่องหมาย FAILED เพื่อให้ UI ไม่ค้าง "รอสร้างภาพ" ตลอดไป
    expect(mocked.cardDefinition.update).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: { imageStatus: 'FAILED' },
    });
  });

  test('หาการ์ดไม่เจอ + เกิน maxRetries → FAILED โดยไม่แตะการ์ด', async () => {
    mocked.imageJob.findMany.mockResolvedValueOnce([{
      ...JOB, retryCount: 2, updatedAt: new Date(Date.now() - 300_000),
    }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(null);
    mocked.imageJob.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('FAILED');
    expect(mocked.cardDefinition.update).not.toHaveBeenCalled();
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
    mocked.imageJob.findMany.mockResolvedValueOnce([]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 4 });

    const count = await ImageService.requeueFailed();

    expect(count).toBe(4);
    expect(mocked.imageJob.updateMany).toHaveBeenCalledWith({
      where: { status: 'FAILED' },
      data: { status: 'PENDING', retryCount: 0, errorMessage: null },
    });
  });

  test('requeue แล้วการ์ดที่เคย FAILED กลับเป็น PENDING (UI กลับมา "รอสร้างภาพ")', async () => {
    mocked.imageJob.findMany.mockResolvedValueOnce([{ cardId: 'card-1' }, { cardId: 'card-2' }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 2 });
    mocked.cardDefinition.updateMany.mockResolvedValueOnce({ count: 2 });

    const count = await ImageService.requeueFailed();

    expect(count).toBe(2);
    expect(mocked.cardDefinition.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['card-1', 'card-2'] } },
      data: { imageStatus: 'PENDING' },
    });
  });
});


// Phase 14: เส้นทาง AI จริง (mock ผู้ให้บริการ + ที่เก็บไฟล์ → ไม่แตะเครือข่าย/ดิสก์จริง)
describe('ImageService + AI provider (Phase 14)', () => {
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const CARD_WITH_HASH = { ...CARD_BASE, canonicalSeedHash: 'a3f19c8e77b2d4001122334455667788' };

  test('aiImageEnabled: ค่าเริ่มต้น (pollinations) เปิด แต่ปิดได้ด้วย AI_IMAGE_DISABLED=1', () => {
    delete process.env.AI_IMAGE_DISABLED;
    delete process.env.AI_IMAGE_PROVIDER;
    expect(aiImageEnabled()).toBe(true);

    process.env.AI_IMAGE_DISABLED = '1';
    expect(aiImageEnabled()).toBe(false);
  });

  test('มี AI → สร้างภาพจริง เก็บไฟล์ และตั้ง imageUrl เป็น /api/cards/<id>/art', async () => {
    delete process.env.AI_IMAGE_DISABLED;
    process.env.AI_IMAGE_PROVIDER = 'pollinations';
    // resetAllMocks() ล้าง implementation ของ mock → ต้องตั้งใหม่ต่อเทสต์
    (saveCardArt as unknown as jest.Mock).mockResolvedValue('/api/cards/card-1/art');

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => jpegHeader.buffer.slice(0),
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    mocked.imageJob.findMany.mockResolvedValueOnce([{
      id: 'job-ai', cardId: 'card-1', status: 'PENDING', priority: 0,
      retryCount: 0, maxRetries: 3, imagePrompt: 'safe prompt',
      createdAt: new Date(), updatedAt: new Date(),
    }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(CARD_WITH_HASH);
    mocked.imageJob.update.mockResolvedValueOnce({});
    mocked.cardDefinition.update.mockResolvedValueOnce({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('COMPLETED');
    expect(result?.resultUrl).toBe('/api/cards/card-1/art');
    expect(fetchMock).toHaveBeenCalled();
    expect(mocked.cardDefinition.update).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: { imageUrl: '/api/cards/card-1/art', imageStatus: 'READY' },
    });
  });

  test('ผู้ให้บริการตอบไม่ใช่ภาพ (เช่น HTML error) → RETRY ไม่บันทึกเป็นภาพ', async () => {
    delete process.env.AI_IMAGE_DISABLED;
    process.env.AI_IMAGE_PROVIDER = 'pollinations';
    process.env.AI_IMAGE_RETRY_BASE_MS = '1';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      arrayBuffer: async () => Buffer.from('<html>error</html>').buffer.slice(0),
    });
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;

    mocked.imageJob.findMany.mockResolvedValueOnce([{
      id: 'job-bad', cardId: 'card-1', status: 'PENDING', priority: 0,
      retryCount: 0, maxRetries: 3, imagePrompt: 'safe prompt',
      createdAt: new Date(), updatedAt: new Date(),
    }]);
    mocked.imageJob.updateMany.mockResolvedValueOnce({ count: 1 });
    mocked.cardDefinition.findUnique.mockResolvedValueOnce(CARD_WITH_HASH);
    mocked.imageJob.update.mockResolvedValue({});

    const result = await ImageService.processNext();

    expect(result?.status).toBe('RETRY');
    expect(mocked.cardDefinition.update).not.toHaveBeenCalled();
  }, 30_000);
});


// Phase 14.2: prompt ต้อง "หลากหลายจริง" — คน/สัตว์/อสูร/สิ่งของ/ภูมิทัศน์ ไม่ใช่แนวเดิมซ้ำ
describe('buildCardImagePrompt (ความหลากหลายของ prompt)', () => {
  const base = {
    name: 'Test Card',
    nameTh: 'การ์ดทดสอบ',
    element: 'EMBERBOUND',
    rarity: 'RARE',
    role: 'WARRIOR',
    loreTh: 'อักษรแรกเริ่มถูกเผาไว้บนเถ้าถ่าน',
  };
  const hashOf = (seed: string) => require('crypto').createHash('sha256').update(seed).digest('hex');
  const cards = Array.from({ length: 60 }, (_, i) => ({ ...base, canonicalSeedHash: hashOf(`prompt-${i}`) }));

  test('การ์ดใบเดิม → prompt เดิมเสมอ (deterministic)', () => {
    expect(buildCardImagePrompt(cards[0])).toBe(buildCardImagePrompt(cards[0]));
    expect(describeCardPrompt(cards[0])).toEqual(describeCardPrompt(cards[0]));
  });

  test('60 ใบ → prompt ไม่ซ้ำกันเลย', () => {
    const prompts = new Set(cards.map((c) => buildCardImagePrompt(c)));
    expect(prompts.size).toBe(cards.length);
  });

  test('มี "ตัวแบบ" หลากหลายอย่างน้อย 10 แบบใน 60 ใบ (คน/สัตว์/อสูร/สิ่งของ/ภูมิทัศน์)', () => {
    const subjects = new Set(cards.map((c) => describeCardPrompt(c).subject));
    expect(subjects.size).toBeGreaterThanOrEqual(10);
  });

  test('ทุกรายละเอียดภาพ (องค์ประกอบ/แสง/สื่อ/รายละเอียด/พลิกฉาก) มีความหลากหลาย', () => {
    const d = cards.map((c) => describeCardPrompt(c));
    for (const key of ['composition', 'lighting', 'medium', 'detail', 'twist'] as const) {
      const unique = new Set(d.map((x) => x[key]));
      expect(unique.size).toBeGreaterThanOrEqual(3);
    }
  });

  test('prompt มีข้อมูลการ์ด + คำสั่งห้ามข้อความในภาพ + ผ่าน isPromptSafe', () => {
    for (const card of cards.slice(0, 10)) {
      const prompt = buildCardImagePrompt(card);
      const lower = prompt.toLowerCase();
      expect(prompt).toContain(card.name);
      expect(lower).toContain('no text');
      expect(lower).toContain('no card frame');
      expect(prompt).toContain('Composition:');
      expect(prompt).not.toContain('[object');
      expect(isPromptSafe(prompt)).toBe(true);
    }
  });

  test('ธาตุ/บทบาท/ระดับ ยังถูกอ้างถึงใน prompt (ธีมไม่หลุด)', () => {
    const prompt = buildCardImagePrompt({ ...cards[3], element: 'TIDEBORN', role: 'HEALER', rarity: 'MYTHIC' }).toLowerCase();
    expect(prompt).toContain('tideborn');
    expect(prompt).toContain('healer');
    expect(prompt).toContain('mythic');
    expect(prompt).toContain('deep blue, cyan and silver');
  });
});

