// เทสต์ตรรกะ "จัดทีมเป็นวงกลม 5 ช่อง" + คะแนนตามบทบาท + กราฟ 6 เหลี่ยม (Phase 15)
// คำสั่งผู้ใช้: โจมตี 2 · ป้องกัน 2 · สนับสนุน 1 — โจมตีคิดจาก ATK, ป้องกันคิดจาก DEF,
// สนับสนุนคิดจากพลังสกิล, เพิ่มแบบสมดุล, กราฟ 6 เหลี่ยม + คะแนนรวมตรงกลาง

import {
  AFFINITY_BONUS_RATE,
  DECK_SLOT_COUNT,
  DECK_SLOT_ROLES,
  EMPTY_AXES,
  HEX_AXES,
  ROLE_AFFINITY,
  ROLE_BONUS_RATE,
  axisPercent,
  easeOutCubic,
  formationGrade,
  formationReport,
  hasRoleAffinity,
  hexAxisAngle,
  lerp,
  lerpSeries,
  normalizedAxes,
  polarPoint,
  polygonPointsAttr,
  radarPolygon,
  ringArcMidpoint,
  ringLayout,
  ringSlotAngle,
  roleBonus,
  skillPower,
  slotRole,
  type FormationCard,
} from '@/lib/deck-formation';

const card = (over: Partial<FormationCard> = {}): FormationCard => ({
  cardId: 'c1',
  name: 'Tester',
  nameTh: 'เทสเตอร์',
  element: 'EMBERBOUND',
  rarity: 'RARE',
  role: 'WARRIOR',
  atk: 100,
  def: 80,
  hp: 200,
  spd: 30,
  manaCost: 5,
  skills: [{ name: 'คมดาบ', manaCost: 4 }],
  ...over,
});

describe('Deck Formation — บทบาทของช่อง', () => {
  it('5 ช่อง = โจมตี 2 · ป้องกัน 2 · สนับสนุน 1 ตามที่ผู้ใช้สั่ง', () => {
    expect(DECK_SLOT_COUNT).toBe(5);
    expect(DECK_SLOT_ROLES).toEqual(['ATTACK', 'ATTACK', 'DEFENSE', 'DEFENSE', 'SUPPORT']);
    expect([0, 1, 2, 3, 4].map(slotRole)).toEqual([
      'ATTACK',
      'ATTACK',
      'DEFENSE',
      'DEFENSE',
      'SUPPORT',
    ]);
  });

  it('ตำแหน่งเพี้ยนก็ไม่พัง (ปัดเศษ + วนกลับ)', () => {
    expect(slotRole(5)).toBe('ATTACK');
    expect(slotRole(-1)).toBe('SUPPORT');
    expect(slotRole(2.9)).toBe('DEFENSE');
    expect(slotRole(Number.NaN)).toBe('ATTACK');
  });

  it('โบนัสตรงบทบาทเฉพาะบทบาทที่กำหนด', () => {
    expect(hasRoleAffinity('ATTACK', 'ASSASSIN')).toBe(true);
    expect(hasRoleAffinity('ATTACK', 'TANK')).toBe(false);
    expect(hasRoleAffinity('SUPPORT', 'HEALER')).toBe(true);
    expect(hasRoleAffinity('DEFENSE', null)).toBe(false);
    expect(ROLE_AFFINITY.SUPPORT).toContain('SUPPORT');
  });
});

describe('Deck Formation — เรขาคณิตวงกลม', () => {
  it('มุมของช่องครบ 5 ช่อง ห่างกัน 72° และสนับสนุนอยู่บนสุด', () => {
    const angles = [0, 1, 2, 3, 4].map(ringSlotAngle);
    expect(new Set(angles).size).toBe(5);
    expect(ringSlotAngle(4)).toBe(0); // สนับสนุน = บนสุด
    const sorted = [...angles].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i] - sorted[i - 1]).toBeCloseTo(72, 6);
    }
  });

  it('polarPoint: 0° = บน, 90° = ขวา (พิกัดจอ y ชี้ลง)', () => {
    const top = polarPoint(0, 10);
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(-10, 6);
    const right = polarPoint(90, 10);
    expect(right.x).toBeCloseTo(10, 6);
    expect(right.y).toBeCloseTo(0, 6);
  });

  it('ผังวงกลมสมมาตรซ้าย–ขวา (ช่อง 0 ↔ 3 และ 1 ↔ 2)', () => {
    const layout = ringLayout(1);
    expect(layout).toHaveLength(5);
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
    expect(near(layout[0].point.x, -layout[3].point.x)).toBe(true);
    expect(near(layout[1].point.x, -layout[2].point.x)).toBe(true);
    expect(near(layout[0].point.y, layout[3].point.y)).toBe(true);
  });

  it('ringArcMidpoint ของช่องว่างคืน null', () => {
    expect(ringArcMidpoint([])).toBeNull();
    expect(ringArcMidpoint([4])?.y).toBeCloseTo(-1, 6);
  });
});

