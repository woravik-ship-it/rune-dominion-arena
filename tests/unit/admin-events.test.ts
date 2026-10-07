// Admin Events — เทสต์ตรรกะบริสุทธิ์ (Phase 44, ผู้ใช้สั่ง 2026-10-07)
// ตรวจ: ช่วงเวลากิจกรรม (validateEventWindow) + Zod schema สร้าง/แก้กิจกรรม
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  eventAdminCreateSchema,
  eventAdminUpdateSchema,
  validateEventWindow,
} from '@/lib/validation';

const START = '2026-10-01T00:00:00.000Z';
const END = '2026-10-14T00:00:00.000Z';

const validCreate = {
  name: 'Test Event',
  nameTh: 'กิจกรรมทดสอบ',
  eventType: 'SEASONAL',
  startDate: START,
  endDate: END,
  currencyName: 'Veil Shards',
};

describe('validateEventWindow — ช่วงเวลากิจกรรม (pure)', () => {
  test('ช่วงเวลาถูกต้อง → null', () => {
    expect(validateEventWindow({ startDate: START, endDate: END })).toBeNull();
  });

  test('ยอมรับ Date object', () => {
    expect(
      validateEventWindow({ startDate: new Date(START), endDate: new Date(END) })
    ).toBeNull();
  });

  test('สิ้นสุดเท่ากับเริ่ม → ไม่ผ่าน', () => {
    expect(validateEventWindow({ startDate: START, endDate: START })).toBe(
      'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม'
    );
  });

  test('สิ้นสุดก่อนเริ่ม → ไม่ผ่าน', () => {
    expect(validateEventWindow({ startDate: END, endDate: START })).toBe(
      'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม'
    );
  });

  test('gracePeriodEnd หลัง endDate → ผ่าน', () => {
    expect(
      validateEventWindow({ startDate: START, endDate: END, gracePeriodEnd: '2026-10-15T00:00:00.000Z' })
    ).toBeNull();
  });

  test('gracePeriodEnd ก่อน endDate → ไม่ผ่าน', () => {
    expect(
      validateEventWindow({ startDate: START, endDate: END, gracePeriodEnd: '2026-10-13T00:00:00.000Z' })
    ).toBe('gracePeriodEnd ต้องไม่ก่อนเวลาสิ้นสุด');
  });

  test('gracePeriodEnd เป็น null → มองข้าม', () => {
    expect(validateEventWindow({ startDate: START, endDate: END, gracePeriodEnd: null })).toBeNull();
  });

  test('วันที่ตีความไม่ได้ → รูปแบบวันที่ไม่ถูกต้อง', () => {
    expect(validateEventWindow({ startDate: 'ไม่ใช่วันที่', endDate: END })).toBe(
      'รูปแบบวันที่ไม่ถูกต้อง'
    );
    expect(validateEventWindow({ startDate: START, endDate: 'x' })).toBe('รูปแบบวันที่ไม่ถูกต้อง');
  });
});

describe('eventAdminCreateSchema', () => {
  test('payload ถูกต้องผ่าน (ไม่มี default isActive — ค่าเริ่มต้นปิดตั้งที่ route)', () => {
    const parsed = eventAdminCreateSchema.safeParse(validCreate);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isActive).toBeUndefined();
      expect(parsed.data.status).toBeUndefined();
    }
  });

  test('มี gracePeriodEnd ที่ถูกต้อง → ผ่าน', () => {
    const parsed = eventAdminCreateSchema.safeParse({
      ...validCreate,
      gracePeriodEnd: '2026-10-15T00:00:00.000Z',
      maxCurrency: 100,
    });
    expect(parsed.success).toBe(true);
  });

  test('ขาดชื่อไทย → ไม่ผ่าน', () => {
    const parsed = eventAdminCreateSchema.safeParse({ ...validCreate, nameTh: '' });
    expect(parsed.success).toBe(false);
  });

  test('ชนิดกิจกรรมไม่ถูกต้อง → ไม่ผ่าน', () => {
    const parsed = eventAdminCreateSchema.safeParse({ ...validCreate, eventType: 'NOPE' });
    expect(parsed.success).toBe(false);
  });

  test('สถานะไม่ถูกต้อง → ไม่ผ่าน', () => {
    const parsed = eventAdminCreateSchema.safeParse({ ...validCreate, status: 'OPEN' });
    expect(parsed.success).toBe(false);
  });

  test('สิ้นสุดก่อนเริ่ม → ไม่ผ่าน และชี้ที่ endDate', () => {
    const parsed = eventAdminCreateSchema.safeParse({ ...validCreate, endDate: START });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes('endDate'))).toBe(true);
      expect(parsed.error.issues[0].message).toContain('สิ้นสุด');
    }
  });

  test('maxCurrency ติดลบ → ไม่ผ่าน', () => {
    const parsed = eventAdminCreateSchema.safeParse({ ...validCreate, maxCurrency: -1 });
    expect(parsed.success).toBe(false);
  });

  test('คีย์ enum ตรงกับ Prisma (ชนิด/สถานะ)', () => {
    expect(EVENT_TYPES).toEqual(['SEASONAL', 'WEEKLY', 'SPECIAL', 'COMMUNITY']);
    expect(EVENT_STATUSES).toEqual(['UPCOMING', 'ACTIVE', 'GRACE_PERIOD', 'ENDED']);
  });
});

describe('eventAdminUpdateSchema (PATCH บางฟิลด์)', () => {
  test('ปุ่มเปิด/ปิดส่ง { isActive } เดี่ยว ๆ → ผ่าน', () => {
    expect(eventAdminUpdateSchema.safeParse({ isActive: true }).success).toBe(true);
    expect(eventAdminUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  test('body ว่าง → ไม่ผ่าน', () => {
    expect(eventAdminUpdateSchema.safeParse({}).success).toBe(false);
  });

  test('gracePeriodEnd = null (ล้างค่า) → ผ่าน', () => {
    expect(eventAdminUpdateSchema.safeParse({ gracePeriodEnd: null }).success).toBe(true);
  });

  test('maxCurrency = null (ล้างค่า) → ผ่าน', () => {
    expect(eventAdminUpdateSchema.safeParse({ maxCurrency: null }).success).toBe(true);
  });

  test('แก้เฉพาะชื่อไทย → ผ่าน', () => {
    expect(eventAdminUpdateSchema.safeParse({ nameTh: 'ชื่อใหม่' }).success).toBe(true);
  });

  test('สถานะไม่ถูกต้อง → ไม่ผ่าน', () => {
    expect(eventAdminUpdateSchema.safeParse({ status: 'BAD' }).success).toBe(false);
  });
});
