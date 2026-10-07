// Phase 45.2 (2026-10-07): เทสต์ตรรกะคอลเลคชั่นการ์ด (กรอง · เรียง · สรุปความคืบหน้า)
// ผู้ใช้สั่ง: "เอาเมนู คอลเลคชั่นการ์ด กลับมา และทำให้สมบูรณ์กว่าเดิม"
import {
  cardPower,
  collectionSummary,
  elementOrder,
  filterCollection,
  rarityOrder,
  sortCollection,
  type CollectionCard,
} from '@/lib/collection';

function card(over: Partial<CollectionCard> & { cardId: string }): CollectionCard {
  return {
    name: 'Card',
    nameTh: null,
    element: 'EMBERBOUND',
    rarity: 'COMMON',
    role: 'WARRIOR',
    stats: { atk: 10, def: 10, hp: 10, spd: 10, manaCost: 1 },
    owned: false,
    quantity: 0,
    isFavorite: false,
    obtainedAt: null,
    ...over,
  };
}

const ROWS: CollectionCard[] = [
  card({ cardId: 'a', name: 'Alpha', nameTh: 'อัลฟา', element: 'EMBERBOUND', rarity: 'COMMON', role: 'WARRIOR', stats: { atk: 5, def: 5, hp: 5, spd: 5, manaCost: 1 }, owned: true, quantity: 3, obtainedAt: '2026-09-01T00:00:00.000Z' }),
  card({ cardId: 'b', name: 'Beta', nameTh: 'เบตา', element: 'TIDEBORN', rarity: 'LEGENDARY', role: 'MAGE', stats: { atk: 40, def: 20, hp: 30, spd: 12, manaCost: 3 }, owned: true, quantity: 1, isFavorite: true, obtainedAt: '2026-10-01T00:00:00.000Z' }),
  card({ cardId: 'c', name: 'Gamma', nameTh: 'แกมมา', element: 'VEILMARKED', rarity: 'EPIC', role: 'TANK', stats: { atk: 18, def: 44, hp: 50, spd: 6, manaCost: 4 } }),
  card({ cardId: 'd', name: 'Delta', nameTh: null, element: 'TIDEBORN', rarity: 'RARE', role: 'SUPPORT', stats: { atk: 12, def: 12, hp: 12, spd: 12, manaCost: 2 }, owned: true, quantity: 2, obtainedAt: null }),
];

describe('cardPower', () => {
  it('= atk + def + hp + spd (สูตรเดียวกับพลังทีม)', () => {
    expect(cardPower({ atk: 40, def: 20, hp: 30, spd: 12, manaCost: 3 })).toBe(102);
  });

  it('ปัดเศษทิ้ง (จำนวนเต็มเท่านั้น)', () => {
    expect(cardPower({ atk: 10.9, def: 5.9, hp: 1.1, spd: 0.5, manaCost: 0 })).toBe(10 + 5 + 1 + 0);
  });
});

describe('rarityOrder / elementOrder', () => {
  it('เรียงตามระดับหายากจากน้อยไปมาก', () => {
    expect(rarityOrder('COMMON')).toBeLessThan(rarityOrder('MYTHIC'));
  });
  it('ค่าที่ไม่รู้จักไปท้าย (0)', () => {
    expect(rarityOrder('NOPE')).toBe(0);
    expect(elementOrder('NOPE')).toBe(99);
  });
});

describe('filterCollection', () => {
  it('แท็บ having = เห็นเฉพาะใบที่มี', () => {
    const out = filterCollection(ROWS, { tab: 'owned' });
    expect(out.map((c) => c.cardId)).toEqual(['a', 'b', 'd']);
  });

  it('แท็บ missing = เห็นเฉพาะใบที่ยังไม่มี (ของใหม่ที่เดิมดูไม่ได้)', () => {
    const out = filterCollection(ROWS, { tab: 'missing' });
    expect(out.map((c) => c.cardId)).toEqual(['c']);
  });

  it('กรองธาตุ + ระดับหายาก พร้อมกันได้', () => {
    expect(filterCollection(ROWS, { element: 'TIDEBORN' }).map((c) => c.cardId)).toEqual(['b', 'd']);
    expect(filterCollection(ROWS, { element: 'TIDEBORN', rarity: 'RARE' }).map((c) => c.cardId)).toEqual(['d']);
  });

  it('กรองบทบาทได้', () => {
    expect(filterCollection(ROWS, { role: 'TANK' }).map((c) => c.cardId)).toEqual(['c']);
  });

  it('ค้นหาได้ทั้งชื่ออังกฤษและชื่อไทย (ไม่สนตัวพิมพ์)', () => {
    expect(filterCollection(ROWS, { search: 'gam' }).map((c) => c.cardId)).toEqual(['c']);
    expect(filterCollection(ROWS, { search: 'เบตา' }).map((c) => c.cardId)).toEqual(['b']);
  });

  it('การ์ดที่ไม่มีชื่อไทยก็ยังค้นด้วยชื่ออังกฤษได้', () => {
    expect(filterCollection(ROWS, { search: 'delta' }).map((c) => c.cardId)).toEqual(['d']);
  });
});

