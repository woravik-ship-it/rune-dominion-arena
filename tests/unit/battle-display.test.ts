// เทสต์ข้อมูลแสดงผลหน้าสนามรบ (Phase 16 รอบ 2) — ชื่อทีมต้องเป็นชื่อ Deck + ข้อมูลการ์ดสำหรับวาดเต็มใบ
import {
  BOT_TEAM_NAME,
  BATTLE_TEAM_SIZE,
  cardMetaMap,
  hasArt,
  refightBody,
  teamCardIds,
  teamName,
} from '@/services/battle-display';

describe('ชื่อทีมบนหน้าสนามรบ = ชื่อ Deck', () => {
  it('มีชื่อ Deck → ใช้ชื่อ Deck ตรงๆ (ทั้งสองฝ่าย)', () => {
    expect(teamName('A', 'ทีมด่วน 1')).toBe('ทีมด่วน 1');
    expect(teamName('B', 'ทีม2 แข็งแกร่งมาก')).toBe('ทีม2 แข็งแกร่งมาก');
  });

  it('ชื่อ Deck มีช่องว่างหัวท้าย → ตัดออก', () => {
    expect(teamName('A', '  ทีมด่วน 1  ')).toBe('ทีมด่วน 1');
  });

  it('ไม่มีชื่อ Deck → ใช้ป้ายสำรอง (ฝ่าย B ที่เป็นบอท = บอท)', () => {
    expect(teamName('A', null)).toBe('ทีมของฉัน');
    expect(teamName('B', undefined)).toBe('คู่ต่อสู้');
    expect(teamName('B', null, true)).toBe(BOT_TEAM_NAME);
    expect(teamName('A', null, true)).toBe('ทีมของฉัน');
  });

  it('ชื่อ Deck ว่าง/ช่องว่างล้วน → ถือว่าไม่มีชื่อ', () => {
    expect(teamName('A', '   ')).toBe('ทีมของฉัน');
    expect(teamName('B', '')).toBe('คู่ต่อสู้');
  });
});

describe('ข้อมูลการ์ดสำหรับวาดการ์ดเต็มใบ', () => {
  const ROWS = [
    { id: 'c1', imageUrl: '/api/cards/c1/art', imageStatus: 'READY', rarity: 'EPIC' },
    { id: 'c2', imageUrl: null, imageStatus: 'PROCESSING', rarity: 'RARE' },
  ];

  it('map ตาม cardId ครบทุกใบ', () => {
    const map = cardMetaMap(ROWS);
    expect(Object.keys(map).sort()).toEqual(['c1', 'c2']);
    expect(map.c1).toEqual({ cardId: 'c1', imageUrl: '/api/cards/c1/art', imageStatus: 'READY', rarity: 'EPIC' });
    expect(map.c2.imageUrl).toBeNull();
    expect(map.c2.imageStatus).toBe('PROCESSING');
  });

  it('ฟิลด์ที่ไม่ส่งมา → null (ไม่ใช่ undefined)', () => {
    const map = cardMetaMap([{ id: 'c3', imageUrl: null, rarity: 'COMMON' }]);
    expect(map.c3.imageStatus).toBeNull();
  });

  it('hasArt: รูปจริง = true · การ์ดวาดเอง (/image) หรือไม่มีรูป = false', () => {
    expect(hasArt(cardMetaMap(ROWS).c1)).toBe(true);
    expect(hasArt(cardMetaMap(ROWS).c2)).toBe(false);
    expect(hasArt({ cardId: 'c4', imageUrl: '/api/cards/c4/image?v=6', imageStatus: 'READY', rarity: 'RARE' })).toBe(false);
    expect(hasArt(undefined)).toBe(false);
  });
});

describe('รวม cardId จาก snapshot ทีม', () => {
  it('รวม A+B ไม่ซ้ำ และไม่เอา id ว่าง', () => {
    const ids = teamCardIds({
      A: [{ cardId: 'a1' }, { cardId: 'a2' }],
      B: [{ cardId: 'a2' }, { cardId: 'b1' }, { cardId: '' }],
    });
    expect(ids.sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('ไม่มีทีม (การต่อสู้เก่า) → อาร์เรย์ว่าง', () => {
    expect(teamCardIds(null)).toEqual([]);
    expect(teamCardIds(undefined)).toEqual([]);
    expect(teamCardIds({})).toEqual([]);
  });

  it('ขนาดทีมมาตรฐาน = 5 ใบ', () => {
    expect(BATTLE_TEAM_SIZE).toBe(5);
  });
});

// ปุ่ม "ต่อสู้อีกครั้ง" (ผู้ใช้สั่ง: ศึกที่ผ่านไปแล้วต้องสู้ใหม่ได้)
describe('refightBody — body ของการต่อสู้อีกครั้ง', () => {
  it('มีเด็คทั้งสองฝ่าย → สู้กับเด็คเดิม', () => {
    expect(refightBody('deckA', 'deckB')).toEqual({ attackerDeckId: 'deckA', defenderDeckId: 'deckB' });
  });

  it('ไม่มีเด็คฝ่าย B (ศึกกับบอท) → ใช้ bot: true', () => {
    expect(refightBody('deckA', null)).toEqual({ attackerDeckId: 'deckA', bot: true });
    expect(refightBody('deckA', undefined)).toEqual({ attackerDeckId: 'deckA', bot: true });
  });

  it('ไม่รู้เด็คฝ่าย A → null (ปุ่มจะแจ้งให้ไปเริ่มศึกใหม่เอง)', () => {
    expect(refightBody(null, 'deckB')).toBeNull();
    expect(refightBody(undefined, undefined)).toBeNull();
  });
});
