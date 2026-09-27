// เทสต์แคตตาล็อก Item + ช่องใส่ 3 ช่อง (Phase 25)
// ผู้ใช้สั่ง 2026-09-27: "ช่างใส่ Item เพิ่ม Status ให้ 3 ช่อง Item โจมตี, ป้องกัน, สนับสนุน"
import {
  ITEM_CATALOG,
  ITEM_SELL_REFUND_RATE,
  ITEM_SLOTS,
  applyItemStats,
  cheapestPrice,
  craftQuote,
  findItemDef,
  itemsForSlot,
  sellQuote,
  slotAcceptsItem,
  sumItemStats,
} from '@/lib/item-definitions';

describe('แคตตาล็อก Item', () => {
  test('มี Item ครบทั้ง 3 ช่อง (โจมตี/ป้องกัน/สนับสนุน)', () => {
    for (const slot of ITEM_SLOTS) {
      expect(itemsForSlot(slot).length).toBeGreaterThan(0);
    }
    expect(ITEM_SLOTS).toEqual(['ATTACK', 'DEFENSE', 'SUPPORT']);
  });

  test('code ไม่ซ้ำ และค้นหาได้', () => {
    const codes = ITEM_CATALOG.map((item) => item.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(findItemDef(codes[0])?.code).toBe(codes[0]);
    expect(findItemDef('NOT_EXIST')).toBeNull();
  });

  test('ทุก Item ให้ Status อย่างน้อย 1 อย่าง และค่ามีเฉพาะอย่างที่ตรงช่อง', () => {
    for (const item of ITEM_CATALOG) {
      const total = item.atk + item.def + item.hp + item.spd;
      expect(total).toBeGreaterThan(0);
      for (const value of [item.atk, item.def, item.hp, item.spd]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      // ช่องโจมตีต้องมี ATK — ช่องป้องกันต้องมี DEF/HP — ช่องสนับสนุนต้องมี SPD/HP
      if (item.slot === 'ATTACK') expect(item.atk).toBeGreaterThan(0);
      if (item.slot === 'DEFENSE') expect(item.def + item.hp).toBeGreaterThan(0);
      if (item.slot === 'SUPPORT') expect(item.spd + item.hp).toBeGreaterThan(0);
    }
  });

  test('ราคาเป็นจำนวนเต็ม · อย่างน้อยมีทางได้มา (ซื้อหรือคราฟต์)', () => {
    for (const item of ITEM_CATALOG) {
      expect(Number.isInteger(item.craftCost)).toBe(true);
      expect(Number.isInteger(item.dustCost)).toBe(true);
      expect(item.craftCost > 0 || (item.buyCost ?? 0) > 0).toBe(true);
      if (item.buyCost !== null) expect(Number.isInteger(item.buyCost)).toBe(true);
      expect(cheapestPrice(item)).toBeGreaterThan(0);
    }
  });

  test('Item หายากกว่าให้ Status มากกว่า (ความก้าวหน้าชัด)', () => {
    const common = findItemDef('ATK_WHETSTONE');
    const legendary = findItemDef('ATK_RIFTRENDER');
    expect(legendary?.atk ?? 0).toBeGreaterThan(common?.atk ?? 0);
    expect(legendary?.craftCost ?? 0).toBeGreaterThan(common?.craftCost ?? 0);
  });

  test('Item ระดับสูงต้องคราฟต์เท่านั้น (ซื้อตรงไม่ได้)', () => {
    expect(findItemDef('ATK_MOONLESS_BLADE')?.buyCost).toBeNull();
    expect(findItemDef('SUP_SELENE_SIGIL')?.buyCost).toBeNull();
  });

  test('มีของให้คราฟต์หลากหลายครบทุกระดับ (Phase 32: 12 ชิ้น/ช่อง = 36 ชิ้น)', () => {
    // 2 ชิ้นต่อระดับความหายาก (6 ระดับ) ต่อช่อง
    for (const slot of ITEM_SLOTS) {
      const list = itemsForSlot(slot);
      expect(list.length).toBeGreaterThanOrEqual(12);
      for (const rarity of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']) {
        expect(list.filter((item) => item.rarity === rarity).length).toBeGreaterThanOrEqual(2);
      }
    }
    expect(ITEM_CATALOG.length).toBeGreaterThanOrEqual(36);
    // ระดับสูงสุด (MYTHIC) ต้องมีจริง ครบ 3 ช่อง และคราฟต์เท่านั้น
    const mythic = ITEM_CATALOG.filter((item) => item.rarity === 'MYTHIC');
    expect(new Set(mythic.map((item) => item.slot)).size).toBe(3);
    for (const item of mythic) {
      expect(item.buyCost).toBeNull();
      expect(item.dustCost).toBeGreaterThanOrEqual(200);
    }
  });

  test('ของคราฟต์ใหม่ใช้งานได้ (มี code เฉพาะ + status ตรงช่อง)', () => {
    for (const code of ['ATK_ASHEN_SPIKE', 'DEF_IRONWEAVE', 'SUP_DUSKVEIL', 'ATK_STORMFANG', 'DEF_TITANHEART', 'SUP_WORLDSEED']) {
      const item = findItemDef(code);
      expect(item).not.toBeNull();
      expect(item!.craftCost).toBeGreaterThan(0);
      expect(item!.dustCost).toBeGreaterThan(0);
    }
  });
});

describe('Status จาก Item (บวกเข้าการ์ดจริง)', () => {
  test('รวม Status ของหลายชิ้น', () => {
    const total = sumItemStats([
      { atk: 6, def: 0, hp: 0, spd: 0 },
      { atk: 0, def: 16, hp: 25, spd: 0 },
      { atk: 0, def: 0, hp: 4, spd: 5 },
    ]);
    expect(total).toEqual({ atk: 6, def: 16, hp: 29, spd: 5 });
  });

  test('ไม่มี Item → ทุกอย่าง 0', () => {
    expect(sumItemStats([])).toEqual({ atk: 0, def: 0, hp: 0, spd: 0 });
  });

  test('Status จริง = พื้นฐาน + Item (integer)', () => {
    const base = { atk: 80, def: 62, hp: 178, spd: 37 };
    const effective = applyItemStats(base, { atk: 16, def: 0, hp: 0, spd: 4 });
    expect(effective).toEqual({ atk: 96, def: 62, hp: 178, spd: 41 });
    // ค่าเดิมไม่ถูกแก้ (ไม่ mutate)
    expect(base).toEqual({ atk: 80, def: 62, hp: 178, spd: 37 });
  });

  test('ช่องใส่ต้องตรงกับชนิดของ Item', () => {
    expect(slotAcceptsItem('ATTACK', 'ATTACK')).toBe(true);
    expect(slotAcceptsItem('DEFENSE', 'SUPPORT')).toBe(false);
  });
});

describe('การประเมินการคราฟต์ (ใช้ทั้ง UI และ API)', () => {
  const sword = { craftCost: 20, dustCost: 25 };

  test('ของพอ → คราฟต์ได้', () => {
    expect(craftQuote(sword, { veilShards: 20, dust: 25 }).ok).toBe(true);
    expect(craftQuote(sword, { veilShards: 100, dust: 100 }).ok).toBe(true);
  });

  test('ของไม่พอ → บอกจำนวนที่ขาด (Veil Shards / ฝุ่นเวท แยกกัน)', () => {
    const quote = craftQuote(sword, { veilShards: 5, dust: 10 });
    expect(quote.ok).toBe(false);
    expect(quote.missingShards).toBe(15);
    expect(quote.missingDust).toBe(15);
  });

  test('ขาดอย่างเดียว → อีกอย่างไม่ถูกหักเป็นลบ', () => {
    const quote = craftQuote(sword, { veilShards: 30, dust: 0 });
    expect(quote.missingShards).toBe(0);
    expect(quote.missingDust).toBe(25);
    expect(quote.ok).toBe(false);
  });
});

describe('ขาย Item คืนวัตถุดิบ 50% (Phase 32)', () => {
  test('คืนครึ่งหนึ่งของสูตรคราฟต์ (ปัดลง) ทั้ง Veil Shards และฝุ่นเวท', () => {
    expect(ITEM_SELL_REFUND_RATE).toBe(0.5);
    // หินลับคม: คราฟต์ 6 shards + 5 dust → คืน 3 + 2
    expect(sellQuote({ craftCost: 6, dustCost: 5 })).toEqual({ shards: 3, dust: 2, total: 5 });
    // ดาบฉีกสุญญตา: 260 + 240 → คืน 130 + 120
    expect(sellQuote({ craftCost: 260, dustCost: 240 })).toEqual({ shards: 130, dust: 120, total: 250 });
  });

  test('ขายหลายชิ้น = คูณจำนวน (และจำนวนเพี้ยนไม่ทำให้พัง)', () => {
    expect(sellQuote({ craftCost: 20, dustCost: 25 }, 3)).toEqual({ shards: 30, dust: 36, total: 66 });
    expect(sellQuote({ craftCost: 20, dustCost: 25 }, 0).shards).toBe(10);
    expect(sellQuote({ craftCost: 20, dustCost: 25 }, Number.NaN).dust).toBe(12);
  });

  test('ทุกรายการ: ขายคืนต้องไม่เกินครึ่งของต้นทุน (กันปั๊มของ/กำไรจากคราฟต์แล้วขาย)', () => {
    for (const item of ITEM_CATALOG) {
      const quote = sellQuote(item);
      expect(quote.shards).toBeLessThanOrEqual(Math.max(1, item.craftCost));
      expect(quote.shards + quote.dust).toBeLessThan(item.craftCost + item.dustCost + 1);
      expect(quote.shards).toBeLessThanOrEqual(Math.floor(item.craftCost / 2));
      expect(quote.dust).toBeLessThanOrEqual(Math.floor(item.dustCost / 2));
    }
  });
});
