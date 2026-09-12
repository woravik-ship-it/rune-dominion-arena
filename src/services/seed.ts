import crypto from 'crypto';
import { Element, Rarity, CardRole } from '@/types';

const ELEMENTS: Element[] = ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'DAWNSWORN', 'VEILMARKED'];
const RARITIES: Rarity[] = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
const ROLES: CardRole[] = ['WARRIOR', 'MAGE', 'HEALER', 'TANK', 'ASSASSIN', 'SUPPORT'];

const ELEMENT_NAMES: Record<Element, { th: string; en: string }> = {
  EMBERBOUND: { th: 'เพลิง', en: 'Emberbound' },
  TIDEBORN: { th: 'น้ำ', en: 'Tideborn' },
  SKYRIVEN: { th: 'ลม', en: 'Skyriven' },
  ROOTFORGED: { th: 'ดิน', en: 'Rootforged' },
  DAWNSWORN: { th: 'แสง', en: 'Dawnsworn' },
  VEILMARKED: { th: 'เงา', en: 'Veilmarked' },
};

const ROLE_NAMES: Record<CardRole, { th: string; en: string }> = {
  WARRIOR: { th: 'นักรบ', en: 'Warrior' },
  MAGE: { th: 'จอมเวท', en: 'Mage' },
  HEALER: { th: 'ผู้รักษา', en: 'Healer' },
  TANK: { th: 'ผู้พิทักษ์', en: 'Tank' },
  ASSASSIN: { th: 'นักฆ่า', en: 'Assassin' },
  SUPPORT: { th: 'ผู้สนับสนุน', en: 'Support' },
};

const SKILL_NAMES = [
  { th: 'ดาบเพลิง', en: 'Flame Sword', desc: 'โจมตีด้วยเพลิง' },
  { th: 'น้ำแข็งปั่น', en: 'Ice Blast', desc: 'ยิงน้ำแข็ง' },
  { th: 'สายฟ้า', en: 'Lightning', desc: 'สายฟ้าจากท้องฟ้า' },
  { th: 'โลหะเกราะ', en: 'Metal Armor', desc: 'เพิ่มเกราะ' },
  { th: 'แสงศักดิ์สิทธิ์', en: 'Holy Light', desc: 'แสงเยียวยา' },
  { th: 'เงามืด', en: 'Dark Shadow', desc: 'โจมตีด้วยเงา' },
  { th: 'พายุ', en: 'Storm', desc: 'พายุทำลายล้าง' },
  { th: 'แรงสะเทือน', en: 'Earthquake', desc: 'แผ่นดินไหว' },
];

const LORE_PREFIXES = [
  'อักษรโบราณเล่าว่า',
  'ใต้แสงจันทร์เต็มดวง',
  'ณ ดินแดนที่ห่างไกล',
  'จากความฝันอันลึกลับ',
  'เมื่อแสงอาทิตย์ลับขอบฟ้า',
  'ในห้วงน้ำแห่งความทรงจำ',
];

const LORE_SUFFIXES = [
  'รอคอยผู้กล้าที่จะมาปลุกกลับ',
  'เตือนผู้คนถึงภัยที่กำลังจะมาถึง',
  'บันทึกคำสาบานที่ไม่เคยลืม',
  'เก็บเศษเสี้ยวของอารมณ์ไว้',
  'ค้นหาสิ่งที่สูญหาย',
  'พิทักษ์ดินแดนนี้มาอย่างยาวนาน',
];

/**
 * Build canonical string from rune sequence
 */
export function buildCanonicalString(runes: number[]): string {
  const sorted = [...runes].sort((a, b) => a - b);
  const padded = sorted.map(r => r.toString().padStart(4, '0'));
  return `version=1|runes=${padded.join(',')}`;
}

/**
 * Hash seed with SHA-256 + Server Pepper
 */
export function hashSeed(canonicalString: string): string {
  const pepper = process.env.SERVER_PEPPER || 'default-pepper-change-me';
  return crypto.createHash('sha256').update(canonicalString + pepper).digest('hex');
}

/**
 * Deterministic PRNG from hash
 */
function seededRandom(seed: string, index: number): number {
  const hash = crypto.createHash('sha256').update(seed + index).digest('hex');
  const value = parseInt(hash.substring(0, 8), 16);
  return value / 0xFFFFFFFF;
}

/**
 * Pick deterministic value from array
 */
function pickFromArray<T>(hash: string, index: number, array: T[]): T {
  const random = seededRandom(hash, index);
  return array[Math.floor(random * array.length)];
}

/**
 * Generate card stats deterministically from hash
 */
function generateStats(hash: string, rarity: Rarity): { atk: number; def: number; hp: number; spd: number; manaCost: number } {
  const rarityMultiplier: Record<Rarity, number> = {
    COMMON: 1.0,
    UNCOMMON: 1.2,
    RARE: 1.5,
    EPIC: 1.8,
    LEGENDARY: 2.2,
    MYTHIC: 2.8,
  };

  const multiplier = rarityMultiplier[rarity];
  const baseAtk = Math.floor(seededRandom(hash, 100) * 50 + 20);
  const baseDef = Math.floor(seededRandom(hash, 101) * 40 + 15);
  const baseHp = Math.floor(seededRandom(hash, 102) * 100 + 50);
  const baseSpd = Math.floor(seededRandom(hash, 103) * 30 + 10);
  const manaCost = Math.floor(seededRandom(hash, 104) * 8 + 2);

  return {
    atk: Math.floor(baseAtk * multiplier),
    def: Math.floor(baseDef * multiplier),
    hp: Math.floor(baseHp * multiplier),
    spd: baseSpd,
    manaCost,
  };
}

