// AI Image Generation — provider adapter (Phase 14)
// ทำหน้าที่สร้าง "ภาพจริง" ให้การ์ดด้วยโมเดล AI ผ่าน HTTP API (ไม่ผูกกับยี่ห้อใด)
//
// Providers ที่รองรับ:
// - `pollinations` (ค่าเริ่มต้น, ใช้ฟรีไม่ต้องมี key): GET https://image.pollinations.ai/prompt/<prompt>?width&height&seed&nologo
// - `generic` (POST JSON + Bearer key คืน { url } หรือ { data: [{ url }] }) — สำหรับผู้ให้บริการทั่วไป
//
// หลักการ: prompt/metadata deterministic จาก canonicalSeedHash (seed เดิม → ภาพเดิม) และ prompt ต้องผ่าน isPromptSafe
import { isPromptSafe } from '@/lib/image-placeholder';
import { setDefaultResultOrder } from 'node:dns';

/**
 * ผู้ให้บริการฟรีกักคิวต่อ "IP" — พบว่า IPv6 ของเครื่องนี้ค้าง แต่ IPv4 ใช้ได้
 * จึงบังคับให้ resolve แบบ IPv4 ก่อน (ทำครั้งเดียวต่อโปรเซส)
 */
let dnsOrderApplied = false;
function preferIpv4(): void {
  if (dnsOrderApplied) return;
  try {
    setDefaultResultOrder('ipv4first');
  } catch {
    // environment ที่ไม่มี node:dns (เช่น edge runtime) → ข้าม
  }
  dnsOrderApplied = true;
}

export interface AiImageCardInput {
  name: string;
  nameTh?: string | null;
  element: string;
  rarity: string;
  role: string;
  loreTh?: string | null;
  canonicalSeedHash: string;
}

export interface AiImageOptions {
  width?: number;
  height?: number;
  /** บังคับ provider (ค่าเริ่มต้นอ่านจาก env) */
  provider?: 'pollinations' | 'generic';
  timeoutMs?: number;
}

const ELEMENT_VISUAL: Record<string, { en: string; motifs: string; scene: string; mood: string }> = {
  EMBERBOUND: { en: 'fire', motifs: 'flame tongues, drifting ash, molten cracks, volcanic rock, glowing embers', scene: 'a ruined forge city under a crimson sky', mood: 'fierce and burning' },
  TIDEBORN: { en: 'water', motifs: 'deep currents, mist, water crystals, coral ruins, silver droplets', scene: 'a drowned temple beneath a still lagoon', mood: 'serene yet dangerous' },
  SKYRIVEN: { en: 'wind', motifs: 'spiral gales, feathers, torn clouds, lightning arcs, rising dust', scene: 'cliff peaks above an endless storm front', mood: 'swift and untamed' },
  ROOTFORGED: { en: 'earth', motifs: 'ancient roots, carved stone, moss, ore veins, crystal geodes', scene: 'a hollow mountain mine lit by glowing ore', mood: 'steadfast and heavy' },
  DAWNSWORN: { en: 'light', motifs: 'radiant beams, golden dust, geometric rune light, dawn halos, ivory banners', scene: 'a sky-tower at sunrise above the clouds', mood: 'hopeful and luminous' },
  VEILMARKED: { en: 'shadow', motifs: 'veil mist, cracks in reality, crescent moon, violet runes, silver smoke', scene: 'a moonless gate wreathed in indigo fog', mood: 'mysterious and ominous' },
};

const ROLE_VISUAL: Record<string, string> = {
  WARRIOR: 'a frontline warrior with a runed blade',
  MAGE: 'an arcane spellcaster weaving rune sigils',
  HEALER: 'a gentle healer with restorative aura',
  TANK: 'a towering guardian in layered armour',
  ASSASSIN: 'a swift shadow assassin with twin daggers',
  SUPPORT: 'a banner-bearing support with protective wards',
};

const RARITY_VISUAL: Record<string, string> = {
  COMMON: 'plain, grounded, believable gear',
  UNCOMMON: 'refined detail with a small magical flourish',
  RARE: 'ornate gear with glowing signature accents',
  EPIC: 'elaborate regalia with powerful magic aura',
  LEGENDARY: 'heroic, awe-inspiring presence with radiant effects',
  MYTHIC: 'mythic, otherworldly manifestation of raw elemental power',
};

