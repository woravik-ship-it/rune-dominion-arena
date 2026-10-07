import {
  buildCollectionUrl,
  parseCollectionView,
  sanitizeCollectionFrom,
  shouldOpenDetailInModal,
  toCardDefinition,
} from '@/lib/card-modal';

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

/**
 * 2026-10-07 รอบ 2 (ผู้ใช้แจ้ง): "กดเปิดเต็มจอ พอกดกลับคอลเลคชั่น จะกลับไปหน้า 1 อีก
 * แก้ด้วย ให้กลับไปหน้าที่การ์ดที่เปิดดูอยู่"
 */
describe('buildCollectionUrl / parseCollectionView — มุมมองคอลเลคชั่นต้องติดไปกับ URL', () => {
  test('ค่าเริ่มต้นทั้งหมด → /cards เปล่า ๆ (URL สั้น)', () => {
    expect(buildCollectionUrl({ page: 1, tab: 'all', sort: 'power', element: 'ALL', rarity: 'ALL', role: 'ALL', search: '' })).toBe('/cards');
    expect(buildCollectionUrl({})).toBe('/cards');
  });

  test('หน้า 2 → ติด page=2', () => {
    expect(buildCollectionUrl({ page: 2 })).toBe('/cards?page=2');
  });

  test('ตัวกรอง+คำค้น+เรียง → ครบทุกตัวที่ต่างจากค่าเริ่มต้น', () => {
    const url = buildCollectionUrl({ page: 3, tab: 'owned', sort: 'atk', element: 'EMBERBOUND', rarity: 'RARE', role: 'MAGE', search: 'อัศวิน' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/cards?')).toBe(true);
    expect(params.get('page')).toBe('3');
    expect(params.get('tab')).toBe('owned');
    expect(params.get('sort')).toBe('atk');
    expect(params.get('element')).toBe('EMBERBOUND');
    expect(params.get('rarity')).toBe('RARE');
    expect(params.get('role')).toBe('MAGE');
    expect(params.get('search')).toBe('อัศวิน');
  });

  test('parse: อ่านค่ากลับได้ตรงกับที่ build ไว้ (ไป-กลับไม่เพี้ยน)', () => {
    const view = { page: 2, tab: 'missing', sort: 'name', element: 'TIDEBORN', rarity: 'EPIC', role: 'TANK', search: 'sea' };
    expect(parseCollectionView(new URLSearchParams(buildCollectionUrl(view).split('?')[1]))).toEqual(view);
  });

  test('parse: ค่าที่ผิดรูปถูกทิ้ง ไม่ทำให้หน้าพัง', () => {
    const bad = new URLSearchParams('page=-3&tab=hack&element=<script>&rarity=RARE&search=' + 'x'.repeat(200));
    const view = parseCollectionView(bad);
    expect(view.page).toBeUndefined();       // page ต้อง >= 2
    expect(view.tab).toBeUndefined();        // ไม่อยู่ในแท็บที่รู้จัก
    expect(view.element).toBeUndefined();    // มีอักขระที่ไม่ใช่ตัวอักษร
    expect(view.rarity).toBe('RARE');
    expect(view.search!.length).toBe(60);    // ตัดความยาว
  });
});

describe('sanitizeCollectionFrom — กัน open redirect ให้ปุ่มกลับไปคอลเลคชั่น', () => {
  test('รับ URL คอลเลคชั่นของเราเอง (มี query ได้)', () => {
    expect(sanitizeCollectionFrom('/cards?page=2')).toBe('/cards?page=2');
    expect(sanitizeCollectionFrom('/cards')).toBe('/cards');
    expect(sanitizeCollectionFrom('/cards?page=2&element=EMBERBOUND')).toBe('/cards?page=2&element=EMBERBOUND');
  });

  test('ปฏิเสธลิงก์นอกเว็บ/ลิงก์ที่พาวนไปหน้ารายละเอียด', () => {
    expect(sanitizeCollectionFrom('https://evil.example/x')).toBeNull();
    expect(sanitizeCollectionFrom('//evil.example')).toBeNull();
    expect(sanitizeCollectionFrom('/cards/abc123')).toBeNull();   // วนกลับไปหน้ารายละเอียด
    expect(sanitizeCollectionFrom('/decks?page=2')).toBeNull();
    expect(sanitizeCollectionFrom('')).toBeNull();
    expect(sanitizeCollectionFrom(null)).toBeNull();
    expect(sanitizeCollectionFrom(undefined)).toBeNull();
  });

  test('ปฏิเสธ query ที่เราไม่ได้สร้าง (กัน parameter แปลกปลอม)', () => {
    expect(sanitizeCollectionFrom('/cards?next=https://evil.example')).toBeNull();
    expect(sanitizeCollectionFrom('/cards?page=2&weird=1')).toBeNull();
  });
});
