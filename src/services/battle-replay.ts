// battle-replay.ts — เล่น log ย้อนหลังเป็น "สถานะต่อเฟรม" (pure, ไม่แตะ DOM/DB)
//
// คำสั่งผู้ใช้ (2026-09-25): หน้าสนามรบต้องแสดงการ์ดเรียงบน-ล่าง (เรา=ล่าง/คู่ต่อสู้=บน)
// พร้อม HP/MP ต่อใบ + สัญลักษณ์ดาบ (คนโจมตี)/โล่ (คนรับ) + เอฟเฟกต์แดงใสที่คนโดนตี
// + ข้อความล่าสุดอยู่ด้านบน + แถบ HP รวมทั้งสองทีม
//
// โมดูลนี้รับ teams snapshot + log ทั้งก้อน (มาจาก GET /api/battle/:id/log อยู่แล้ว)
// แล้วคืน "เฟรม" ต่อเหตุการณ์: HP/MP ของการ์ดทุกใบหลังเหตุการณ์นั้น + ใครโจมตี/ใครรับ
// → หน้า battle/[id] ใช้เลื่อนดูย้อนหลัง/ข้ามไปจบได้โดยไม่ต้องจำลอง engine ซ้ำ
import type { BattleLogEntry, BattleUnitState, CombatCard } from './combat';
import { BATTLE_MANA_MAX, BATTLE_MANA_PER_TURN } from '@/lib/constants';
import { skillForElement, toUnit } from './combat';

// ค่าคงที่ของสถานะ — ต้องตรงกับ combat-engine.ts (engine ตั้งค่าด้วยเลขชุดเดียวกัน)
// SHIELD: ตั้ง 2 แล้วลดท้ายเทิร์นของเจ้าตัว → ยังเหลือ 1 เทิร์นถัดไป
const SHIELD_TURNS = 2;
const HASTE_TURNS = 3;
const WEAKEN_TURNS = 3;
const BURN_MAX_STACKS = 3;

/** สถานะการ์ด 1 ใบในเฟรม (HP/MP ปัจจุบัน + ตายหรือยัง + บัฟ/ดีบัฟที่ยังติด) */
export interface ReplayCardState {
  cardId: string;
  name: string;
  nameTh: string | null;
  element: string;
  maxHp: number;
  hp: number;
  mana: number;
  alive: boolean;
  /** สแต็กเผาไหม้ที่ยังติด (0-3) */
  burnStacks: number;
  /** เทิร์นที่ยังอ่อนแอ (0 = ไม่ติด) */
  weakenTurns: number;
  /** เทิร์นที่ยังมีโล่ */
  shieldTurns: number;
  /** เทิร์นที่ยังว่องไว */
  hasteTurns: number;
}

/** ไอคอนสถานะบนการ์ด (ใช้ทั้งหน้าสนามรบและตัวตรวจหน้าจริง) */
export const BATTLE_STATUS_ICON: Record<string, string> = {
  BURN: '🔥',
  WEAKEN: '💧',
  SHIELD: '🛡️',
  HASTE: '⚡',
};

/** สรุปสถานะที่ยังติดของการ์ด 1 ใบ → [{ key, icon, label }] (ว่าง = ไม่มีสถานะ) */
export function cardStatuses(c: ReplayCardState): { key: string; icon: string; label: string }[] {
  if (!c.alive) return [];
  const out: { key: string; icon: string; label: string }[] = [];
  if (c.burnStacks > 0)
    out.push({ key: 'BURN', icon: BATTLE_STATUS_ICON.BURN, label: `เผาไหม้ ${c.burnStacks} สแต็ก` });
  if (c.weakenTurns > 0)
    out.push({ key: 'WEAKEN', icon: BATTLE_STATUS_ICON.WEAKEN, label: `อ่อนแอ ${c.weakenTurns} เทิร์น` });
  if (c.shieldTurns > 0)
    out.push({ key: 'SHIELD', icon: BATTLE_STATUS_ICON.SHIELD, label: `โล่ ${c.shieldTurns} เทิร์น` });
  if (c.hasteTurns > 0)
    out.push({ key: 'HASTE', icon: BATTLE_STATUS_ICON.HASTE, label: `ว่องไว ${c.hasteTurns} เทิร์น` });
  return out;
}

