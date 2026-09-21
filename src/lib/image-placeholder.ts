// Deterministic Placeholder Art — Phase 8 / Phase 13
// เจน SVG จากข้อมูลการ์ดแบบ deterministic (ห้าม Math.random — ใช้ hash เป็นแหล่งความสุ่ม)
// ใช้เป็นภาพชั่วคราวขณะรอ AI generation หรือใช้ถาวรเมื่อไม่ได้ตั้งค่า external provider
//
// Phase 13: ยกระดับงานศิลป์ — 6 style archetype × 6 element motif × 6 role emblem
// ทำให้การ์ดแต่ละใบต่างกันจริง (ไม่ใช่แค่เปลี่ยนชื่อ) แต่ยัง deterministic 100%
import crypto from 'crypto';


export interface PlaceholderCardInput {
  cardId: string;
  name: string;
  nameTh?: string | null;
  element: string;
  rarity: string;
  /** ใช้เลือกตราประจำบทบาท — ถ้าไม่ส่งมาจะเลือกจาก hash แทน */
  role?: string | null;
  canonicalSeedHash: string;
}

// ทิศทางศิลป์ต่อธาตุ — ตาม GDD §10.4 (สี: crimson/orange/gold, blue/cyan/silver, teal/mint, moss/ochre/bronze, ivory/gold/amber, indigo/violet/silver)
type Motif = 'flame' | 'wave' | 'wind' | 'stone' | 'light' | 'shadow';

const ELEMENT_ART: Record<string, { from: string; to: string; accent: string; glow: string; motif: Motif; labelTh: string }> = {
  EMBERBOUND: { from: '#c2410c', to: '#450a0a', accent: '#fbbf24', glow: '#fb923c', motif: 'flame', labelTh: 'เพลิง' },
  TIDEBORN: { from: '#0369a1', to: '#082f49', accent: '#a5f3fc', glow: '#38bdf8', motif: 'wave', labelTh: 'น้ำ' },
  SKYRIVEN: { from: '#0d9488', to: '#042f2b', accent: '#d1fae5', glow: '#5eead4', motif: 'wind', labelTh: 'ลม' },
  ROOTFORGED: { from: '#92400e', to: '#1c1207', accent: '#e7e5e4', glow: '#f59e0b', motif: 'stone', labelTh: 'ดิน' },
  DAWNSWORN: { from: '#d97706', to: '#7c2d12', accent: '#fef3c7', glow: '#fde68a', motif: 'light', labelTh: 'แสง' },
  VEILMARKED: { from: '#6d28d9', to: '#0b1020', accent: '#c7d2fe', glow: '#818cf8', motif: 'shadow', labelTh: 'เงา' },
};

const RARITY_COLORS: Record<string, string> = {
  COMMON: '#9ca3af',
  UNCOMMON: '#4ade80',
  RARE: '#60a5fa',
  EPIC: '#c084fc',
  LEGENDARY: '#fbbf24',
  MYTHIC: '#f87171',
};

const RARITY_STARS: Record<string, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
  MYTHIC: 6,
};

const RARITY_LABEL_TH: Record<string, string> = {
  COMMON: 'ทั่วไป',
  UNCOMMON: 'ไม่ธรรมดา',
  RARE: 'หายาก',
  EPIC: 'มหากาพย์',
  LEGENDARY: 'ตำนาน',
  MYTHIC: 'เทพนิยาย',
};

/** ตราประจำบทบาท (วาดเป็น path — ใช้ซ้ำในวงแหวนกลางการ์ด) */
const ROLE_EMBLEM: Record<string, string> = {
  WARRIOR: 'M0,-30 L6,-14 L6,22 L0,30 L-6,22 L-6,-14 Z M-14,4 L14,4',
  MAGE: 'M0,-32 L9,-8 L22,-8 L12,4 L16,24 L0,14 L-16,24 L-12,4 L-22,-8 L-9,-8 Z',
  HEALER: 'M-6,-26 L6,-26 L6,-8 L24,-8 L24,4 L6,4 L6,22 L-6,22 L-6,4 L-24,4 L-24,-8 L-6,-8 Z',
  TANK: 'M0,-30 L24,-20 L24,4 C24,18 12,26 0,32 C-12,26 -24,18 -24,4 L-24,-20 Z',
  ASSASSIN: 'M0,-32 L5,-6 L3,26 L0,32 L-3,26 L-5,-6 Z M-12,-2 L12,-2',
  SUPPORT: 'M-16,-20 L0,-30 L16,-20 L16,18 L0,28 L-16,18 Z M-8,-6 L8,-6 L8,10 L-8,10 Z',
};

