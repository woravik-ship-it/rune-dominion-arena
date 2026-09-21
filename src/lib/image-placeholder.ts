// Deterministic Card Art — Trading Card ของเกม Rune Dominion Arena
//
// หลักการ:
// - **การ์ดจริงทั้งใบ** ไม่ใช่แค่ภาพพื้นหลัง: กรอบโลหะตามระดับความหายาก (ทอง = หายากสุด),
//   แถบชื่อ, ตราธาตุมุมขวา, ดาวระดับ, ช่องภาพพร้อมลายฉาก + ตัวแบบ, แถบชนิดการ์ด,
//   กล่องคำบรรยายคุณสมบัติ (สกิล/คำอธิบาย/lore) และแถบ ATK/DEF/HP/SPD/MP
// - deterministic 100%: ข้อมูลเดิม → การ์ดเดิมทุกไบต์ (สุ่มจาก canonicalSeedHash เท่านั้น)
// - วาดด้วย SVG ล้วน ไม่มี dependency/ไฟล์ภาพ/ฟอนต์ภายนอก
import crypto from 'crypto';

export interface CardStatsInput {
  atk: number;
  def: number;
  hp: number;
  spd: number;
  manaCost: number;
}

export interface CardSkillInput {
  name: string;
  description?: string | null;
  manaCost?: number | null;
}

export interface PlaceholderCardInput {
  cardId: string;
  name: string;
  nameTh?: string | null;
  element: string;
  rarity: string;
  /** ใช้เลือกตราประจำบทบาท — ถ้าไม่ส่งมาจะเลือกจาก hash */
  role?: string | null;
  canonicalSeedHash: string;
  /** ข้อมูลที่จะพิมพ์ลงในกรอบการ์ด (ไม่ส่งมาก็ยังวาดการ์ดได้ แต่กล่องข้อความจะว่าง) */
  stats?: CardStatsInput | null;
  skills?: CardSkillInput[];
  descriptionTh?: string | null;
  loreTh?: string | null;
}

// ===== ขนาด/ตำแหน่งของส่วนต่างๆ บนการ์ด (420×600) =====
export const CARD_SIZE = { width: 420, height: 600 } as const;
const FRAME = { x: 8, y: 8, w: 404, h: 584, r: 22 };
const INNER = { x: 20, y: 20, w: 380, h: 560, r: 14 };
const NAME_BAR = { x: 24, y: 24, w: 328, h: 54, r: 10 };
const ATTR = { cx: 384, cy: 51, r: 25 };
const STARS = { x: 30, y: 97 };
const ART = { x: 24, y: 106, w: 372, h: 222, r: 10 };
const TYPE_BAR = { x: 24, y: 336, w: 372, h: 26, r: 6 };
const TEXT_BOX = { x: 24, y: 370, w: 372, h: 146, r: 10 };
const STATS_BAR = { x: 24, y: 524, w: 372, h: 50, r: 10 };

export interface Box { x: number; y: number; w: number; h: number }

type Motif = 'flame' | 'wave' | 'wind' | 'stone' | 'light' | 'shadow';
type Subject = 'winged' | 'horned' | 'serpent' | 'colossus' | 'orb' | 'spectral';
type ArtStyle = 'aura' | 'celestial' | 'terrain' | 'tempest' | 'mandala' | 'eclipse';

interface ElementArt {
  from: string;
  to: string;
  accent: string;
  glow: string;
  motif: Motif;
  labelTh: string;
  glyphTh: string;
}

/** ทิศทางศิลป์ต่อธาตุ — ตาม GDD §10.4 */
const ELEMENT_ART: Record<string, ElementArt> = {
  EMBERBOUND: { from: '#c2410c', to: '#450a0a', accent: '#fbbf24', glow: '#fb923c', motif: 'flame', labelTh: 'เพลิง', glyphTh: 'ไฟ' },
  TIDEBORN: { from: '#0369a1', to: '#082f49', accent: '#a5f3fc', glow: '#38bdf8', motif: 'wave', labelTh: 'น้ำ', glyphTh: 'น้ำ' },
  SKYRIVEN: { from: '#0d9488', to: '#042f2b', accent: '#d1fae5', glow: '#5eead4', motif: 'wind', labelTh: 'ลม', glyphTh: 'ลม' },
  ROOTFORGED: { from: '#92400e', to: '#1c1207', accent: '#e7e5e4', glow: '#f59e0b', motif: 'stone', labelTh: 'ดิน', glyphTh: 'ดิน' },
  DAWNSWORN: { from: '#d97706', to: '#7c2d12', accent: '#fef3c7', glow: '#fde68a', motif: 'light', labelTh: 'แสง', glyphTh: 'แสง' },
  VEILMARKED: { from: '#6d28d9', to: '#0b1020', accent: '#c7d2fe', glow: '#818cf8', motif: 'shadow', labelTh: 'เงา', glyphTh: 'เงา' },
};



/**
 * กรอบตามระดับความหายาก — ผู้ใช้กำหนดว่า "สีทองคือหายากสุด"
 * COMMON เทาเหล็ก → UNCOMMON ทองแดง → RARE เงินอมฟ้า → EPIC ม่วง → LEGENDARY ทองคำขาว → MYTHIC ทองคำ + โฮโลแกรม
 */
interface RarityFrame {
  light: string;
  mid: string;
  dark: string;
  labelTh: string;
  stars: number;
  /** เปิดเอฟเฟกต์โฮโลแกรม/ฟอยล์ */
  foil: boolean;
}

const RARITY_FRAME: Record<string, RarityFrame> = {
  COMMON: { light: '#d4d4d8', mid: '#9ca3af', dark: '#3f3f46', labelTh: 'ทั่วไป', stars: 1, foil: false },
  UNCOMMON: { light: '#fcd34d', mid: '#b45309', dark: '#5b2c06', labelTh: 'ไม่ธรรมดา', stars: 2, foil: false },
  RARE: { light: '#e2e8f0', mid: '#60a5fa', dark: '#1e293b', labelTh: 'หายาก', stars: 3, foil: true },
  EPIC: { light: '#e9d5ff', mid: '#a855f7', dark: '#3b0764', labelTh: 'มหากาพย์', stars: 4, foil: true },
  LEGENDARY: { light: '#fffbeb', mid: '#e5d3a3', dark: '#6b5320', labelTh: 'ตำนาน', stars: 5, foil: true },
  MYTHIC: { light: '#fff7cc', mid: '#fbbf24', dark: '#7c4a03', labelTh: 'เทพนิยาย', stars: 6, foil: true },
};