/** เฟรมหลังเหตุการณ์ที่ i (i = -1 คือสถานะเริ่มต้นก่อนเริ่มสู้) */
export interface ReplayFrame {
  /** index ใน log ที่เฟรมนี้สะท้อนถึง (-1 = ก่อนเริ่ม) */
  eventIndex: number;
  /** log entry ที่ทำให้เกิดเฟรมนี้ (null = เฟรมเริ่มต้น) */
  entry: BattleLogEntry | null;
  /** สถานะทีมเรา (A) / คู่ต่อสู้ (B) หลังเหตุการณ์ */
  teamA: ReplayCardState[];
  teamB: ReplayCardState[];
  /** การ์ดที่โจมตีในเหตุการณ์นี้ (ใส่ดาบ ⚔️) */
  attackerId: string | null;
  /** การ์ดที่รับการโจมตีในเหตุการณ์นี้ (ใส่โล่ 🛡️ + คลุมแดง) */
  defenderId: string | null;
  /** HP รวมทั้งทีมหลังเหตุการณ์ (แถบบนหน้าจอ) */
  hpA: number;
  hpB: number;
  maxHpA: number;
  maxHpB: number;
}

function snapshot(units: BattleUnitState[]): ReplayCardState[] {
  return units.map((u) => ({
    cardId: u.cardId,
    name: u.name,
    nameTh: u.nameTh ?? null,
    element: u.element,
    maxHp: u.maxHp,
    hp: Math.max(0, u.hp),
    mana: Math.max(0, Math.min(BATTLE_MANA_MAX, u.mana)),
    alive: u.alive,
    burnStacks: u.burnStacks,
    weakenTurns: u.weakenTurns,
    shieldTurns: u.shieldTurns,
    hasteTurns: u.hasteTurns,
  }));
}

/**
 * ลดเทิร์นบัฟ/ดีบัฟของ "เจ้าของเทิร์น" ท้ายการกระทำ
 * — engine ทำแบบนี้หลังจบ attack/skill/heal ของการ์ดใบนั้น (เทิร์นที่โดนเผาไม่นับ เพราะ engine `continue` ออกไป)
 */
function tickTurns(actor: BattleUnitState | undefined): void {
  if (!actor) return;
  if (actor.shieldTurns > 0) actor.shieldTurns -= 1;
  if (actor.weakenTurns > 0) actor.weakenTurns -= 1;
  if (actor.hasteTurns > 0) actor.hasteTurns -= 1;
}

function findUnit(all: BattleUnitState[], side: 'A' | 'B', cardId?: string): BattleUnitState | undefined {
  if (!cardId) return undefined;
  return all.find((u) => u.side === side && u.cardId === cardId);
}

/**
 * สร้างเฟรมทั้งหมดจาก teams + log (เลียนแบบ combat-engine แบบ read-only:
 * HP/MP/สถานะถูกอัปเดตจาก field ที่ engine บันทึกไว้ในแต่ละ entry — hpAfter,
 * manaAfter, damage, healing — ไม่คำนวณดาเมจซ้ำ)
 */
