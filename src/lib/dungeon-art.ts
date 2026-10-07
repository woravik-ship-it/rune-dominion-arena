// Dungeon Art — Phase 31.1: การ์ดศัตรูดันเจี้ยนต้องแสดงเป็น "การ์ดจริง" บนหน้าสนามรบ
//
// ปัญหาที่แก้ (ผู้ใช้แจ้ง 2026-09-27): "เข้าหน้าต่อสู้ไม่ได้จริง ไม่ถูกต้องตามการเล่นเกม"
//   → เดิม log API ส่ง URL ภาพของ route ที่ไม่มีอยู่ (/api/dungeons/art/<name> = 404)
//     และกรอบการ์ดของศัตรู (/api/cards/dungeon:…/image) ตกไปเป็น placeholder "???"
//     ⇒ ฝั่งศัตรูทั้ง 5 ใบพังหมด (รูปไม่ขึ้น + หมุนค้าง "กำลังวาดภาพ…")
//
// กติกาของไฟล์นี้ (pure — ไม่แตะ DB/DOM จึงเทสต์ได้)
//  - "รหัสการ์ดศัตรูดันเจี้ยน" = `dungeon:<DUNGEON_CODE>:f<ชั้น>:boss` / `:minion<K>`
//    (รูปแบบเดียวกับที่ services/dungeon.ts สร้างตอนสู้จริง → ใช้ที่เดียวทั้งระบบ)
//  - status บนใบการ์ดต้องเป็นค่าเดียวกับที่ใช้ต่อสู้จริง → อ่านจาก dungeon-definitions + scaleStats
//  - ภาพ: ยืมภาพ AI ของการ์ดจริงในแคตตาล็อก (reuse ไม่ Gen ใหม่) โดยเลือกแบบ deterministic
//    → ไฟล์นี้กำหนด "คีย์เลือกภาพ" ส่วนการเลือกใบจริงเป็นหน้าที่ของ services/dungeon-art.ts
import {
  findFloor, floorBossCount, floorHpBonus, bossWeight, scaleStats, enemyTeamSize,
  type DungeonDef, type DungeonFloorDef,
} from '@/lib/dungeon-definitions';

/** คูณ status ฐานด้วยตัวคูณ (ใช้กับ bossScale) — integer เท่านั้น */
function scaleStats4(
  base: { atk: number; def: number; hp: number; spd: number },
  factor: number
): { atk: number; def: number; hp: number; spd: number } {
  return {
    atk: Math.max(1, Math.floor(base.atk * factor)),
    def: Math.max(0, Math.floor(base.def * factor)),
    hp: Math.max(1, Math.floor(base.hp * factor)),
    spd: Math.max(1, Math.floor(base.spd * factor)),
  };
}

const CARD_ID_PREFIX = 'dungeon:';

export type DungeonEnemyKind = 'boss' | 'minion';

export interface DungeonCardRef {
  dungeonCode: string;
  floor: number;
  kind: DungeonEnemyKind;
  /** บอส = 1 · ลูกน้อง = 1..N */
  index: number;
}

/** รหัสการ์ดศัตรูของดัน/ชั้นนี้ (ใช้ร่วมกันทั้งฝั่งต่อสู้และฝั่งแสดงผล) */
export function dungeonCardId(
  dungeonCode: string,
  floor: number,
  kind: DungeonEnemyKind,
  index = 1
): string {
  // บอสตัวที่ 1 ใช้ชื่อเดิม (`:boss`) เพื่อให้ประวัติศึกเก่ายังอ่านได้ · ตัวที่ 2+ = `:boss2`
  const suffix = kind === 'boss' ? (index > 1 ? `boss${index}` : 'boss') : `minion${index}`;
  return `${CARD_ID_PREFIX}${dungeonCode}:f${floor}:${suffix}`;
}