/** ตราประจำบทบาท (วาดในช่องภาพ เป็นลายน้ำเรืองแสง) */
const ROLE_EMBLEM: Record<string, string> = {
  WARRIOR: 'M0,-30 L6,-14 L6,22 L0,30 L-6,22 L-6,-14 Z M-14,4 L14,4',
  MAGE: 'M0,-32 L9,-8 L22,-8 L12,4 L16,24 L0,14 L-16,24 L-12,4 L-22,-8 L-9,-8 Z',
  HEALER: 'M-6,-26 L6,-26 L6,-8 L24,-8 L24,4 L6,4 L6,22 L-6,22 L-6,4 L-24,4 L-24,-8 L-6,-8 Z',
  TANK: 'M0,-30 L24,-20 L24,4 C24,18 12,26 0,32 C-12,26 -24,18 -24,4 L-24,-20 Z',
  ASSASSIN: 'M0,-32 L5,-6 L3,26 L0,32 L-3,26 L-5,-6 Z M-12,-2 L12,-2',
  SUPPORT: 'M-16,-20 L0,-30 L16,-20 L16,18 L0,28 L-16,18 Z M-8,-6 L8,-6 L8,10 L-8,10 Z',
};

const ROLE_TH: Record<string, string> = {
  WARRIOR: 'นักรบ',
  MAGE: 'จอมเวท',
  HEALER: 'ผู้รักษา',
  TANK: 'ผู้พิทักษ์',
  ASSASSIN: 'นักฆ่า',
  SUPPORT: 'ผู้สนับสนุน',
};

/** ตัวแบบในภาพ (silhouette) — 6 แบบ เลือกด้วย hash ให้การ์ดแต่ละใบมี "รูป" ไม่ใช่แค่พื้นหลัง */
const SUBJECTS: Subject[] = ['winged', 'horned', 'serpent', 'colossus', 'orb', 'spectral'];
const SUBJECT_PATH: Record<Subject, string> = {
  winged: 'M50 12 C38 22 34 34 36 46 C20 36 10 44 8 58 C22 54 34 58 42 68 C46 80 50 88 50 92 C50 88 54 80 58 68 C66 58 78 54 92 58 C90 44 80 36 64 46 C66 34 62 22 50 12 Z',
  horned: 'M50 20 C36 20 26 32 26 48 C26 60 32 70 38 76 L38 92 L44 92 L44 78 C48 80 52 80 56 78 L56 92 L62 92 L62 76 C68 70 74 60 74 48 C74 32 64 20 50 20 Z M26 40 C16 30 12 20 16 10 C24 22 30 28 36 30 Z M74 40 C84 30 88 20 84 10 C76 22 70 28 64 30 Z',
  serpent: 'M50 94 C28 94 18 82 26 70 C34 58 52 60 58 50 C64 40 54 32 44 36 C34 40 30 30 38 22 C46 14 62 14 70 24 C80 36 74 52 62 60 C50 68 38 72 44 80 C48 86 62 84 70 78 C74 86 64 94 50 94 Z',
  colossus: 'M50 8 C42 8 36 14 36 22 L36 28 L20 32 L14 56 L22 58 L26 46 L30 72 L40 92 L60 92 L70 72 L74 46 L78 58 L86 56 L80 32 L64 28 L64 22 C64 14 58 8 50 8 Z',
  orb: 'M50 10 C30 10 16 26 16 48 C16 72 32 92 50 92 C68 92 84 72 84 48 C84 26 70 10 50 10 Z M50 26 C62 26 70 36 70 48 C70 62 62 76 50 76 C38 76 30 62 30 48 C30 36 38 26 50 26 Z',
  spectral: 'M50 8 C34 14 26 30 28 48 C30 62 38 70 40 84 C42 92 46 94 50 94 C54 94 58 92 60 84 C62 70 70 62 72 48 C74 30 66 14 50 8 Z M34 44 C26 52 24 66 30 76 C34 62 36 52 34 44 Z M66 44 C74 52 76 66 70 76 C66 62 64 52 66 44 Z',
};

const ART_STYLES: ArtStyle[] = ['aura', 'celestial', 'terrain', 'tempest', 'mandala', 'eclipse'];
const STYLE_LABEL_TH: Record<ArtStyle, string> = {
  aura: 'วงแหวนออร่า',
  celestial: 'ฟ้าดารา',
  terrain: 'ภูมิทัศน์',
  tempest: 'พายุคลั่ง',
  mandala: 'มันดาลารูน',
  eclipse: 'สุริยุปราคา',
};

// ===== helper: hash → ตัวเลขสุ่มแบบ deterministic =====

/** แปลง hash hex → byte array */
function hashBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '') || '00';
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16) || 0);
  }
  return bytes.length > 0 ? bytes : [0];
}

/** ความยาว hash ขั้นต่ำที่ถือว่าใช้ได้ */
export const MIN_SEED_HASH_LENGTH = 8;

/** ตรวจว่า hash ใช้งานได้จริง */
export function isValidSeedHash(hex: string): boolean {
  return hashBytes(hex).length >= MIN_SEED_HASH_LENGTH;
}

/** ขยาย hash เป็น byte pool ยาวพอวาดการ์ดทั้งใบ (deterministic) */
function bytePool(seed: string, size: number): number[] {
  const out: number[] = [];
  let block = 0;
  while (out.length < size) {
    const digest = crypto.createHash('sha256').update(`${seed}|card|${block}`).digest();
    for (const byte of digest) out.push(byte);
    block += 1;
  }
  return out.slice(0, size);
}

/** อ่านค่าจาก pool → จำนวนเต็ม 0..max-1 */
const iAt = (pool: number[], index: number, max: number): number => pool[index % pool.length] % max;

