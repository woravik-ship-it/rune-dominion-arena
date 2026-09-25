// deck-formation.ts — ตรรกะ "จัดทีมเป็นวงกลม 5 ช่อง" + คะแนนตามบทบาทช่อง + กราฟ 6 เหลี่ยม
//
// คำสั่งผู้ใช้ (2026-09-25): "ให้เรียงการ์ดเป็นวงกลม แบ่งเป็น โจมตี 2 ป้องกัน 2 support 1
//   ช่องโจมตีคิดคะแนนเพิ่มจากค่าโจมตีของการ์ด ช่องป้องกันคิดจากค่าป้องกัน การ์ด Support
//   ได้คะแนนเพิ่มจากสกิลที่มีค่าที่เพิ่ม เพิ่มแบบสมดุล และแสดง Status แบบ 6 เหลี่ยม
//   แสดงค่าพลังต่างๆ รวมทั้งคะแนนรวมตรงกลาง แสดง Graphics แบบเรียลไทม์เมื่อเปลี่ยนการ์ดเข้าออก"
//
// ⚠️ โมดูลนี้เป็น **pure** (ไม่แตะ DOM/DB) → เทสต์ได้ และทั้งหน้าจัดทีม/API ใช้ค่าชุดเดียวกัน
//    - บทบาทช่องผูกกับ "position" 0–4 เดิมในฐานข้อมูล (ไม่ต้อง migrate DB)
//    - 0,1 = โจมตี · 2,3 = ป้องกัน · 4 = สนับสนุน (ผู้ใช้กำหนด)
//    - เรขาคณิตทั้งหมดใช้หน่วย "รัศมี = 1" (คอมโพเนนต์คูณด้วยพิกเซลจริงเอง)

// ===== บทบาทของช่อง =====

export type DeckSlotRole = 'ATTACK' | 'DEFENSE' | 'SUPPORT';

/**
 * บทบาทตามตำแหน่ง (position 0–4)
 * ลำดับตามที่ผู้ใช้สั่ง: โจมตี 2 ช่อง → ป้องกัน 2 ช่อง → สนับสนุน 1 ช่อง
 */
export const DECK_SLOT_ROLES: readonly DeckSlotRole[] = Object.freeze([
  'ATTACK',
  'ATTACK',
  'DEFENSE',
  'DEFENSE',
  'SUPPORT',
]);

export const DECK_SLOT_COUNT = DECK_SLOT_ROLES.length; // 5

export interface SlotRoleStyle {
  /** ชื่อไทยที่แสดงบนช่อง/ป้าย */
  th: string;
  en: string;
  icon: string;
  /** สีหลัก (hex) — ใช้ทั้งขอบช่อง วงแหวน และจุดเรือง */
  color: string;
  /** คะแนนเพิ่มมาจากอะไร (แสดงในคำอธิบาย) */
  bonusSourceTh: string;
}

export const SLOT_ROLE_STYLE: Record<DeckSlotRole, SlotRoleStyle> = {
  ATTACK: {
    th: 'โจมตี',
    en: 'Attack',
    icon: '⚔️',
    color: '#f97316',
    bonusSourceTh: 'คะแนนเพิ่มจากค่าโจมตี (ATK) ของการ์ด',
  },
  DEFENSE: {
    th: 'ป้องกัน',
    en: 'Defense',
    icon: '🛡️',
    color: '#38bdf8',
    bonusSourceTh: 'คะแนนเพิ่มจากค่าป้องกัน (DEF) ของการ์ด',
  },
  SUPPORT: {
    th: 'สนับสนุน',
    en: 'Support',
    icon: '✨',
    color: '#c084fc',
    bonusSourceTh: 'คะแนนเพิ่มจากพลังสกิล (ค่ามานาของสกิล)',
  },
};

/** บทบาทการ์ดที่ "เข้าช่อง" แล้วได้โบนัสตรงบทบาท (การ์ดอื่นยังวางได้ แต่ไม่ได้โบนัสส่วนนี้) */
export const ROLE_AFFINITY: Record<DeckSlotRole, readonly string[]> = {
  ATTACK: ['WARRIOR', 'MAGE', 'ASSASSIN'],
  DEFENSE: ['TANK', 'WARRIOR'],
  SUPPORT: ['SUPPORT', 'HEALER', 'MAGE'],
};

