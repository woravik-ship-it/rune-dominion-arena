// เทสต์ตัวเล่น replay ของหน้าสนามรบ (Phase 16)
// กติกา: frames ยาว = log + 1 (เฟรม -1 คือก่อนเริ่ม) · HP/MP ตรงกับที่ engine บันทึก
// · attacker/defender ถูกใบสำหรับดาบ/โล่ · HP รวมลดเมื่อโดนตี
import { buildReplayFrames, cardStatuses, BATTLE_STATUS_ICON } from '@/services/battle-replay';
import { simulateBattle } from '@/services/combat-engine';
import type { BattleLogEntry, CombatCard } from '@/services/combat';

const A: CombatCard[] = [
  { cardId: 'a1', name: 'A1', nameTh: 'เอ1', element: 'EMBERBOUND', atk: 100, def: 10, hp: 500, spd: 50 },
  { cardId: 'a2', name: 'A2', nameTh: 'เอ2', element: 'TIDEBORN', atk: 60, def: 60, hp: 400, spd: 10 },
];
const B: CombatCard[] = [
  { cardId: 'b1', name: 'B1', nameTh: 'บี1', element: 'SKYRIVEN', atk: 80, def: 20, hp: 450, spd: 40 },
  { cardId: 'b2', name: 'B2', nameTh: 'บี2', element: 'ROOTFORGED', atk: 50, def: 80, hp: 600, spd: 5 },
];

const LOG: BattleLogEntry[] = [
  { round: 1, order: 0, actorId: 'a1', actorSide: 'A', action: 'attack', targetId: 'b1', damage: 90, manaAfter: 20, hpAfter: 360, messageTh: 'เอ1 โจมตี 90 ดาเมจ' },
  { round: 1, order: 1, actorId: 'b1', actorSide: 'B', action: 'attack', targetId: 'a1', damage: 70, manaAfter: 20, hpAfter: 430, messageTh: 'บี1 โจมตี 70 ดาเมจ' },
  { round: 1, order: 2, actorId: 'a2', actorSide: 'A', action: 'heal', targetId: 'a1', healing: 100, manaAfter: 0, hpAfter: 500, statusApplied: 'HEAL', messageTh: 'เอ2 ใช้ เยียวยา +100' },
  { round: 2, order: 3, actorId: 'b1', actorSide: 'B', action: 'skill', targetId: 'a1', damage: 500, manaAfter: 0, hpAfter: 0, statusApplied: 'BURN', messageTh: 'บี1 ใช้ เผาไหม้ 500 ดาเมจ' },
  { round: 2, order: 4, actorId: 'a1', actorSide: 'A', action: 'faint', hpAfter: 0, messageTh: 'เอ1 หมดสภาพ' },
];

describe('Battle replay — เฟรมสถานะสำหรับหน้าสนามรบ', () => {
  it('เฟรมแรกคือก่อนเริ่ม (HP เต็ม ไม่มีดาบ/โล่)', () => {
    const frames = buildReplayFrames(A, B, LOG);
    expect(frames).toHaveLength(LOG.length + 1);
    expect(frames[0].eventIndex).toBe(-1);
    expect(frames[0].entry).toBeNull();
    expect(frames[0].attackerId).toBeNull();
    expect(frames[0].defenderId).toBeNull();
    expect(frames[0].hpA).toBe(900);
    expect(frames[0].hpB).toBe(1050);
    expect(frames[0].teamA.every((c) => c.alive)).toBe(true);
  });

  it('โจมตีแล้ว HP คนรับลด + ดาบ/โล่ชี้ถูกใบ', () => {
    const frames = buildReplayFrames(A, B, LOG);
    const f = frames[1]; // เอ1 ตี บี1
    expect(f.attackerId).toBe('a1');
    expect(f.defenderId).toBe('b1');
    expect(f.teamB.find((c) => c.cardId === 'b1')?.hp).toBe(360);
    expect(f.hpB).toBe(360 + 600);
    expect(f.teamA.find((c) => c.cardId === 'a1')?.mana).toBe(20);
  });

  it('ฮีลแล้ว HP กลับเต็ม (ไม่เกิน max) + ไม่มีโล่เพราะไม่ใช่การโจมตี', () => {
    const frames = buildReplayFrames(A, B, LOG);
    const f = frames[3];
    expect(f.entry?.action).toBe('heal');
    expect(f.attackerId).toBeNull(); // ฮีลไม่ใช่โจมตี → ไม่มีดาบ
    expect(f.teamA.find((c) => c.cardId === 'a1')?.hp).toBe(500);
    expect(f.teamA.find((c) => c.cardId === 'a1')?.alive).toBe(true);
  });

  it('โดนตีตายแล้ว alive=false + faint ย้ำสถานะเดิม', () => {
    const frames = buildReplayFrames(A, B, LOG);
    const f = frames[4];
    expect(f.teamA.find((c) => c.cardId === 'a1')?.alive).toBe(false);
    expect(f.teamA.find((c) => c.cardId === 'a1')?.hp).toBe(0);
    expect(frames[5].teamA.find((c) => c.cardId === 'a1')?.alive).toBe(false);
  });

  it('log ว่าง = มีแค่เฟรมเริ่มต้น', () => {
    const frames = buildReplayFrames(A, B, []);
    expect(frames).toHaveLength(1);
    expect(frames[0].hpA).toBe(900);
  });

  it('เฟรมแรกยังไม่มีสถานะใดๆ ติดตัว', () => {
    const frames = buildReplayFrames(A, B, LOG);
    for (const card of [...frames[0].teamA, ...frames[0].teamB]) {
      expect(card.burnStacks).toBe(0);
      expect(card.weakenTurns).toBe(0);
      expect(card.shieldTurns).toBe(0);
      expect(card.hasteTurns).toBe(0);
      expect(cardStatuses(card)).toEqual([]);
    }
  });
});