/** อารมณ์ฉากพื้นหลังตาม style archetype */
const ART_STYLES = ['aura', 'celestial', 'terrain', 'tempest', 'mandala', 'eclipse'] as const;
type ArtStyle = (typeof ART_STYLES)[number];

const STYLE_LABEL_TH: Record<ArtStyle, string> = {
  aura: 'วงแหวนออร่า',
  celestial: 'ฟ้าดารา',
  terrain: 'ภูมิทัศน์',
  tempest: 'พายุคลั่ง',
  mandala: 'มันดาลารูน',
  eclipse: 'สุริยุปราคา',
};


/** แปลง hash hex → byte array (ใช้กำหนดรูปทรงแบบ deterministic) */
function hashBytes(hex: string): number[] {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '') || '00';
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16) || 0);
  }
  return bytes.length > 0 ? bytes : [0];
}

/** ความยาว hash ที่ถือว่าใช้ได้ (กันข้อมูลเพี้ยนจาก DB/ไฟล์ import) */
export const MIN_SEED_HASH_LENGTH = 8;

/** ตรวจว่า hash ใช้งานได้จริง (ใช้ในเทสต์และ route) */
export function isValidSeedHash(hex: string): boolean {
  return hashBytes(hex).length >= MIN_SEED_HASH_LENGTH;
}

/**
 * ขยาย hash ให้ได้ byte pool ยาวพอสำหรับวาดภาพหลายชั้น
 * (ยัง deterministic 100% — มาจาก sha256 ของ hash + ลำดับบล็อก)
 */
function bytePool(seed: string, size: number): number[] {
  const out: number[] = [];
  let block = 0;
  while (out.length < size) {
    const digest = crypto.createHash('sha256').update(`${seed}|${block}`).digest();
    for (const byte of digest) out.push(byte);
    block += 1;
  }
  return out.slice(0, size);
}

/** อ่านค่าจาก pool แบบวนรอบ → ตัวเลข 0..max-1 */
const iAt = (pool: number[], index: number, max: number): number => pool[index % pool.length] % max;

/** อ่านค่าจาก pool → ตัวเลขในช่วง [lo, hi) ทศนิยม 2 ตำแหน่ง */
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

/**
 * เจน SVG placeholder ขนาด 300×400 จากข้อมูลการ์ด (Phase 13 — งานศิลป์หลายชั้น)
 *
 * องค์ประกอบ: พื้นหลังไล่สี + ลายพื้น + ฉากตาม style archetype + ลายธาตุ + ฝุ่นแสง
 *             + วงแหวนรูน/ตราบทบาท + กรอบตามระดับ + แผ่นชื่อสองภาษา
 * ทั้งหมดผูกกับ canonicalSeedHash → การ์ดคนละใบได้ภาพคนละแบบ แต่ใบเดิมได้ภาพเดิมเสมอ
 */