/** บทบาทช่องของตำแหน่งนี้ (ปัดเป็นจำนวนเต็มและวนกลับถ้าเกินช่วง — กันค่าเพี้ยนแล้วหน้าจอพัง) */
export function slotRole(position: number): DeckSlotRole {
  const safe = Number.isFinite(position) ? Math.trunc(position) : 0;
  const index = ((safe % DECK_SLOT_COUNT) + DECK_SLOT_COUNT) % DECK_SLOT_COUNT;
  return DECK_SLOT_ROLES[index];
}

/** การ์ดบทบาทนี้วางในช่องบทบาทนั้นได้โบนัสตรงบทบาทหรือไม่ */
export function hasRoleAffinity(role: DeckSlotRole, cardRole?: string | null): boolean {
  if (!cardRole) return false;
  return ROLE_AFFINITY[role].includes(cardRole);
}

// ===== เรขาคณิตวงกลม (รัศมี 1) =====
//
// มุม 0° = บนสุด (12 นาฬิกา) และเพิ่มตามเข็มนาฬิกา → x = r·sinθ, y = −r·cosθ
// SUPPORT อยู่บนสุด (0°) · คู่โจมตีอยู่ล่าง (72°/144°) · คู่ป้องกันอยู่บนซ้าย/ขวา (216°/288°)
// ⇒ สมมาตรซ้าย–ขวารอบแกนตั้ง: ช่อง 0 ↔ 3 และ 1 ↔ 2 สะท้อนกัน

const RING_ANGLE: Record<number, number> = {
  4: 0, // สนับสนุน — บนสุด
  0: 72, // โจมตี (ขวาล่าง)
  1: 144, // โจมตี (ซ้ายล่าง)
  2: 216, // ป้องกัน (ซ้ายบน)
  3: 288, // ป้องกัน (ขวาบน)
};

export interface Point {
  x: number;
  y: number;
}

/** มุมของช่อง (องศา) — 0 = บนสุด, วนตามเข็มนาฬิกา */
export function ringSlotAngle(position: number): number {
  const safe = Number.isFinite(position) ? Math.trunc(position) : 0;
  const index = ((safe % DECK_SLOT_COUNT) + DECK_SLOT_COUNT) % DECK_SLOT_COUNT;
  return RING_ANGLE[index];
}

/** แปลงมุม/รัศมีเป็นพิกัดคาร์ทีเซียน (ศูนย์กลาง = 0,0) */
export function polarPoint(angleDeg: number, radius: number, center: Point = { x: 0, y: 0 }): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + radius * Math.sin(rad),
    y: center.y - radius * Math.cos(rad),
  };
}

export interface RingNode {
  position: number;
  role: DeckSlotRole;
  angle: number;
  point: Point;
}

/** ผังวงกลมของทั้ง 5 ช่อง (เรียงตาม position) */
export function ringLayout(radius = 1): RingNode[] {
  return DECK_SLOT_ROLES.map((role, position) => {
    const angle = ringSlotAngle(position);
    return { position, role, angle, point: polarPoint(angle, radius) };
  });
}

/** จุดกึ่งกลางมุมของช่องที่ระบุ (ใช้วาดป้าย/เส้นอ้างอิงรอบวง) */
export function ringArcMidpoint(positions: number[], radius = 1): Point | null {
  const used = positions.filter((p) => Number.isInteger(p) && p >= 0 && p < DECK_SLOT_COUNT);
  if (!used.length) return null;
  const angles = used.map(ringSlotAngle);
  const avg = angles.reduce((sum, a) => sum + a, 0) / angles.length;
  return polarPoint(avg, radius);
}

// ===== พลังสกิล (ฐานของโบนัสช่องสนับสนุน) =====

export interface FormationSkill {
  name?: string | null;
  manaCost?: number | null;
}

