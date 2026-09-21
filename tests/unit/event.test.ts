// Event / Boss tests — Phase 11 (GDD §13)
// ทดสอบ pure logic: lifecycle, boss phase, mechanics, element bonus (deterministic)
import {
  BOSS_PHASES,
  RAID_ENTRY_COST,
  applyBossMechanics,
  applyElementBonus,
  bossPhaseDef,
  bossPhaseForHp,
  hasElementBonus,
} from '@/services/event-boss';
import { eventStatusAt, graceEndFor } from '@/services/event';
import {
  COMMUNITY_MILESTONES,
  PERSONAL_MILESTONES,
  SHOP_ITEMS,
  STORY_CHAPTERS,
} from '@/services/event-definitions';

describe('Event lifecycle (GDD §13)', () => {
  const start = new Date('2026-09-01T00:00:00Z');
  const end = new Date('2026-09-15T00:00:00Z');
  const grace = graceEndFor(end); // +24 ชม.

  test('ก่อนเริ่ม → UPCOMING', () => {
    expect(eventStatusAt({ startDate: start, endDate: end, gracePeriodEnd: grace }, new Date('2026-08-31T23:59:99Z'.replace('99', '59')))).toBe('UPCOMING');
  });

  test('ระหว่างช่วง event → ACTIVE', () => {
    expect(eventStatusAt({ startDate: start, endDate: end, gracePeriodEnd: grace }, new Date('2026-09-10T12:00:00Z'))).toBe('ACTIVE');
  });

  test('หลังจบแต่ยังใน grace 24 ชม. → GRACE_PERIOD', () => {
    expect(eventStatusAt({ startDate: start, endDate: end, gracePeriodEnd: grace }, new Date('2026-09-15T12:00:00Z'))).toBe('GRACE_PERIOD');
  });

  test('พ้น grace → ENDED', () => {
    expect(eventStatusAt({ startDate: start, endDate: end, gracePeriodEnd: grace }, new Date('2026-09-16T01:00:00Z'))).toBe('ENDED');
  });

  test('gracePeriodEnd ไม่ระบุ → คำนวณ 24 ชม. ให้เอง', () => {
    expect(eventStatusAt({ startDate: start, endDate: end, gracePeriodEnd: null }, new Date('2026-09-15T23:00:00Z'))).toBe('GRACE_PERIOD');
    expect(eventStatusAt({ startDate: start, endDate: end, gracePeriodEnd: null }, new Date('2026-09-16T00:30:00Z'))).toBe('ENDED');
  });
});

describe('Boss phase (GDD §13.3)', () => {
  const MAX = 1_000_000;

  test('100–76% → Phase 1 (The Rift Warden)', () => {
    expect(bossPhaseForHp(MAX, MAX)).toBe(1);
    expect(bossPhaseForHp(Math.floor(MAX * 0.76), MAX)).toBe(1);
  });

  test('75–51% → Phase 2', () => {
    expect(bossPhaseForHp(Math.floor(MAX * 0.75), MAX)).toBe(2);
    expect(bossPhaseForHp(Math.floor(MAX * 0.51), MAX)).toBe(2);
  });

  test('50–26% → Phase 3', () => {
    expect(bossPhaseForHp(Math.floor(MAX * 0.5), MAX)).toBe(3);
    expect(bossPhaseForHp(Math.floor(MAX * 0.26), MAX)).toBe(3);
  });

  test('25–0% → Phase 4 (Echo of Morrow)', () => {
    expect(bossPhaseForHp(Math.floor(MAX * 0.25), MAX)).toBe(4);
    expect(bossPhaseForHp(0, MAX)).toBe(4);
  });

  test('นิยาม 4 phase + ชื่อครบ', () => {
    expect(BOSS_PHASES).toHaveLength(4);
    expect(bossPhaseDef(2).nameTh).toBe('อัศวินสะท้อนเงา');
    expect(bossPhaseDef(99).phase).toBe(4); // fallback
  });
});