/** อ่านรหัสการ์ดศัตรู → คืน null ถ้าไม่ใช่การ์ดดันเจี้ยน */
export function parseDungeonCardId(cardId: string | null | undefined): DungeonCardRef | null {
  if (!cardId || !cardId.startsWith(CARD_ID_PREFIX)) return null;
  const match = /^dungeon:([A-Z0-9_]+):f(\d+):(boss(\d+)?|minion(\d+))$/.exec(cardId);
  if (!match) return null;
  const isBoss = match[3].startsWith('boss');
  return {
    dungeonCode: match[1],
    floor: Number(match[2]),
    kind: isBoss ? 'boss' : 'minion',
    index: Number((isBoss ? match[4] : match[5]) ?? 1) || 1,
  };
}

/** djb2 hash — ใช้เลือกภาพ/สีแบบ deterministic (ไม่พึ่ง crypto → เทสต์ได้) */
export function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** จำนวนภาพที่ใช้ต่อชนิด (บอส 1 แบบ · ลูกน้องสลับ 2 แบบ ให้ดูลูกทีมไม่ซ้ำกันหมด) */
export function artSlotCount(kind: DungeonEnemyKind): number {
  return kind === 'boss' ? 1 : 2;
}

/**
 * คีย์สำหรับเลือก "ภาพ" ของการ์ดศัตรู
 *  - คิดตาม (ดัน + ชนิด + ช่องภาพ) → ทุกชั้นของดันเดียวกันใช้ภาพชุดเดิม (จำง่าย ไม่สับสน)
 */
export function artSlotKey(dungeonCode: string, kind: DungeonEnemyKind, index: number): string {
  const slot = kind === 'boss' ? 0 : (index - 1) % artSlotCount(kind);
  return `${dungeonCode}#${kind}#${slot}`;
}

/** เลือกลำดับในคลังภาพจากคีย์ (deterministic) */
export function pickArtIndex(seedKey: string, poolSize: number): number {
  if (poolSize <= 0) return 0;
  return stableHash(seedKey) % poolSize;
}

export interface DungeonEnemyCard {
  cardId: string;
  name: string;
  nameTh: string;
  element: string;
  rarity: string;
  role: string;
  stats: { atk: number; def: number; hp: number; spd: number };
  manaCost: number;
  descriptionTh: string;
}

/**
 * ข้อมูลการ์ดศัตรูใบหนึ่ง (ชื่อ/ธาตุ/ระดับหายาก/status) — ใช้ทั้ง "ตอนสู้" และ "ตอนวาดการ์ด"
 * ⇒ เลข status บนใบการ์ดตรงกับที่ระบบต่อสู้ใช้จริงเสมอ
 */
