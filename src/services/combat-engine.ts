// Combat Engine — Phase 4: simulateBattle (pure, deterministic)
import { BATTLE_MAX_TURNS, BATTLE_MANA_PER_TURN, BATTLE_MANA_MAX } from '@/lib/constants';
import {
  BattleLogEntry,
  BattleResult,
  BattleSide,
  BattleUnitState,
  CombatCard,
  COMBAT_VERSION,
  battlePrng,
  calculateDamage,
  effectiveAtk,
  effectiveSpd,
  skillForElement,
  toUnit,
} from './combat';

export function simulateBattle(
  teamA: CombatCard[],
  teamB: CombatCard[],
  seed: string
): BattleResult {
  const unitsA = teamA.map((c) => toUnit(c, 'A'));
  const unitsB = teamB.map((c) => toUnit(c, 'B'));
  const all: BattleUnitState[] = [...unitsA, ...unitsB];
  const log: BattleLogEntry[] = [];
  let prngCounter = 0;
  const nextRand = (): number => battlePrng(seed, prngCounter++);

  const aliveOf = (side: BattleSide): BattleUnitState[] =>
    all.filter((u) => u.side === side && u.alive);

  const firstEnemy = (side: BattleSide): BattleUnitState | undefined => {
    const enemies = aliveOf(side === 'A' ? 'B' : 'A');
    enemies.sort((a, b) => a.spd - b.spd || (a.cardId < b.cardId ? -1 : 1));
    return enemies[0];
  };

  const lowestAlly = (side: BattleSide): BattleUnitState | undefined => {
    const allies = aliveOf(side);
    allies.sort((a, b) => a.hp - b.hp || (a.cardId < b.cardId ? -1 : 1));
    return allies[0];
  };

  let order = 0;
  let roundsPlayed = 0;

  for (let round = 1; round <= BATTLE_MAX_TURNS; round++) {
    roundsPlayed = round;
    if (aliveOf('A').length === 0 || aliveOf('B').length === 0) break;

    const turnOrder = all
      .filter((u) => u.alive)
      .sort((a, b) => effectiveSpd(b) - effectiveSpd(a) || (a.cardId < b.cardId ? -1 : 1));

    for (const actor of turnOrder) {
      if (!actor.alive) continue;
      if (aliveOf('A').length === 0 || aliveOf('B').length === 0) break;

      if (actor.burnStacks > 0) {
        const burnDmg = Math.max(1, Math.floor(actor.maxHp * 0.05 * actor.burnStacks));
        actor.hp = Math.max(0, actor.hp - burnDmg);
        order++;
        log.push({
          round, order, actorId: actor.cardId, actorSide: actor.side,
          action: 'burn', damage: burnDmg, hpAfter: actor.hp,
          messageTh: `${actor.nameTh || actor.name} โดนเผาไหม้ ${burnDmg}`,
        });
        if (actor.hp <= 0) {
          actor.alive = false;
          order++;
          log.push({
            round, order, actorId: actor.cardId, actorSide: actor.side,
            action: 'faint', hpAfter: 0,
            messageTh: `${actor.nameTh || actor.name} หมดสภาพ`,
          });
          continue;
        }
      }

      actor.mana = Math.min(BATTLE_MANA_MAX, actor.mana + BATTLE_MANA_PER_TURN);
      const useSkill = actor.mana >= 50;
      const skill = skillForElement(actor.element);

      if (useSkill && (skill.status === 'HEAL' || skill.status === 'SHIELD' || skill.status === 'HASTE')) {
        actor.mana -= 50;
        if (skill.status === 'HEAL') {
          const target = lowestAlly(actor.side) ?? actor;
          const healing = Math.max(1, Math.floor(target.maxHp * 0.2));
          target.hp = Math.min(target.maxHp, target.hp + healing);
          order++;
          log.push({
            round, order, actorId: actor.cardId, actorSide: actor.side,
            action: 'heal', targetId: target.cardId,
            healing, manaAfter: actor.mana, hpAfter: target.hp,
            statusApplied: 'HEAL',
            messageTh: `${actor.nameTh || actor.name} ใช้ ${skill.name} +${healing}`,
          });
        } else {
          if (skill.status === 'SHIELD') actor.shieldTurns = 2;
          else actor.hasteTurns = 3;
          order++;
          log.push({
            round, order, actorId: actor.cardId, actorSide: actor.side,
            action: 'skill', manaAfter: actor.mana, statusApplied: skill.status,
            messageTh: `${actor.nameTh || actor.name} ใช้ ${skill.name}`,
          });
        }
      } else {
        const target = firstEnemy(actor.side);
        if (!target) break;
        const variance = 0.95 + nextRand() * 0.1;
        let raw = calculateDamage(effectiveAtk(actor), target.def, actor.element, target.element, variance);
        let isSkill = false;
        let statusApplied: string | undefined;
        if (useSkill && (skill.status === 'BURN' || skill.status === 'WEAKEN')) {
          isSkill = true;
          actor.mana -= 50;
          raw = Math.floor(raw * 1.5);
          statusApplied = skill.status;
          if (skill.status === 'BURN') target.burnStacks = Math.min(3, target.burnStacks + 1);
          else target.weakenTurns = 3;
        }
        if (target.shieldTurns > 0) raw = Math.max(1, Math.floor(raw * 0.7));
        target.hp = Math.max(0, target.hp - raw);
        order++;
        log.push({
          round, order, actorId: actor.cardId, actorSide: actor.side,
          action: isSkill ? 'skill' : 'attack', targetId: target.cardId,
          damage: raw, manaAfter: actor.mana, hpAfter: target.hp,
          statusApplied,
          messageTh: isSkill
            ? `${actor.nameTh || actor.name} ใช้ ${skill.name} ${raw} ดาเมจ`
            : `${actor.nameTh || actor.name} โจมตี ${raw} ดาเมจ`,
        });
        if (target.hp <= 0) {
          target.alive = false;
          order++;
          log.push({
            round, order, actorId: target.cardId, actorSide: target.side,
            action: 'faint', hpAfter: 0,
            messageTh: `${target.nameTh || target.name} หมดสภาพ`,
          });
        }
      }

      if (actor.shieldTurns > 0) actor.shieldTurns--;
      if (actor.weakenTurns > 0) actor.weakenTurns--;
      if (actor.hasteTurns > 0) actor.hasteTurns--;
    }
  }

  const hpA = unitsA.reduce((s, u) => s + Math.max(0, u.hp), 0);
  const hpB = unitsB.reduce((s, u) => s + Math.max(0, u.hp), 0);
  const aliveA = unitsA.filter((u) => u.alive).length;
  const aliveB = unitsB.filter((u) => u.alive).length;

  let winner: BattleResult['winner'] = 'DRAW';
  if (aliveA > 0 && aliveB === 0) winner = 'A';
  else if (aliveB > 0 && aliveA === 0) winner = 'B';
  else if (hpA !== hpB) winner = hpA > hpB ? 'A' : 'B';

  return {
    winner, roundsPlayed,
    teamAHpRemaining: hpA, teamBHpRemaining: hpB,
    log, seed, combatVersion: COMBAT_VERSION,
  };
}