describe('Boss mechanics (GDD §13.4)', () => {
  test('Veil Shield ลดดาเมจ 40% เมื่อไม่มีธาตุแสง', () => {
    const r = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['EMBERBOUND'], turn: 1 });
    // 10000 × 0.6 (shield) × 1.15 (ember) × 1.2 (moonless) = 8280
    expect(r.damage).toBe(8280);
  });

  test('Dawn Resonance ลดเกราะเหลือ 20% (ดาเมจมากขึ้น)', () => {
    const withDawn = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['DAWNSWORN'], turn: 1 });
    const withoutDawn = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['EMBERBOUND'], turn: 1 });
    expect(withDawn.damage).toBeGreaterThan(withoutDawn.damage);
  });

  test('Tide Cleanse ล้าง Moonless Mark (ไม่คูณ 1.2)', () => {
    const withTide = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['TIDEBORN'], turn: 1 });
    expect(withTide.effects.some((e) => e.noteTh.includes('Tide Cleanse'))).toBe(true);
    expect(withTide.damage).toBe(6000); // 10000 × 0.6 เท่านั้น
  });

  test('Rune Fracture ทุก 3 เทิร์น +10%', () => {
    const t3 = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['TIDEBORN'], turn: 3 });
    const t1 = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['TIDEBORN'], turn: 1 });
    expect(t3.damage).toBeGreaterThan(t1.damage);
    expect(t3.effects.some((e) => e.noteTh.includes('Rune Fracture'))).toBe(true);
  });

  test('Phase 4 (Rift Hunger) เพิ่มดาเมจ 10%', () => {
    const p4 = applyBossMechanics({ baseDamage: 10_000, phase: 4, elementsUsed: ['TIDEBORN'], turn: 1 });
    const p1 = applyBossMechanics({ baseDamage: 10_000, phase: 1, elementsUsed: ['TIDEBORN'], turn: 1 });
    expect(p4.damage).toBeGreaterThan(p1.damage);
    expect(p4.effects.some((e) => e.noteTh.includes('Rift Hunger'))).toBe(true);
  });

  test('ดาเมจต่ำสุด 1 (ไม่ติดลบ)', () => {
    const r = applyBossMechanics({ baseDamage: 0, phase: 1, elementsUsed: ['TIDEBORN'], turn: 1 });
    expect(r.damage).toBe(1);
  });
});

describe('Element bonus (GDD §13.5)', () => {
  test('ทีม 4 ธาตุขึ้นไป → โบนัส 10%', () => {
    expect(hasElementBonus(['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED'])).toBe(true);
    expect(hasElementBonus(['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN'])).toBe(false);
  });

  test('applyElementBonus คูณ 1.1 และปัดเศษทิ้ง (integer)', () => {
    expect(applyElementBonus(1000, ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'DAWNSWORN'])).toBe(1100);
    expect(applyElementBonus(3333, ['EMBERBOUND'])).toBe(3333);
    expect(applyElementBonus(3333, ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'DAWNSWORN'])).toBe(3666);
  });
});

describe('Event definitions ตรงตาม GDD §13', () => {
  test('Personal milestones 7 ระดับ ตามตาราง', () => {
    expect(PERSONAL_MILESTONES).toHaveLength(7);
    expect(PERSONAL_MILESTONES.map((m) => m.threshold)).toEqual([
      2_000, 5_000, 10_000, 20_000, 35_000, 50_000, 75_000,
    ]);
  });

  test('Community milestones 5 ระดับ ตามตาราง', () => {
    expect(COMMUNITY_MILESTONES).toHaveLength(5);
    expect(COMMUNITY_MILESTONES.map((m) => m.threshold)).toEqual([
      1_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
    ]);
  });

  test('ค่าเข้า Raid = 10 Veil Shards', () => {
    expect(RAID_ENTRY_COST).toBe(10);
  });

  test('Shop items มีราคาเป็น integer บวก และมี code ไม่ซ้ำ', () => {
    const codes = SHOP_ITEMS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const s of SHOP_ITEMS) {
      expect(Number.isInteger(s.price)).toBe(true);
      expect(s.price).toBeGreaterThan(0);
    }
  });

  test('Story chapters 4 บท และเรียงตาม unlockAtDamage ขึ้นไป', () => {
    expect(STORY_CHAPTERS).toHaveLength(4);
    const dmg = STORY_CHAPTERS.map((c) => c.unlockAtDamage);
    expect([...dmg].sort((a, b) => a - b)).toEqual(dmg);
  });
});

