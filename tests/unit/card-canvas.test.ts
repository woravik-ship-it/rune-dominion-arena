import { AURA_CARD, AURA_VARIANTS, auraLayers, isCanvasVariant } from '@/lib/card-aura';
import {
  flameParticles,
  flowParticles,
  neonEnabled,
  neonLayers,
  neonSpec,
  normalizeTime,
  orbitSpec,
  ringDash,
  ringGeometry,
  ringPointAt,
  sheenBand,
  spiralGeometry,
  spiralStrands,
  spiralStreak,
  type SpiralStrand,
} from '@/lib/card-canvas';

// Phase 14.13 (2026-09-24): เอฟเฟกต์การ์ดด้วย Canvas 2D
// (ผู้ใช้สั่ง: ctx.globalCompositeOperation='lighter' + shadowBlur/shadowColor สร้างออร่ารอบการ์ด)
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;

describe('neonSpec — สเปกแสง Canvas ตามระดับความหายาก', () => {
  test('COMMON = ไม่มีเอฟเฟกต์ · UNCOMMON = มี (วิ่งรอบขอบเท่านั้น)', () => {
    for (const rarity of ['COMMON', undefined, null, 'x']) {
      expect(neonEnabled(rarity)).toBe(false);
      expect(neonSpec(rarity).enabled).toBe(false);
      expect(neonSpec(rarity).blur).toBe(0);
      expect(neonSpec(rarity).alpha).toBe(0);
      expect(neonLayers(rarity).frame).toBe(false);
    }
    // UNCOMMON: ต้องมีออร่าขอบ + แสงไหล แต่ยังไม่มีเกลียว/เลื่อมบนภาพ
    expect(neonEnabled('UNCOMMON')).toBe(true);
    const un = neonLayers('UNCOMMON');
    expect(un).toEqual({ frame: true, flow: true, particles: false, spiral: false, sheen: false });
    expect(orbitSpec('UNCOMMON').enabled).toBe(false);
  });

  test('บันไดเอฟเฟกต์ตามระดับ: UNCOMMON < RARE < EPIC (ชั้น + จำนวนเส้น)', () => {
    // RARE = เริ่มมีอนุภาค/เลื่อมบนภาพ/เกลียว · EPIC ขึ้นไป = จัดเต็มทุกชั้น
    expect(neonLayers('RARE')).toEqual({ frame: true, flow: true, particles: true, spiral: true, sheen: true });
    expect(neonLayers('EPIC')).toEqual(neonLayers('MYTHIC'));
    // จำนวนเส้นเพิ่มขึ้นตามระดับ
    expect(orbitSpec('RARE').wisps).toBe(2);
    expect(orbitSpec('EPIC').wisps).toBe(4);
    expect(orbitSpec('LEGENDARY').wisps).toBe(5);
    expect(orbitSpec('MYTHIC').wisps).toBe(6);
    // ความเข้มเพิ่มขึ้นตามระดับ (แสงยิ่งจัด)
    const chain = ['UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'].map((r) => neonSpec(r).blur);
    for (let i = 1; i < chain.length; i += 1) expect(chain[i]).toBeGreaterThan(chain[i - 1]);
  });

  test('RARE ขึ้นไปมีสี/ความเบลอ/ความหนา/จำนวนอนุภาค ครบ', () => {
    for (const rarity of ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']) {
      const spec = neonSpec(rarity);
      expect(spec.enabled).toBe(true);
      expect(spec.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(spec.core).toMatch(/^#[0-9a-f]{6}$/i);
      expect(spec.blur).toBeGreaterThanOrEqual(12);
      expect(spec.lineWidth).toBeGreaterThan(0);
      expect(spec.flowCount).toBeGreaterThan(0);
      expect(spec.flameCount).toBeGreaterThan(0);
      expect(spec.flowSpeed).toBeGreaterThan(0);
      expect(spec.alpha).toBeGreaterThan(0);
      expect(spec.alpha).toBeLessThanOrEqual(1);
    }
  });

  test('ระดับยิ่งสูง ยิ่งเบลอ/หนา/อนุภาคเยอะ (เทียบเคียง "ตีบวก")', () => {
    const rare = neonSpec('RARE');
    const mythic = neonSpec('MYTHIC');
    expect(mythic.blur).toBeGreaterThan(rare.blur);
    expect(mythic.lineWidth).toBeGreaterThan(rare.lineWidth);
    expect(mythic.flowCount).toBeGreaterThan(rare.flowCount);
    expect(mythic.alpha).toBeGreaterThanOrEqual(rare.alpha);
  });

  test('ระดับไม่รู้จัก → ไม่มีเอฟเฟกต์', () => {
    for (const value of ['', 'x', undefined, null]) {
      expect(neonEnabled(value)).toBe(false);
    }
  });
});

describe('ringGeometry / ringPointAt — พิกัด 2D บนเส้นรอบการ์ด', () => {
  test('ความยาวเส้นรอบ = เส้นตรง + วงกลม 4 มุม', () => {
    const geo = ringGeometry();
    const straight = 2 * (geo.w - 2 * geo.r) + 2 * (geo.h - 2 * geo.r);
    expect(geo.length).toBeCloseTo(straight + 2 * Math.PI * geo.r, 6);
    expect(geo.length).toBeGreaterThan(1900);
  });

  test('ระยะ 0 = มุมบนซ้ายเริ่มเส้น · เดินครบรอบแล้วกลับจุดเดิม', () => {
    const geo = ringGeometry();
    const start = ringPointAt(geo, 0);
    expect(start.x).toBeCloseTo(geo.x + geo.r, 6);
    expect(start.y).toBeCloseTo(geo.y, 6);
    const full = ringPointAt(geo, geo.length);
    expect(full.x).toBeCloseTo(start.x, 6);
    expect(full.y).toBeCloseTo(start.y, 6);
  });

  test('จุดทุกจุดอยู่บนเส้นขอบการ์ด (ไม่หลุดเข้าไปกลางการ์ด)', () => {
    const geo = ringGeometry();
    for (let i = 0; i <= 40; i += 1) {
      const pt = ringPointAt(geo, (geo.length * i) / 40);
      // อยู่ในกรอบการ์ดเสมอ
      expect(pt.x).toBeGreaterThanOrEqual(geo.x - 0.001);
      expect(pt.x).toBeLessThanOrEqual(geo.x + geo.w + 0.001);
      expect(pt.y).toBeGreaterThanOrEqual(geo.y - 0.001);
      expect(pt.y).toBeLessThanOrEqual(geo.y + geo.h + 0.001);
      // อยู่ใน "แถบขอบ" (ด้านตรง หรือ โค้งมุม) — ไม่หลุดเข้าไปกลางการ์ด
      const inBand = pt.x <= geo.x + geo.r + 0.001
        || pt.x >= geo.x + geo.w - geo.r - 0.001
        || pt.y <= geo.y + geo.r + 0.001
        || pt.y >= geo.y + geo.h - geo.r - 0.001;
      expect(inBand).toBe(true);
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });

  test('ระยะติดลบ/เกินรอบ ยังคืนจุดที่ถูกต้อง (ไม่ NaN)', () => {
    const geo = ringGeometry();
    const a = ringPointAt(geo, -10);
    const b = ringPointAt(geo, geo.length * 3 + 10);
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
    expect(a.x).toBeCloseTo(ringPointAt(geo, geo.length - 10).x, 6);
  });
});

describe('อนุภาค Canvas (flow / flame) — deterministic ต่อการ์ดใบนั้น', () => {
  test('seed เดิม → ค่าเดิมเสมอ', () => {
    const geo = ringGeometry();
    expect(flowParticles('card-a', 8, geo.length, 100)).toEqual(flowParticles('card-a', 8, geo.length, 100));
    expect(flameParticles('card-a', 8)).toEqual(flameParticles('card-a', 8));
  });

  test('การ์ดต่างใบ → ตำแหน่งต่างกัน', () => {
    const geo = ringGeometry();
    expect(flowParticles('card-a', 8, geo.length, 100)).not.toEqual(flowParticles('card-b', 8, geo.length, 100));
    expect(flameParticles('card-a', 8)).not.toEqual(flameParticles('card-b', 8));
  });

  test('จำนวนอนุภาคตรงตามสั่ง · ขอ 0 ได้ []', () => {
    const geo = ringGeometry();
    expect(flowParticles('c', 9, geo.length, 100)).toHaveLength(9);
    expect(flowParticles('c', 0, geo.length, 100)).toEqual([]);
    expect(flameParticles('c', 7)).toHaveLength(7);
    expect(flameParticles('c', -1)).toEqual([]);
  });

  test('อนุภาคไหลกระจายทั่วเส้นรอบ (ไม่กองที่เดียว)', () => {
    const geo = ringGeometry();
    const parts = flowParticles('card-flow', 10, geo.length, 100);
    const buckets = new Set(parts.map((p) => Math.floor((p.offset / geo.length) * 10)));
    expect(buckets.size).toBeGreaterThanOrEqual(8);
  });

  test('เปลวไฟอยู่ในวงแหวนขอบการ์ด (สูงไม่เกิน 28 · x อยู่ในกรอบ)', () => {
    const { frame } = AURA_CARD;
    for (const f of flameParticles('card-f', 12)) {
      expect(f.x).toBeGreaterThan(frame.x);
      expect(f.x).toBeLessThan(frame.x + frame.w);
      expect(f.height).toBeGreaterThan(0);
      expect(f.height).toBeLessThanOrEqual(28);
      expect(f.lifeSec).toBeGreaterThan(0);
      expect(f.phase).toBeGreaterThanOrEqual(0);
      expect(f.phase).toBeLessThan(1);
    }
  });

  test('ringDash: หลายช่วงแสงวนรอบเส้นพอดี (ไหลแบบน้ำ ไม่ใช่โชน์เดี่ยว)', () => {
    const geo = ringGeometry();
    for (const rarity of RARITIES) {
      const spec = neonSpec(rarity);
      const dash = ringDash(spec, geo);
      const period = dash.dash[0] + dash.dash[1];
      // ช่วง [ติด+ดับ] ต้องหารเส้นรอบลงตัว → วนซ้ำไร้รอยต่อ (ทนทานต่อ floating point)
      expect(dash.segments).toBeGreaterThanOrEqual(2);
      const periods = geo.length / period;
      expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.001);
      expect(dash.dash[0]).toBeGreaterThan(0);
      expect(dash.dash[1]).toBeGreaterThan(0);
    }
    // ระดับสูง = ช่วงแสงถี่กว่า (MYTHIC 4 ช่วง > RARE 3 ช่วง)
    expect(ringDash(neonSpec('MYTHIC'), geo).segments)
      .toBeGreaterThan(ringDash(neonSpec('RARE'), geo).segments);
  });

  test('normalizeTime กัน NaN/ค่าติดลบ', () => {
    expect(normalizeTime(Number.NaN, 5)).toBe(0);
    expect(normalizeTime(7, 5)).toBeCloseTo(2, 6);
    expect(normalizeTime(-1, 5)).toBeCloseTo(4, 6);
  });
});

describe('การต่อเข้ากับระบบดีไซน์ (variant)', () => {
  test('neon อยู่ในรายการดีไซน์ และถูกระบุว่าเป็นดีไซน์ Canvas', () => {
    expect(AURA_VARIANTS).toContain('neon');
    expect(isCanvasVariant('neon')).toBe(true);
    expect(isCanvasVariant('inner')).toBe(false);
    expect(isCanvasVariant('flow')).toBe(false);
  });

  test('ดีไซน์ neon ไม่มีชั้น SVG (คอมโพเนนต์ SVG ต้องไม่วาดอะไร)', () => {
    const layers = auraLayers('neon', 'MYTHIC');
    expect(layers.halo).toBe(false);
    expect(layers.sparks).toBe(false);
    expect(layers.flow).toBe(false);
    expect(layers.pillar).toBe(false);
  });
});

// Phase 14.14 (2026-09-25): เอฟเฟกต์ตาม GIF อ้างอิง (dreamassets 419–424)
//   "เกลียวแสงปีนขึ้น + วงแหวนฐาน + แสงกวาดบนภาพ" — เรขาคณิตล้วน (pure) จึงทดสอบได้
//   รอบ 2 (ผู้ใช้ติ "เป็นแค่หมุนเป็นวงกลม/วงกลมยืดหด"): แถบแสงเปลี่ยนจากวงรีแบนกลางช่องภาพ
//   → **เกลียวปีนขึ้น** (`spiralGeometry`/`spiralStreak`) ครอบทั้งความสูงของช่องภาพ
describe('orbitSpec / spiralGeometry — สเปกเกลียวแสงตามระดับความหายาก', () => {
  test('การ์ดธรรมดา (COMMON/UNCOMMON/ไม่รู้จัก) ไม่มีเอฟเฟกต์วนรอบ', () => {
    // เส้นสมมติ (ใช้ยืนยันว่าสเปกปิดอยู่ ⇒ ไม่วาดอะไรเลย)
    const dummy: SpiralStrand = {
      phaseDeg: 0, tailClimb: 1, width: 8, alpha: 1, riseSec: 4,
      centerX: 0.5, spread: 1, spin: 1, aOff: 0, w0: 0, w1: 1,
    };
    for (const rarity of ['COMMON', 'UNCOMMON', undefined, null, 'x']) {
      const spec = orbitSpec(rarity);
      expect(spec.enabled).toBe(false);
      expect(spiralStreak(0, spec, 'c', dummy)).toEqual([]);
      expect(spiralStrands(spec, 'c')).toEqual([]);
      expect(sheenBand(0, spec).alpha).toBe(0);
    }
  });

  test('RARE ขึ้นไปมีข้อมูลเกลียว/แสงกวาดครบ', () => {
    for (const rarity of ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']) {
      const spec = orbitSpec(rarity);
      expect(spec.enabled).toBe(true);
      expect(spec.tailClimb).toBeGreaterThan(0.9); // แถบยาวคลุมทั้งช่วงการปีน (ไม่ใช่เส้นสั้นพาด)
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.riseSec).toBeGreaterThan(0);
      expect(spec.turns).toBeGreaterThan(1);
      expect(spec.sheenSec).toBeGreaterThan(0);
      expect(spec.alpha).toBeGreaterThan(0);
      expect(spec.alpha).toBeLessThanOrEqual(1);
    }
    // ผู้ใช้สั่ง "เพิ่มเส้นอีก แต่แสดงแบบ Random" → RARE 3 · EPIC 4 · LEGENDARY 5 · MYTHIC 6
    expect(orbitSpec('RARE').wisps).toBe(2);
    expect(orbitSpec('EPIC').wisps).toBe(4);
    expect(orbitSpec('LEGENDARY').wisps).toBe(5);
    expect(orbitSpec('MYTHIC').wisps).toBe(6);
  });

  test('ระดับสูง: แถบยาวกว่า ปีนขึ้นเร็วกว่า และกว้างกว่า', () => {
    expect(orbitSpec('MYTHIC').tailClimb).toBeGreaterThan(orbitSpec('RARE').tailClimb);
    expect(orbitSpec('MYTHIC').riseSec).toBeLessThan(orbitSpec('RARE').riseSec);
    expect(orbitSpec('MYTHIC').rxRatio).toBeGreaterThan(orbitSpec('RARE').rxRatio);
    // ช้าเพียงพอที่จะอ่านเป็น "ค่อย ๆ ขยับขึ้น" (เดิมวนรอบ 2.4–3.3 วิ)
    expect(orbitSpec('MYTHIC').riseSec).toBeGreaterThan(4);
  });

  test('เรขาคณิตเกลียว: วนทั้งการ์ด (แกนกลาง · กว้างเกือบทั้งใบ · ปีนจากขอบล่างขึ้นขอบบน)', () => {
    const { frame, width: cardW } = AURA_CARD;
    for (const rarity of ['RARE', 'MYTHIC']) {
      const spec = orbitSpec(rarity);
      const g = spiralGeometry(spec, spiralStrands(spec, 'card-1')[0]);
      expect(g.cx).toBeCloseTo(cardW / 2, 6); // เส้นหลักอยู่แกนกลางการ์ด
      // กว้างกว่าครึ่งการ์ด แต่ยังไม่ทะลุกรอบการ์ด (แสงไม่ล้นออกนอกใบ)
      expect(g.rx).toBeGreaterThan(cardW * 0.3);
      expect(g.cx - g.rx).toBeGreaterThan(frame.x);
      expect(g.cx + g.rx).toBeLessThan(frame.x + frame.w);
      // ปีนจากใกล้ขอบล่าง → ใกล้ขอบบนของ "การ์ด" (ไม่ใช่แค่ช่องภาพ)
      expect(g.yBottom).toBeGreaterThan(frame.y + frame.h * 0.9);
      expect(g.yTop).toBeLessThan(frame.y + frame.h * 0.1);
      expect(g.yBottom).toBeGreaterThan(g.yTop);
      expect(g.turns).toBeGreaterThan(1);
    }
  });

  test('แต่ละเส้นมีแกน/รัศมี/ทิศหมุนของตัวเอง (คนละเส้น · หมุนวนอีกฝั่งได้)', () => {
    const spec = orbitSpec('MYTHIC');
    const strands = spiralStrands(spec, 'card-1');
    expect(strands.length).toBeGreaterThanOrEqual(3);
    // แกนคนละตำแหน่ง (กลาง/ซ้าย/ขวา) — สุ่มแต่ต้องกระจายจริง
    const centers = strands.map((s) => s.centerX);
    expect(new Set(centers.map((c) => Math.round(c * 50))).size).toBeGreaterThanOrEqual(strands.length - 1);
    expect(Math.max(...centers) - Math.min(...centers)).toBeGreaterThan(0.15);
    // มีทั้งเส้นที่หมุนสวนทาง (วนอีกฝั่ง) และเส้นที่หมุนตาม
    expect(strands.some((s) => s.spin === -1)).toBe(true);
    expect(strands.some((s) => s.spin === 1)).toBe(true);
    // รัศมีต่างกัน → ได้เส้นคนละรูปจริง
    expect(new Set(strands.map((s) => Math.round(s.spread * 100))).size).toBeGreaterThanOrEqual(strands.length - 1);
    // เรขาคณิตของแต่ละเส้นไม่ทับกันเป๊ะ
    const geos = strands.map((s) => spiralGeometry(spec, s));
    expect(new Set(geos.map((g) => `${Math.round(g.cx)}:${Math.round(g.rx)}`)).size).toBeGreaterThanOrEqual(strands.length - 1);
  });

  test('ช่วงชีวิต (w0/w1): ไม่จำเป็นต้องวิ่งสุดการ์ด — หายไประหว่างทางได้', () => {
    const spec = orbitSpec('MYTHIC');
    const strands = spiralStrands(spec, 'card-life');
    for (const s of strands) {
      expect(s.w0).toBeGreaterThanOrEqual(0);
      expect(s.w1).toBeLessThanOrEqual(1.06);
      expect(s.w1).toBeGreaterThan(s.w0);
    }
    // เส้นเอกวิ่งเกือบสุดการ์ด · เส้นอื่นส่วนใหญ่สั้นกว่า (หายกลางทาง)
    expect(strands[0].w1 - strands[0].w0).toBeGreaterThan(0.9);
    const others = strands.slice(1);
    expect(others.some((s) => s.w1 - s.w0 < 0.8)).toBe(true);
    expect(others.some((s) => s.w0 > 0.08 || s.w1 < 0.95)).toBe(true);
    // จำนวนรอบที่เส้นสั้นทำได้ต้องน้อยกว่า 1 รอบ (ไม่ดูเป็นลูปกลม)
    const short = others.find((s) => s.w1 - s.w0 < 0.8);
    expect(short).toBeDefined();
    expect((short as SpiralStrand).w1 - (short as SpiralStrand).w0).toBeLessThan(spec.turns);
  });

  test('สุ่มแต่ deterministic: การ์ดคนละใบได้เส้นคนละชุด · ใบเดิมได้เดิมเสมอ', () => {
    const spec = orbitSpec('MYTHIC');
    const a = spiralStrands(spec, 'card-aaa');
    const b = spiralStrands(spec, 'card-bbb');
    expect(spiralStrands(spec, 'card-aaa')).toEqual(a);
    expect(b).not.toEqual(a);
    // ค่าที่สุ่มต้องอยู่ในช่วงที่กำหนด (กันหลุดขอบ/เพี้ยน) — ยกเว้นเส้นเอก (i=0) ที่ตั้งใจให้ยาว/สว่างสุด
    for (const s of [...a.slice(1), ...b.slice(1)]) {
      expect(s.centerX).toBeGreaterThanOrEqual(0.25);
      expect(s.centerX).toBeLessThanOrEqual(0.75);
      expect(s.spread).toBeGreaterThanOrEqual(0.5);
      expect(s.spread).toBeLessThanOrEqual(0.98);
      expect(s.tailClimb).toBeGreaterThanOrEqual(0.3);
      expect(s.tailClimb).toBeLessThanOrEqual(0.7);
      expect(s.alpha).toBeGreaterThan(0.3);
      expect(s.alpha).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('spiralStrands — หลายเส้น ยาว/สั้น/สว่าง ไม่เท่ากัน (คำสั่งผู้ใช้ 2026-09-25)', () => {
  test('COMMON/UNCOMMON ไม่มีเส้นเกลียว (UNCOMMON = แค่แสงวิ่งรอบ)', () => {
    for (const rarity of ['COMMON', 'UNCOMMON', undefined, 'x']) {
      expect(spiralStrands(orbitSpec(rarity), 'c')).toEqual([]);
    }
  });

  test('มีมากกว่า 1 เส้น และมีทั้งเส้นสั้น/เส้นยาว (ไม่ใช่เส้นเดียว)', () => {
    for (const rarity of ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']) {
      const strands = spiralStrands(orbitSpec(rarity), 'card-1');
      expect(strands.length).toBeGreaterThanOrEqual(2);
      const tails = strands.map((s) => s.tailClimb);
      expect(Math.max(...tails)).toBeGreaterThan(Math.min(...tails) * 1.8); // สั้น/ยาวชัดเจน
      // เส้นแรกยาว/หนา/สว่างสุด → เส้นท้าย ๆ สั้น/บาง/หรี่
      expect(strands[0].width).toBeGreaterThan(strands[strands.length - 1].width);
      expect(strands[0].alpha).toBeGreaterThan(strands[strands.length - 1].alpha);
      // คนละเฟส (ไม่ทับกัน) และคนละจังหวะการปีน (เหมือน GIF ที่เส้นแสงเคลื่อนไม่พร้อมกัน)
      expect(new Set(strands.map((s) => s.phaseDeg)).size).toBe(strands.length);
      expect(new Set(strands.map((s) => s.riseSec)).size).toBe(strands.length);
    }
  });

  test('deterministic ต่อ seed (การ์ดใบเดิมได้เส้นเดิมเสมอ)', () => {
    const spec = orbitSpec('MYTHIC');
    const a = spiralStrands(spec, 'card-1');
    expect(spiralStrands(spec, 'card-1')).toEqual(a);
    expect(spiralStrands(spec, 'card-2')).not.toEqual(a);
    expect(a.every((s) => Number.isFinite(s.phaseDeg) && s.tailClimb > 0 && s.riseSec > 0)).toBe(true);
  });
});

describe('spiralStreak — เกลียวแสงปีนขึ้น (หัวใจของตัวอย่างที่ผู้ใช้ขอ)', () => {
  const spec = orbitSpec('MYTHIC');
  /** เส้นหลัก (ยาวสุด) ของการ์ด seed นั้น — ใช้แทน phase แบบเดิม */
  const main = (seed: string): SpiralStrand => spiralStrands(spec, seed)[0];

  test('ขอ 0 ช่วง → []', () => {
    expect(spiralStreak(1, spec, 'c', main('c'), 0)).toEqual([]);
  });

  test('seed เดิม + เวลาเดิม → ค่าเดิมเสมอ (deterministic)', () => {
    expect(spiralStreak(1.5, spec, 'card-a', main('card-a')))
      .toEqual(spiralStreak(1.5, spec, 'card-a', main('card-a')));
  });

  test('เวลาเปลี่ยน หรือการ์ดต่างใบ → ตำแหน่งเปลี่ยน (ไม่นิ่ง)', () => {
    expect(spiralStreak(0, spec, 'card-a', main('card-a')))
      .not.toEqual(spiralStreak(1, spec, 'card-a', main('card-a')));
    expect(spiralStreak(0, spec, 'card-a', main('card-a')))
      .not.toEqual(spiralStreak(0, spec, 'card-b', main('card-b')));
  });

  test('หัวแถบ "ปีนขึ้น" จริง: ตลอด 1 คาบ ระดับหัวไล่ขึ้นทุกช่วง (วนกลับครั้งเดียว)', () => {
    const { frame } = AURA_CARD;
    const strand = main('card-rise');
    const cycleSec = strand.riseSec * (1 + strand.tailClimb); // 1 คาบ = ปีนขึ้น + ไถลพ้นขอบบน (ค่อย ๆ จาง)
    const headY: number[] = [];
    for (let k = 0; k < 40; k += 1) {
      const q = spiralStreak((k / 40) * cycleSec, spec, 'card-rise', strand, 24)[0];
      headY.push((q.y1 + q.y2 + q.y3 + q.y4) / 4);
    }
    // ปีนเต็มความสูงของช่องภาพ (ไม่ใช่หมุนวนอยู่จุดเดิม)
    expect(Math.max(...headY) - Math.min(...headY)).toBeGreaterThan(frame.h * 0.9);
    // ขึ้นตลอด (y ลดลง) ยกเว้นจังหวะวนกลับไปเริ่มที่ขอบล่างเพียงครั้งเดียว
    let rises = 0;
    for (let k = 1; k < headY.length; k += 1) if (headY[k] > headY[k - 1]) rises += 1;
    expect(rises).toBe(1);
  });

  test('ค่อย ๆ ขึ้น/ค่อย ๆ จาง: ความสว่างไม่กระโดด (ไม่หายวับที่ขอบบน/ล่าง)', () => {
    const strand = main('card-smooth');
    const step = 0.05; // 50 ms = ~3 เฟรม
    let prev = -1;
    let maxJump = 0;
    for (let t = 0; t <= strand.riseSec * 2; t += step) {
      const quads = spiralStreak(t, spec, 'card-smooth', strand, 40);
      const peak = quads.reduce((m, q) => Math.max(m, q.alpha), 0);
      if (prev >= 0) maxJump = Math.max(maxJump, Math.abs(peak - prev));
      prev = peak;
    }
    // ใน 50 ms แสงต้องไม่โผล่/หายเกิน 20% ของความสว่างสูงสุด (ฟ้าผ่า = หายวับ)
    expect(maxJump).toBeLessThan(0.2);
  });

  test('ครอบทั้งความสูงของการ์ด: เห็นแสงทั้งครึ่งบนและครึ่งล่าง (ไม่ใช่แค่กลางการ์ด)', () => {
    const { frame } = AURA_CARD;
    const strand = main('card-span');
    const cycleSec = strand.riseSec * (1 + strand.tailClimb);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < 24; k += 1) {
      const t = (k / 24) * cycleSec;
      for (const q of spiralStreak(t, spec, 'card-span', strand, 40)) {
        if (q.alpha <= 0.05) continue; // จุดที่จางหาย (ยังไม่เกิด/เลยขอบบน) ไม่นับ
        for (const y of [q.y1, q.y2, q.y3, q.y4]) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    expect(minY).toBeLessThan(frame.y + frame.h * 0.25);
    expect(maxY).toBeGreaterThan(frame.y + frame.h * 0.75);
  });

  test('มีแสงให้เห็นเกือบตลอดคาบ (ช่วงจาง = ตอนแถบไถลออกขอบบนเท่านั้น)', () => {
    let lit = 0;
    const samples = 200;
    const strand = main('card-always');
    const cycleSec = strand.riseSec * (1 + strand.tailClimb);
    for (let k = 0; k < samples; k += 1) {
      const quads = spiralStreak((k / samples) * cycleSec, spec, 'card-always', strand, 30);
      if (quads.some((q) => q.alpha > 0.02)) lit += 1;
    }
    // ช่วงท้ายของ "การไถลออก" แถบจะหรี่ต่ำกว่าเกณฑ์ที่ตาเห็น (นั่นคือ "ค่อย ๆ จางหาย")
    // ⇒ ต้องเห็นแสง ≥ 75% ของคาบ และที่เหลือคือการจางหายอย่างนุ่มนวล (ไม่ใช่หายวับ)
    expect(lit / samples).toBeGreaterThan(0.75);
  });

  test('จุดที่มองเห็นได้ อยู่ในการ์ด (clip ทั้งใบได้ → ไม่ล้นออกนอกกรอบการ์ด)', () => {
    const { frame } = AURA_CARD;
    const slack = 16; // ค่าเผื่อความหนา/เงาฟุ้งของแถบ
    for (let t = 0; t < 4; t += 0.5) {
      for (const q of spiralStreak(t, spec, 'card-x', main('card-x'))) {
        if (q.alpha <= 0.02) continue;
        for (const [x, y] of [[q.x1, q.y1], [q.x2, q.y2], [q.x3, q.y3], [q.x4, q.y4]]) {
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(frame.x - slack);
          expect(x).toBeLessThanOrEqual(frame.x + frame.w + slack);
          expect(y).toBeGreaterThanOrEqual(frame.y - slack);
          expect(y).toBeLessThanOrEqual(frame.y + frame.h + slack);
        }
      }
    }
  });

  test('แสงกวาดถึงข้างซ้าย/ขวาของการ์ด (ไม่จุกอยู่กลางการ์ด)', () => {
    const { frame, width: cardW } = AURA_CARD;
    const strand = main('card-wide');
    const cycleSec = strand.riseSec * (1 + strand.tailClimb);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < 24; k += 1) {
      for (const q of spiralStreak((k / 24) * cycleSec, spec, 'card-wide', strand, 40)) {
        if (q.alpha <= 0.05) continue;
        for (const x of [q.x1, q.x2, q.x3, q.x4]) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    expect(minX).toBeLessThan(frame.x + cardW * 0.25);
    expect(maxX).toBeGreaterThan(frame.x + cardW * 0.75);
  });

  test('หัวแถบ "เฟดขึ้น–เฟดลง" (ไม่วาบ): มืดสนิทที่ปลายชีวิต · สว่างสุดกลางชีวิต', () => {
    const strand = main('card-fade');
    const cycleSec = strand.riseSec * (1 + strand.tailClimb);
    const alphas: number[] = [];
    for (let k = 0; k <= 60; k += 1) {
      const q = spiralStreak((k / 60) * cycleSec, spec, 'card-fade', strand, 24)[0];
      alphas.push(q.alpha);
    }
    expect(Math.min(...alphas)).toBeLessThan(0.05); // เฟดลงจนเกือบมืด (ไม่วับหาย)
    expect(Math.max(...alphas)).toBeGreaterThan(0.4); // สว่างสุดกลางช่วงชีวิต
  });

  test('ทิศ/มุมเริ่ม: มีทั้งเส้นที่วนจากฝั่งซ้ายและฝั่งขวา (ไม่วนทางเดียวกันหมด)', () => {
    const strands = spiralStrands(spec, 'card-dir');
    expect(strands.some((s) => s.spin === -1)).toBe(true);
    expect(strands.some((s) => s.spin === 1)).toBe(true);
    expect(new Set(strands.map((s) => Math.round(s.aOff * 10))).size).toBeGreaterThanOrEqual(2);
    // ตำแหน่งหัวตอนเริ่ม ต้องมีทั้งซีกซ้ายและซีกขวาของการ์ด
    const starts = strands
      .map((s) => spiralStreak(0, spec, 'card-dir', s, 24)[0])
      .map((q) => (q.x1 + q.x2 + q.x3 + q.x4) / 4);
    expect(starts.some((x) => x < 210)).toBe(true);
    expect(starts.some((x) => x > 210)).toBe(true);
  });

  test('ผายหัว เรียมหาง: ช่วงหัวหนา/สว่างสุด · ปลายหางบาง/จางสุด', () => {
    const strand = main('card-f');
    const cycleSec = strand.riseSec * (1 + strand.tailClimb);
    // หาจังหวะที่แถบอยู่ในหน้าต่างเต็มที่ (สว่างสุดในคาบ) แล้วตรวจรูปทรงหัว/หาง
    let best = spiralStreak(0, spec, 'card-f', strand, 20);
    let bestPeak = -1;
    for (let t = 0; t < cycleSec; t += cycleSec / 80) {
      const quads = spiralStreak(t, spec, 'card-f', strand, 20);
      const peak = quads.reduce((m, q) => Math.max(m, q.alpha), 0);
      if (peak > bestPeak) {
        bestPeak = peak;
        best = quads;
      }
    }
    expect(best).toHaveLength(20);
    expect(best[0].width).toBeGreaterThan(best[19].width);
    expect(best[0].alpha).toBeGreaterThan(best[19].alpha);
    expect(best[19].width).toBeLessThan(best[0].width * 0.3);
    for (let i = 1; i < best.length; i += 1) {
      expect(best[i].from).toBeGreaterThan(best[i - 1].from);
    }
  });

  test('เส้นสั้นของแต่ละใบ หรี่กว่าเส้นยาว (มีสั้นมียาวจริง)', () => {
    const strands = spiralStrands(spec, 'card-len');
    const long = spiralStreak(1.4, spec, 'card-len', strands[0], 24);
    const short = spiralStreak(1.4, spec, 'card-len', strands[strands.length - 1], 24);
    const peak = (qs: typeof long) => qs.reduce((m, q) => Math.max(m, q.alpha), 0);
    expect(peak(short)).toBeLessThan(peak(long));
  });

  test('ช่วงติดกันแชร์ขอบเดียวกัน → ต่อเนื่องไม่มีร่อง/ไม่แหว่ง', () => {
    const quads = spiralStreak(1.1, spec, 'card-g', main('card-g'), 12);
    for (let i = 1; i < quads.length; i += 1) {
      expect(quads[i].x1).toBeCloseTo(quads[i - 1].x2, 9);
      expect(quads[i].y1).toBeCloseTo(quads[i - 1].y2, 9);
      expect(quads[i].x4).toBeCloseTo(quads[i - 1].x3, 9);
      expect(quads[i].y4).toBeCloseTo(quads[i - 1].y3, 9);
    }
  });

  test('เส้นที่ 2/3 อยู่คนละตำแหน่ง/คนละจังหวะ → ได้หลายเส้นพร้อมกันแบบ GIF', () => {
    const strands = spiralStrands(spec, 'card-h');
    const a = spiralStreak(0.7, spec, 'card-h', strands[0], 8);
    const b = spiralStreak(0.7, spec, 'card-h', strands[1], 8);
    expect(a).not.toEqual(b);
  });
});

describe('แสงกวาดบนภาพ (ตาม GIF อ้างอิง) — วงแหวนฐานถูกถอดออกแล้ว (คำสั่งผู้ใช้ 2026-09-25)', () => {
  test('sheenBand กวาดซ้าย→ขวา และจางหัว-ท้ายรอบ (วนซ้ำเนียน)', () => {
    const spec = orbitSpec('MYTHIC');
    expect(sheenBand(0, spec).alpha).toBeCloseTo(0, 6);
    expect(sheenBand(0, spec).x).toBeLessThan(0.4);
    const mid = sheenBand(spec.sheenSec / 2, spec);
    expect(mid.alpha).toBeGreaterThan(0.9);
    expect(mid.x).toBeGreaterThan(0.4);
    expect(sheenBand(spec.sheenSec, spec).alpha).toBeCloseTo(0, 6);
    expect(sheenBand(Number.NaN, spec).alpha).toBeCloseTo(0, 6);
  });
});