export function generatePlaceholderSvg(card: PlaceholderCardInput): string {
  const art = ELEMENT_ART[card.element] ?? ELEMENT_ART.VEILMARKED;
  const rarityColor = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.COMMON;
  const stars = RARITY_STARS[card.rarity] ?? 1;
  const rarityLabel = RARITY_LABEL_TH[card.rarity] ?? 'ไม่ทราบระดับ';
  const pool = bytePool(card.canonicalSeedHash, 900);

  const style = ART_STYLES[iAt(pool, 0, ART_STYLES.length)];
  const gradAngle = iAt(pool, 1, 360);
  const grainRot = fAt(pool, 2, 0, 90);
  const emblemRotation = fAt(pool, 6, -12, 12);
  const roleKey = card.role && ROLE_EMBLEM[card.role] ? card.role : Object.keys(ROLE_EMBLEM)[iAt(pool, 5, 6)];
  const runeGlyphs = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ'];
  const runes = Array.from({ length: 12 }, (_, i) => runeGlyphs[iAt(pool, 600 + i, runeGlyphs.length)]);

  const displayName = escapeXml(card.nameTh || card.name || 'การ์ดลึกลับ');
  const displayNameEn = escapeXml(card.name || '');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400" role="img" aria-label="${displayName}">
  <title>${displayName}</title>
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${gradAngle} 0.5 0.5)">
      <stop offset="0%" stop-color="${art.from}"/>
      <stop offset="48%" stop-color="${art.to}"/>
      <stop offset="100%" stop-color="#05060d"/>
    </linearGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${art.accent}"/>
      <stop offset="55%" stop-color="${art.glow}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${art.glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="motifGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${art.glow}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${art.accent}" stop-opacity="0.1"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="45%" r="72%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.62"/>
    </radialGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.1"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="glowF" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
    <clipPath id="frameClip"><rect x="6" y="6" width="288" height="388" rx="16"/></clipPath>
    <pattern id="grain" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(${grainRot} 0 0)">
      <line x1="0" y1="0" x2="0" y2="16" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>
  <g clip-path="url(#frameClip)">
    <rect width="300" height="400" fill="url(#bg)"/>
    <rect width="300" height="400" fill="url(#grain)"/>
    ${artBackground(style, art, pool, rarityColor)}
    <g filter="url(#glowF)" opacity="0.55">
      ${elementMotif(art.motif, art, pool)}
    </g>
    ${particleField(pool, art, rarityColor)}
    <rect width="300" height="400" fill="url(#vig)"/>
  </g>
  ${emblemRing(roleKey, art, rarityColor, emblemRotation, runes)}
  ${rarityFrame(rarityColor, stars, card.rarity, rarityLabel)}
  ${namePlate(displayName, displayNameEn, art, rarityColor, style)}