/**
 * พลังสกิล = ค่าพลังของสกิลที่มี (ผู้ใช้สั่งให้ช่องสนับสนุนคิดจาก "สกิลที่มีค่าที่เพิ่ม")
 * สูตร: Σ (ค่ามานาของสกิล × 3 + 6) — ค่ามานาในเกมนี้คือ 2–6 ต่อสกิล และการ์ดมี 1–2 สกิล
 * ⇒ พลังสกิลอยู่ช่วง 12–48 (เฉลี่ย ≈ 27) ตรงกับสเกลของ ATK/DEF หลังคูณเรตโบนัส
 */
export function skillPower(skills?: readonly FormationSkill[] | null): number {
  if (!skills?.length) return 0;
  let total = 0;
  for (const skill of skills) {
    if (!skill) continue;
    const mana = Number.isFinite(skill.manaCost) ? Math.max(0, Math.trunc(skill.manaCost as number)) : 0;
    total += mana * 3 + 6;
  }
  return total;
}

// ===== โบนัสตามบทบาทช่อง =====
//
// "เพิ่มแบบสมดุล" (คำสั่งผู้ใช้) = โบนัสของทั้ง 3 บทบาทต้องมีขนาดใกล้กัน ไม่มีบทบาทไหนโก่ง
// ค่ามาตรฐานของเกม (จาก src/services/seed.ts): ATK เฉลี่ย ~45 · DEF เฉลี่ย ~35 · พลังสกิลเฉลี่ย ~27
// ⇒ เรตที่ทำให้ค่าคาดหวังเท่ากัน (≈42–45 ต่อใบ):
//     โจมตี 45 × 1.0 = 45 · ป้องกัน 35 × 1.2 = 42 · สนับสนุน 27 × 1.6 ≈ 43

export const ROLE_BONUS_RATE: Record<DeckSlotRole, number> = {
  ATTACK: 1,
  DEFENSE: 1.2,
  SUPPORT: 1.6,
};

/** โบนัสเพิ่มเมื่อการ์ดมีบทบาทตรงกับช่อง (จูงใจให้จัดวางให้ถูกบทบาท) */
export const AFFINITY_BONUS_RATE = 0.1;

export interface FormationCard {
  cardId: string;
  name?: string | null;
  nameTh?: string | null;
  element?: string | null;
  rarity?: string | null;
  role?: string | null;
  atk: number;
  def: number;
  hp: number;
  spd: number;
  manaCost?: number | null;
  skills?: readonly FormationSkill[] | null;
}

export interface RoleBonusDetail {
  role: DeckSlotRole;
  /** ค่าดิบที่ใช้คิดโบนัส (ATK / DEF / พลังสกิล) */
  sourceValue: number;
  /** เรตที่ใช้ */
  rate: number;
  /** โบนัสหลัก (จำนวนเต็ม) */
  base: number;
  /** โบนัสตรงบทบาท (จำนวนเต็ม) */
  affinity: number;
  total: number;
}

const trunc = (value: number): number => (Number.isFinite(value) ? Math.trunc(value) : 0);

/** คิดโบนัสของช่องหนึ่งจากบทบาท + การ์ดที่วาง (ไม่มีการ์ด → 0 ทั้งหมด) */
export function roleBonus(role: DeckSlotRole, card: FormationCard | null): RoleBonusDetail {
  if (!card) {
    return { role, sourceValue: 0, rate: ROLE_BONUS_RATE[role], base: 0, affinity: 0, total: 0 };
  }

  const rate = ROLE_BONUS_RATE[role];
  const sourceValue =
    role === 'ATTACK' ? trunc(card.atk) : role === 'DEFENSE' ? trunc(card.def) : skillPower(card.skills);

  const base = Math.round(sourceValue * rate);
  const affinity = hasRoleAffinity(role, card.role) ? Math.round(base * AFFINITY_BONUS_RATE) : 0;

  return { role, sourceValue, rate, base, affinity, total: base + affinity };
}

// ===== แกน 6 เหลี่ยม =====

export type HexAxisKey = 'atk' | 'def' | 'hp' | 'spd' | 'mana' | 'skill';

export interface HexAxis {
  key: HexAxisKey;
  labelTh: string;
  short: string;
  /** ค่าอ้างอิงที่ถือว่า "เต็มวง" (ทีม 5 ใบระดับบน) — ดูเหตุผลท้ายบล็อก */
  ref: number;
  color: string;
}

