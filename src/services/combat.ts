// Combat Engine — Phase 4 (Deterministic Auto Battle) — Part 1: types, PRNG, element, damage
import crypto from 'crypto';
import {
  BATTLE_MANA_MAX,
  ELEMENT_ADVANTAGE,
  ELEMENT_DISADVANTAGE,
} from '@/lib/constants';

export const COMBAT_VERSION = 'v1';

export interface CombatCard {
  cardId: string;
  name: string;
  nameTh?: string | null;
  element: string;
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

export type BattleSide = 'A' | 'B';

export interface BattleUnitState {
  cardId: string;
  name: string;
  nameTh?: string | null;
  element: string;
  atk: number;
  def: number;
  maxHp: number;
  hp: number;
  spd: number;
  mana: number;
  side: BattleSide;
  alive: boolean;
  shieldTurns: number;
  weakenTurns: number;
  hasteTurns: number;
  burnStacks: number;
}

export interface BattleLogEntry {
  round: number;
  order: number;
  actorId: string;
  actorSide: BattleSide;
  action: 'attack' | 'skill' | 'burn' | 'heal' | 'faint' | 'info';
  targetId?: string;
  damage?: number;
  healing?: number;
  manaAfter?: number;
  hpAfter?: number;
  statusApplied?: string;
  messageTh: string;
}

export interface BattleResult {
  winner: 'A' | 'B' | 'DRAW';
  roundsPlayed: number;
  teamAHpRemaining: number;
  teamBHpRemaining: number;
  log: BattleLogEntry[];
  seed: string;
  combatVersion: string;
}

export function battlePrng(seed: string, counter: number): number {
  const h = crypto.createHash('sha256').update(`${seed}#${counter}`).digest('hex');
  const v = parseInt(h.substring(0, 8), 16);
  return v / 0xffffffff;
}

export function buildBattleSeed(
  battleId: string,
  teamAIds: string[],
  teamBIds: string[],
  serverSecret: string
): string {
  const raw = `${battleId}|${[...teamAIds].sort().join(',')}|${[...teamBIds].sort().join(',')}|${COMBAT_VERSION}|${serverSecret}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const STRONG_AGAINST: Record<string, string[]> = {
  EMBERBOUND: ['SKYRIVEN'],
  SKYRIVEN: ['ROOTFORGED'],
  ROOTFORGED: ['TIDEBORN'],
  TIDEBORN: ['EMBERBOUND'],
  DAWNSWORN: ['VEILMARKED'],
  VEILMARKED: ['DAWNSWORN'],
};

export function getElementMultiplier(attackerElement: string, defenderElement: string): number {
  if (STRONG_AGAINST[attackerElement]?.includes(defenderElement)) {
    return ELEMENT_ADVANTAGE;
  }
  if (STRONG_AGAINST[defenderElement]?.includes(attackerElement)) {
    return ELEMENT_DISADVANTAGE;
  }
  return 1;
}

export function calculateDamage(
  atk: number,
  def: number,
  attackerElement: string,
  defenderElement: string,
  variance: number
): number {
  const base = Math.trunc(atk);
  const mitigation = 100 / (100 + Math.max(0, Math.trunc(def)));
  const element = getElementMultiplier(attackerElement, defenderElement);
  const dmg = Math.floor(base * mitigation * element * variance);
  return Math.max(1, dmg);
}

export function skillForElement(element: string): { name: string; status: string } {
  switch (element) {
    case 'EMBERBOUND':
      return { name: 'เผาไหม้', status: 'BURN' };
    case 'ROOTFORGED':
      return { name: 'โล่หิน', status: 'SHIELD' };
    case 'SKYRIVEN':
      return { name: 'ว่องไว', status: 'HASTE' };
    case 'VEILMARKED':
      return { name: 'คำสาปเงา', status: 'WEAKEN' };
    case 'TIDEBORN':
    case 'DAWNSWORN':
    default:
      return { name: 'เยียวยา', status: 'HEAL' };
  }
}

export function toUnit(c: CombatCard, side: BattleSide): BattleUnitState {
  return {
    cardId: c.cardId,
    name: c.name,
    nameTh: c.nameTh ?? null,
    element: c.element,
    atk: Math.trunc(c.atk),
    def: Math.trunc(c.def),
    maxHp: Math.max(1, Math.trunc(c.hp)),
    hp: Math.max(1, Math.trunc(c.hp)),
    spd: Math.trunc(c.spd),
    mana: 0,
    side,
    alive: true,
    shieldTurns: 0,
    weakenTurns: 0,
    hasteTurns: 0,
    burnStacks: 0,
  };
}

export function effectiveAtk(u: BattleUnitState): number {
  if (u.weakenTurns > 0) return Math.floor(u.atk * 0.8);
  return u.atk;
}

export function effectiveSpd(u: BattleUnitState): number {
  if (u.hasteTurns > 0) return u.spd + 10;
  return u.spd;
}

export { BATTLE_MANA_MAX };
