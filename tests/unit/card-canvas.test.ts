import { AURA_CARD, AURA_VARIANTS, auraLayers, isCanvasVariant } from '@/lib/card-aura';
import {
  flameParticles,
  flowParticles,
  neonEnabled,
  neonSpec,
  normalizeTime,
  ringDash,
  ringGeometry,
  ringPointAt,
} from '@/lib/card-canvas';

// Phase 14.13 (2026-09-24): เอฟเฟกต์การ์ดด้วย Canvas 2D
// (ผู้ใช้สั่ง: ctx.globalCompositeOperation='lighter' + shadowBlur/shadowColor สร้างออร่ารอบการ์ด)
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;

describe('neonSpec — สเปกแสง Canvas ตามระดับความหายาก', () => {
  test('การ์ดธรรมดา (COMMON/UNCOMMON) ไม่มีเอฟเฟกต์', () => {
    for (const rarity of ['COMMON', 'UNCOMMON']) {
      expect(neonEnabled(rarity)).toBe(false);
      expect(neonSpec(rarity).enabled).toBe(false);
      expect(neonSpec(rarity).blur).toBe(0);
      expect(neonSpec(rarity).alpha).toBe(0);
    }
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

  test('ringDash: ช่วงแสง+ช่องว่าง = รอบเส้นพอดี (ไหลวนไม่มีรอยต่อ)', () => {
    const geo = ringGeometry();
    for (const rarity of RARITIES) {
      const spec = neonSpec(rarity);
      const dash = ringDash(spec, geo);
      expect(dash.dash[0] + dash.dash[1]).toBeCloseTo(geo.length, 6);
      if (spec.enabled) expect(dash.dash[0]).toBeLessThan(geo.length);
    }
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
