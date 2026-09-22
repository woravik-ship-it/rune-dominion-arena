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
import crypto from 'node:crypto';

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

// ===== คลังคำสำหรับสร้าง prompt (ให้หลากหลายจริง: คน/สัตว์/อสูร/สิ่งของ/ภูมิทัศน์/สถาปัตยกรรม) =====
// ทุกมิติเลือกจาก canonicalSeedHash → deterministic (การ์ดเดิมได้ภาพเดิม) แต่การ์ดต่างใบได้คนละแนวชัดเจน

interface SubjectDef {
  id: string;
  en: string;
  /** ธาตุที่เข้ากันเป็นพิเศษ (ถ้ามี) — ใช้ถ่วงน้ำหนักให้เหมาะ ไม่ใช่บังคับ */
  elements?: string[];
}

/** แบบของ "สิ่งที่อยู่ในภาพ" — ครอบคลุมทั้งคน สัตว์ สิ่งของ สถานที่ */
const SUBJECTS: SubjectDef[] = [
  // มนุษย์ / ฮีโร่
  { id: 'hero', en: 'a lone hero in rune-etched armour' },
  { id: 'sorceress', en: 'a robed sorceress weaving rune sigils in mid-air' },
  { id: 'ranger', en: 'a hooded ranger on a rocky ledge with a longbow drawn' },
  { id: 'monk', en: 'a martial monk in flowing wraps, caught mid-strike' },
  { id: 'apprentice', en: 'a young apprentice clutching a glowing rune shard' },
  { id: 'lorekeeper', en: 'an ancient lorekeeper with a staff carved with runes' },
  { id: 'smith', en: 'a wandering smith at a portable forge, sparks flying' },
  { id: 'bard', en: 'a travelling bard singing to a crowd in a torchlit square' },
  // สัตว์ / อสูร
  { id: 'beast', en: 'a six-legged elemental beast prowling low to the ground' },
  { id: 'serpent', en: 'a colossal winged serpent coiling through storm clouds' },
  { id: 'spiritfox', en: 'a many-tailed spirit fox with runes drifting from its fur' },
  { id: 'crab', en: 'a giant crystal-shelled crab on black volcanic sand' },
  { id: 'moth', en: 'a giant luminous moth with pattern-marked wings' },
  { id: 'stag', en: 'a crowned stag whose antlers hold small floating flames' },
  { id: 'whale', en: 'an enormous rune-scarred sky-whale drifting above the clouds' },
  { id: 'wolfpack', en: 'a pack of spectral wolves running through shallow fog' },
  // สิ่งของ / อาวุธ / สิ่งประดิษฐ์
  { id: 'blade', en: 'a runed greatsword floating point-down, humming with power' },
  { id: 'relic', en: 'an ornate relic chest half-buried, light leaking from its seams' },
  { id: 'lantern', en: 'a floating regal lantern casting long dramatic shadows' },
  { id: 'tome', en: 'a chained grimoire open on a stone lectern, pages turning by themselves' },
  { id: 'emptyarmour', en: 'an empty suit of animated armour standing guard' },
  { id: 'mosaic', en: 'a shattered rune mosaic reassembling itself in mid-air' },
  { id: 'coin', en: 'a hoard of ancient rune-coins spilling from a broken urn' },
  { id: 'banner', en: 'a tattered war-banner planted on a wind-blasted ridge' },
  // ภูมิทัศน์ / สถาปัตยกรรม
  { id: 'vista', en: 'a vast elemental vista with a tiny lone figure on a precipice' },
  { id: 'gate', en: 'an immense rune gate half-swallowed by the landscape' },
  { id: 'temple', en: 'a half-sunken temple with light shafts through collapsed domes' },
  { id: 'bazaar', en: 'a crowded night bazaar of rune-traders lit by hanging lanterns' },
  { id: 'bridge', en: 'a rope bridge spanning a glowing chasm between two spires' },
  { id: 'library', en: 'an endless underground library of stone tablets and floating scrolls' },
];

const POSES = [
  'standing tall', 'leaping forward', 'summoning with both hands raised', 'striking downward',
  'guarding a threshold', 'kneeling in prayer', 'climbing a sheer cliff', 'riding into view',
  'forging at an anvil', 'awakening from stone', 'walking away from an explosion of light',
  'reaching toward a floating rune',
];