/**
 * Generate skills deterministically from hash
 */
function generateSkills(hash: string, element: Element): { name: string; nameEn: string; description: string; manaCost: number }[] {
  const skills: { name: string; nameEn: string; description: string; manaCost: number }[] = [];
  const numSkills = Math.floor(seededRandom(hash, 200) * 2) + 1;

  const elementSkills = SKILL_NAMES.filter((_, i) => {
    const skillElement = i % 6;
    return skillElement === ELEMENTS.indexOf(element);
  });

  for (let i = 0; i < numSkills; i++) {
    const skill = elementSkills.length > 0 
      ? elementSkills[i % elementSkills.length]
      : pickFromArray(hash, 201 + i, SKILL_NAMES);
    skills.push({
      name: skill.th,
      nameEn: skill.en,
      description: skill.desc,
      manaCost: Math.floor(seededRandom(hash, 202 + i) * 5 + 2),
    });
  }

  return skills;
}

/**
 * Generate card name deterministically
 */
function generateName(hash: string, element: Element, role: CardRole): { name: string; nameTh: string } {
  const random1 = seededRandom(hash, 300);
  const random2 = seededRandom(hash, 301);

  const elementName = ELEMENT_NAMES[element];
  const roleName = ROLE_NAMES[role];

  const prefixes = ['Lord', 'Knight', 'Seeker', 'Guardian', 'Master', 'Champion', 'Warden', 'Keeper'];
  const suffixes = ['of Fire', 'of Ice', 'of Storm', 'of Earth', 'of Light', 'of Shadow', 'of Wind', 'of Stone'];

  const enPrefix = prefixes[Math.floor(random1 * prefixes.length)];
  const enSuffix = suffixes[Math.floor(random2 * suffixes.length)];

  return {
    name: `${enPrefix} ${enSuffix}`,
    nameTh: `${roleName.th} ${elementName.th}`,
  };
}

/**
 * Generate lore text deterministically
 */
function generateLore(hash: Element): { lore: string; loreTh: string } {
  const random1 = seededRandom(hash, 400);
  const random2 = seededRandom(hash, 401);

  const prefix = LORE_PREFIXES[Math.floor(random1 * LORE_PREFIXES.length)];
  const suffix = LORE_SUFFIXES[Math.floor(random2 * LORE_SUFFIXES.length)];

  return {
    lore: `${prefix}... ${suffix}`,
    loreTh: `${prefix}... ${suffix}`,
  };
}

/**
 * Create card definition from seed hash
 */
export function createCardFromSeed(hash: string): {
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  lore: string;
  loreTh: string;
  element: Element;
  rarity: Rarity;
  role: CardRole;
  atk: number;
  def: number;
  hp: number;
  spd: number;
  manaCost: number;
  skills: { name: string; nameEn: string; description: string; manaCost: number }[];
  canonicalSeedHash: string;
} {
  // Determine rarity (weighted)
  const rarityRoll = seededRandom(hash, 1);
  let rarity: Rarity;
  if (rarityRoll < 0.40) rarity = 'COMMON';
  else if (rarityRoll < 0.70) rarity = 'UNCOMMON';
  else if (rarityRoll < 0.85) rarity = 'RARE';
  else if (rarityRoll < 0.94) rarity = 'EPIC';
  else if (rarityRoll < 0.98) rarity = 'LEGENDARY';
  else rarity = 'MYTHIC';

  // Determine element
  const element = pickFromArray(hash, 2, ELEMENTS);

  // Determine role
  const role = pickFromArray(hash, 3, ROLES);

  // Generate name
  const { name, nameTh } = generateName(hash, element, role);

  // Generate stats
  const stats = generateStats(hash, rarity);

  // Generate skills
  const skills = generateSkills(hash, element);

  // Generate lore
  const { lore, loreTh } = generateLore(hash as any);

  return {
    name,
    nameTh,
    description: `A ${role.toLowerCase()} from the ${element.toLowerCase()} realm.`,
    descriptionTh: `${ROLE_NAMES[role].th}จากดินแดน${ELEMENT_NAMES[element].th}`,
    lore,
    loreTh,
    element,
    rarity,
    role,
    ...stats,
    skills,
    canonicalSeedHash: hash,
  };
}

/**
 * Validate rune sequence
 */
export function validateRuneSequence(runes: number[]): { valid: boolean; error?: string } {
  if (!Array.isArray(runes)) {
    return { valid: false, error: 'Rune sequence must be an array' };
  }

  if (runes.length < 8 || runes.length > 16) {
    return { valid: false, error: 'Rune sequence must contain 8-16 runes' };
  }

  for (const rune of runes) {
    if (!Number.isInteger(rune) || rune < 0 || rune > 9999) {
      return { valid: false, error: 'Each rune must be an integer between 0 and 9999' };
    }
  }

  return { valid: true };
}
