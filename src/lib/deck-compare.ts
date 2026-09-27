// Deck Compare — Phase 41: เทียบการ์ด "ดีขึ้นหรือแย่ลง" ก่อนเปลี่ยนในทีม
//
// ผู้ใช้สั่ง 2026-09-27: *"ส่วนการ์ดที่จะเปลี่ยนควรมีระบบเปรียบเทียบว่าดีขึ้นหรือแย่ลง"*
//
// ไฟล์บริสุทธิ์ (ไม่แตะ DB/DOM) ⇒ UI ใช้ตัวเลขชุดเดียวกับเทสต์ และเทียบได้ทุกจุด
//  - เทียบ Status ทีละบรรทัด (Δ) พร้อมบอกว่าดีขึ้น/แย่ลง
//  - สรุปเป็นคะแนน (ถ่วงน้ำหนักแบบเดียวกับที่ใช้ประเมินเด็ค) → verdict ดีขึ้น/แย่ลง/พอ ๆ กัน

export interface StatsLike {
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

export type StatKey = 'atk' | 'def' | 'hp' | 'spd';

export interface StatDeltaLine {
  key: StatKey;
  label: string;
  icon: string;
  from: number;
  to: number;
  delta: number;
  /** 'up' = ดีขึ้น · 'down' = แย่ลง · 'same' = เท่าเดิม */
  trend: 'up' | 'down' | 'same';
}

export type CompareVerdict = 'better' | 'worse' | 'equal';

export interface CompareResult {
  lines: StatDeltaLine[];
  /** คะแนนจาก/ไป (ถ่วงน้ำหนัก ATK 2 · DEF 1.2 · HP 0.35 · SPD 1.8) */
  fromScore: number;
  toScore: number;
  scoreDelta: number;
  verdict: CompareVerdict;
  /** จำนวนค่าที่ดีขึ้น / แย่ลง */
  better: number;
  worse: number;
}

const STAT_META: Array<{ key: StatKey; label: string; icon: string }> = [
  { key: 'atk', label: 'ATK', icon: '⚔️' },
  { key: 'def', label: 'DEF', icon: '🛡️' },
  { key: 'hp', label: 'HP', icon: '❤️' },
  { key: 'spd', label: 'SPD', icon: '💨' },
];

/** คะแนนพลังของการ์ด 1 ใบ (น้ำหนักเดียวกับที่ใช้ประเมินเด็ค) */
export function statScore(stats: StatsLike): number {
  return Math.round(stats.atk * 2 + stats.def * 1.2 + stats.hp * 0.35 + stats.spd * 1.8);
}

/**
 * เทียบ Status สองชุด (from = ของเดิม · to = ของใหม่)
 * `from` เป็น null ได้ = ช่องว่าง (เทียบกับ "ไม่มีอะไร")
 */
export function compareCardStats(from: StatsLike | null, to: StatsLike): CompareResult {
  const base: StatsLike = from ?? { atk: 0, def: 0, hp: 0, spd: 0 };
  const lines: StatDeltaLine[] = STAT_META.map((meta) => {
    const before = Math.trunc(base[meta.key] ?? 0);
    const after = Math.trunc(to[meta.key] ?? 0);
    const delta = after - before;
    return {
      key: meta.key, label: meta.label, icon: meta.icon,
      from: before, to: after, delta,
      trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
    };
  });
  const fromScore = statScore(base);
  const toScore = statScore(to);
  const scoreDelta = toScore - fromScore;
  const better = lines.filter((l) => l.trend === 'up').length;
  const worse = lines.filter((l) => l.trend === 'down').length;
  // เผื่อความต่างเล็กน้อย (±1% ของคะแนนเดิม · ±3 คะแนนเมื่อเริ่มจากศูนย์) = "พอ ๆ กัน"
  const tolerance = fromScore > 0 ? Math.max(1, Math.round(fromScore * 0.01)) : 3;
  const verdict: CompareVerdict =
    scoreDelta > tolerance ? 'better' : scoreDelta < -tolerance ? 'worse' : 'equal';
  return { lines, fromScore, toScore, scoreDelta, verdict, better, worse };
}

/** ข้อความสรุปสั้น ๆ ภาษาไทย (ใช้ใน UI) */
export function compareVerdictLabel(verdict: CompareVerdict): string {
  if (verdict === 'better') return 'ดีขึ้น';
  if (verdict === 'worse') return 'แย่ลง';
  return 'พอ ๆ กัน';
}

/** ป้ายสั้นของ Δ เช่น "+12" / "-5" / "=" */
export function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '=';
}
