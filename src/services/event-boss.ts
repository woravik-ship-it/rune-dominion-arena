// Event Service — Phase 11: Seasonal Event "Call of the Moonless Gate" (GDD §13)
// หลักการ: lifecycle คำนวณจากเวลา (lazy — ไม่ต้องพึ่ง cron), ค่ารางวัลเป็น Integer,
// งานที่เขียนข้อมูลต้อง idempotent (raid entry / milestone claim / shop purchase)
import { prisma } from '@/lib/prisma';

// ===== ค่าคงที่ตาม GDD §13 =====
export const EVENT_DURATION_DAYS = 14;
export const EVENT_GRACE_HOURS = 24;
export const RAID_ENTRY_COST = 10;          // Veil Shards
export const RAID_DAILY_CAP = 10;           // ครั้ง/วัน
export const RAID_PARTICIPATION_SHARDS = 2; // แพ้ก็ได้
export const RAID_CLEAR_BONUS_SHARDS = 5;   // ชนะเพิ่ม
export const RAID_ELEMENT_BONUS = 0.1;      // ทีม 4 ธาตุขึ้นไป +10% Event Points
export const RAID_BOSS_MAX_HP = 1_000_000;

// ===== Boss Phase (GDD §13.3) =====
export interface BossPhaseDef {
  phase: number;
  name: string;
  nameTh: string;
  hpFromPercent: number; // ขอบบน (%)
  hpToPercent: number;   // ขอบล่าง (%)
}

export const BOSS_PHASES: BossPhaseDef[] = [
  { phase: 1, name: 'The Rift Warden', nameTh: 'ผู้เฝ้ารอยแยก', hpFromPercent: 100, hpToPercent: 76 },
  { phase: 2, name: 'Reflected Knight', nameTh: 'อัศวินสะท้อนเงา', hpFromPercent: 75, hpToPercent: 51 },
  { phase: 3, name: 'Moonless Veil', nameTh: 'ม่านไร้จันทร์', hpFromPercent: 50, hpToPercent: 26 },
  { phase: 4, name: 'Echo of Morrow', nameTh: 'เสียงสะท้อนแห่งรุ่งอรุณ', hpFromPercent: 25, hpToPercent: 0 },
];

/** Phase ปัจจุบันจาก HP ที่เหลือ (%) — deterministic ล้วน */
export function bossPhaseForHp(currentHp: number, maxHp: number): number {
  if (maxHp <= 0) return 4;
  const pct = (Math.max(0, Math.min(currentHp, maxHp)) / maxHp) * 100;
  const found = BOSS_PHASES.find((p) => pct >= p.hpToPercent && pct <= p.hpFromPercent);
  return found?.phase ?? 4;
}

export function bossPhaseDef(phase: number): BossPhaseDef {
  return BOSS_PHASES.find((p) => p.phase === phase) ?? BOSS_PHASES[BOSS_PHASES.length - 1];
}

// ===== Boss Mechanics ตามธาตุ (GDD §13.4) =====
export type ElementValue =
  | 'EMBERBOUND' | 'TIDEBORN' | 'SKYRIVEN'
  | 'ROOTFORGED' | 'DAWNSWORN' | 'VEILMARKED';

export interface MechanicEffect {
  damageMultiplier: number; // ตัวคูณดาเมจรวม
  noteTh: string;
}

/**
 * คำนวณผลของ mechanics ต่อดาเมจของการโจมตี 1 ครั้ง
 * ทุกอย่าง deterministic — รับค่าจาก server เท่านั้น (ห้ามเชื่อ client)
 */
export function applyBossMechanics(params: {
  baseDamage: number;
  phase: number;
  elementsUsed: ElementValue[];
  turn: number;
}): { damage: number; effects: MechanicEffect[] } {
  const { baseDamage, phase, elementsUsed, turn } = params;
  const effects: MechanicEffect[] = [];
  let multiplier = 1;

  const has = (e: ElementValue) => elementsUsed.includes(e);
  const uniqueElements = new Set(elementsUsed).size;

  // Veil Shield — ลดดาเมจที่ได้รับ 40% (Dawn Resonance ลดเกราะได้)
  const shieldReduction = has('DAWNSWORN') ? 0.2 : 0.4;
  multiplier *= 1 - shieldReduction;
  effects.push({
    damageMultiplier: 1 - shieldReduction,
    noteTh: has('DAWNSWORN')
      ? 'Dawn Resonance สลาย Veil Shield (ลดเกราะเหลือ 20%)'
      : 'Veil Shield ลดดาเมจ 40%',
  });

  // Ember Break — Fire ทำดาเมจต่อ Shield เพิ่ม
  if (has('EMBERBOUND')) {
    multiplier *= 1.15;
    effects.push({ damageMultiplier: 1.15, noteTh: 'Ember Break ไฟตีทะลุเกราะ +15%' });
  }

  // Rune Fracture — ทุก 3 เทิร์น ธาตุหนึ่งรับดาเมจเพิ่ม
  if (turn % 3 === 0) {
    multiplier *= 1.1;
    effects.push({ damageMultiplier: 1.1, noteTh: 'Rune Fracture +10%' });
  }

  // Moonless Mark — เป้าหมายรับดาเมจเพิ่ม 20% (Tide Cleanse ล้างได้)
  if (!has('TIDEBORN')) {
    multiplier *= 1.2;
    effects.push({ damageMultiplier: 1.2, noteTh: 'Moonless Mark +20%' });
  } else {
    effects.push({ damageMultiplier: 1, noteTh: 'Tide Cleanse ล้าง Moonless Mark' });
  }

  // Rooted Guard — Earth ลด AoE ให้ทีม (ลด incoming ไม่ใช่ดาเมจ → คิดเป็น survivability)
  if (has('ROOTFORGED')) {
    effects.push({ damageMultiplier: 1, noteTh: 'Rooted Guard ลด AoE ให้ทีม' });
  }

  // Gale Shift — Wind หลบการโจมตีเดี่ยวได้เพิ่ม
  if (has('SKYRIVEN')) {
    effects.push({ damageMultiplier: 1, noteTh: 'Gale Shift หลบการโจมตีเดี่ยวได้เพิ่ม' });
  }

  // Eclipse Pulse — AoE ทุก 4 เทิร์น (เพิ่มดาเมจบอส แต่ผู้เล่นได้ดาเมจตอบโต้)
  if (turn % 4 === 0) {
    multiplier *= 1.05;
    effects.push({ damageMultiplier: 1.05, noteTh: 'Eclipse Pulse (AoE รอบที่ 4)' });
  }

  // Rift Hunger — HP บอสต่ำกว่า 30% บอสเร็วขึ้น → โอกาสสร้างดาเมจแลกเปลี่ยนเพิ่ม
  if (phase === 4) {
    multiplier *= 1.1;
    effects.push({ damageMultiplier: 1.1, noteTh: 'Rift Hunger บอสต่ำกว่า 30% +10%' });
  }

  const damage = Math.max(1, Math.floor(baseDamage * multiplier));
  return { damage, effects };
}

/** โบนัสทีม 4 ธาตุขึ้นไป +10% Event Points (GDD §13.5) */
export function hasElementBonus(elementsUsed: string[]): boolean {
  return new Set(elementsUsed).size >= 4;
}

export function applyElementBonus(points: number, elementsUsed: string[]): number {
  return hasElementBonus(elementsUsed)
    ? Math.floor(points * (1 + RAID_ELEMENT_BONUS))
    : Math.floor(points);
}