/** อ่านค่าจาก pool → ทศนิยมในช่วง [lo, hi) */
const fAt = (pool: number[], index: number, lo: number, hi: number): number =>
  Number((lo + (pool[index % pool.length] / 255) * (hi - lo)).toFixed(2));

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ===== helper: จัดข้อความให้อยู่ในกรอบ (Thai ไม่มีเว้นวรรค → ตัดตามความกว้างตัวอักษร) =====

/** ประเมินความกว้างคร่าวๆ ของข้อความ (หน่วย = ความกว้างตัวอักษรไทย 1 ตัว) */
export function textUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x0e00 && code < 0x0e80) {
      // ไทย: สระ/วรรณยุกต์เป็นตัวซ้อน ไม่กินความกว้าง
      units += code >= 0x0e48 && code <= 0x0e4b ? 0 : 1;
    } else if (char === ' ') {
      units += 0.35;
    } else {
      units += 0.56;
    }
  }
  return units;
}

/** ตัดข้อความให้ไม่เกินความกว้างที่กำหนด (เติม … ถ้าถูกตัด) */
export function wrapText(text: string, maxUnits: number, maxLines = 99): string[] {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const lines: string[] = [];
  let current = '';
  let currentUnits = 0;

  for (const char of clean) {
    const units = textUnits(char);
    if (currentUnits + units > maxUnits && current.length > 0) {
      lines.push(current.trim());
      current = '';
      currentUnits = 0;
      if (lines.length >= maxLines) break;
    }
    current += char;
    currentUnits += units;
  }
  if (lines.length < maxLines && current.trim()) lines.push(current.trim());

  if (lines.length === maxLines) {
    // ถ้ายังมีข้อความเหลือ ให้ต่อท้ายบรรทัดสุดท้ายด้วย …
    const joined = lines.join('');
    if (joined.length < clean.replace(/\s+/g, '').length) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
    }
  }
  return lines;
}

/** ย่อชื่อให้อยู่ในความกว้างที่กำหนด (ตัดกลางด้วย …) */
export function truncateText(text: string, maxUnits: number): string {
  const lines = wrapText(text, maxUnits, 1);
  return lines[0] ?? '';
}

/** เลือกขนาดฟอนต์ของชื่อไทยตามความยาว (ให้ชื่อยาวยังอ่านออก) */
function nameFontSize(nameTh: string): number {
  const units = textUnits(nameTh);
  if (units <= 15) return 22;
  if (units <= 19) return 19;
  if (units <= 24) return 16.5;
  if (units <= 30) return 14.5;
  return 13;
}



// ===== ช่องภาพ: ฉากหลัง + ลายธาตุ + ตัวแบบ + ประกาย (คำนวณจากกรอบภาพ ART) =====

const nx = (u: number): number => Number((ART.x + (ART.w * u) / 100).toFixed(1));
const ny = (v: number): number => Number((ART.y + (ART.h * v) / 100).toFixed(1));
const nr = (n: number): number => Number(((Math.min(ART.w, ART.h) * n) / 100).toFixed(1));

