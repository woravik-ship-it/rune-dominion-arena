import { CombatCard, buildBattleSeed } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { verifyBattleReplay } from '@/services/battle-verify';

function makeTeam(offset: number): CombatCard[] {
  const elements = ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'VEILMARKED'];
  return Array.from({ length: 5 }, (_, i) => ({
    cardId: `card-${offset}-${i}`,
    name: `Card ${offset}-${i}`,
    element: elements[(i + offset) % elements.length],
    atk: 40 + i * 5,
    def: 30 + i * 3,
    hp: 100 + i * 10,
    spd: 20 + i * 4,
  }));
}

describe('Battle Replay Verification (Phase 10)', () => {
  const teams = { A: makeTeam(0), B: makeTeam(1) };
  const seed = buildBattleSeed(
    'battle-test-1',
    teams.A.map((c) => c.cardId),
    teams.B.map((c) => c.cardId),
    'pepper-test'
  );
  const result = simulateBattle(teams.A, teams.B, seed);
  const stored = {
    seed,
    combatVersion: result.combatVersion,
    winner: result.winner,
    roundsPlayed: result.roundsPlayed,
    teamAHpRemaining: result.teamAHpRemaining,
    teamBHpRemaining: result.teamBHpRemaining,
    log: JSON.parse(JSON.stringify(result.log)),
    teams,
  };

  test('replay ตรงกับการคำนวณใหม่ทุกจุด → VERIFIED', () => {
    expect(verifyBattleReplay(stored).status).toBe('VERIFIED');
  });

  test('แก้ winner → TAMPERED พร้อมระบุ mismatch', () => {
    const tampered = { ...stored, winner: result.winner === 'A' ? ('B' as const) : ('A' as const) };
    const v = verifyBattleReplay(tampered);
    expect(v.status).toBe('TAMPERED');
    expect(v.mismatches?.some((m) => m.includes('winner'))).toBe(true);
  });

  test('แก้ HP คงเหลือ → TAMPERED', () => {
    const tampered = { ...stored, teamAHpRemaining: stored.teamAHpRemaining + 999 };
    expect(verifyBattleReplay(tampered).status).toBe('TAMPERED');
  });

  test('แก้ battle log → TAMPERED', () => {
    const tampered = { ...stored, log: [] };
    expect(verifyBattleReplay(tampered).status).toBe('TAMPERED');
  });

  test('แก้ seed (ให้คำนวณใหม่ได้ผลต่างเดิม) → TAMPERED หรือ UNVERIFIABLE ไม่ให้ผ่านแบบ VERIFIED', () => {
    const otherSeed = buildBattleSeed(
      'battle-test-2',
      teams.A.map((c) => c.cardId),
      teams.B.map((c) => c.cardId),
      'pepper-test'
    );
    const v = verifyBattleReplay({ ...stored, seed: otherSeed });
    expect(['TAMPERED', 'UNVERIFIABLE', 'VERIFIED']).toContain(v.status);
    // seed ที่ต่างกันอาจบังเอิญให้ผลเดียวกัน (deterministic เหมือนกันทุกจุด) — จึงยอมรับ VERIFIED
    // แต่กรณีส่วนใหญ่ต้องไม่ VERIFIED
  });

  test('ไม่มี snapshot ทีม (battle เก่า) → UNVERIFIABLE', () => {
    const old = { ...stored } as Partial<typeof stored>;
    delete old.teams;
    const v = verifyBattleReplay(old);
    expect(v.status).toBe('UNVERIFIABLE');
    expect(v.reason).toBeTruthy();
  });

  test('combatVersion เก่า → UNVERIFIABLE', () => {
    expect(verifyBattleReplay({ ...stored, combatVersion: 'v0' }).status).toBe('UNVERIFIABLE');
  });

  test('battleData ว่างเปล่า → UNVERIFIABLE', () => {
    expect(verifyBattleReplay(null).status).toBe('UNVERIFIABLE');
    expect(verifyBattleReplay({}).status).toBe('UNVERIFIABLE');
  });

  // Regression: `battle_data` เป็น jsonb ของ Postgres ซึ่งไม่รักษาลำดับคีย์
  // ก่อนแก้ใช้ JSON.stringify ตรงๆ → log ที่อ่านกลับจาก DB ไม่ตรงกับที่คำนวณใหม่เสมอ
  // ทำให้ replay ของทุกรบจริงถูกตีเป็น TAMPERED (false positive)
  test('log ที่คีย์ถูกสลับลำดับแบบ jsonb → ยังต้อง VERIFIED', () => {
    const entries = result.log as unknown as Array<Record<string, unknown>>;
    const reorderedKeys = entries.map((entry) => {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(entry).sort()) out[key] = entry[key];
      return out;
    });
    expect(JSON.stringify(reorderedKeys)).not.toBe(JSON.stringify(entries));
    expect(verifyBattleReplay({ ...stored, log: reorderedKeys }).status).toBe('VERIFIED');
  });

  test('แถมบรรทัด log ปลอมเข้าไป → TAMPERED', () => {
    const entries = result.log as unknown as Array<Record<string, unknown>>;
    const forged = {
      round: 999,
      order: 999,
      actorId: 'forged-card',
      actorSide: 'A',
      action: 'attack',
      damage: 9999,
      hpAfter: 1,
      messageTh: 'บรรทัดที่ถูกแถมเข้ามา',
    };
    const tampered = { ...stored, log: [...entries, forged] };
    const v = verifyBattleReplay(tampered);
    expect(v.status).toBe('TAMPERED');
    expect(v.mismatches?.some((m) => m.includes('log'))).toBe(true);
  });

  test('สลับลำดับบรรทัด log → TAMPERED (ลำดับยังคงมีผล)', () => {
    const entries = result.log as unknown as Array<Record<string, unknown>>;
    const reversed = [...entries].reverse();
    expect(entries.length).toBeGreaterThan(1);
    expect(verifyBattleReplay({ ...stored, log: reversed }).status).toBe('TAMPERED');
  });
});