export function buildReplayFrames(
  teamA: CombatCard[],
  teamB: CombatCard[],
  log: BattleLogEntry[]
): ReplayFrame[] {
  const unitsA = teamA.map((c) => toUnit(c, 'A'));
  const unitsB = teamB.map((c) => toUnit(c, 'B'));
  const all = [...unitsA, ...unitsB];
  const maxHpA = unitsA.reduce((s, u) => s + u.maxHp, 0);
  const maxHpB = unitsB.reduce((s, u) => s + u.maxHp, 0);

  const hpOf = (side: 'A' | 'B'): number =>
    (side === 'A' ? unitsA : unitsB).reduce((s, u) => s + Math.max(0, u.hp), 0);

  const toFrame = (eventIndex: number, entry: BattleLogEntry | null): ReplayFrame => ({
    eventIndex,
    entry,
    teamA: snapshot(unitsA),
    teamB: snapshot(unitsB),
    attackerId:
      entry && (entry.action === 'attack' || entry.action === 'skill') ? entry.actorId : null,
    defenderId: entry?.targetId ?? null,
    hpA: hpOf('A'),
    hpB: hpOf('B'),
    maxHpA,
    maxHpB,
  });

  const frames: ReplayFrame[] = [toFrame(-1, null)];

  log.forEach((entry, i) => {
    const actor = findUnit(all, entry.actorSide, entry.actorId);
    // เป้าหมาย: โจมตี/ดีบัฟ → ฝั่งตรงข้าม · ฮีล → ฝั่งเดียวกัน · faint/burn → ตัวเอง
    const targetSide =
      entry.action === 'heal' || entry.action === 'faint' || entry.action === 'burn'
        ? entry.actorSide
        : entry.actorSide === 'A' ? 'B' : 'A';
    const target = entry.targetId ? findUnit(all, targetSide, entry.targetId) : undefined;

    switch (entry.action) {
      case 'attack':
      case 'skill': {
        // มานา: ใช้ค่าที่ engine บันทึก (manaAfter) ถ้ามี ไม่งั้นเติมตามรอบแบบ engine
        if (actor) {
          if (typeof entry.manaAfter === 'number') actor.mana = entry.manaAfter;
          else actor.mana = Math.min(BATTLE_MANA_MAX, actor.mana + BATTLE_MANA_PER_TURN);
          // สกิลโล่/ว่องไวเป็นบัฟตัวเอง — ไม่มี target (defender = null ถูกต้อง)
          if (entry.statusApplied === 'SHIELD') actor.shieldTurns = SHIELD_TURNS;
          if (entry.statusApplied === 'HASTE') actor.hasteTurns = HASTE_TURNS;
        }
        if (target) {
          if (typeof entry.hpAfter === 'number') target.hp = entry.hpAfter;
          else if (typeof entry.damage === 'number') target.hp = Math.max(0, target.hp - entry.damage);
          if (target.hp <= 0) target.alive = false;
          // ดีบัฟเผา/อ่อนแอติดตาม target (แสดงเป็นไอคอนบนการ์ดในเฟรมถัดไป)
          if (entry.statusApplied === 'BURN')
            target.burnStacks = Math.min(BURN_MAX_STACKS, target.burnStacks + 1);
          if (entry.statusApplied === 'WEAKEN') target.weakenTurns = WEAKEN_TURNS;
        }
        tickTurns(actor);
        break;
      }
      case 'burn': {
        if (actor) {
          if (typeof entry.hpAfter === 'number') actor.hp = entry.hpAfter;
          else if (typeof entry.damage === 'number') actor.hp = Math.max(0, actor.hp - entry.damage);
          if (actor.hp <= 0) actor.alive = false;
        }
        // เทิร์นเผาไม่ลดเทิร์นบัฟของเจ้าตัว (engine `continue` ก่อนถึงบรรทัดลดเทิร์น)
        break;
      }
      case 'heal': {
        if (actor && typeof entry.manaAfter === 'number') actor.mana = entry.manaAfter;
        if (target && typeof entry.hpAfter === 'number') {
          target.hp = Math.min(target.maxHp, entry.hpAfter);
          if (target.hp > 0) target.alive = true;
        }
        tickTurns(actor);
        break;
      }
      case 'faint': {
        if (actor) {
          actor.hp = 0;
          actor.alive = false;
        }
        break;
      }
      case 'info':
      default:
        break;
    }

    frames.push(toFrame(i, entry));
  });

  return frames;
}

/** ไอคอน action สำหรับข้อความ log (ใช้สีพื้นแยกตาม action ในหน้า battle) */
export const BATTLE_ACTION_ICON: Record<string, string> = {
  attack: '⚔️',
  skill: '✨',
  burn: '🔥',
  heal: '💚',
  faint: '💀',
  info: 'ℹ️',
};

/** ชื่อสกิลตามธาตุ (แสดงใน tooltip ของการ์ดที่ติดสถานะ) */
export function skillNameFor(element: string): string {
  return skillForElement(element).name;
}