/** ฉากหลัง 6 แบบ (aura / celestial / terrain / tempest / mandala / eclipse) */
function sceneBackground(style: ArtStyle, art: ElementArt, pool: number[], rarityColor: string): string {
  const out: string[] = [];

  if (style === 'aura') {
    for (let i = 0; i < 6; i += 1) {
      out.push(`<ellipse cx="${nx(50)}" cy="${ny(52)}" rx="${nr(12 + i * 8 + fAt(pool, 10 + i, 0, 4))}" ry="${nr(12 + i * 8)}" fill="none" stroke="${art.glow}" stroke-opacity="${Math.max(0.05, 0.26 - i * 0.035).toFixed(2)}" stroke-width="${Math.max(1, 2.6 - i * 0.3).toFixed(1)}"/>`);
    }
    for (let i = 0; i < 16; i += 1) {
      const angle = (i * 22.5 + iAt(pool, 30 + i, 12)) * (Math.PI / 180);
      const r1 = nr(10);
      const r2 = nr(30 + iAt(pool, 50 + i, 22));
      out.push(`<line x1="${(nx(50) + Math.cos(angle) * r1).toFixed(1)}" y1="${(ny(52) + Math.sin(angle) * r1 * 0.6).toFixed(1)}" x2="${(nx(50) + Math.cos(angle) * r2).toFixed(1)}" y2="${(ny(52) + Math.sin(angle) * r2 * 0.6).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.14" stroke-width="1.6"/>`);
    }
  } else if (style === 'celestial') {
    out.push(`<circle cx="${nx(64)}" cy="${ny(30)}" r="${nr(16 + iAt(pool, 8, 8))}" fill="url(#cardCore)"/>`);
    out.push(`<circle cx="${nx(64)}" cy="${ny(30)}" r="${nr(22)}" fill="none" stroke="${art.accent}" stroke-opacity="0.35" stroke-width="1.2" stroke-dasharray="5 7"/>`);
    for (let i = 0; i < 26; i += 1) {
      out.push(`<circle cx="${nx(fAt(pool, 60 + i, 2, 98))}" cy="${ny(fAt(pool, 100 + i, 2, 96))}" r="${fAt(pool, 140 + i, 0.6, 1.9)}" fill="${i % 4 === 0 ? rarityColor : art.accent}" opacity="${fAt(pool, 180 + i, 0.25, 0.85)}"/>`);
    }
    for (let i = 0; i < 4; i += 1) {
      const x1 = nx(fAt(pool, 210 + i * 2, 5, 80));
      const y1 = ny(fAt(pool, 211 + i * 2, 6, 60));
      out.push(`<line x1="${x1}" y1="${y1}" x2="${(x1 + 22).toFixed(1)}" y2="${(y1 + 16).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.2" stroke-width="0.9"/>`);
    }
  } else if (style === 'terrain') {
    for (let layer = 0; layer < 4; layer += 1) {
      const pts: string[] = [`${ART.x},${ny(100)}`];
      for (let i = 0; i <= 7; i += 1) {
        pts.push(`${nx((100 / 7) * i)},${ny(46 + layer * 9 - fAt(pool, 240 + layer * 9 + i, 2, 26))}`);
      }
      pts.push(`${ART.x + ART.w},${ny(100)}`);
      out.push(`<polygon points="${pts.join(' ')}" fill="${layer % 2 === 0 ? art.to : art.from}" opacity="${(0.5 + layer * 0.12).toFixed(2)}"/>`);
    }
    out.push(`<rect x="${ART.x}" y="${ny(72)}" width="${ART.w}" height="${(ART.y + ART.h - ny(72)).toFixed(1)}" fill="#05060d" opacity="0.35"/>`);
  } else if (style === 'tempest') {
    for (let i = 0; i < 22; i += 1) {
      const x = nx(fAt(pool, 260 + i, -10, 100));
      const y = ny(fAt(pool, 290 + i, 0, 100));
      const len = nr(fAt(pool, 320 + i, 12, 40));
      out.push(`<line x1="${x}" y1="${y}" x2="${(x + len).toFixed(1)}" y2="${(y - len * 0.4).toFixed(1)}" stroke="${art.accent}" stroke-opacity="${fAt(pool, 350 + i, 0.06, 0.26)}" stroke-width="${fAt(pool, 380 + i, 0.8, 3).toFixed(1)}" stroke-linecap="round"/>`);
    }
  } else if (style === 'mandala') {
    for (let i = 0; i < 5; i += 1) {
      const r = nr(10 + i * 7);
      out.push(`<circle cx="${nx(50)}" cy="${ny(52)}" r="${r}" fill="none" stroke="${art.accent}" stroke-opacity="${(0.3 - i * 0.04).toFixed(2)}" stroke-width="1.3"/>`);
      const sides = 5 + i * 2;
      const pts: string[] = [];
      for (let s = 0; s < sides; s += 1) {
        const angle = ((360 / sides) * s + iAt(pool, 400 + i, 24)) * (Math.PI / 180);
        pts.push(`${(nx(50) + Math.cos(angle) * r).toFixed(1)},${(ny(52) + Math.sin(angle) * r * 0.72).toFixed(1)}`);
      }
      out.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="${art.glow}" stroke-opacity="0.18" stroke-width="1.2"/>`);
    }
  } else {
    const r = nr(24 + iAt(pool, 9, 8));
    out.push(`<circle cx="${nx(50)}" cy="${ny(48)}" r="${r + nr(4)}" fill="${rarityColor}" opacity="0.22"/>`);
    out.push(`<circle cx="${nx(50)}" cy="${ny(48)}" r="${r}" fill="#05060d" opacity="0.94"/>`);
    out.push(`<circle cx="${nx(50)}" cy="${ny(48)}" r="${r}" fill="none" stroke="${art.accent}" stroke-opacity="0.6" stroke-width="2"/>`);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * 45 + iAt(pool, 420 + i, 30)) * (Math.PI / 180);
      const len = nr(fAt(pool, 440 + i, 12, 34));
      out.push(`<line x1="${nx(50)}" y1="${ny(48)}" x2="${(nx(50) + Math.cos(angle) * len).toFixed(1)}" y2="${(ny(48) + Math.sin(angle) * len * 0.72).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.24" stroke-width="1.4"/>`);
    }
  }

  return out.join('\n    ');
}

/** ลายธาตุในช่องภาพ (เปลวไฟ/คลื่น/ลม/ศิลาราก/รัศมี/หมอกเงา) */
function elementMotif(motif: Motif, art: ElementArt, pool: number[]): string {
  const out: string[] = [];

  if (motif === 'flame') {
    for (let i = 0; i < 5; i += 1) {
      const x = nx(8 + i * 19 + fAt(pool, 500 + i, -3, 3));
      const h = fAt(pool, 520 + i, 32, 66);
      const w = nr(fAt(pool, 540 + i, 6, 11));
      const yb = ny(100);
      const yt = ny(100 - h);
      const mid = yb - (yb - yt) * 0.5;
      out.push(`<path d="M${x} ${yb} C${(x - w).toFixed(1)} ${mid} ${(x - w * 0.3).toFixed(1)} ${yt} ${x} ${(yt - 8).toFixed(1)} C${(x + w * 0.3).toFixed(1)} ${yt} ${(x + w).toFixed(1)} ${mid} ${x} ${yb} Z" fill="url(#cardMotif)" opacity="0.6"/>`);
      out.push(`<path d="M${x} ${yb} C${(x - w * 0.45).toFixed(1)} ${yb - (yb - yt) * 0.35} ${(x - w * 0.15).toFixed(1)} ${yb - (yb - yt) * 0.6} ${x} ${yb - (yb - yt) * 0.74} C${(x + w * 0.15).toFixed(1)} ${yb - (yb - yt) * 0.6} ${(x + w * 0.45).toFixed(1)} ${yb - (yb - yt) * 0.35} ${x} ${yb} Z" fill="${art.accent}" opacity="0.55"/>`);
    }
  } else if (motif === 'wave') {
    for (let i = 0; i < 4; i += 1) {
      const y = ny(52 + i * 13);
      const amp = nr(fAt(pool, 560 + i, 3, 7));
      out.push(`<path d="M${ART.x - 4} ${y} Q ${nx(18)} ${(y - amp).toFixed(1)} ${nx(36)} ${y} T ${nx(72)} ${y} T ${nx(108)} ${y}" fill="none" stroke="${i % 2 === 0 ? art.glow : art.accent}" stroke-opacity="${(0.5 - i * 0.08).toFixed(2)}" stroke-width="${(3.4 - i * 0.5).toFixed(1)}"/>`);
    }
    for (let i = 0; i < 4; i += 1) {
      out.push(`<circle cx="${nx(20 + i * 20)}" cy="${ny(fAt(pool, 580 + i, 74, 88))}" r="${nr(fAt(pool, 590 + i, 2.5, 5))}" fill="${art.accent}" opacity="0.3"/>`);
    }
  } else if (motif === 'wind') {
    for (let i = 0; i < 6; i += 1) {
      const y = ny(16 + i * 14 + fAt(pool, 600 + i, -4, 4));
      out.push(`<path d="M${ART.x - 6} ${y} C ${nx(24)} ${(y - 14).toFixed(1)} ${nx(50)} ${(y + 14).toFixed(1)} ${nx(74)} ${y} C ${nx(88)} ${(y - 9).toFixed(1)} ${nx(98)} ${(y + 6).toFixed(1)} ${ART.x + ART.w + 6} ${(y - 3).toFixed(1)}" fill="none" stroke="${art.accent}" stroke-opacity="${fAt(pool, 620 + i, 0.16, 0.4)}" stroke-width="${fAt(pool, 640 + i, 1, 2.6).toFixed(1)}" stroke-linecap="round"/>`);
    }
  } else if (motif === 'stone') {
    out.push(`<polygon points="${ART.x},${ny(100)} ${nx(22)},${ny(40)} ${nx(42)},${ny(72)} ${nx(58)},${ny(30)} ${nx(78)},${ny(74)} ${ART.x + ART.w},${ny(100)}" fill="${art.glow}" opacity="0.22"/>`);
    for (let i = 0; i < 7; i += 1) {
      const x = nx(6 + i * 15);
      out.push(`<path d="M${x} ${ny(104)} C${(x - 4).toFixed(1)} ${ny(78)} ${(x + 5).toFixed(1)} ${ny(58)} ${(x - 2).toFixed(1)} ${ny(34)}" fill="none" stroke="${art.accent}" stroke-opacity="0.32" stroke-width="2"/>`);
    }
  } else if (motif === 'light') {
    for (let i = 0; i < 18; i += 1) {
      const angle = i * 20 * (Math.PI / 180);
      const len = nr(70);
      out.push(`<line x1="${nx(50)}" y1="${ny(50)}" x2="${(nx(50) + Math.cos(angle) * len).toFixed(1)}" y2="${(ny(50) + Math.sin(angle) * len * 0.7).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.16" stroke-width="${i % 2 === 0 ? 2.4 : 1.2}"/>`);
    }
    out.push(`<ellipse cx="${nx(50)}" cy="${ny(50)}" rx="${nr(22)}" ry="${nr(16)}" fill="none" stroke="${art.accent}" stroke-opacity="0.42" stroke-width="1.8"/>`);
  } else {
    for (let i = 0; i < 7; i += 1) {
      const x = nx(10 + i * 14);
      const y = ny(fAt(pool, 660 + i, 26, 80));
      out.push(`<path d="M${x} ${y} q ${fAt(pool, 680 + i, -10, 10)} ${fAt(pool, 690 + i, 8, 22)} ${fAt(pool, 700 + i, -8, 8)} ${fAt(pool, 710 + i, 16, 36)}" fill="none" stroke="${art.accent}" stroke-opacity="0.26" stroke-width="1.8"/>`);
    }
    out.push(`<path d="M${nx(50)} ${ny(20)} A ${nr(26)} ${nr(26)} 0 1 0 ${nx(50)} ${ny(68)} A ${nr(20)} ${nr(20)} 0 1 1 ${nx(50)} ${ny(20)} Z" fill="${art.accent}" opacity="0.22"/>`);
  }

  return out.join('\n    ');
}


/** ตัวแบบ (silhouette) ของการ์ด — ให้แต่ละใบมี "รูป" ที่ต่างกัน */
function subjectSilhouette(subject: Subject, art: ElementArt, pool: number[], rarityColor: string): string {
  const s = (ART.h / 100) * fAt(pool, 720, 0.66, 0.82);
  const cx = nx(fAt(pool, 730, 38, 62));
  const cy = ny(fAt(pool, 740, 46, 56));
  const ox = fAt(pool, 750, -4, 4);

  return `<g transform="translate(${(cx + ox).toFixed(1)} ${cy.toFixed(1)}) scale(${s.toFixed(3)}) translate(-50 -50)">
      <ellipse cx="50" cy="52" rx="46" ry="40" fill="url(#cardAura)"/>
      <path d="${SUBJECT_PATH[subject]}" fill="#05060d" fill-opacity="0.72" stroke="${art.accent}" stroke-opacity="0.55" stroke-width="1.6"/>
      <path d="${SUBJECT_PATH[subject]}" fill="none" stroke="${rarityColor}" stroke-opacity="0.28" stroke-width="0.7"/>
    </g>`;
}

/** ลายน้ำตราบทบาทมุมล่างขวาของช่องภาพ */
function emblemWatermark(role: string, art: ElementArt): string {
  const x = ART.x + ART.w - 30;
  const y = ART.y + ART.h - 30;
  return `<g transform="translate(${x} ${y}) scale(0.55)" opacity="0.8">
      <circle cx="0" cy="0" r="34" fill="#05060d" fill-opacity="0.45" stroke="${art.accent}" stroke-opacity="0.5" stroke-width="2"/>
      <path d="${ROLE_EMBLEM[role] ?? ROLE_EMBLEM.SUPPORT}" fill="${art.accent}" fill-opacity="0.75" stroke="#000000" stroke-opacity="0.3" stroke-width="1.6"/>
    </g>`;
}

/** ประกาย/ฝุ่นแสงในช่องภาพ (การ์ดระดับสูงมีมากขึ้น + ประกายดาว) */
function artParticles(pool: number[], art: ElementArt, rarityColor: string, foil: boolean): string {
  const count = foil ? 30 : 18;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = nx(fAt(pool, 760 + i, 2, 98));
    const y = ny(fAt(pool, 820 + i, 2, 98));
    const r = fAt(pool, 880 + i, 0.5, 1.9);
    const color = i % 6 === 0 ? rarityColor : art.accent;
    out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${fAt(pool, 940 + i, 0.25, 0.9)}"/>`);
    if (foil && i % 5 === 0) {
      out.push(`<path d="M${x} ${(y - 5).toFixed(1)} L${(x + 1.2).toFixed(1)} ${y} L${x} ${(y + 5).toFixed(1)} L${(x - 1.2).toFixed(1)} ${y} Z" fill="#ffffff" opacity="0.55"/>`);
    }
  }
  return out.join('\n    ');
}