// สถานะบนการ์ด: สกิลตัวเอง (โล่/ว่องไว) + ดีบัฟใส่เป้า (เผา/อ่อนแอ)
const STATUS_LOG: BattleLogEntry[] = [
  { round: 1, order: 0, actorId: 'a1', actorSide: 'A', action: 'skill', manaAfter: 0, statusApplied: 'SHIELD', messageTh: 'เอ1 ใช้ โล่หิน' },
  { round: 1, order: 1, actorId: 'b2', actorSide: 'B', action: 'skill', targetId: 'a1', damage: 60, manaAfter: 0, hpAfter: 440, statusApplied: 'WEAKEN', messageTh: 'บี2 ใช้ คำสาปเงา 60 ดาเมจ' },
  { round: 2, order: 2, actorId: 'a1', actorSide: 'A', action: 'attack', targetId: 'b2', damage: 70, manaAfter: 20, hpAfter: 530, messageTh: 'เอ1 โจมตี 70 ดาเมจ' },
  { round: 2, order: 3, actorId: 'b1', actorSide: 'B', action: 'skill', manaAfter: 0, statusApplied: 'HASTE', messageTh: 'บี1 ใช้ ว่องไว' },
];

const BURN_LOG: BattleLogEntry[] = [0, 1, 2, 3].map((i) => ({
  round: 1,
  order: i,
  actorId: i % 2 === 0 ? 'a1' : 'a2',
  actorSide: 'A' as const,
  action: 'skill' as const,
  targetId: 'b1',
  damage: 10,
  manaAfter: 0,
  hpAfter: 440 - i * 10,
  statusApplied: 'BURN',
  messageTh: `ติดเผาไหม้ครั้งที่ ${i + 1}`,
}));

