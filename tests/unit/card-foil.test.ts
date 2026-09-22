import { FOIL_SPECS, foilEnabled, foilHash, foilSpec, foilStyle, foilVariation } from '@/lib/card-foil';
import { generatePlaceholderSvg } from '@/lib/image-placeholder';

// Phase 14.9: ชั้น "แสงเลื่อม" (foil/holo overlay) ตามระดับความหายาก — CSS ล้วน ไม่เกี่ยวกับการเจนภาพ
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'] as const;

describe('foilSpec — กติกาแสงเลื่อมตามระดับความหายาก', () => {
  test('การ์ดธรรมดา (COMMON/UNCOMMON) ไม่มีชั้นแสงเลย', () => {
    for (const rarity of ['COMMON', 'UNCOMMON']) {
      const spec = foilSpec(rarity);
      expect(spec.tier).toBe('NONE');
      expect(spec.intensity).toBe(0);
      expect(spec.sweep).toBe(false);
      expect(spec.prism).toBe(false);
      expect(spec.sparkle).toBe(false);
      expect(foilEnabled(rarity)).toBe(false);
    }
  });

  test('RARE ขึ้นไปมีชั้นแสง และเข้มขึ้นตามระดับ', () => {
    const rare = foilSpec('RARE');
    const epic = foilSpec('EPIC');
    const legendary = foilSpec('LEGENDARY');
    const mythic = foilSpec('MYTHIC');

    for (const spec of [rare, epic, legendary, mythic]) {
      expect(foilEnabled(spec.tier === 'NONE' ? 'COMMON' : 'MYTHIC')).toBe(true);
      expect(spec.sweep).toBe(true);
      expect(spec.intensity).toBeGreaterThan(0);
      expect(spec.intensity).toBeLessThanOrEqual(1);
      expect(spec.sweepSec).toBeGreaterThan(0);
      expect(spec.prismSec).toBeGreaterThan(0);
    }

    // ความเข้มเพิ่มขึ้น + เลื่อมเร็วขึ้น ตามระดับความหายาก
    expect(rare.intensity).toBeLessThan(epic.intensity);
    expect(epic.intensity).toBeLessThan(legendary.intensity);
    expect(legendary.intensity).toBeLessThan(mythic.intensity);
    expect(rare.sweepSec).toBeGreaterThan(epic.sweepSec);
    expect(epic.sweepSec).toBeGreaterThan(legendary.sweepSec);
    expect(legendary.sweepSec).toBeGreaterThan(mythic.sweepSec);
  });

  test('ชั้นวงรุ้ง/ประกายดาวเปิดเฉพาะระดับสูง', () => {
    expect(foilSpec('RARE').prism).toBe(false);
    expect(foilSpec('EPIC').prism).toBe(true);
    expect(foilSpec('EPIC').sparkle).toBe(false);
    expect(foilSpec('LEGENDARY').sparkle).toBe(true);
    expect(foilSpec('MYTHIC').sparkle).toBe(true);
    expect(foilSpec('MYTHIC').tier).toBe('PRISMATIC');
  });

  test('ระดับที่ไม่รู้จัก/ไม่ส่งมา → ถือเป็น COMMON (ไม่ใส่เอฟเฟกต์)', () => {
    for (const value of ['', 'rare-unknown', 'SUPER_RARE', undefined, null]) {
      expect(foilSpec(value).tier).toBe('NONE');
      expect(foilSpec(value).intensity).toBe(0);
    }
  });

  test('รับตัวพิมพ์เล็ก/ใหญ่ได้ (rare = RARE)', () => {
    expect(foilSpec('rare')).toEqual(foilSpec('RARE'));
    expect(foilSpec('legendary')).toEqual(foilSpec('LEGENDARY'));
  });

  test('ทุกระดับในเกมมีค่าตั้งต้นครบ (ไม่มีระดับไหนหลุดไปใช้ค่าอื่น)', () => {
    for (const rarity of RARITIES) {
      expect(FOIL_SPECS[rarity]).toBeDefined();
      expect(FOIL_SPECS[rarity].tint).toHaveLength(2);
    }
  });
});