// ===== ส่วนประกอบของการ์ด: กรอบ / ชื่อ / ตราธาตุ / ดาว / แถบชนิด / กล่องคำบรรยาย / แถบสเตตัส =====

const THAI_FONT = "'Noto Sans Thai','Sarabun','Leelawadee UI',sans-serif";
const SANS_FONT = "Verdana,Geneva,sans-serif";

/** นิยาม gradient/filter ของการ์ด (สีมาจากธาตุ + ระดับความหายาก) */
function buildDefs(art: ElementArt, frame: RarityFrame, rarityColor: string, gradAngle: number, grainRot: number): string {
  return `<defs>
    <linearGradient id="cardFrame" gradientTransform="rotate(${gradAngle} 0.5 0.5)">
      <stop offset="0%" stop-color="${frame.light}"/>
      <stop offset="30%" stop-color="${frame.mid}"/>
      <stop offset="55%" stop-color="${frame.dark}"/>
      <stop offset="80%" stop-color="${frame.mid}"/>
      <stop offset="100%" stop-color="${frame.light}"/>
    </linearGradient>
    <linearGradient id="cardPlate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f2937" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#030712" stop-opacity="0.96"/>
    </linearGradient>
    <linearGradient id="cardText" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#111827" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#030712" stop-opacity="0.98"/>
    </linearGradient>
    <linearGradient id="cardType" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${art.from}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${art.to}" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="cardArt" gradientTransform="rotate(${gradAngle} 0.5 0.5)">
      <stop offset="0%" stop-color="${art.from}"/>
      <stop offset="52%" stop-color="${art.to}"/>
      <stop offset="100%" stop-color="#05060d"/>
    </linearGradient>
    <radialGradient id="cardCore" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${art.accent}"/>
      <stop offset="60%" stop-color="${art.glow}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${art.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cardAura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${art.glow}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${art.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cardMotif" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${art.glow}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${art.accent}" stop-opacity="0.1"/>
    </linearGradient>
    <radialGradient id="cardAttr" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="${art.accent}"/>
      <stop offset="70%" stop-color="${art.from}"/>
      <stop offset="100%" stop-color="${art.to}"/>
    </radialGradient>
    <linearGradient id="cardStar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${frame.light}"/>
      <stop offset="100%" stop-color="${rarityColor}"/>
    </linearGradient>
    <radialGradient id="cardVig" cx="50%" cy="45%" r="72%">
      <stop offset="58%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="cardHolo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="25%" stop-color="#67e8f9" stop-opacity="0.14"/>
      <stop offset="50%" stop-color="#f0abfc" stop-opacity="0.14"/>
      <stop offset="75%" stop-color="#fde68a" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.18"/>
    </linearGradient>
    <filter id="cardGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <pattern id="cardGrain" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(${grainRot} 0 0)">
      <line x1="0" y1="0" x2="0" y2="16" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
    <clipPath id="cardFrameClip"><rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}"/></clipPath>
    <clipPath id="cardArtClip"><rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" rx="${ART.r}"/></clipPath>
  </defs>`;
}