describe('Deck Formation — พลังสกิล (ฐานโบนัสช่องสนับสนุน)', () => {
  it('Σ(มานา × 3 + 6) ต่อสกิล', () => {
    expect(skillPower([{ manaCost: 2 }])).toBe(12);
    expect(skillPower([{ manaCost: 4 }])).toBe(18);
    expect(skillPower([{ manaCost: 2 }, { manaCost: 6 }])).toBe(36);
  });

  it('ไม่มีสกิล/ค่าผิดรูป → 0 หรือไม่ติดลบ', () => {
    expect(skillPower([])).toBe(0);
    expect(skillPower(null)).toBe(0);
    expect(skillPower([{ manaCost: null }])).toBe(6);
    expect(skillPower([{ manaCost: -3 }])).toBe(6);
  });
});

describe('Deck Formation — โบนัสตามบทบาทช่อง', () => {
  it('ช่องโจมตีคิดจาก ATK ของการ์ด', () => {
    const bonus = roleBonus('ATTACK', card({ atk: 120, def: 999 }));
    expect(bonus.sourceValue).toBe(120);
    expect(bonus.rate).toBe(ROLE_BONUS_RATE.ATTACK);
    expect(bonus.base).toBe(120);
  });

  it('ช่องป้องกันคิดจาก DEF ของการ์ด (ไม่ใช้ ATK)', () => {
    const bonus = roleBonus('DEFENSE', card({ atk: 999, def: 80 }));
    expect(bonus.sourceValue).toBe(80);
    expect(bonus.base).toBe(Math.round(80 * ROLE_BONUS_RATE.DEFENSE));
  });

  it('ช่องสนับสนุนคิดจากพลังสกิลของการ์ด', () => {
    const bonus = roleBonus('SUPPORT', card({ skills: [{ manaCost: 3 }, { manaCost: 5 }] }));
    expect(bonus.sourceValue).toBe(skillPower([{ manaCost: 3 }, { manaCost: 5 }]));
    expect(bonus.base).toBe(Math.round(bonus.sourceValue * ROLE_BONUS_RATE.SUPPORT));
  });

  it('ช่องว่างได้ 0 ทุกค่า', () => {
    const bonus = roleBonus('SUPPORT', null);
    expect(bonus).toMatchObject({ sourceValue: 0, base: 0, affinity: 0, total: 0 });
  });

  it('การ์ดตรงบทบาทได้โบนัสเพิ่ม 10%', () => {
    const matched = roleBonus('ATTACK', card({ role: 'WARRIOR', atk: 100 }));
    expect(matched.affinity).toBe(Math.round(matched.base * AFFINITY_BONUS_RATE));
    expect(matched.total).toBe(matched.base + matched.affinity);

    const mismatch = roleBonus('ATTACK', card({ role: 'HEALER', atk: 100 }));
    expect(mismatch.affinity).toBe(0);
    expect(mismatch.total).toBe(mismatch.base);
  });

  it('"เพิ่มแบบสมดุล": โบนัสเฉลี่ย 3 บทบาท (การ์ด 1–2 สกิล · มานา 2–6) ต่างกันไม่เกิน 25%', () => {
    // ค่ามาตรฐานจาก seed.ts: ATK เฉลี่ย 45 · DEF เฉลี่ย 35 · พลังสกิลเฉลี่ย 27 (1 skill หรือ 2 skills)
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

    const attack = mean([2, 3, 4, 5, 6].map((mana) => roleBonus('ATTACK', card({ atk: 45, skills: [{ manaCost: mana }] })).base));
    const defense = mean([2, 3, 4, 5, 6].map((mana) => roleBonus('DEFENSE', card({ def: 35, skills: [{ manaCost: mana }] })).base));
    const support = mean([
      ...([2, 3, 4, 5, 6].map((mana) => roleBonus('SUPPORT', card({ skills: [{ manaCost: mana }] })).base)),
      ...([2, 3, 4, 5, 6].map((mana) =>
        roleBonus('SUPPORT', card({ skills: [{ manaCost: mana }, { manaCost: mana }] })).base
      )),
    ]);

    const values = [attack, defense, support];
    const max = Math.max(...values);
    const min = Math.min(...values);
    expect(max).toBeGreaterThan(0);
    expect(max / min).toBeLessThanOrEqual(1.25);
  });
});