const COMPOSITIONS = [
  'low-angle hero shot', 'wide establishing shot', 'tight medium close-up',
  'over-the-shoulder framing', 'isometric diorama view', 'bold silhouette against a bright sky',
  'centered symmetrical icon', 'diagonal dynamic composition', 'extreme foreshortening',
  'top-down bird\'s-eye view',
];

const LIGHTING = [
  'hard backlit rim light', 'stormy side light', 'warm torchlit key light',
  'cold moonlit top light', 'pale dawn haze', 'underwater caustic light',
  'ember glow from below', 'flickering lightning flashes', 'single shaft of light through fog',
  'harsh midday desert sun',
];

const MEDIA = [
  'painterly digital illustration', 'gouache fantasy painting', 'ink and watercolour wash',
  'textured oil-painting look', 'stylised concept-art rendering', 'etched engraving with colour',
];

const DETAILS = [
  'rich material textures', 'grass and dust caught in the wind', 'floating rune particles',
  'rain-soaked reflective surfaces', 'steam and smoke curling upward', 'frost crystals in the air',
  'ink-like brush strokes', 'scattered debris and footprints',
];

const SCENE_TWISTS = [
  'with the ruins of a fallen colossus in the background',
  'as a comet streaks across the sky',
  'while a storm front rolls in behind',
  'during a festival of floating lanterns',
  'beside a mirror-still shattered lake',
  'beneath an unnatural eclipse',
  'amid drifting ash and falling petals',
  'with colossal statues watching from the cliffs',
];


/** บรรยากาศ/สี/ฉากตามธาตุ (เป็น "กรอบอารมณ์" ของภาพ — ไม่ใช่ตัวกำหนดตัวแบบ) */
const ELEMENT_VISUAL: Record<string, { en: string; motifs: string; scene: string; mood: string; palette: string }> = {
  EMBERBOUND: {
    en: 'fire', motifs: 'flame tongues, drifting ash, molten cracks, glowing embers',
    scene: 'a ruined forge city under a crimson sky', mood: 'fierce and burning',
    palette: 'crimson, orange and gold palette with blackened iron',
  },
  TIDEBORN: {
    en: 'water', motifs: 'deep currents, mist, water crystals, silver droplets',
    scene: 'a drowned temple beneath a still lagoon', mood: 'serene yet dangerous',
    palette: 'deep blue, cyan and silver palette with wet stone',
  },
  SKYRIVEN: {
    en: 'wind', motifs: 'spiral gales, feathers, torn clouds, lightning arcs',
    scene: 'cliff peaks above an endless storm front', mood: 'swift and untamed',
    palette: 'teal, mint and white palette with storm grey',
  },
  ROOTFORGED: {
    en: 'earth', motifs: 'ancient roots, carved stone, moss, ore veins, crystal geodes',
    scene: 'a hollow mountain mine lit by glowing ore', mood: 'steadfast and heavy',
    palette: 'moss, ochre and bronze palette with warm stone',
  },
  DAWNSWORN: {
    en: 'light', motifs: 'radiant beams, golden dust, geometric rune light, ivory banners',
    scene: 'a sky-tower at sunrise above the clouds', mood: 'hopeful and luminous',
    palette: 'ivory, gold and amber palette with pale sky',
  },
  VEILMARKED: {
    en: 'shadow', motifs: 'veil mist, cracks in reality, crescent moon, violet runes',
    scene: 'a moonless gate wreathed in indigo fog', mood: 'mysterious and ominous',
    palette: 'indigo, violet and silver palette with deep black',
  },
};

const ROLE_VISUAL: Record<string, string> = {
  WARRIOR: 'frontline fighter with practical battle-worn gear',
  MAGE: 'spellcaster with an arcane focus and floating sigils',
  HEALER: 'healer with soft restorative light and clean lines',
  TANK: 'towering guardian in layered heavy armour',
  ASSASSIN: 'swift shadow operative with minimal gear and blades',
  SUPPORT: 'banner-bearer and ward-keeper in a supportive stance',
};

