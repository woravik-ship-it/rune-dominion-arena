import {
  AURA_BLEED_PERCENT,
  AURA_CARD,
  AURA_SPECS,
  AURA_VARIANTS,
  DEFAULT_AURA_VARIANT,
  auraEnabled,
  auraClipPaths,
  auraGeometry,
  auraLayers,
  auraSparks,
  auraSpec,
  auraStyle,
  auraUid,
  auraVariation,
  roundedRectPath,
  tierLayers,
} from '@/lib/card-aura';

// Phase 14.10: ชั้น "แสงเรืองแบบไอเทมตีบวก" (item upgrade glow) — SVG glow ล้วน
// กติกาเดิมที่ต้องไม่หลุด: COMMON/UNCOMMON = การ์ดธรรมดา ไม่มีแสง
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;

describe('auraSpec — กติกาแสงเรืองตามระดับ', () => {
  test('การ์ดธรรมดา (COMMON/UNCOMMON) ไม่มีแสง', () => {
    for (const rarity of ['COMMON', 'UNCOMMON']) {
      const spec = auraSpec(rarity);
      expect(spec.tier).toBe('NONE');
      expect(spec.intensity).toBe(0);
      expect(auraEnabled(rarity)).toBe(false);
      expect(auraLayers('tier', rarity)).toEqual({
        halo: false,
        flare: false,
        pillar: false,
        sparks: false,
        clip: false,
      });
    }
  });

  test('RARE ขึ้นไปมีแสง และเข้มขึ้นตามระดับ (จังหวะเร็วขึ้นด้วย)', () => {
    const rare = auraSpec('RARE');
    const epic = auraSpec('EPIC');
    const legendary = auraSpec('LEGENDARY');
    const mythic = auraSpec('MYTHIC');

    for (const spec of [rare, epic, legendary, mythic]) {
      expect(spec.tier).not.toBe('NONE');
      expect(spec.intensity).toBeGreaterThan(0);
      expect(spec.intensity).toBeLessThanOrEqual(1);
      expect(spec.breatheSec).toBeGreaterThan(0);
      expect(spec.flareSec).toBeGreaterThan(0);
      expect(spec.pillarSec).toBeGreaterThan(0);
      expect(spec.sparkSec).toBeGreaterThan(0);
    }

    expect(rare.intensity).toBeLessThan(epic.intensity);
    expect(epic.intensity).toBeLessThan(legendary.intensity);
    expect(legendary.intensity).toBeLessThan(mythic.intensity);
    expect(rare.breatheSec).toBeGreaterThan(mythic.breatheSec);
    expect(rare.flareSec).toBeGreaterThan(mythic.flareSec);
  });

  test('ระดับที่ไม่รู้จัก/ไม่ส่งมา → ไม่มีแสง', () => {
    for (const value of ['', 'super-rare', undefined, null]) {
      expect(auraSpec(value).tier).toBe('NONE');
      expect(auraEnabled(value)).toBe(false);
    }
  });

  test('รับตัวพิมพ์เล็ก/ใหญ่ได้', () => {
    expect(auraSpec('mythic')).toEqual(auraSpec('MYTHIC'));
  });

  test('ทุกระดับในเกมมีค่าตั้งต้นครบ', () => {
    for (const rarity of RARITIES) {
      expect(AURA_SPECS[rarity]).toBeDefined();
      expect(AURA_SPECS[rarity].core).toMatch(/^#[0-9a-f]{6}$/i);
      expect(AURA_SPECS[rarity].edge).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('tierLayers / auraLayers — องค์ประกอบแสงที่วาดจริง', () => {
  test('บันไดตีบวก: ระดับสูงได้องค์ประกอบเพิ่มขึ้นเรื่อยๆ (+7 → +13)', () => {
    const plus7 = tierLayers('RARE');
    const plus9 = tierLayers('EPIC');
    const plus11 = tierLayers('LEGENDARY');
    const plus13 = tierLayers('MYTHIC');

    expect(plus7).toEqual({ halo: true, flare: false, pillar: false, sparks: false, clip: false });
    expect(plus9.flare).toBe(true);
    expect(plus11.pillar).toBe(true);
    expect(plus13.sparks).toBe(true);
    // ไม่มีระดับไหน "ถอยหลัง" (ชั้นที่เปิดแล้วต้องไม่ปิด)
    expect(plus7.halo && plus9.halo && plus11.halo && plus13.halo).toBe(true);
    expect(plus9.sparks).toBe(false);
    expect(plus11.sparks).toBe(false);
  });

  test('ดีไซน์ tier = บันไดระดับ', () => {
    for (const rarity of RARITIES) {
      expect(auraLayers('tier', rarity)).toEqual(tierLayers(rarity));
    }
  });

  test('ดีไซน์ inner ตัดแสงในกรอบ · ดีไซน์อื่นล้นออกนอกกรอบได้', () => {
    expect(auraLayers('inner', 'MYTHIC').clip).toBe(true);
    for (const variant of AURA_VARIANTS.filter((v) => v !== 'inner')) {
      expect(auraLayers(variant, 'MYTHIC').clip).toBe(false);
    }
  });

  test('ทุกดีไซน์มีขอบเรืองเป็นฐาน (halo) เมื่อระดับมีแสง', () => {
    for (const variant of AURA_VARIANTS) {
      expect(auraLayers(variant, 'LEGENDARY').halo).toBe(true);
    }
  });

  test('ดีไซน์ไม่รู้จัก → ไม่วาดอะไรเลย', () => {
    expect(auraLayers('unknown-design' as never, 'MYTHIC').halo).toBe(false);
  });
});

describe('auraVariation / auraSparks — ความต่างต่อใบ (deterministic)', () => {
  test('seed เดิม → ค่าเดิมเสมอ', () => {
    expect(auraVariation('card-abc')).toEqual(auraVariation('card-abc'));
    expect(auraSparks('card-abc', 8, 4)).toEqual(auraSparks('card-abc', 8, 4));
  });

  test('การ์ดต่างใบ → เฟสไม่เหมือนกัน', () => {
    expect(auraVariation('card-aaa')).not.toEqual(auraVariation('card-bbb'));
  });

  test('ค่าความต่างอยู่ในช่วงที่ออกแบบไว้', () => {
    for (const seed of ['', 'a', 'card-1', 'x'.repeat(64), '🎴-การ์ด']) {
      const v = auraVariation(seed);
      expect(v.delaySec).toBeGreaterThanOrEqual(0);
      expect(v.delaySec).toBeLessThan(12);
      expect(Math.abs(v.tiltDeg)).toBeLessThanOrEqual(14);
      expect(Math.abs(v.hueDeg)).toBeLessThanOrEqual(16);
    }
  });

  test('ประกาย: จำนวนตรงตามสั่ง และอยู่ในการ์ดเสมอ', () => {
    const sparks = auraSparks('card-1', 10, 4);
    expect(sparks).toHaveLength(10);
    for (const spark of sparks) {
      expect(spark.x).toBeGreaterThan(AURA_CARD.frame.x);
      expect(spark.x).toBeLessThan(AURA_CARD.frame.x + AURA_CARD.frame.w);
      expect(spark.y).toBeGreaterThanOrEqual(500);
      expect(spark.r).toBeGreaterThanOrEqual(1.6);
      expect(spark.r).toBeLessThanOrEqual(4.2);
      expect(spark.delaySec).toBeGreaterThanOrEqual(0);
      expect(spark.durSec).toBeGreaterThan(0);
    }
    expect(auraSparks('card-1', 0, 4)).toEqual([]);
  });
});

describe('auraStyle / auraGeometry / auraUid — ค่าที่คอมโพเนนต์นำไปใช้', () => {
  test('คืนตัวแปร CSS ครบชุด', () => {
    const style = auraStyle('MYTHIC', 'card-1');
    expect(style['--aura-intensity']).toBe(String(auraSpec('MYTHIC').intensity));
    expect(style['--aura-core']).toBe(auraSpec('MYTHIC').core);
    expect(style['--aura-edge']).toBe(auraSpec('MYTHIC').edge);
    expect(style['--aura-breathe']).toBe(`${auraSpec('MYTHIC').breatheSec}s`);
    expect(style['--aura-flare-dur']).toBe(`${auraSpec('MYTHIC').flareSec}s`);
    expect(style['--aura-pillar-dur']).toBe(`${auraSpec('MYTHIC').pillarSec}s`);
    expect(style['--aura-spark-dur']).toBe(`${auraSpec('MYTHIC').sparkSec}s`);
    expect(style['--aura-delay']).toMatch(/^-\d+(\.\d+)?s$/);
    expect(style['--aura-tilt']).toMatch(/^-?\d+deg$/);
    expect(style['--aura-hue']).toMatch(/^-?\d+deg$/);
  });

  test('"ลดเอฟเฟกต์รุนแรง" → ความเข้มลดลงครึ่ง', () => {
    const full = auraStyle('MYTHIC', 'card-1');
    const reduced = auraStyle('MYTHIC', 'card-1', { reduceIntense: true });
    expect(Number(reduced['--aura-intensity'])).toBeCloseTo(Number(full['--aura-intensity']) / 2, 5);
  });

  test('ระดับล่างได้ความเข้ม 0 (คอมโพเนนต์จะไม่ render)', () => {
    expect(auraStyle('COMMON', 'card-1')['--aura-intensity']).toBe('0');
    expect(auraStyle(undefined, 'card-1')['--aura-intensity']).toBe('0');
  });

  test('geometry: โหมด clip ตรงกับผืนการ์ด · โหมดล้นออกนอกมีระยะ 12% และสัดส่วนเท่าเดิม', () => {
    const inner = auraGeometry(true);
    expect(inner.inset).toBe('0');
    expect(inner.viewBox).toBe(`0 0 ${AURA_CARD.width} ${AURA_CARD.height}`);

    const outer = auraGeometry(false);
    expect(outer.inset).toBe(`-${AURA_BLEED_PERCENT}%`);
    const [, , w, h] = outer.viewBox.split(' ').map(Number);
    expect(w).toBeCloseTo(AURA_CARD.width * (1 + (AURA_BLEED_PERCENT * 2) / 100), 5);
    expect(h).toBeCloseTo(AURA_CARD.height * (1 + (AURA_BLEED_PERCENT * 2) / 100), 5);
    // สัดส่วน viewBox ต้องเท่ากับกล่อง host (ไม่งั้นแสงจะเลื่อนหลุดตำแหน่ง)
    expect(w / h).toBeCloseTo(AURA_CARD.width / AURA_CARD.height, 5);
  });

  test('uid ของ SVG ไม่ชนกัน และใช้เป็น id ได้ (ไม่มีอักขระต้องห้าม)', () => {
    const a = auraUid('card-1');
    const b = auraUid('card-2');
    expect(a).not.toBe(b);
    expect(a).toBe(auraUid('card-1'));
    expect(auraUid('🎴/การ์ด ใบ#1')).toMatch(/^aura-[a-zA-Z0-9_-]*-[a-z0-9]+$/);
  });
});

describe('roundedRectPath / auraClipPaths — รูสำหรับตัดแสง (กันแสงฟุ้งทับตัวภาพ)', () => {
  test('path สี่เหลี่ยมมุมโค้งปิดรูปเสมอ และมีส่วนโค้ง 4 มุม', () => {
    const path = roundedRectPath({ x: 0, y: 0, w: 100, h: 50 }, 10);
    expect(path.startsWith('M10 0')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.match(/A/g)).toHaveLength(4);
  });

  test('รัศมีถูกจำกัดไม่ให้เกินครึ่งของด้านสั้น', () => {
    expect(roundedRectPath({ x: 0, y: 0, w: 100, h: 20 }, 999)).toContain('A10 10');
  });

  test('path นอกกรอบมีทั้งขอบเขตใหญ่และรูของการ์ด/ช่องภาพ', () => {
    const { outsideCard, outsideArt } = auraClipPaths(false);
    expect(outsideCard).not.toBe(outsideArt);
    // รูของการ์ด (จุดเริ่มของ subpath ที่สอง)
    expect(outsideCard).toContain(`M${AURA_CARD.frame.x + AURA_CARD.frame.r} ${AURA_CARD.frame.y}`);
    // รูของช่องภาพ
    expect(outsideArt).toContain(`M${AURA_CARD.art.x + AURA_CARD.art.r} ${AURA_CARD.art.y}`);
    // ขอบเขตใหญ่ต้องเริ่มที่มุมซ้ายบนของ viewBox (คลุมพื้นที่ให้แสงล้นได้ทั้งก้อน)
    const [vx, vy] = auraGeometry(false).viewBox.split(' ').map(Number);
    expect(outsideCard.startsWith(`M${vx} ${vy}`)).toBe(true);
    expect(outsideArt.startsWith(`M${vx} ${vy}`)).toBe(true);
  });
});

// Phase 14.11: นำดีไซน์ `inner` ไปใช้จริงบนการ์ด (ผู้ใช้เลือกจากภาพจริง 2026-09-23: "ลองทำแบบ inner")
// CardFace ใช้ DEFAULT_AURA_VARIANT เป็นค่าตั้งต้น → ทุกหน้าที่ใช้ CardFace ได้แสงนี้ทันที
describe('การนำไปใช้จริงบนการ์ด — ดีไซน์ตั้งต้น', () => {
  test('ดีไซน์ตั้งต้นคือ inner และอยู่ในรายการดีไซน์ที่รองรับ', () => {
    expect(DEFAULT_AURA_VARIANT).toBe('inner');
    expect(AURA_VARIANTS).toContain(DEFAULT_AURA_VARIANT);
  });

  test('ดีไซน์ตั้งต้น "พอดีกรอบการ์ด" → ไม่ต้องแก้ layout/overflow ของหน้าใด', () => {
    const layers = auraLayers(DEFAULT_AURA_VARIANT, 'MYTHIC');
    expect(layers.clip).toBe(true); // ตัดแสงในกรอบ

    const geo = auraGeometry(layers.clip);
    // ไม่มีระยะล้นออกนอกกล่องการ์ด (ต่างจากดีไซน์อื่นที่ inset = -12%) → กล่องแม่ overflow-hidden ได้
    expect(geo.inset).toBe('0');
    expect(geo.viewBox).toBe(`0 0 ${AURA_CARD.width} ${AURA_CARD.height}`);
  });

  test('การ์ดทุกระดับที่ควรมีแสง ได้องค์ประกอบครบตามดีไซน์ตั้งต้น (ไม่มีเสาแสงที่ล้นกรอบ)', () => {
    for (const rarity of ['RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']) {
      const layers = auraLayers(DEFAULT_AURA_VARIANT, rarity);
      expect(layers.halo).toBe(true);
      expect(layers.flare).toBe(true);
      expect(layers.sparks).toBe(true);
      expect(layers.pillar).toBe(false); // เสาแสงล้นออกนอกกรอบ → ไม่ใช้ในโหมด clip
    }
  });

  test('กติกาเดิมไม่หลุด: การ์ดธรรมดา (COMMON/UNCOMMON) ยังไม่มีแสง', () => {
    for (const rarity of ['COMMON', 'UNCOMMON', undefined, 'unknown']) {
      const layers = auraLayers(DEFAULT_AURA_VARIANT, rarity);
      expect(layers.halo || layers.flare || layers.pillar || layers.sparks).toBe(false);
      expect(auraStyle(rarity, 'card-1')['--aura-intensity']).toBe('0');
    }
  });
});