describe('Deck Formation — กราฟ 6 เหลี่ยม', () => {
  it('มี 6 แกน · มุมห่างกัน 60° เริ่มจากบนสุด', () => {
    expect(HEX_AXES).toHaveLength(6);
    const angles = HEX_AXES.map((_, i) => hexAxisAngle(i));
    expect(angles).toEqual([0, 60, 120, 180, 240, 300]);
    expect(hexAxisAngle(6)).toBe(0);
  });

  it('ค่าอ้างอิงเต็มวงต้องมากกว่าศูนย์ทุกแกน (กันกราฟหารศูนย์)', () => {
    for (const axis of HEX_AXES) expect(axis.ref).toBeGreaterThan(0);
  });

  it('axisPercent ตัดที่ 0–1 และค่าเพี้ยนได้ 0', () => {
    const atk = HEX_AXES[0];
    expect(axisPercent(atk, 0)).toBe(0);
    expect(axisPercent(atk, atk.ref / 2)).toBeCloseTo(0.5, 6);
    expect(axisPercent(atk, atk.ref * 5)).toBe(1);
    expect(axisPercent(atk, Number.NaN)).toBe(0);
  });

  it('normalizedAxes คืนค่าตามลำดับแกนที่ประกาศไว้', () => {
    const values = normalizedAxes({ ...EMPTY_AXES, atk: 300, skill: 125 });
    expect(values).toHaveLength(6);
    expect(values[0]).toBeCloseTo(0.5, 6); // ATK 300 / ref 600
    expect(values[5]).toBeCloseTo(0.5, 6); // SKL 125 / ref 250
    expect(values[1]).toBe(0);
  });

  it('radarPolygon: ค่าศูนย์ = จุดศูนย์กลาง, ค่าเต็ม = ปลายแกน', () => {
    const zeros = radarPolygon([0, 0, 0, 0, 0, 0], 50);
    for (const point of zeros) {
      expect(point.x).toBeCloseTo(0, 6);
      expect(point.y).toBeCloseTo(0, 6);
    }
    const full = radarPolygon([1, 1, 1, 1, 1, 1], 50);
    expect(full[0].y).toBeCloseTo(-50, 6); // แกนแรก = บนสุด
    expect(radarPolygon([0.5, 0, 0, 0, 0, 0], 50)[0].y).toBeCloseTo(-25, 6);
  });

  it('polygonPointsAttr ผลิตข้อความ SVG ที่ใช้งานได้ (ปัด 2 ตำแหน่ง)', () => {
    expect(polygonPointsAttr([{ x: 1.23456, y: -2.5 }])).toBe('1.23,-2.5');
    expect(polygonPointsAttr([])).toBe('');
  });
});

