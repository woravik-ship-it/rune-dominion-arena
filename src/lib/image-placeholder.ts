// Deterministic Placeholder Art — Phase 8
// เจน SVG จากข้อมูลการ์ดแบบ deterministic (ห้าม Math.random — ใช้ hash เป็นแหล่งความสุ่ม)
// ใช้เป็นภาพชั่วคราวขณะรอ AI generation หรือใช้ถาวรเมื่อไม่ได้ตั้งค่า external provider

export interface PlaceholderCardInput {
  cardId: string;
  name: string;
  nameTh?: string | null;
  element: string;
  rarity: string;
  canonicalSeedHash: string;
}

// Palette ต่อธาตุ: [from, to] (HSL)
const ELEMENT_PALETTES: Record<string, [string, string]> = {
  EMBERBOUND: ['#c2410c', '#7f1d1d'],
  TIDEBORN: ['#0284c7', '#155e75'],
  SKYRIVEN: ['#4ade80', '#047857'],
  ROOTFORGED: ['#a16207', '#713f12'],
  DAWNSWORN: ['#f472b6', '#7e22ce'],
  VEILMARKED: ['#475569', '#0f172a'],
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

const ELEMENT_GLYPHS: Record<string, string> = {
  EMBERBOUND: '🔥',
  TIDEBORN: '💧',
  SKYRIVEN: '🌪️',
  ROOTFORGED: '⛰️',
  DAWNSWORN: '✨',
  VEILMARKED: '🌑',
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * เจน SVG placeholder ขนาด 300×400 จากข้อมูลการ์ด
 * - deterministic: input เดิม → SVG เดิม (byte ต่อ byte)
 * - สี/ลายมาจาก canonicalSeedHash + element/rarity
 */
export function generatePlaceholderSvg(card: PlaceholderCardInput): string {
  const bytes = hashBytes(card.canonicalSeedHash);
  const palette = ELEMENT_PALETTES[card.element] ?? ELEMENT_PALETTES.VEILMARKED;
  const rarityColor = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.COMMON;
  const glyph = ELEMENT_GLYPHS[card.element] ?? '❓';
  const stars = RARITY_STARS[card.rarity] ?? 1;

  // มุม gradient และตำแหน่งลายรูน อนุพันธ์จาก hash
  const gradAngle = bytes[0] % 360;
  const rot = (bytes[1] % 60) - 30; // -30..29 องศา
  const shapes = bytes.slice(2, 10).map((b, i) => ({
    cx: 40 + ((b * 7 + i * 31) % 220),
    cy: 50 + ((b * 13 + i * 17) % 260),
    r: 8 + (b % 26),
    opacity: 0.05 + (b % 5) / 40,
  }));
  const runeRings = bytes.slice(10, 16).map((b, i) => ({
    cx: 60 + ((b * 11 + i * 43) % 180),
    cy: 80 + ((b * 19 + i * 29) % 200),
    r: 20 + (b % 40),
  }));

  const displayName = escapeXml(card.nameTh || card.name || 'การ์ดลึกลับ');
  const starRow = '★'.repeat(stars);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400" role="img" aria-label="${displayName}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${gradAngle} 0.5 0.5)">
      <stop offset="0%" stop-color="${palette[0]}"/>
      <stop offset="100%" stop-color="${palette[1]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="55%">
      <stop offset="0%" stop-color="${rarityColor}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${rarityColor}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="300" height="400" fill="url(#bg)"/>
  <g transform="rotate(${rot} 150 200)">
    ${shapes.map((s) => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="#ffffff" opacity="${s.opacity.toFixed(3)}"/>`).join('\n    ')}
  </g>
  ${runeRings.map((r) => `<circle cx="${r.cx}" cy="${r.cy}" r="${r.r}" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2"/>`).join('\n  ')}
  <rect width="300" height="400" fill="url(#glow)"/>
  <rect x="6" y="6" width="288" height="388" fill="none" stroke="${rarityColor}" stroke-width="3" rx="14"/>
  <text x="150" y="205" font-size="88" text-anchor="middle">${glyph}</text>
  <text x="150" y="252" font-size="20" text-anchor="middle" fill="${rarityColor}">${starRow}</text>
  <rect x="20" y="330" width="260" height="44" rx="10" fill="#000000" fill-opacity="0.55"/>
  <text x="150" y="358" font-size="18" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${displayName}</text>
</svg>`;
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