/** เพชรมุมกรอบ 4 จุด (สีตามระดับความหายาก) */
function cornerGems(frame: RarityFrame): string {
  const spots: Array<[number, number]> = [
    [FRAME.x + 14, FRAME.y + 14],
    [FRAME.x + FRAME.w - 14, FRAME.y + 14],
    [FRAME.x + 14, FRAME.y + FRAME.h - 14],
    [FRAME.x + FRAME.w - 14, FRAME.y + FRAME.h - 14],
  ];
  return spots
    .map(([x, y]) => `<path d="M${x} ${y - 7} L${x + 7} ${y} L${x} ${y + 7} L${x - 7} ${y} Z" fill="${frame.mid}" stroke="${frame.light}" stroke-opacity="0.8" stroke-width="0.8"/>`)
    .join('\n    ');
}

/** เอฟเฟกต์โฮโลแกรม/ฟอยล์ สำหรับการ์ดระดับสูง (RARE ขึ้นไป) */
function holoSheen(frame: RarityFrame): string {
  void frame;
  return `<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}" fill="url(#cardHolo)" opacity="0.5"/>
    <g opacity="0.35">
      <rect x="${FRAME.x - 40}" y="${FRAME.y + 90}" width="480" height="10" fill="#ffffff" fill-opacity="0.12" transform="rotate(-18 210 300)"/>
      <rect x="${FRAME.x - 40}" y="${FRAME.y + 210}" width="480" height="6" fill="#ffffff" fill-opacity="0.1" transform="rotate(-18 210 300)"/>
      <rect x="${FRAME.x - 40}" y="${FRAME.y + 330}" width="480" height="8" fill="#ffffff" fill-opacity="0.1" transform="rotate(-18 210 300)"/>
    </g>`;
}

/** กรอบการ์ด + ขอบใน + เพชรมุม + โฮโลแกรม */
function frameLayer(frame: RarityFrame): string {
  return `<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}" fill="url(#cardFrame)" stroke="${frame.dark}" stroke-width="2.5"/>
    ${frame.foil ? holoSheen(frame) : ''}
    <rect x="${INNER.x}" y="${INNER.y}" width="${INNER.w}" height="${INNER.h}" rx="${INNER.r}" fill="none" stroke="#000000" stroke-opacity="0.5" stroke-width="2.5"/>
    <rect x="${INNER.x + 3.5}" y="${INNER.y + 3.5}" width="${INNER.w - 7}" height="${INNER.h - 7}" rx="${INNER.r - 2}" fill="none" stroke="${frame.light}" stroke-opacity="0.45" stroke-width="1.2"/>
    ${cornerGems(frame)}`;
}


/** แถบชื่อการ์ด (ไทย + อังกฤษ) */
function nameBar(card: PlaceholderCardInput, frame: RarityFrame, art: ElementArt): string {
  const nameTh = (card.nameTh ?? '').trim() || card.name;
  const nameEn = (card.nameTh ?? '').trim() ? card.name : '';
  const size = nameFontSize(nameTh);
  const baseY = NAME_BAR.y + (nameEn ? 30 : 35);
  return `<rect x="${NAME_BAR.x}" y="${NAME_BAR.y}" width="${NAME_BAR.w}" height="${NAME_BAR.h}" rx="${NAME_BAR.r}" fill="url(#cardPlate)" stroke="${frame.mid}" stroke-opacity="0.9" stroke-width="1.6"/>
    <rect x="${NAME_BAR.x + 4}" y="${NAME_BAR.y + 4}" width="${NAME_BAR.w - 8}" height="${NAME_BAR.h - 8}" rx="${NAME_BAR.r - 4}" fill="none" stroke="${art.accent}" stroke-opacity="0.3" stroke-width="1"/>
    <text x="${NAME_BAR.x + 14}" y="${baseY}" font-size="${size}" font-weight="700" fill="#ffffff" font-family="${THAI_FONT}">${escapeXml(truncateText(nameTh, 32))}</text>
    ${nameEn ? `<text x="${NAME_BAR.x + 14}" y="${NAME_BAR.y + 47}" font-size="11" fill="${art.accent}" fill-opacity="0.95" font-family="${SANS_FONT}">${escapeXml(truncateText(nameEn, 54))}</text>` : ''}`;
}