/** สร้าง prompt สำหรับ AI — deterministic จากข้อมูลการ์ด (ต้องผ่าน isPromptSafe เสมอ) */
export function buildCardImagePrompt(card: AiImageCardInput): string {
  const element = ELEMENT_VISUAL[card.element] ?? ELEMENT_VISUAL.VEILMARKED;
  const role = ROLE_VISUAL[card.role] ?? 'a mysterious rune-touched figure';
  const rarity = RARITY_VISUAL[card.rarity] ?? 'balanced detail';
  const lore = (card.loreTh ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);

  const prompt = [
    `Original high-fantasy collectible card illustration of ${role}`,
    `aligned to ${element.en} (${element.motifs}).`,
    `Scene: ${element.scene}.`,
    `Mood: ${element.mood}; ${rarity}.`,
    'Dynamic cinematic composition, strong central silhouette, dramatic elemental magic, rich material textures, painterly digital illustration, original fantasy world, no text, no letters, no logo, no watermark, no card frame, no border, no UI.',
    lore ? `Story hint: ${lore}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return prompt.replace(/\s+/g, ' ').trim();
}

/** seed ตัวเลข (0..2^31) จาก canonicalSeedHash → การ์ดเดิมได้ภาพเดิม */
export function seedFromHash(hash: string): number {
  const clean = hash.replace(/[^0-9a-fA-F]/g, '').padEnd(8, '0').slice(0, 8);
  return parseInt(clean, 16) % 2_147_483_647;
}

function resolveProvider(options: AiImageOptions): 'pollinations' | 'generic' {
  if (options.provider) return options.provider;
  const configured = (process.env.AI_IMAGE_PROVIDER ?? '').toLowerCase();
  if (configured === 'generic') return 'generic';
  if (configured === 'pollinations') return 'pollinations';
  const url = process.env.AI_IMAGE_API_URL ?? '';
  if (url.includes('pollinations')) return 'pollinations';
  return url ? 'generic' : 'pollinations';
}

/** เปิดใช้ AI จริงหรือไม่ (ปิดได้ด้วย AI_IMAGE_DISABLED=1 เพื่อกลับไปใช้ placeholder) */
export function aiImageEnabled(): boolean {
  if (process.env.AI_IMAGE_DISABLED === '1') return false;
  if (resolveProvider({}) === 'pollinations') return true;
  return Boolean(process.env.AI_IMAGE_API_URL && process.env.AI_IMAGE_API_KEY);
}

/** สร้าง URL ของ pollinations จาก prompt (GET, ไม่ต้องมี key) */
export function buildPollinationsUrl(card: AiImageCardInput, options: AiImageOptions = {}): string {
  const base = (process.env.AI_IMAGE_API_URL ?? '').includes('pollinations')
    ? process.env.AI_IMAGE_API_URL!
    : 'https://image.pollinations.ai/prompt';
  const width = options.width ?? 896;
  const height = options.height ?? 512;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seedFromHash(card.canonicalSeedHash)),
    nologo: 'true',
    model: process.env.AI_IMAGE_MODEL || 'sana',
  });
  return `${base.replace(/\/$/, '')}/${encodeURIComponent(buildCardImagePrompt(card))}?${params.toString()}`;
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
  provider: 'pollinations' | 'generic';
  prompt: string;
}

/** ตรวจว่าไบต์ที่ได้เป็นภาพจริง (กันหน้า HTML error ถูกบันทึกเป็นรูป) */
function detectImageType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/** ดาวน์โหลดภาพจาก URL → bytes (ตรวจชนิดไฟล์ด้วย) */
async function downloadImage(url: string, timeoutMs: number): Promise<{ bytes: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`ดาวน์โหลดภาพไม่สำเร็จ (HTTP ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const detected = detectImageType(bytes) ?? res.headers.get('content-type') ?? '';
  if (!detected.startsWith('image/')) {
    throw new Error(`ผู้ให้บริการไม่ได้ส่งภาพกลับมา (content-type: ${detected || 'unknown'})`);
  }
  return { bytes, contentType: detected };
}

/**
 * สร้างภาพการ์ดด้วย AI → คืน bytes พร้อม prompt ที่ใช้
 * รองรับ retry 2 ครั้ง (ผู้ให้บริการฟรีบางครั้งช้า/สะดุด)
 */
export async function generateCardImageBytes(
  card: AiImageCardInput,
  options: AiImageOptions = {}
): Promise<GeneratedImage> {
  preferIpv4();
  const prompt = buildCardImagePrompt(card);
  if (!isPromptSafe(prompt)) throw new Error('prompt ไม่ผ่านการตรวจเนื้อหา');

  const provider = resolveProvider(options);
  const timeoutMs = options.timeoutMs ?? Number(process.env.AI_IMAGE_TIMEOUT_MS ?? 45_000);
  let lastError: unknown = null;

  /** ผู้ให้บริการฟรีตอบ 429 เมื่อคิวเต็ม (1 งาน/IP) → ต้องรอนานกว่าปกติ */
  const isRateLimit = (error: unknown): boolean =>
    /429|too many requests|queue full/i.test(error instanceof Error ? error.message : String(error));

  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      if (provider === 'pollinations') {
        const url = buildPollinationsUrl(card, options);
        const { bytes, contentType } = await downloadImage(url, timeoutMs);
        return { bytes, contentType, provider, prompt };
      }

      const apiUrl = process.env.AI_IMAGE_API_URL;
      const apiKey = process.env.AI_IMAGE_API_KEY;
      if (!apiUrl || !apiKey) throw new Error('ไม่ได้ตั้งค่า AI provider (AI_IMAGE_API_URL / AI_IMAGE_API_KEY)');

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          prompt,
          n: 1,
          size: `${options.width ?? 896}x${options.height ?? 512}`,
          seed: seedFromHash(card.canonicalSeedHash),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`AI provider ตอบ ${res.status}`);
      const json = (await res.json()) as { url?: string; data?: Array<{ url?: string; b64_json?: string }> };
      const direct = json.url ?? json.data?.[0]?.url;
      if (direct) {
        const { bytes, contentType } = await downloadImage(direct, timeoutMs);
        return { bytes, contentType, provider, prompt };
      }
      const b64 = json.data?.[0]?.b64_json;
      if (b64) {
        const bytes = Buffer.from(b64, 'base64');
        const detected = detectImageType(bytes);
        if (!detected) throw new Error('ผู้ให้บริการส่ง base64 ที่ไม่ใช่ภาพ');
        return { bytes, contentType: detected, provider, prompt };
      }
      throw new Error('AI provider ไม่ส่ง URL/base64 ภาพกลับมา');
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        // base delay ปรับได้ผ่าน env (เทสต์ตั้งให้สั้น เพื่อไม่ให้รอนาน)
        const base = Number(process.env.AI_IMAGE_RETRY_BASE_MS ?? 3000);
        const waitMs = isRateLimit(error) ? base * 5 * (attempt + 1) : base * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('สร้างภาพไม่สำเร็จ');
}