describe('Deck Formation — สรุปคะแนนทั้งทีม', () => {
  it('ทีมว่าง: คะแนน 0 · ไม่มีแกนไหนมีค่า · เกรดว่าง', () => {
    const report = formationReport([null, null, null, null, null]);
    expect(report.filled).toBe(0);
    expect(report.total).toBe(0);
    expect(report.baseScore).toBe(0);
    expect(report.grade.key).toBe('EMPTY');
    expect(report.axes).toEqual(EMPTY_AXES);
    expect(report.slots.map((s) => s.role)).toEqual(['ATTACK', 'ATTACK', 'DEFENSE', 'DEFENSE', 'SUPPORT']);
  });

  it('รองรับอาเรย์สั้น/มี undefined โดยไม่พัง', () => {
    const report = formationReport([card()]);
    expect(report.filled).toBe(1);
    expect(report.slots).toHaveLength(5);
    expect(report.slots[4].card).toBeNull();
  });

  it('คะแนนรวม = สเตตัสพื้นฐาน + โบนัสบทบาท + โบนัสตรงบทบาท', () => {
    // ช่อง 0 (โจมตี) = การ์ด ATK 100 DEF 80 HP 200 SPD 30 → base 410
    const report = formationReport([card({ role: 'WARRIOR' }), null, null, null, null]);
    const slot = report.slots[0];
    expect(slot.base).toBe(410);
    expect(slot.bonus.base).toBe(100); // ATK × 1.0
    expect(slot.bonus.affinity).toBe(10); // WARRIOR ตรงบทบาทโจมตี +10%
    expect(report.baseScore).toBe(410);
    expect(report.bonusScore).toBe(100);
    expect(report.affinityScore).toBe(10);
    expect(report.total).toBe(410 + 100 + 10);
  });

  it('ช่องสนับสนุนใช้พลังสกิล ไม่ใช่ ATK/DEF', () => {
    const report = formationReport([
      null,
      null,
      null,
      null,
      card({ skills: [{ manaCost: 5 }, { manaCost: 5 }], role: 'HEALER' }),
    ]);
    const slot = report.slots[4];
    expect(slot.role).toBe('SUPPORT');
    expect(slot.bonus.sourceValue).toBe(skillPower([{ manaCost: 5 }, { manaCost: 5 }]));
    expect(report.axes.skill).toBe(slot.bonus.sourceValue);
  });

  it('แกนทั้ง 6 รวมค่าจากการ์ดทุกใบ (รวม manaและพลังสกิล)', () => {
    const all = [0, 1, 2, 3, 4].map((i) =>
      card({ cardId: `c${i}`, role: 'HEALER', atk: 10, def: 20, hp: 30, spd: 40, manaCost: 5, skills: [{ manaCost: 4 }] })
    );
    const report = formationReport(all);
    expect(report.filled).toBe(5);
    expect(report.axes).toMatchObject({ atk: 50, def: 100, hp: 150, spd: 200, mana: 25, skill: skillPower([{ manaCost: 4 }]) * 5 });
    expect(report.baseScore).toBe((10 + 20 + 30 + 40) * 5);
  });

  it('เกรดไล่ตามคะแนนรวม (D→C→B→A→S) และทีมว่างได้ EMPTY', () => {
    expect(formationGrade(0, 0).key).toBe('EMPTY');
    expect(formationGrade(1000, 5).key).toBe('D');
    expect(formationGrade(1300, 5).key).toBe('C');
    expect(formationGrade(1700, 5).key).toBe('B');
    expect(formationGrade(2000, 5).key).toBe('A');
    expect(formationGrade(3000, 5).key).toBe('S');
    expect(formationGrade(5000, 0).key).toBe('EMPTY'); // ไม่มีการ์ด → ไม่มีเกรด
  });

  it('สเตตัสทศนิยมถูกปัดทิ้ง (Integer only)', () => {
    const report = formationReport([
      card({ atk: 10.9, def: 5.5, hp: 20.2, spd: 3.7, manaCost: 2.9, skills: [{ manaCost: 3.9 }] }),
    ]);
    expect(report.baseScore).toBe(10 + 5 + 20 + 3);
    expect(report.axes.mana).toBe(2);
    expect(Number.isInteger(report.total)).toBe(true);
  });
});

describe('Deck Formation — ตัวช่วยอนิเมชันเรียลไทม์', () => {
  it('lerp วิ่งจากค่าเดิมไปค่าใหม่และตัดที่ 0–1', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(0, 100, 5)).toBe(100);
    expect(lerp(0, 100, -1)).toBe(0);
  });

  it('lerpSeries ไล่ทีละค่า และคืนค่าเป้าหมายเมื่อความยาวไม่เท่ากัน', () => {
    expect(lerpSeries([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    expect(lerpSeries([0, 0, 0], [10, 20], 1)).toEqual([10, 20]);
  });

  it('easeOutCubic เริ่ม 0 จบ 1 และเร่งตอนต้น', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