const RARITY_VISUAL: Record<string, string> = {
  COMMON: 'grounded and believable, worn everyday detail',
  UNCOMMON: 'refined detail with a small magical flourish',
  RARE: 'ornate accents with one signature glowing element',
  EPIC: 'elaborate regalia with a powerful magic aura',
  LEGENDARY: 'heroic, awe-inspiring presence with radiant effects',
  MYTHIC: 'mythic, otherworldly manifestation of raw elemental power',
};

/** หยิบคำตาม hash แบบ deterministic (คนละ index กับที่อื่น → ไม่ซ้ำแนวกัน) */
function pickFrom<T>(list: T[], hash: string, salt: number): T {
  const digest = crypto.createHash('sha256').update(`${hash}|prompt|${salt}`).digest();
  const value = digest.readUInt32BE(0) % list.length;
  return list[value];
}

/**
 * สร้าง prompt สำหรับ AI — หลากหลายจริงและ deterministic
 *
 * องค์ประกอบที่ผสมกัน: ตัวแบบ (คน/สัตว์/อสูร/สิ่งของ/ภูมิทัศน์) × อากัปกิริยา × องค์ประกอบภาพ
 * × แสง × สื่อ/เทคนิค × รายละเอียด × สถานการณ์พลิกฉาก × ธาตุ × บทบาท × ระดับความหายาก
 * → การ์ดต่างใบแทบไม่มีทางได้แนวภาพซ้ำกัน (แต่การ์ดใบเดิมได้ภาพเดิมเสมอ)
 */