</svg>`;
}

type ElementArt = (typeof ELEMENT_ART)[string];

/** ชั้นพื้นหลัง: ท้องฟ้า/เนิน/วัตถุท้องฟ้า/เส้นแสง ตาม style archetype (deterministic) */
function artBackground(style: ArtStyle, art: ElementArt, pool: number[], rarityColor: string): string {
  const out: string[] = [];
  const cx = fAt(pool, 3, 95, 205);
  const cy = fAt(pool, 4, 100, 210);

  if (style === 'aura') {
    for (let i = 0; i < 5; i += 1) {
      const r = 34 + i * 24 + fAt(pool, 10 + i, 0, 10);
      out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${art.glow}" stroke-opacity="${Math.max(0.04, 0.24 - i * 0.04).toFixed(2)}" stroke-width="${Math.max(1, 3 - i * 0.4).toFixed(1)}"/>`);
    }
    for (let i = 0; i < 14; i += 1) {
      const angle = (i * (360 / 14) + iAt(pool, 20 + i, 14)) * (Math.PI / 180);
      const r2 = 120 + iAt(pool, 34 + i, 50);
      out.push(`<line x1="${(cx + Math.cos(angle) * 26).toFixed(1)}" y1="${(cy + Math.sin(angle) * 26).toFixed(1)}" x2="${(cx + Math.cos(angle) * r2).toFixed(1)}" y2="${(cy + Math.sin(angle) * r2).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.13" stroke-width="2"/>`);
    }
  } else if (style === 'celestial') {
    const sunR = 46 + iAt(pool, 8, 34);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${sunR}" fill="url(#core)" opacity="0.9"/>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="${sunR + 12}" fill="none" stroke="${art.accent}" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="6 8"/>`);
    for (let i = 0; i < 22; i += 1) {
      out.push(`<circle cx="${fAt(pool, 40 + i, 12, 288)}" cy="${fAt(pool, 70 + i, 12, 300)}" r="${fAt(pool, 100 + i, 0.8, 2.6)}" fill="${art.accent}" opacity="${fAt(pool, 130 + i, 0.2, 0.85)}"/>`);
    }
    for (let i = 0; i < 5; i += 1) {
      const x1 = fAt(pool, 160 + i * 2, 20, 280);
      const y1 = fAt(pool, 161 + i * 2, 20, 140);
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x1 + 26}" y2="${y1 + 20}" stroke="${art.accent}" stroke-opacity="0.18" stroke-width="1"/>`);
    }
  } else if (style === 'terrain') {
    for (let layer = 0; layer < 3; layer += 1) {
      const baseY = 210 + layer * 32;
      const pts: string[] = [];
      for (let i = 0; i <= 6; i += 1) {
        const x = (300 / 6) * i;
        const y = baseY - fAt(pool, 200 + layer * 8 + i, 0, 52) - layer * 6;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      out.push(`<polygon points="0,330 ${pts.join(' ')} 300,330" fill="${layer === 0 ? art.glow : art.to}" opacity="${(0.28 + layer * 0.18).toFixed(2)}"/>`);
    }
  } else if (style === 'tempest') {
    for (let i = 0; i < 16; i += 1) {
      const x = fAt(pool, 240 + i, -40, 300);
      const y = fAt(pool, 260 + i, 0, 330);
      const len = fAt(pool, 280 + i, 40, 120);
      out.push(`<line x1="${x}" y1="${y}" x2="${x + len}" y2="${y - len * 0.35}" stroke="${art.accent}" stroke-opacity="${fAt(pool, 300 + i, 0.06, 0.24)}" stroke-width="${fAt(pool, 320 + i, 1, 4)}" stroke-linecap="round"/>`);
    }
  } else if (style === 'mandala') {
    for (let i = 0; i < 4; i += 1) {
      const r = 40 + i * 26;
      out.push(`<circle cx="150" cy="165" r="${r}" fill="none" stroke="${art.accent}" stroke-opacity="${(0.3 - i * 0.05).toFixed(2)}" stroke-width="1.5"/>`);
      const sides = 6 + i;
      const pts: string[] = [];
      for (let s = 0; s < sides; s += 1) {
        const angle = ((360 / sides) * s + iAt(pool, 340 + i, 20)) * (Math.PI / 180);
        pts.push(`${(150 + Math.cos(angle) * r).toFixed(1)},${(165 + Math.sin(angle) * r).toFixed(1)}`);
      }
      out.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="${art.glow}" stroke-opacity="0.16" stroke-width="1.5"/>`);
    }
  } else {
    const discR = 58 + iAt(pool, 9, 26);
    out.push(`<circle cx="150" cy="150" r="${discR + 10}" fill="${rarityColor}" opacity="0.20"/>`);
    out.push(`<circle cx="150" cy="150" r="${discR}" fill="#05060d" opacity="0.92"/>`);
    out.push(`<circle cx="150" cy="150" r="${discR}" fill="none" stroke="${art.accent}" stroke-opacity="0.55" stroke-width="2.5"/>`);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i * 51 + iAt(pool, 350 + i, 30)) * (Math.PI / 180);
      const len = fAt(pool, 360 + i, 30, 90);
      out.push(`<line x1="150" y1="150" x2="${(150 + Math.cos(angle) * len).toFixed(1)}" y2="${(150 + Math.sin(angle) * len).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.22" stroke-width="1.5"/>`);
    }
  }

  return out.join('\n  ');
}

/** ลายธาตุ (motif) ตาม GDD §10.4: เปลวไฟ/คลื่น/ลมหมุน/รากศิลา/รัศมี/หมอกเงา */
function elementMotif(motif: Motif, art: ElementArt, pool: number[]): string {
  const out: string[] = [];

  if (motif === 'flame') {
    for (let i = 0; i < 4; i += 1) {
      const x = 40 + i * 62 + fAt(pool, 400 + i, -10, 10);
      const h = fAt(pool, 410 + i, 60, 120);
      out.push(`<path d="M${x} 330 C${x - 26} ${330 - h * 0.5} ${x - 8} ${330 - h} ${x} ${330 - h * 1.1} C${x + 8} ${330 - h} ${x + 26} ${330 - h * 0.5} ${x} 330 Z" fill="url(#motifGrad)" opacity="0.55"/>`);
      out.push(`<path d="M${x} 330 C${x - 12} ${330 - h * 0.4} ${x - 4} ${330 - h * 0.62} ${x} ${330 - h * 0.7} C${x + 4} ${330 - h * 0.62} ${x + 12} ${330 - h * 0.4} ${x} 330 Z" fill="${art.accent}" opacity="0.6"/>`);
    }
  } else if (motif === 'wave') {
    for (let i = 0; i < 4; i += 1) {
      const y = 210 + i * 32;
      const amp = fAt(pool, 430 + i, 8, 20);
      out.push(`<path d="M-10 ${y} Q 45 ${y - amp} 90 ${y} T 190 ${y} T 290 ${y} T 390 ${y}" fill="none" stroke="${i % 2 === 0 ? art.glow : art.accent}" stroke-opacity="${(0.45 - i * 0.07).toFixed(2)}" stroke-width="${(4 - i * 0.6).toFixed(1)}"/>`);
    }
    for (let i = 0; i < 3; i += 1) {
      out.push(`<circle cx="${70 + i * 80}" cy="${fAt(pool, 440 + i, 240, 300)}" r="${fAt(pool, 450 + i, 6, 14)}" fill="${art.accent}" opacity="0.28"/>`);
    }
  } else if (motif === 'wind') {
    for (let i = 0; i < 5; i += 1) {
      const y = 70 + i * 46 + fAt(pool, 460 + i, -10, 10);
      out.push(`<path d="M-10 ${y} C 60 ${y - 22} 120 ${y + 22} 190 ${y} C 240 ${y - 14} 270 ${y + 10} 310 ${y - 6}" fill="none" stroke="${art.accent}" stroke-opacity="${fAt(pool, 470 + i, 0.16, 0.4)}" stroke-width="${fAt(pool, 480 + i, 1.5, 3.5)}" stroke-linecap="round"/>`);
    }
  } else if (motif === 'stone') {
    out.push(`<polygon points="0,330 60,190 110,250 160,150 210,245 260,180 300,330" fill="${art.glow}" opacity="0.22"/>`);
    for (let i = 0; i < 6; i += 1) {
      const x = 30 + i * 46;
      out.push(`<path d="M${x} 330 C${x - 8} 290 ${x + 10} 260 ${x - 4} 220" fill="none" stroke="${art.accent}" stroke-opacity="0.35" stroke-width="2.5"/>`);
    }
  } else if (motif === 'light') {
    for (let i = 0; i < 16; i += 1) {
      const angle = i * 22.5 * (Math.PI / 180);
      out.push(`<line x1="150" y1="150" x2="${(150 + Math.cos(angle) * 165).toFixed(1)}" y2="${(150 + Math.sin(angle) * 165).toFixed(1)}" stroke="${art.accent}" stroke-opacity="0.16" stroke-width="${i % 2 === 0 ? 3 : 1.5}"/>`);
    }
    out.push(`<circle cx="150" cy="150" r="62" fill="none" stroke="${art.accent}" stroke-opacity="0.4" stroke-width="2"/>`);
  } else {
    for (let i = 0; i < 6; i += 1) {
      const x = fAt(pool, 500 + i, 10, 290);
      const y = fAt(pool, 510 + i, 40, 240);
      out.push(`<path d="M${x} ${y} q ${fAt(pool, 520 + i, -30, 30)} ${fAt(pool, 530 + i, 20, 60)} ${fAt(pool, 540 + i, -20, 20)} ${fAt(pool, 550 + i, 40, 90)}" fill="none" stroke="${art.accent}" stroke-opacity="0.22" stroke-width="2"/>`);
    }
    out.push(`<path d="M150 60 A 62 62 0 1 0 150 184 A 48 48 0 1 1 150 60 Z" fill="${art.accent}" opacity="0.25"/>`);
  }

  return out.join('\n  ');
}

/** วงแหวนรูน + ตราบทบาทกลางการ์ด */
function emblemRing(role: string, art: ElementArt, rarityColor: string, rotation: number, runes: string[]): string {
  const ringRunes = runes
    .map((glyph, i) => {
      const angle = i * ((360 / runes.length) * Math.PI) / 180;
      const x = 150 + Math.cos(angle) * 74;
      const y = 168 + Math.sin(angle) * 74;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" fill="${art.accent}" fill-opacity="0.6" text-anchor="middle" dominant-baseline="middle">${glyph}</text>`;
    })
    .join('\n    ');

  return `<g transform="rotate(${rotation} 150 168)">
    <circle cx="150" cy="168" r="88" fill="#000000" opacity="0.3"/>
    <circle cx="150" cy="168" r="88" fill="none" stroke="${art.accent}" stroke-opacity="0.45" stroke-width="1.5"/>
    <circle cx="150" cy="168" r="70" fill="none" stroke="${rarityColor}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="4 6"/>
    ${ringRunes}
    <g transform="translate(150 168) scale(1.5)">
      <path d="${ROLE_EMBLEM[role] ?? ROLE_EMBLEM.SUPPORT}" fill="${art.accent}" fill-opacity="0.92" stroke="#000000" stroke-opacity="0.35" stroke-width="1.5"/>
    </g>
  </g>`;
}

