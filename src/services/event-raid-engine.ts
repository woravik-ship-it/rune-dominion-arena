// Event Raid Engine — Phase 11.1
// ผูก Boss Raid กับ combat engine จริง (5v1) แทนสูตร teamAtk × 12
// หลักการ: server-side ล้วน, deterministic (seed จาก boss+deck+attempt), ห้ามเชื่อ client
import { prisma } from '@/lib/prisma';
import {
  CombatCard,
  buildBattleSeed,
} from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { bossPhaseDef, bossPhaseForHp, ElementValue } from '@/services/event-boss';
import { deckToCombatCards } from '@/services/battle-api';

/** สถิติบอสแต่ละ Phase — ยิ่ง Phase สูงยิ่งโหด (ค่าคงที่ deterministic) */
const PHASE_STATS: Record<number, { atk: number; def: number; hp: number; spd: number }> = {
  1: { atk: 130, def: 90, hp: 420, spd: 22 },
  2: { atk: 160, def: 110, hp: 480, spd: 26 },
  3: { atk: 190, def: 130, hp: 540, spd: 30 },
  4: { atk: 220, def: 150, hp: 600, spd: 34 },
};

const BOSS_ELEMENT: Record<number, ElementValue> = {
  1: 'ROOTFORGED',
  2: 'VEILMARKED',
  3: 'VEILMARKED',
  4: 'DAWNSWORN',
};

/**
 * สร้างทีมบอส 5 หน่วยตาม Phase (GDD §13.3)
 * ใช้ engine 5v5 เดิม → ผู้เล่นสู้กับบอสที่แข็งขึ้นตาม Phase
 */
export function buildBossTeam(bossId: string, bossNameTh: string, phase: number): CombatCard[] {
  const stats = PHASE_STATS[phase] ?? PHASE_STATS[4];
  const def = bossPhaseDef(phase);
  const element = BOSS_ELEMENT[phase] ?? 'VEILMARKED';
  // หน่วยที่ 1 = ตัวบอสจริง, หน่วย 2–5 = องครักษ์สะท้อนเงา (สเกล 70%)
  return Array.from({ length: 5 }, (_, i) => {
    const scale = i === 0 ? 100 : 70;
    return {
      cardId: `${bossId}-p${phase}-u${i + 1}`,
      name: i === 0 ? def.name : `${def.name} Echo`,
      nameTh: i === 0 ? bossNameTh : `${bossNameTh} (สะท้อนเงา)`,
      element,
      atk: Math.floor((stats.atk * scale) / 100),
      def: Math.floor((stats.def * scale) / 100),
      hp: Math.floor((stats.hp * scale) / 100),
      spd: Math.floor((stats.spd * scale) / 100),
    } satisfies CombatCard;
  });
}

export interface RaidSimulation {
  damage: number;
  won: boolean;
  roundsPlayed: number;
  seed: string;
  elementsUsed: ElementValue[];
  bossHpRemaining: number;
  teamHpRemaining: number;
  /** ใช้เป็น "ดาเมจ" ที่ป้อนเข้า EventService.raid (หัก HP บอส) */
  bossDamage: number;
}

/**
 * รันการต่อสู้ 5v1 กับบอสด้วย combat engine จริง
 * - ดาเมจ = ผลรวมดาเมจที่ทีมผู้เล่นทำได้กับทีมบอส (อ่านจาก battle log)
 * - ชนะ = ทีมบอสรอดทั้งหมดตายก่อน (winner === 'A')
 */
export async function simulateRaid(params: {
  bossId: string;
  bossNameTh: string;
  bossCurrentHp: number;
  bossMaxHp: number;
  deckId: string;
  attemptKey: string;
}): Promise<RaidSimulation> {
  const teamA = await deckToCombatCards(params.deckId);
  if (!teamA) throw new Error('เด็คต้องมี 5 ใบ');

  const phase = bossPhaseForHp(params.bossCurrentHp, params.bossMaxHp);
  const teamB = buildBossTeam(params.bossId, params.bossNameTh, phase);

  const seed = buildBattleSeed(
    `raid:${params.attemptKey}`,
    teamA.map((c) => c.cardId),
    teamB.map((c) => c.cardId),
    process.env.SERVER_PEPPER ?? 'rune-dominion'
  );

  const result = simulateBattle(teamA, teamB, seed);

  // ดาเมจที่ทีมผู้เล่นทำกับฝั่งบอส (side B) จาก log จริงของ engine
  const bossDamageLog = result.log.filter(
    (e) => e.actorSide === 'A' && typeof e.damage === 'number' && e.damage > 0
  );
  const rawDamage = bossDamageLog.reduce((sum, e) => sum + (e.damage ?? 0), 0);

  const bossMaxHpTeam = teamB.reduce((sum, c) => sum + c.hp, 0);
  const bossHpRemaining = result.teamBHpRemaining;

  // สเกลดาเมจทีมบอส → HP บอสจริง (raid boss มี HP หลักล้าน)
  const ratio = bossMaxHpTeam > 0 ? (bossMaxHpTeam - bossHpRemaining) / bossMaxHpTeam : 0;
  const scaled = Math.max(500, Math.floor(ratio * Math.max(20_000, params.bossMaxHp * 0.02)));

  return {
    damage: scaled,
    bossDamage: rawDamage,
    won: result.winner === 'A',
    roundsPlayed: result.roundsPlayed,
    seed,
    elementsUsed: [...new Set(teamA.map((c) => c.element))] as ElementValue[],
    bossHpRemaining: bossHpRemaining,
    teamHpRemaining: result.teamAHpRemaining,
  };
}

/** ตรวจว่าเด็คเป็นของผู้ใช้จริง (กันแก้ deckId ของคนอื่น) */
export async function assertDeckOwner(deckId: string, userId: string): Promise<void> {
  const deck = await prisma.deck.findUnique({ where: { id: deckId }, select: { userId: true } });
  if (!deck || deck.userId !== userId) throw new Error('เด็คไม่ถูกต้อง');
}