export function buildCardImagePrompt(card: AiImageCardInput): string {
  const element = ELEMENT_VISUAL[card.element] ?? ELEMENT_VISUAL.VEILMARKED;
  const role = ROLE_VISUAL[card.role] ?? 'a mysterious rune-touched figure';
  const rarity = RARITY_VISUAL[card.rarity] ?? 'balanced detail';
  const lore = (card.loreTh ?? '').replace(/\s+/g, ' ').trim().slice(0, 70);

  const subject = pickFrom(SUBJECTS, card.canonicalSeedHash, 1);
  const pose = pickFrom(POSES, card.canonicalSeedHash, 2);
  const composition = pickFrom(COMPOSITIONS, card.canonicalSeedHash, 3);
  const lighting = pickFrom(LIGHTING, card.canonicalSeedHash, 4);
  const medium = pickFrom(MEDIA, card.canonicalSeedHash, 5);
  const detail = pickFrom(DETAILS, card.canonicalSeedHash, 6);
  const twist = pickFrom(SCENE_TWISTS, card.canonicalSeedHash, 7);

  const prompt = [
    `Original high-fantasy collectible card illustration of ${subject.en}, ${pose}.`,
    `This is the ${card.element.toLowerCase()} ${card.role.toLowerCase()} card "${card.name}" — ${role}.`,
    `Scene: ${element.scene}, ${twist}.`,
    `Elemental language: ${element.motifs}; ${element.palette}. Mood: ${element.mood}, ${rarity}.`,
    `Composition: ${composition}; ${lighting}; ${detail}.`,
    `Rendered as ${medium}, crisp focal subject, strong value contrast, original fantasy world.`,
    'No text, no letters, no numbers, no logo, no watermark, no signature, no card frame, no border, no UI, no blood, no violence — family-friendly fantasy artwork.',
    lore ? `Story hint: ${lore}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return prompt.replace(/\s+/g, ' ').trim();
}

/** รายละเอียดของ prompt ที่ใช้ (สำหรับ debug/ทดสอบ) */
export function describeCardPrompt(card: AiImageCardInput): {
  subject: string; pose: string; composition: string; lighting: string; medium: string; detail: string; twist: string;
} {
  return {
    subject: pickFrom(SUBJECTS, card.canonicalSeedHash, 1).id,
    pose: pickFrom(POSES, card.canonicalSeedHash, 2),
    composition: pickFrom(COMPOSITIONS, card.canonicalSeedHash, 3),
    lighting: pickFrom(LIGHTING, card.canonicalSeedHash, 4),
    medium: pickFrom(MEDIA, card.canonicalSeedHash, 5),
    detail: pickFrom(DETAILS, card.canonicalSeedHash, 6),
    twist: pickFrom(SCENE_TWISTS, card.canonicalSeedHash, 7),
  };
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

/** ค่าใช้จ่ายที่ตั้งไว้ต่อระดับความหายาก (ผู้ใช้กำหนด: การ์ดทั่วไปประหยัดสุด · EPIC ขึ้นไปสูงกว่านิดหน่อย) */
export interface ImagePreset {
  label: 'standard' | 'premium';
  model?: string;
  quality?: string;
  size: string;
  outputFormat?: string;
  compression?: number;
}

/** ระดับความหายากที่ถือว่า "ใช้ preset สูงขึ้น" (ปรับได้ผ่าน AI_IMAGE_PREMIUM_RARITIES) */
export function premiumRarities(): string[] {
  return (process.env.AI_IMAGE_PREMIUM_RARITIES ?? 'EPIC,LEGENDARY,MYTHIC')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

/** เลือก preset ของการ์ดตามระดับความหายาก (deterministic — เทสต์ได้) */
export function resolveImagePreset(rarity: string): ImagePreset {
  const isPremium = premiumRarities().includes((rarity ?? '').toUpperCase());

  const shared = {
    outputFormat: process.env.AI_IMAGE_OUTPUT_FORMAT,
    compression: process.env.AI_IMAGE_COMPRESSION ? Number(process.env.AI_IMAGE_COMPRESSION) : undefined,
  };

  if (isPremium) {
    return {
      label: 'premium',
      model: process.env.AI_IMAGE_PREMIUM_MODEL ?? process.env.AI_IMAGE_MODEL,
      quality: process.env.AI_IMAGE_PREMIUM_QUALITY ?? 'medium',
      size: process.env.AI_IMAGE_PREMIUM_SIZE ?? process.env.AI_IMAGE_SIZE ?? '1536x1024',
      ...shared,
    };
  }

  return {
    label: 'standard',
    model: process.env.AI_IMAGE_MODEL,
    quality: process.env.AI_IMAGE_QUALITY ?? 'low',
    size: process.env.AI_IMAGE_SIZE ?? '1536x1024',
    ...shared,
  };
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
  provider: 'pollinations' | 'generic';
  prompt: string;
  /** preset ที่ใช้จริง (standard = ประหยัดสุด, premium = EPIC ขึ้นไป) */
  preset?: ImagePreset;
  /** token ที่ผู้ให้บริการรายงาน (ใช้ประเมินค่าใช้จ่าย) */
  usage?: { inputTokens?: number; outputTokens?: number; imageTokens?: number };
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

      const isOpenAi = /openai\.com/.test(apiUrl);
      const preset = resolveImagePreset(card.rarity);
      const model = preset.model || (isOpenAi ? 'gpt-image-1' : undefined);
      const size = preset.size || `${options.width ?? 896}x${options.height ?? 512}`;

      const requestBody: Record<string, unknown> = { prompt, n: 1, size };
      if (model) requestBody.model = model;
      if (preset.quality) requestBody.quality = preset.quality;
      if (preset.outputFormat) requestBody.output_format = preset.outputFormat;
      if (preset.compression && preset.outputFormat && preset.outputFormat !== 'png') {
        requestBody.output_compression = preset.compression;
      }
      // OpenAI ไม่รับ seed (การสุ่มเกิดที่ฝั่งผู้ให้บริการ) — ส่งเฉพาะ provider ที่รองรับ
      if (!isOpenAi) requestBody.seed = seedFromHash(card.canonicalSeedHash);

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`AI provider ตอบ ${res.status}${detail ? ` — ${detail.slice(0, 160)}` : ''}`);
      }
      const json = (await res.json()) as {
        url?: string;
        data?: Array<{ url?: string; b64_json?: string }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          output_tokens_details?: { image_tokens?: number };
        };
      };
      const usage = json.usage
        ? {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
            imageTokens: json.usage.output_tokens_details?.image_tokens,
          }
        : undefined;

      const direct = json.url ?? json.data?.[0]?.url;
      if (direct) {
        const { bytes, contentType } = await downloadImage(direct, timeoutMs);
        return { bytes, contentType, provider, prompt, preset, usage };
      }
      const b64 = json.data?.[0]?.b64_json;
      if (b64) {
        const bytes = Buffer.from(b64, 'base64');
        const detected = detectImageType(bytes);
        if (!detected) throw new Error('ผู้ให้บริการส่ง base64 ที่ไม่ใช่ภาพ');
        return { bytes, contentType: detected, provider, prompt, preset, usage };
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