describe('สถานะบนการ์ดในเฟรม (บัฟ/ดีบัฟ)', () => {
  it('ใช้สกิลโล่ → shieldTurns = 1 (engine ลดเทิร์นท้ายเทิร์นของตัวเองทันที)', () => {
    const frames = buildReplayFrames(A, B, STATUS_LOG);
    expect(frames[1].teamA.find((c) => c.cardId === 'a1')?.shieldTurns).toBe(1);
    expect(cardStatuses(frames[1].teamA.find((c) => c.cardId === 'a1')!)).toEqual([
      { key: 'SHIELD', icon: BATTLE_STATUS_ICON.SHIELD, label: 'โล่ 1 เทิร์น' },
    ]);
  });

  it('ใช้สกิลว่องไว → hasteTurns = 2 (ตั้ง 3 แล้วลดท้ายเทิร์นตัวเอง)', () => {
    const frames = buildReplayFrames(A, B, STATUS_LOG);
    expect(frames[4].teamB.find((c) => c.cardId === 'b1')?.hasteTurns).toBe(2);
  });

  it('ดีบัฟอ่อนแอติดเป้า = 3 เทิร์น แล้วลดเองเมื่อถึงเทิร์นของใบนั้น', () => {
    const frames = buildReplayFrames(A, B, STATUS_LOG);
    expect(frames[2].teamA.find((c) => c.cardId === 'a1')?.weakenTurns).toBe(3);
    expect(frames[3].teamA.find((c) => c.cardId === 'a1')?.weakenTurns).toBe(2);
  });

  it('เผาไหม้ซ้ำ = สแต็กเพิ่มแต่ไม่เกิน 3 + มีไอคอน 🔥', () => {
    const frames = buildReplayFrames(A, B, BURN_LOG);
    const card = frames[frames.length - 1].teamB.find((c) => c.cardId === 'b1')!;
    expect(card.burnStacks).toBe(3);
    expect(cardStatuses(card).map((s) => s.key)).toEqual(['BURN']);
    expect(cardStatuses(card)[0].icon).toBe('🔥');
    expect(cardStatuses(card)[0].label).toBe('เผาไหม้ 3 สแต็ก');
  });

  it('สถานะที่ไม่ติดไม่โผล่ (มีแค่เผาไหม้ 1 สแต็ก)', () => {
    const frames = buildReplayFrames(A, B, BURN_LOG);
    const card = frames[1].teamB.find((c) => c.cardId === 'b1')!;
    expect(card.burnStacks).toBe(1);
    expect(card.shieldTurns).toBe(0);
    expect(card.hasteTurns).toBe(0);
    expect(cardStatuses(card).map((s) => s.key)).toEqual(['BURN']);
  });

  it('การ์ดที่หมดสภาพไม่แสดงไอคอนสถานะ (แต่ข้อมูลยังอยู่ในเฟรม)', () => {
    const frames = buildReplayFrames(A, B, LOG);
    const dead = frames[5].teamA.find((c) => c.cardId === 'a1')!;
    expect(dead.alive).toBe(false);
    expect(dead.burnStacks).toBeGreaterThan(0);
    expect(cardStatuses(dead)).toEqual([]);
  });

// เทียบกับ engine จริง (deterministic ด้วย seed) — กันเทปเพี้ยนถ้า engine/log เปลี่ยนในอนาคต
const RICH_A: CombatCard[] = [
  { cardId: 'a1', name: 'A1', nameTh: 'เอ1', element: 'EMBERBOUND', atk: 120, def: 20, hp: 900, spd: 55 },
  { cardId: 'a2', name: 'A2', nameTh: 'เอ2', element: 'TIDEBORN', atk: 80, def: 40, hp: 700, spd: 30 },
  { cardId: 'a3', name: 'A3', nameTh: 'เอ3', element: 'ROOTFORGED', atk: 70, def: 80, hp: 1100, spd: 15 },
  { cardId: 'a4', name: 'A4', nameTh: 'เอ4', element: 'SKYRIVEN', atk: 90, def: 30, hp: 650, spd: 70 },
  { cardId: 'a5', name: 'A5', nameTh: 'เอ5', element: 'VEILMARKED', atk: 100, def: 25, hp: 800, spd: 45 },
];
const RICH_B: CombatCard[] = [
  { cardId: 'b1', name: 'B1', nameTh: 'บี1', element: 'VEILMARKED', atk: 110, def: 25, hp: 850, spd: 50 },
  { cardId: 'b2', name: 'B2', nameTh: 'บี2', element: 'EMBERBOUND', atk: 95, def: 35, hp: 950, spd: 40 },
  { cardId: 'b3', name: 'B3', nameTh: 'บี3', element: 'SKYRIVEN', atk: 85, def: 30, hp: 600, spd: 65 },
  { cardId: 'b4', name: 'B4', nameTh: 'บี4', element: 'ROOTFORGED', atk: 60, def: 90, hp: 1200, spd: 10 },
  { cardId: 'b5', name: 'B5', nameTh: 'บี5', element: 'TIDEBORN', atk: 75, def: 45, hp: 750, spd: 35 },
];

describe('เทียบ replay กับผลของ engine จริง', () => {
  const result = simulateBattle(RICH_A, RICH_B, 'replay-parity-seed');
  const frames = buildReplayFrames(RICH_A, RICH_B, result.log);
  const last = frames[frames.length - 1];

  it('เฟรมเท่ากับ log + 1 และ HP รวมเฟรมสุดท้ายตรงกับ engine เป๊ะ', () => {
    expect(frames).toHaveLength(result.log.length + 1);
    expect(last.hpA).toBe(result.teamAHpRemaining);
    expect(last.hpB).toBe(result.teamBHpRemaining);
  });

  it('ใบที่หมดสภาพในเฟรมสุดท้าย = ใบที่มี log faint (และ HP = 0)', () => {
    const fainted = new Set(result.log.filter((e) => e.action === 'faint').map((e) => e.actorId));
    const all = [...last.teamA, ...last.teamB];
    expect(new Set(all.filter((c) => !c.alive).map((c) => c.cardId))).toEqual(fainted);
    expect(all.filter((c) => !c.alive).every((c) => c.hp === 0)).toBe(true);
  });

  it('ทุกเฟรม: HP รวม = ผลรวมการ์ด และค่าสถานะอยู่ในช่วงที่ถูกต้อง', () => {
    for (const f of frames) {
      expect(f.hpA).toBe(f.teamA.reduce((s, c) => s + c.hp, 0));
      expect(f.hpB).toBe(f.teamB.reduce((s, c) => s + c.hp, 0));
      for (const c of [...f.teamA, ...f.teamB]) {
        expect(c.hp).toBeGreaterThanOrEqual(0);
        expect(c.hp).toBeLessThanOrEqual(c.maxHp);
        expect(c.mana).toBeGreaterThanOrEqual(0);
        expect(c.mana).toBeLessThanOrEqual(100);
        expect(c.burnStacks).toBeLessThanOrEqual(3);
        expect(c.weakenTurns).toBeLessThanOrEqual(3);
        expect(c.shieldTurns).toBeLessThanOrEqual(2);
        expect(c.hasteTurns).toBeLessThanOrEqual(3);
      }
    }
  });
});
});