/**
 * ค่าอ้างอิง "เต็มวง" มาจากทีม 5 ใบระดับ UNCOMMON–RARE (ค่ามาตรฐานจาก seed.ts):
 * ATK 5×120 · DEF 5×90 · HP 5×260 · SPD 5×40 (spd ไม่คูณระดับความหายาก) · MP 5×9 · SKL 5×50
 * ⇒ ทีมระดับกลางเห็นวงประมาณครึ่ง–สองในสาม ทีมระดับบนเต็มวง (ค่าที่เกินอ้างอิงถูกตัดที่ 1)
 */
export const HEX_AXES: readonly HexAxis[] = Object.freeze([
  { key: 'atk', labelTh: 'โจมตี', short: 'ATK', ref: 600, color: '#f97316' },
  { key: 'def', labelTh: 'ป้องกัน', short: 'DEF', ref: 450, color: '#38bdf8' },
  { key: 'hp', labelTh: 'พลังชีวิต', short: 'HP', ref: 1300, color: '#4ade80' },
  { key: 'spd', labelTh: 'ความเร็ว', short: 'SPD', ref: 200, color: '#facc15' },
  { key: 'mana', labelTh: 'มานา', short: 'MP', ref: 45, color: '#818cf8' },
  { key: 'skill', labelTh: 'พลังสกิล', short: 'SKL', ref: 250, color: '#c084fc' },
]);

export type HexAxisValues = Record<HexAxisKey, number>;

export const EMPTY_AXES: HexAxisValues = Object.freeze({ atk: 0, def: 0, hp: 0, spd: 0, mana: 0, skill: 0 });

/** สัดส่วนของแกนเดียว (0–1) — เกินค่าอ้างอิงถูกตัดที่ 1 */
export function axisPercent(axis: HexAxis, value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(axis.ref) || axis.ref <= 0) return 0;
  return Math.min(1, value / axis.ref);
}

/** ค่าของแกนทั้ง 6 แบบ 0–1 (สำหรับวาดกราฟหกเหลี่ยม) */
export function normalizedAxes(axes: HexAxisValues): number[] {
  return HEX_AXES.map((axis) => axisPercent(axis, axes[axis.key]));
}

/** พิกัดมุมของแกนที่ i (0 = บนสุด, วนตามเข็มนาฬิกา ทุก 60°) */
export function hexAxisAngle(index: number): number {
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return ((((safe % HEX_AXES.length) + HEX_AXES.length) % HEX_AXES.length) * 360) / HEX_AXES.length;
}