/** ตราธาตุมุมขวาบน (แบบ Attribute ของการ์ดจริง) */
function attributeIcon(art: ElementArt, frame: RarityFrame): string {
  return `<circle cx="${ATTR.cx}" cy="${ATTR.cy}" r="${ATTR.r}" fill="url(#cardAttr)" stroke="${frame.light}" stroke-opacity="0.9" stroke-width="2"/>
    <circle cx="${ATTR.cx}" cy="${ATTR.cy}" r="${ATTR.r - 5}" fill="none" stroke="#000000" stroke-opacity="0.25" stroke-width="1"/>
    <text x="${ATTR.cx}" y="${ATTR.cy + 6}" font-size="15" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="${THAI_FONT}">${art.glyphTh}</text>`;
}

/** ดาวระดับความหายาก + ป้ายชื่อระดับ (ทอง = ระดับสูงสุด) */
function levelStars(frame: RarityFrame, rarity: string): string {
  return `<text x="${STARS.x}" y="${STARS.y}" font-size="19" fill="url(#cardStar)" stroke="${frame.dark}" stroke-opacity="0.45" stroke-width="0.6" letter-spacing="4">${'★'.repeat(frame.stars)}</text>
    <text x="${CARD_SIZE.width - 30}" y="${STARS.y}" font-size="11.5" text-anchor="end" fill="${frame.mid}" font-family="${THAI_FONT}">${frame.labelTh} · ${escapeXml(rarity)}</text>`;
}

/** แถบชนิดการ์ด (ธาตุ / บทบาท / มานาเริ่ม) */
function typeBar(card: PlaceholderCardInput, art: ElementArt, skills: CardSkillInput[]): string {
  const role = card.role ?? 'SUPPORT';
  const roleTh = ROLE_TH[role] ?? role;
  const mana = card.stats?.manaCost;
  return `<rect x="${TYPE_BAR.x}" y="${TYPE_BAR.y}" width="${TYPE_BAR.w}" height="${TYPE_BAR.h}" rx="${TYPE_BAR.r}" fill="url(#cardType)" stroke="#000000" stroke-opacity="0.35" stroke-width="1"/>
    <text x="${TYPE_BAR.x + 12}" y="${TYPE_BAR.y + 18}" font-size="12.5" font-weight="700" fill="#ffffff" font-family="${THAI_FONT}">ธาตุ${art.labelTh} · ${roleTh} · สกิล ${skills.length} อย่าง</text>
    ${mana !== undefined ? `<text x="${TYPE_BAR.x + TYPE_BAR.w - 12}" y="${TYPE_BAR.y + 18}" font-size="12" text-anchor="end" fill="#ffffff" font-family="${THAI_FONT}">⚡ ${mana} มานา</text>` : ''}`;
}

/** กล่องคำบรรยายคุณสมบัติในตัวการ์ด (สกิล + คำอธิบาย + lore) */
function effectBox(card: PlaceholderCardInput, art: ElementArt, styleLabel: string): string {
  const skills = card.skills ?? [];
  const lines: Array<{ text: string; size: number; fill: string; weight: number; italic?: boolean }> = [];

  for (const [index, skill] of skills.slice(0, 2).entries()) {
    const mana = skill.manaCost ? ` (มานา ${skill.manaCost})` : '';
    lines.push({ text: `${index + 1}. ${skill.name}${mana}`, size: 12.5, fill: '#ffffff', weight: 700 });
    const desc = wrapText(skill.description ?? '', 46, 2);
    for (const line of desc) lines.push({ text: line, size: 11.5, fill: '#d1d5db', weight: 400 });
  }

  const description = wrapText(card.descriptionTh ?? '', 46, 2);
  for (const line of description) lines.push({ text: line, size: 11.5, fill: '#d1d5db', weight: 400 });

  const lore = wrapText(card.loreTh ?? '', 52, 2);
  for (const line of lore) lines.push({ text: line, size: 10.5, fill: '#9ca3af', weight: 400, italic: true });

  const maxLines = 8;
  const shown = lines.slice(0, maxLines);
  const startY = TEXT_BOX.y + 20;
  const lineH = 16.5;

  const body = shown
    .map((line, index) => `<text x="${TEXT_BOX.x + 12}" y="${(startY + index * lineH).toFixed(1)}" font-size="${line.size}" font-weight="${line.weight}" ${line.italic ? 'font-style="italic"' : ''} fill="${line.fill}" font-family="${THAI_FONT}">${escapeXml(line.text)}</text>`)
    .join('\n    ');

  return `<rect x="${TEXT_BOX.x}" y="${TEXT_BOX.y}" width="${TEXT_BOX.w}" height="${TEXT_BOX.h}" rx="${TEXT_BOX.r}" fill="url(#cardText)" stroke="${art.accent}" stroke-opacity="0.35" stroke-width="1.2"/>
    <rect x="${TEXT_BOX.x + 3}" y="${TEXT_BOX.y + 3}" width="${TEXT_BOX.w - 6}" height="${TEXT_BOX.h - 6}" rx="${TEXT_BOX.r - 3}" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
    <text x="${TEXT_BOX.x + 12}" y="${TEXT_BOX.y + 13.5}" font-size="9.5" fill="${art.accent}" fill-opacity="0.9" font-family="${THAI_FONT}">คุณสมบัติ / EFFECT</text>
    ${body}`;
}


