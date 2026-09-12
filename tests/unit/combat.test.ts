import {
  battlePrng,
  buildBattleSeed,
  calculateDamage,
  getElementMultiplier,
  skillForElement,
  effectiveAtk,
  effectiveSpd,
  toUnit,
  CombatCard,
} from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';

const card = (over: Partial<CombatCard> & { cardId: string }): CombatCard => ({
  name: over.cardId,
  nameTh: over.cardId,
  element: 'EMBERBOUND',
  atk: 100,
  def: 50,
  hp: 300,
  spd: 20,
  ...over,
});

const team5 = (prefix: string, element = 'EMBERBOUND'): CombatCard[] =>
  [1, 2, 3, 4, 5].map((i) => card({ cardId: `${prefix}-${i}`, element }));

describe('Combat Engine', () => {
  describe('getElementMultiplier', () => {
    it('ธาตุที่ชนะได้ 1.15x', () => {
      expect(getElementMultiplier('EMBERBOUND', 'SKYRIVEN')).toBe(1.15);
      expect(getElementMultiplier('TIDEBORN', 'EMBERBOUND')).toBe(1.15);
      expect(getElementMultiplier('DAWNSWORN', 'VEILMARKED')).toBe(1.15);
    });
    it('ธาตุที่แพ้ได้ 0.90x', () => {
      expect(getElementMultiplier('SKYRIVEN', 'EMBERBOUND')).toBe(0.9);
    });
    it('ธาตุเดียวกันได้ 1x', () => {
      expect(getElementMultiplier('EMBERBOUND', 'EMBERBOUND')).toBe(1);
    });
  });

  describe('calculateDamage', () => {
    it('สูตร base × mitigation × element × variance', () => {
      expect(calculateDamage(100, 0, 'EMBERBOUND', 'EMBERBOUND', 1)).toBe(100);
    });
    it('def ลดดาเมจ: def=100 → ครึ่งหนึ่ง', () => {
      expect(calculateDamage(100, 100, 'EMBERBOUND', 'EMBERBOUND', 1)).toBe(50);
    });
    it('ดาเมจขั้นต่ำคือ 1', () => {
      expect(calculateDamage(1, 9999, 'EMBERBOUND', 'EMBERBOUND', 0.95)).toBe(1);
    });
    it('ธาตุชนะแรงกว่า', () => {
      const adv = calculateDamage(100, 0, 'EMBERBOUND', 'SKYRIVEN', 1);
      const neu = calculateDamage(100, 0, 'EMBERBOUND', 'EMBERBOUND', 1);
      expect(adv).toBeGreaterThan(neu);
    });
    it('ผลเป็น integer เสมอ', () => {
      const dmg = calculateDamage(97, 33, 'TIDEBORN', 'SKYRIVEN', 0.97);
      expect(Number.isInteger(dmg)).toBe(true);
    });
  });

  describe('battlePrng determinism', () => {
    it('ค่าเดียวกันซ้ำได้ deterministic', () => {
      expect(battlePrng('seed1', 0)).toBe(battlePrng('seed1', 0));
    });
    it('seed ต่างกันค่าต่างกัน', () => {
      expect(battlePrng('seed1', 0)).not.toBe(battlePrng('seed2', 0));
    });
    it('ค่าอยู่ในช่วง [0,1)', () => {
      for (let i = 0; i < 20; i++) {
        const v = battlePrng('s', i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe('buildBattleSeed', () => {
    it('เรียงลำดับทีมก่อน hash', () => {
      const s1 = buildBattleSeed('b1', ['c1', 'c2'], ['c3'], 'secret');
      const s2 = buildBattleSeed('b1', ['c2', 'c1'], ['c3'], 'secret');
      expect(s1).toBe(s2);
    });
    it('battle ต่างกัน seed ต่างกัน', () => {
      expect(buildBattleSeed('b1', ['c1'], ['c2'], 's')).not.toBe(
        buildBattleSeed('b2', ['c1'], ['c2'], 's')
      );
    });

  describe('simulateBattle', () => {
    it('deterministic: ทีม+seed เดียวกัน = ผลเดียวกัน', () => {
      const r1 = simulateBattle(team5('a'), team5('b'), 'test-seed');
      const r2 = simulateBattle(team5('a'), team5('b'), 'test-seed');
      expect(r1).toEqual(r2);
    });
    it('ไม่เกิน 30 รอบ และ log ครบ', () => {
      const r = simulateBattle(team5('a'), team5('b'), 's');
      expect(r.roundsPlayed).toBeLessThanOrEqual(30);
      expect(r.log.length).toBeGreaterThan(0);
      expect(r.combatVersion).toBe('v1');
    });
    it('ทีมเก่งกว่าชนะทีมอ่อนกว่า', () => {
      const strong = [1, 2, 3, 4, 5].map((i) =>
        card({ cardId: `s-${i}`, atk: 500, def: 200, hp: 2000, spd: 50 })
      );
      const weak = [1, 2, 3, 4, 5].map((i) =>
        card({ cardId: `w-${i}`, atk: 10, def: 5, hp: 50, spd: 5 })
      );
      const r = simulateBattle(strong, weak, 's');
      expect(r.winner).toBe('A');
      expect(r.teamAHpRemaining).toBeGreaterThan(0);
    });
    it('status effect ทำงาน (skill log เกิดขึ้น)', () => {
      const teamA = [
        card({ cardId: 'fire-1', element: 'EMBERBOUND' }),
        card({ cardId: 'earth-1', element: 'ROOTFORGED' }),
        card({ cardId: 'wind-1', element: 'SKYRIVEN' }),
        card({ cardId: 'shadow-1', element: 'VEILMARKED' }),
        card({ cardId: 'water-1', element: 'TIDEBORN', hp: 2000 }),
      ];
      const r = simulateBattle(teamA, team5('b'), 'status-seed');
      const skillLogs = r.log.filter((l) => l.action === 'skill' || l.action === 'heal');
      expect(skillLogs.length).toBeGreaterThan(0);
      const statuses = new Set(r.log.map((l) => l.statusApplied).filter(Boolean));
      expect(statuses.size).toBeGreaterThan(0);
    });
    it('HP รวมเป็น integer ไม่ติดลบ', () => {
      const r = simulateBattle(team5('a'), team5('b'), 's');
      expect(Number.isInteger(r.teamAHpRemaining)).toBe(true);
      expect(Number.isInteger(r.teamBHpRemaining)).toBe(true);
      expect(r.teamAHpRemaining).toBeGreaterThanOrEqual(0);
      expect(r.teamBHpRemaining).toBeGreaterThanOrEqual(0);
    });
  });

  describe('helpers', () => {
    it('skillForElement ครบ 6 ธาตุ', () => {
      expect(skillForElement('EMBERBOUND').status).toBe('BURN');
      expect(skillForElement('ROOTFORGED').status).toBe('SHIELD');
      expect(skillForElement('SKYRIVEN').status).toBe('HASTE');
      expect(skillForElement('VEILMARKED').status).toBe('WEAKEN');
      expect(skillForElement('TIDEBORN').status).toBe('HEAL');
      expect(skillForElement('DAWNSWORN').status).toBe('HEAL');
    });
    it('WEAKEN ลด atk 20%', () => {
      const u = toUnit(card({ cardId: 'x', atk: 100 }), 'A');
      expect(effectiveAtk(u)).toBe(100);
      u.weakenTurns = 2;
      expect(effectiveAtk(u)).toBe(80);
    });
    it('HASTE เพิ่ม spd 10', () => {
      const u = toUnit(card({ cardId: 'x', spd: 20 }), 'A');
      expect(effectiveSpd(u)).toBe(20);
      u.hasteTurns = 2;
      expect(effectiveSpd(u)).toBe(30);
    });
  });
});

  });