/** จุดยอดของรูปหกเหลี่ยมจากค่าที่ปรับเป็น 0–1 แล้ว */
export function radarPolygon(values: readonly number[], radius: number, center: Point = { x: 0, y: 0 }): Point[] {
  return HEX_AXES.map((_, i) => {
    const raw = values[i];
    const ratio = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    return polarPoint(hexAxisAngle(i), radius * ratio, center);
  });
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** ข้อความ SVG points="x,y x,y" */
export function polygonPointsAttr(points: readonly Point[]): string {
  return points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
}

// ===== เกรดของทีม =====

export type FormationGradeKey = 'EMPTY' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface FormationGrade {
  key: FormationGradeKey;
  labelTh: string;
  color: string;
}

/**
 * เกณฑ์เกรดจากคะแนนรวม (calibrate กับทีม 5 ใบจริงจาก seed.ts + โบนัสช่อง)
 * COMMON ≈ 1,200 · UNCOMMON ≈ 1,400 · RARE ≈ 1,700 · EPIC ≈ 1,970 · LEGENDARY ≈ 2,330 · MYTHIC ≈ 2,870
 */
export const GRADE_STEPS: ReadonlyArray<{ min: number; grade: FormationGrade }> = Object.freeze([
  { min: 2400, grade: { key: 'S', labelTh: 'ยอดเยี่ยม', color: '#f59e0b' } },
  { min: 1900, grade: { key: 'A', labelTh: 'แข็งแกร่ง', color: '#c084fc' } },
  { min: 1500, grade: { key: 'B', labelTh: 'ดี', color: '#38bdf8' } },
  { min: 1200, grade: { key: 'C', labelTh: 'พอใช้', color: '#4ade80' } },
  { min: 0, grade: { key: 'D', labelTh: 'เริ่มต้น', color: '#9ca3af' } },
]);

export const EMPTY_GRADE: FormationGrade = Object.freeze({
  key: 'EMPTY',
  labelTh: 'ยังไม่มีการ์ด',
  color: '#6b7280',
});

export function formationGrade(total: number, filled: number): FormationGrade {
  if (filled <= 0 || !Number.isFinite(total) || total <= 0) return EMPTY_GRADE;
  const found = GRADE_STEPS.find((step) => total >= step.min);
  return found ? found.grade : EMPTY_GRADE;
}

// ===== สรุปผลการจัดทีม =====

export interface SlotReport {
  position: number;
  role: DeckSlotRole;
  card: FormationCard | null;
  /** ผลรวมสเตตัสพื้นฐานของการ์ดใบนี้ (atk+def+hp+spd) */
  base: number;
  bonus: RoleBonusDetail;
}

export interface FormationReport {
  slots: SlotReport[];
  filled: number;
  axes: HexAxisValues;
  /** ผลรวมสเตตัสพื้นฐานทั้งทีม */
  baseScore: number;
  /** ผลรวมโบนัสตามบทบาทช่อง (ก่อนบวกโบนัสตรงบทบาท) */
  bonusScore: number;
  /** ผลรวมโบนัสตรงบทบาท */
  affinityScore: number;
  /** คะแนนรวม = baseScore + bonusScore + affinityScore (ตัวเลขที่แสดงกลางวงหกเหลี่ยม) */
  total: number;
  grade: FormationGrade;
}

/**
 * สรุปการจัดทีมทั้งหมด: โบนัสรายช่อง + แกน 6 ด้าน + คะแนนรวม
 * รับอาเรย์ความยาว 5 (index = position) โดยช่องว่างใส่ null ได้
 */
export function formationReport(slots: Array<FormationCard | null | undefined>): FormationReport {
  const axes: HexAxisValues = { ...EMPTY_AXES };
  const reports: SlotReport[] = [];

  for (let position = 0; position < DECK_SLOT_COUNT; position += 1) {
    const role = slotRole(position);
    const card = slots[position] ?? null;
    if (!card) {
      reports.push({ position, role, card: null, base: 0, bonus: roleBonus(role, null) });
      continue;
    }

    axes.atk += trunc(card.atk);
    axes.def += trunc(card.def);
    axes.hp += trunc(card.hp);
    axes.spd += trunc(card.spd);
    axes.mana += trunc(card.manaCost ?? 0);
    axes.skill += skillPower(card.skills);

    const base = trunc(card.atk) + trunc(card.def) + trunc(card.hp) + trunc(card.spd);
    reports.push({ position, role, card, base, bonus: roleBonus(role, card) });
  }

  const filled = reports.filter((slot) => slot.card).length;
  const baseScore = reports.reduce((sum, slot) => sum + slot.base, 0);
  const bonusScore = reports.reduce((sum, slot) => sum + slot.bonus.base, 0);
  const affinityScore = reports.reduce((sum, slot) => sum + slot.bonus.affinity, 0);
  const total = baseScore + bonusScore + affinityScore;

  return {
    slots: reports,
    filled,
    axes,
    baseScore,
    bonusScore,
    affinityScore,
    total,
    grade: formationGrade(total, filled),
  };
}

// ===== ตัวช่วยอนิเมชัน (กราฟวิ่งเรียลไทม์ตอนการ์ดเข้า/ออก) =====

export function lerp(from: number, to: number, t: number): number {
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  return from + (to - from) * clamped;
}

/** ไล่ค่าระหว่างชุดตัวเลขเดิมกับชุดใหม่ (ใช้กับ rAF ในคอมโพเนนต์) */
export function lerpSeries(from: readonly number[], to: readonly number[], t: number): number[] {
  if (from.length !== to.length) return [...to];
  return to.map((value, i) => lerp(from[i] ?? 0, value, t));
}

/** ease-out cubic — ให้กราฟ "วิ่งเข้าที่" นุ่มนวล */
export function easeOutCubic(t: number): number {
  const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  return 1 - Math.pow(1 - clamped, 3);
}