/** ฝุ่นแสง/ประกายรอบการ์ด (ตำแหน่งมาจาก hash) */
function particleField(pool: number[], art: ElementArt, rarityColor: string): string {
  const out: string[] = [];
  for (let i = 0; i < 26; i += 1) {
    const x = fAt(pool, 560 + i, 8, 292);
    const y = fAt(pool, 700 + i, 8, 320);
    const r = fAt(pool, 800 + i, 0.8, 2.4);
    const color = i % 5 === 0 ? rarityColor : art.accent;
    out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${fAt(pool, 860 + i, 0.25, 0.9)}"/>`);
  }
  return out.join('\n  ');
}

/** มุมประดับกรอบ */
function cornerOrnaments(color: string): string {
  const corners: Array<[number, number, number, number]> = [
    [16, 16, 1, 1],
    [284, 16, -1, 1],
    [16, 396, 1, -1],
    [284, 396, -1, -1],
  ];
  return corners
    .map(([x, y, sx, sy]) => `<path d="M${x} ${y + 10 * sy} L${x} ${y} L${x + 10 * sx} ${y}" fill="none" stroke="${color}" stroke-opacity="0.9" stroke-width="3" stroke-linecap="round"/>`)
    .join('\n  ');
}

/** กรอบตามระดับความหายาก + ดาว + ป้ายระดับ */
function rarityFrame(rarityColor: string, stars: number, rarity: string, rarityLabel: string): string {
  return `<rect x="6" y="6" width="288" height="388" rx="16" fill="none" stroke="${rarityColor}" stroke-width="4"/>
  <rect x="13" y="13" width="274" height="374" rx="12" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>
  ${cornerOrnaments(rarityColor)}
  <text x="150" y="44" font-size="20" text-anchor="middle" fill="${rarityColor}" letter-spacing="2">${'★'.repeat(stars)}</text>
  <text x="150" y="62" font-size="11" text-anchor="middle" fill="#ffffff" fill-opacity="0.7">${escapeXml(rarity)} · ${escapeXml(rarityLabel)}</text>`;
}