/** แถบสเตตัสล่างการ์ด (ATK/DEF ตัวใหญ่ + HP/SPD/MP) */
function statsBar(card: PlaceholderCardInput, frame: RarityFrame): string {
  const stats = card.stats;
  const cell = (x: number, label: string, value: number | string, color: string, size = 15) => `
    <text x="${x}" y="${STATS_BAR.y + 17}" font-size="9.5" fill="#9ca3af" font-family="${THAI_FONT}">${label}</text>
    <text x="${x}" y="${STATS_BAR.y + 40}" font-size="${size}" font-weight="700" fill="${color}" font-family="${SANS_FONT}">${value}</text>`;

  return `<rect x="${STATS_BAR.x}" y="${STATS_BAR.y}" width="${STATS_BAR.w}" height="${STATS_BAR.h}" rx="${STATS_BAR.r}" fill="url(#cardPlate)" stroke="${frame.mid}" stroke-opacity="0.85" stroke-width="1.4"/>
    <rect x="${STATS_BAR.x + 3}" y="${STATS_BAR.y + 3}" width="${STATS_BAR.w - 6}" height="${STATS_BAR.h - 6}" rx="${STATS_BAR.r - 3}" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
    ${stats ? cell(STATS_BAR.x + 16, 'ATK', stats.atk, '#fca5a5', 22) : ''}
    ${stats ? cell(STATS_BAR.x + 104, 'DEF', stats.def, '#93c5fd', 22) : ''}
    ${stats ? cell(STATS_BAR.x + 196, 'HP', stats.hp, '#86efac', 16) : ''}
    ${stats ? cell(STATS_BAR.x + 252, 'SPD', stats.spd, '#fde68a', 16) : ''}
    ${stats ? cell(STATS_BAR.x + 308, 'MP', stats.manaCost, '#d8b4fe', 16) : ''}`;
}

export interface CardArtOptions {
  /**
   * 'full' (ค่าเริ่มต้น) = วาดฉาก/ตัวแบบเองทั้งใบ
   * 'overlay' = วาดเฉพาะกรอบ/แถบชื่อ/กล่องคำบรรยาย/สเตตัส โดยเว้นช่องภาพโปร่งใส
   *             (ใช้ซ้อนทับ "ภาพ AI" ของการ์ด → ได้การ์ดที่มีรูปจริง + ข้อความครบ)
   */
  mode?: 'full' | 'overlay';
}

/** สร้างการ์ดทั้งใบ (420×600) — deterministic จาก canonicalSeedHash */
export function generatePlaceholderSvg(card: PlaceholderCardInput, options: CardArtOptions = {}): string {
  const art = ELEMENT_ART[card.element] ?? ELEMENT_ART.VEILMARKED;
  const frame = RARITY_FRAME[card.rarity] ?? RARITY_FRAME.COMMON;
  const rarityColor = frame.mid;
  const pool = bytePool(card.canonicalSeedHash, 1200);

  const style = ART_STYLES[iAt(pool, 0, ART_STYLES.length)];
  const subject = SUBJECTS[iAt(pool, 4, SUBJECTS.length)];
  const role = card.role && ROLE_EMBLEM[card.role] ? card.role : Object.keys(ROLE_EMBLEM)[iAt(pool, 5, 6)];
  const gradAngle = iAt(pool, 1, 360);
  const grainRot = fAt(pool, 2, 0, 90);
  const styleLabel = STYLE_LABEL_TH[style];

  const displayName = escapeXml((card.nameTh ?? '').trim() || card.name || 'การ์ดลึกลับ');
  const overlayOnly = options.mode === 'overlay';

  // เลเยอร์ในช่องภาพ: โหมด full วาดฉากเอง / โหมด overlay เว้นว่างให้ภาพ AI เป็นเลเยอร์ล่าง
  const artLayers = overlayOnly
    ? `<rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="#05060d" fill-opacity="0.08"/>`
    : `<rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="url(#cardArt)"/>
      <rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="url(#cardGrain)"/>
      ${sceneBackground(style, art, pool, rarityColor)}
      <g filter="url(#cardGlow)" opacity="0.5">
        ${elementMotif(art.motif, art, pool)}
      </g>
      ${subjectSilhouette(subject, art, pool, rarityColor)}
      ${artParticles(pool, art, rarityColor, frame.foil)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE.width}" height="${CARD_SIZE.height}" viewBox="0 0 ${CARD_SIZE.width} ${CARD_SIZE.height}" role="img" aria-label="${displayName}">
  <title>${displayName}</title>
  ${buildDefs(art, frame, rarityColor, gradAngle, grainRot)}
  <g clip-path="url(#cardFrameClip)">
    ${overlayOnly ? '' : `<rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}" fill="#03040a"/>`}
    ${frameLayer(frame)}

    <g clip-path="url(#cardArtClip)">
      ${artLayers}
      <rect x="${ART.x}" y="${ART.y}" width="${ART.w}" height="${ART.h}" fill="url(#cardVig)"/>
    </g>
    ${emblemWatermark(role, art)}

    ${nameBar(card, frame, art)}
    ${attributeIcon(art, frame)}
    ${levelStars(frame, card.rarity)}
    ${typeBar(card, art, card.skills ?? [])}
    ${effectBox(card, art, styleLabel)}
    ${statsBar(card, frame)}

    <text x="${CARD_SIZE.width / 2}" y="${CARD_SIZE.height - 23}" font-size="9.5" text-anchor="middle" fill="#e5e7eb" fill-opacity="0.75" font-family="${THAI_FONT}">ฉาก${styleLabel} · ความหายาก ${frame.labelTh} (${escapeXml(card.rarity)}) · Rune Dominion Arena</text>
    ${frame.foil ? holoSheen(frame) : ''}
  </g>
  <rect x="${FRAME.x}" y="${FRAME.y}" width="${FRAME.w}" height="${FRAME.h}" rx="${FRAME.r}" fill="none" stroke="#000000" stroke-opacity="0.55" stroke-width="3"/>
</svg>`;
}

/** Content Moderation ขั้นต่ำ — บล็อกคำต้องห้ามก่อนส่ง prompt ไป AI */
const BLOCKED_WORDS = [
  'nsfw', 'nude', 'naked', 'porn', 'sex', 'gore', 'beheading',
  'โป๊', 'หื่น', 'ลามก', 'เลือดสาด', 'ศพ',
];

export function isPromptSafe(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return !BLOCKED_WORDS.some((word) => lower.includes(word));
}

