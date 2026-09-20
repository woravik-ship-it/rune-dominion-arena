// Battle Replay Verification — Phase 10
// หลักการ (GDD §20): ผลการต่อสู้ต้องคำนวณฝั่ง server เท่านั้น และ replay ต้องตรวจสอบย้อนหลังได้
// ตอนสร้าง battle เราเก็บ snapshot ทีมทั้งสอง (teams.A / teams.B) + seed ไว้ใน battleData
// เวลาเปิด replay จะ re-simulate ด้วยข้อมูลเดิม แล้วเทียบผล — ไม่ตรง = ถูกแก้ (TAMPERED)
import { COMBAT_VERSION, CombatCard } from './combat';
import { simulateBattle } from './combat-engine';

export type ReplayVerificationStatus = 'VERIFIED' | 'TAMPERED' | 'UNVERIFIABLE';

export interface ReplayVerification {
  status: ReplayVerificationStatus;
  /** เหตุผลกรณี UNVERIFIABLE (battle เก่า / ไม่มี snapshot) */
  reason?: string;
  /** จุดที่ไม่ตรง กรณี TAMPERED */
  mismatches?: string[];
}

interface StoredBattleData {
  seed?: string;
  combatVersion?: string;
  winner?: 'A' | 'B' | 'DRAW';
  roundsPlayed?: number;
  teamAHpRemaining?: number;
  teamBHpRemaining?: number;
  log?: unknown;
  teams?: { A?: CombatCard[]; B?: CombatCard[] };
}

/** ตรวจสอบ battleData ด้วยการคำนวณซ้ำ (pure — ไม่แตะ DB) */
export function verifyBattleReplay(battleData: unknown): ReplayVerification {
  const data = (battleData ?? {}) as StoredBattleData;

  if (!data.seed) {
    return { status: 'UNVERIFIABLE', reason: 'ไม่พบ seed ของการต่อสู้' };
  }
  if (data.combatVersion !== COMBAT_VERSION) {
    return {
      status: 'UNVERIFIABLE',
      reason: `combatVersion ต่างจากปัจจุบัน (${data.combatVersion ?? 'unknown'} ≠ ${COMBAT_VERSION})`,
    };
  }
  if (!data.teams?.A?.length || !data.teams?.B?.length) {
    return {
      status: 'UNVERIFIABLE',
      reason: 'ไม่มี snapshot ทีม (battle เก่าก่อน Phase 10) — ตรวจซ้ำไม่ได้',
    };
  }

  const result = simulateBattle(data.teams.A, data.teams.B, data.seed);
  const mismatches: string[] = [];

  if (result.winner !== data.winner) {
    mismatches.push(`winner: บันทึกไว้=${data.winner} คำนวณใหม่=${result.winner}`);
  }
  if (result.roundsPlayed !== data.roundsPlayed) {
    mismatches.push(`roundsPlayed: บันทึกไว้=${data.roundsPlayed} คำนวณใหม่=${result.roundsPlayed}`);
  }
  if (result.teamAHpRemaining !== data.teamAHpRemaining) {
    mismatches.push(
      `teamAHpRemaining: บันทึกไว้=${data.teamAHpRemaining} คำนวณใหม่=${result.teamAHpRemaining}`
    );
  }
  if (result.teamBHpRemaining !== data.teamBHpRemaining) {
    mismatches.push(
      `teamBHpRemaining: บันทึกไว้=${data.teamBHpRemaining} คำนวณใหม่=${result.teamBHpRemaining}`
    );
  }
  if (JSON.stringify(data.log ?? null) !== JSON.stringify(result.log)) {
    mismatches.push('battle log ไม่ตรงกับผลคำนวณใหม่');
  }

  if (mismatches.length > 0) {
    return { status: 'TAMPERED', mismatches };
  }
  return { status: 'VERIFIED' };
}
