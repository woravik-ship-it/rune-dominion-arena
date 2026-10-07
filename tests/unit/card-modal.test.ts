import { shouldOpenDetailInModal, toCardDefinition } from '@/lib/card-modal';

/**
 * 2026-10-07 (ผู้ใช้แจ้ง): "อยู่หน้า 2 กดกลับคอลเลคชั่น จะกลับไปหน้า 1
 * แก้ให้เป็นดูแบบ Popup พอ จะได้ไม่ต้องกดกลับ"
 *
 * เทสต์ชุดนี้คุมตรรกะของการเปิดป๊อปอัป (ไม่ใช่ JSX) เพื่อให้รันได้ใน
 * testEnvironment: 'node' โดยไม่ต้องเพิ่ม dependency ของ testing-library
 */
describe('shouldOpenDetailInModal — เลือกเส้นทางของคลิกการ์ด', () => {
  test('คลิกซ้ายธรรมดา → เปิดป๊อปอัป', () => {
    expect(shouldOpenDetailInModal({ button: 0 })).toBe(true);
    expect(shouldOpenDetailInModal({})).toBe(true);
  });

  test('แตะบนมือถือ (button 0 ไม่มี modifier) → เปิดป๊อปอัป', () => {
    // เบราว์เซอร์มือถือส่ง click เดียวกัน (ไม่มี metaKey/ctrlKey)
    expect(shouldOpenDetailInModal({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false })).toBe(true);
  });

  test('Ctrl/Cmd/Shift/Alt คลิก → ไม่เปิดป๊อปอัป (ให้เปิดแท็บใหม่ตาม href)', () => {
    expect(shouldOpenDetailInModal({ button: 0, ctrlKey: true })).toBe(false);
    expect(shouldOpenDetailInModal({ button: 0, metaKey: true })).toBe(false);
    expect(shouldOpenDetailInModal({ button: 0, shiftKey: true })).toBe(false);
    expect(shouldOpenDetailInModal({ button: 0, altKey: true })).toBe(false);
  });

  test('คลิกปุ่มกลาง (เปิดแท็บใหม่) → ไม่เปิดป๊อปอัป', () => {
    expect(shouldOpenDetailInModal({ button: 1 })).toBe(false);
  });

  test('มีคน preventDefault ไปแล้ว → ไม่แตะเส้นทาง', () => {
    expect(shouldOpenDetailInModal({ button: 0, defaultPrevented: true })).toBe(false);
  });
});

describe('toCardDefinition — แปลง payload ของ GET /api/cards/:id', () => {
  const payload = {
    id: 'card_1',
    name: 'Ember Knight',
    nameTh: 'อัศวินเพลิง',
    lore: 'lore',
    loreTh: 'ตำนาน',
    element: 'EMBERBOUND',
    rarity: 'RARE',
    role: 'WARRIOR',
    stats: { atk: 10, def: 5, hp: 20, spd: 7, manaCost: 3 },
    skills: [{ name: 'Slash', description: 'ฟัน', manaCost: 1 }],
    imageUrl: '/api/cards/card_1/art',
    imageStatus: 'READY',
  };

  test('แปลงค่าครบทุกช่องที่การ์ดต้องใช้', () => {
    const card = toCardDefinition(payload);
    expect(card).not.toBeNull();
    expect(card!.id).toBe('card_1');
    expect(card!.nameTh).toBe('อัศวินเพลิง');
    expect(card!.stats).toEqual({ atk: 10, def: 5, hp: 20, spd: 7, manaCost: 3 });
    expect(card!.skills).toEqual([{ name: 'Slash', description: 'ฟัน', manaCost: 1 }]);
    expect(card!.imageStatus).toBe('READY');
  });

  test('imageUrl = null (การ์ดที่ยังไม่มีภาพ) → undefined ไม่ทำให้ type พัง', () => {
    const card = toCardDefinition({ ...payload, imageUrl: null });
    expect(card!.imageUrl).toBeUndefined();
  });

  test('stats ที่ขาดหาย → 0 ทุกช่อง (ไม่ขึ้น NaN บนการ์ด)', () => {
    const card = toCardDefinition({ id: 'c', name: 'n', stats: { atk: 'x' } });
    expect(card!.stats).toEqual({ atk: 0, def: 0, hp: 0, spd: 0, manaCost: 0 });
  });

  test('skills ที่พังถูกข้าม ไม่ทำให้ทั้งใบหาย', () => {
    const card = toCardDefinition({
      ...payload,
      skills: [null, { description: 'ไม่มีชื่อ' }, { name: 'OK', manaCost: '2' }],
    });
    expect(card!.skills).toEqual([{ name: 'OK', description: '', manaCost: 2 }]);
  });

  test('payload ที่ไม่ใช่การ์ด → null (โชว์ข้อความใน modal แทนที่จะพัง)', () => {
    expect(toCardDefinition(null)).toBeNull();
    expect(toCardDefinition(undefined)).toBeNull();
    expect(toCardDefinition('nope')).toBeNull();
    expect(toCardDefinition({ name: 'ไม่มี id' })).toBeNull();
    expect(toCardDefinition({ id: 'x' })).toBeNull();
  });
});