/** แผ่นชื่อด้านล่าง (ไทย + อังกฤษ + ธาตุ + สไตล์ฉาก) */
function namePlate(nameTh: string, nameEn: string, art: ElementArt, rarityColor: string, style: ArtStyle): string {
  return `<rect x="6" y="316" width="288" height="78" rx="14" fill="url(#plate)"/>
  <rect x="6" y="316" width="288" height="78" rx="14" fill="none" stroke="${rarityColor}" stroke-opacity="0.55" stroke-width="1"/>
  <text x="150" y="345" font-size="19" text-anchor="middle" fill="#ffffff" font-weight="700">${nameTh}</text>
  <text x="150" y="365" font-size="11" text-anchor="middle" fill="${art.accent}" fill-opacity="0.95">${nameEn}</text>
  <text x="150" y="384" font-size="10" text-anchor="middle" fill="#ffffff" fill-opacity="0.6">ธาตุ${art.labelTh} · ฉาก${STYLE_LABEL_TH[style]} · Rune Dominion Arena</text>`;
}


/** Content Moderation ขั้นต่ำ — บล็อกคำต้องห้ามก่อนส่ง prompt ไป AI (ทุกขั้นตอนทำฝั่ง server) */
const BLOCKED_WORDS = [
  'nsfw', 'nude', 'naked', 'porn', 'sex', 'gore', 'beheading',
  'โป๊', 'หื่น', 'ลามก', 'เลือดสาด', 'ศพ',
];

export function isPromptSafe(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return !BLOCKED_WORDS.some((word) => lower.includes(word));
}