describe('sortCollection', () => {
  it('power = พลังรวมมากไปน้อย', () => {
    // b(Beta)=102 · c(Gamma)=118 · d(Delta)=48 · a(Alpha)=20 ⇒ c มากสุด
    expect(sortCollection(ROWS, 'power').map((c) => c.cardId)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('atk = ATK มากไปน้อย', () => {
    expect(sortCollection(ROWS, 'atk').map((c) => c.cardId)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('rarity = หายากสุดก่อน (LEGENDARY → EPIC → RARE → COMMON)', () => {
    expect(sortCollection(ROWS, 'rarity').map((c) => c.cardId)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('newest = ได้มาล่าสุดก่อน และใบที่ยังไม่มีไปท้ายสุด', () => {
    const out = sortCollection(ROWS, 'newest').map((c) => c.cardId);
    // b (ต.ค.) มาก่อน a (ก.ย.) และ 2 ใบที่ยังไม่ได้ (c, d — obtainedAt = null) อยู่สองท้าย
    expect(out.slice(0, 2)).toEqual(['b', 'a']);
    expect([out[2], out[3]].sort()).toEqual(['c', 'd']);
  });

  it('name = เรียงตามชื่อไทยก่อน แล้วต่อด้วยชื่ออังกฤษ', () => {
    const out = sortCollection(ROWS, 'name').map((c) => c.cardId);
    // แกมมา(n) < เบตา(n) < อัลฟา(n) ตามลำดับไทย; Delta ไม่มีชื่อไทย → ใช้ชื่ออังกฤษ
    expect(out).toHaveLength(4);
    expect(out[0]).toBe('c');
  });

  it('ไม่แก้ array ต้นฉบับ (pure)', () => {
    const before = ROWS.map((c) => c.cardId);
    sortCollection(ROWS, 'atk');
    expect(ROWS.map((c) => c.cardId)).toEqual(before);
  });
});

describe('collectionSummary', () => {
  const summary = collectionSummary(ROWS);

  it('นับใบที่มีไม่ซ้ำ + ของซ้ำ + ติดดาว', () => {
    expect(summary.total).toBe(4);
    expect(summary.ownedUnique).toBe(3);
    expect(summary.totalCopies).toBe(3 + 1 + 2);
    expect(summary.favorites).toBe(1);
  });

  it('เปอร์เซ็นต์คิดจาก "การ์ดทั้งเกม"', () => {
    expect(summary.percent).toBe(75);
  });

  it('แยกความคืบหน้าตามระดับหายาก โดยเรียงจากหายากสุดก่อน', () => {
    expect(summary.byRarity.map((g) => g.key)).toEqual(['LEGENDARY', 'EPIC', 'RARE', 'COMMON']);
    const legendary = summary.byRarity.find((g) => g.key === 'LEGENDARY');
    expect(legendary).toEqual({ key: 'LEGENDARY', owned: 1, total: 1, percent: 100 });
    const common = summary.byRarity.find((g) => g.key === 'COMMON');
    expect(common).toEqual({ key: 'COMMON', owned: 1, total: 1, percent: 100 });
  });

  it('แยกตามธาตุตามลำดับธาตุของเกม (เพลิง → น้ำ → ลม → ดิน → แสง → เงา)', () => {
    expect(summary.byElement.map((g) => g.key)).toEqual(['EMBERBOUND', 'TIDEBORN', 'VEILMARKED']);
  });

  it('คอลเลคชั่นว่างไม่ทำให้หารศูนย์', () => {
    const empty = collectionSummary([]);
    expect(empty.percent).toBe(0);
    expect(empty.byRarity).toEqual([]);
  });
});