describe('foilVariation — ความต่างของแสงต่อการ์ดแต่ละใบ (deterministic)', () => {
  test('seed เดิม → ค่าเดิมเสมอ', () => {
    expect(foilVariation('card-abc')).toEqual(foilVariation('card-abc'));
    expect(foilHash('card-abc')).toBe(foilHash('card-abc'));
  });

  test('การ์ดต่างใบ → เฟส/องศาไม่เหมือนกัน (อย่างน้อยต้องมีบางคู่ต่าง)', () => {
    const a = foilVariation('card-aaa');
    const b = foilVariation('card-bbb');
    expect(a).not.toEqual(b);
  });

  test('ค่าอยู่ในช่วงที่ออกแบบไว้', () => {
    for (const seed of ['', 'a', 'card-1', 'x'.repeat(64), '🎴-การ์ด']) {
      const v = foilVariation(seed);
      expect(v.angleDeg).toBeGreaterThanOrEqual(96);
      expect(v.angleDeg).toBeLessThanOrEqual(120);
      expect(v.delaySec).toBeGreaterThanOrEqual(0);
      expect(v.delaySec).toBeLessThan(10);
      expect(v.hueDeg).toBeGreaterThanOrEqual(-20);
      expect(v.hueDeg).toBeLessThanOrEqual(20);
    }
  });
});

describe('foilStyle — ค่า CSS ที่คอมโพเนนต์ CardFoil นำไปใช้', () => {
  test('คืนตัวแปร CSS ครบชุด และค่าความเข้มตรงกับสเปก', () => {
    const style = foilStyle('MYTHIC', 'card-1');
    expect(style['--foil-intensity']).toBe(String(foilSpec('MYTHIC').intensity));
    expect(style['--foil-dur']).toBe(`${foilSpec('MYTHIC').sweepSec}s`);
    expect(style['--foil-prism-dur']).toBe(`${foilSpec('MYTHIC').prismSec}s`);
    expect(style['--foil-tint-a']).toBe(foilSpec('MYTHIC').tint[0]);
    expect(style['--foil-tint-b']).toBe(foilSpec('MYTHIC').tint[1]);
    expect(style['--foil-angle']).toMatch(/^\d+deg$/);
    expect(style['--foil-hue']).toMatch(/^-?\d+deg$/);
    // หน่วงเวลาเป็นค่าลบ → เริ่มกลางคาบ เฟสจึงไม่ตรงกันทั้งกระดาน
    expect(style['--foil-delay']).toMatch(/^-\d+(\.\d+)?s$/);
  });

  test('ระดับล่างได้ความเข้ม 0 (คอมโพเนนต์จะไม่ render ชั้นแสงเลย)', () => {
    expect(foilStyle('COMMON', 'card-1')['--foil-intensity']).toBe('0');
    expect(foilStyle(undefined, 'card-1')['--foil-intensity']).toBe('0');
  });
});

describe('ความสอดคล้องกับกติกาเดิมของการ์ดวาดเอง (image-placeholder)', () => {
  // เดิมเอฟเฟกต์ฟอยล์ถูกอบไว้ใน SVG (holoSheen → url(#cardHolo)) — กติกา "ระดับไหนมีฟอยล์" ต้องตรงกัน
  const input = {
    cardId: 'card-foil-check',
    name: 'Foil Check',
    nameTh: 'ทดสอบแสงเลื่อม',
    element: 'EMBERBOUND',
    canonicalSeedHash: 'a'.repeat(32),
  };

  test('ระดับที่มีชั้นแสงใน CSS = ระดับที่มี url(#cardHolo) ใน SVG', () => {
    for (const rarity of RARITIES) {
      const svg = generatePlaceholderSvg({ ...input, rarity });
      expect(svg.includes('url(#cardHolo)')).toBe(foilEnabled(rarity));
    }
  });
});