export function dungeonEnemyInfo(dungeon: DungeonDef, ref: DungeonCardRef): DungeonEnemyCard | null {
  const floor = findFloor(dungeon, ref.floor);
  if (!floor) return null;
  const isBoss = ref.kind === 'boss';
  const elements = dungeon.elements.length > 0 ? dungeon.elements : ['VEILMARKED'];
  const base = isBoss ? dungeon.bossBase : dungeon.minionBase;
  // ชั้นที่มีบอสหลายตัว: บอสถูกลด status ลงเพื่อคงงบทีม (ดู bossScale ในนิยามชั้น)
  const bossScale = isBoss ? Math.min(1, Math.max(0.2, floor.bossScale ?? 1)) : 1;
  const stats = scaleStats(scaleStats4(base, bossScale), floor.scale);
  // Phase 45.4: HP ไล่ขึ้นทุกชั้น (hpBonus) ⇒ ต่อสู้นานขึ้น = ยากขึ้นอย่าง "พอดี"
  // (ไม่ดัน ATK เกินเพดานที่วัดได้ ซึ่งจะทำให้แพ้ทันทีแทนที่จะรู้สึกว่ายากขึ้น)
  const hpBonus = floorHpBonus(floor);
  const scaled = hpBonus === 1 ? stats : { ...stats, hp: Math.max(1, Math.floor(stats.hp * hpBonus)) };
  const element = isBoss
    ? elements[(ref.index - 1) % elements.length]
    : elements[ref.index % elements.length];
  const bossTotal = floorBossCount(floor);
  return {
    cardId: dungeonCardId(dungeon.code, ref.floor, ref.kind, ref.index),
    name: isBoss ? `${dungeon.name} Boss F${ref.floor}` : `${dungeon.name} Minion`,
    nameTh: isBoss
      ? `${dungeon.nameTh} · บอสชั้น ${ref.floor}${bossTotal > 1 ? ` (${ref.index}/${bossTotal})` : ''}`
      : `${dungeon.nameTh} · ลูกน้อง ${ref.index}`,
    element,
    // บอส = ตำนาน (LEGENDARY) เพื่อให้กรอบ/แสงบนการ์ดดูเป็นบอสจริง · ลูกน้อง = หายาก (RARE)
    rarity: isBoss ? 'LEGENDARY' : 'RARE',
    role: isBoss ? 'WARRIOR' : 'ASSASSIN',
    stats: scaled,
    manaCost: 0,
    descriptionTh: isBoss
      ? `ผู้พิทักษ์ชั้น ${ref.floor} ของ${dungeon.nameTh} — กำจัดให้ได้ก่อนถึงจะผ่านชั้น`
      : `ลูกน้องของ${dungeon.nameTh} ชั้น ${ref.floor}`,
  };
}

/** ช่องการ์ดศัตรูของชั้นตามลำดับที่วางบนสนามรบ (บอสก่อน แล้วตามด้วยลูกน้อง) */
export function dungeonEnemySlots(floor: DungeonFloorDef): Array<{ kind: DungeonEnemyKind; index: number }> {
  const slots: Array<{ kind: DungeonEnemyKind; index: number }> = [];
  const bosses = floorBossCount(floor);
  for (let i = 1; i <= bosses; i += 1) slots.push({ kind: 'boss', index: i });
  for (let i = 1; i <= floor.minions; i += 1) slots.push({ kind: 'minion', index: i });
  return slots;
}

/** จำนวนการ์ดศัตรูของชั้น (บอส + ลูกน้อง · ยึดขนาดทีม 5 ใบเสมอ) */
export function dungeonEnemyCount(floor: DungeonFloorDef): number {
  return enemyTeamSize(floor);
}

/**
 * พลังรวมของทีมศัตรูในชั้นนี้ (atk+def+hp+spd ของทุกใบ) — สูตรเดียวกับ "พลังทีม" ของผู้เล่น
 * ใช้โชว์ในหน้าดันเจี้ยนให้ผู้เล่นเทียบกับทีมตัวเอง = "รู้สึกว่าเปลี่ยนระดับ" ชัดขึ้น
 */
export function floorEnemyPower(dungeon: DungeonDef, floor: DungeonFloorDef): number {
  let power = 0;
  for (const slot of dungeonEnemySlots(floor)) {
    const info = dungeonEnemyInfo(dungeon, {
      dungeonCode: dungeon.code,
      floor: floor.floor,
      kind: slot.kind,
      index: slot.index,
    });
    if (info) power += info.stats.atk + info.stats.def + info.stats.hp + info.stats.spd;
  }
  // คูณ "น้ำหนักจำนวนบอส" (ค่าที่วัดจริงในเกม: บอสยิ่งมากยิ่งอันตรายกว่าตัวเลข status เท่ากัน เพราะยิงรวมศูนย์)
  // ⇒ ตัวเลขนี้เป็น "พลังคุกคาม" ที่ไต่ขึ้นทุกชั้นจริง (ต่างจากผลรวม status ดิบที่ *ลด* ตอนบอสเพิ่มเพราะ scale ถูกหารชดเชย)
  return Math.round(power * bossWeight(floorBossCount(floor)));
}
