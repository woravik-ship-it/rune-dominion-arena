import {
  calculateArenaReward,
  arenaExpiryFrom,
  isArenaExpired,
  validateRoomName,
  countTodayJoins,
  arenaJoinPlan,
  arenaJoinMessage,
} from '@/services/arena';

describe('Arena Service', () => {
  describe('calculateArenaReward', () => {
    it('สูตร min(100 + n×5, 500)', () => {
      expect(calculateArenaReward(0)).toBe(100);
      expect(calculateArenaReward(10)).toBe(150);
      expect(calculateArenaReward(20)).toBe(200);
    });
    it('เพดาน 500', () => {
      expect(calculateArenaReward(80)).toBe(500);
      expect(calculateArenaReward(1000)).toBe(500);
    });
    it('ผลเป็น integer', () => {
      expect(Number.isInteger(calculateArenaReward(7))).toBe(true);
    });
  });

  describe('arenaExpiryFrom', () => {
    it('หมดอายุ 24 ชม. หลังสร้าง', () => {
      const start = new Date('2026-01-01T00:00:00Z');
      const exp = arenaExpiryFrom(start);
      expect(exp.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('isArenaExpired', () => {
    it('เลยเวลาคือหมดอายุ', () => {
      const exp = new Date('2026-01-01T00:00:00Z');
      expect(isArenaExpired(exp, new Date('2026-01-02T00:00:01Z'))).toBe(true);
      expect(isArenaExpired(exp, new Date('2025-12-31T23:59:59Z'))).toBe(false);
    });
    it('null คือยังไม่หมดอายุ', () => {
      expect(isArenaExpired(null)).toBe(false);
    });
  });

  describe('validateRoomName', () => {
    it('ชื่อว่างไม่ผ่าน', () => {
      expect(validateRoomName('').valid).toBe(false);
      expect(validateRoomName('   ').valid).toBe(false);
    });
    it('ชื่อยาวเกิน 60 ไม่ผ่าน', () => {
      expect(validateRoomName('a'.repeat(61)).valid).toBe(false);
      expect(validateRoomName('a'.repeat(60)).valid).toBe(true);
    });
    it('คำหยาบไม่ผ่าน', () => {
      expect(validateRoomName('my fuck room').valid).toBe(false);
    });
    it('ชื่อปกติผ่าน', () => {
      expect(validateRoomName('ห้องนักล่ารูน').valid).toBe(true);
    });
  });

  describe('countTodayJoins', () => {
    it('นับเฉพาะวันนี้', () => {
      const now = new Date('2026-01-02T12:00:00');
      const list = [
        new Date('2026-01-02T01:00:00'),
        new Date('2026-01-02T11:00:00'),
        new Date('2026-01-01T23:00:00'),
      ];
      expect(countTodayJoins(list, now)).toBe(2);
    });
    it('daily cap 20', () => {
      const now = new Date('2026-01-02T12:00:00');
      const list = Array.from({ length: 20 }, () => new Date('2026-01-02T01:00:00'));
      expect(countTodayJoins(list, now)).toBeGreaterThanOrEqual(20);
    });
  });

  // ผู้ใช้สั่ง 2026-09-25: "การเพิ่มทีมเข้ามาในห้อง เก็บค่าเข้า จะจัดเข้ามากี่ครั้งก็ได้"
  describe('arenaJoinPlan — ส่งทีมเข้าห้องซ้ำได้ และคิดค่าเข้าทุกครั้ง', () => {
    it('เข้าครั้งแรก → หักค่าเข้า + สร้างแถวผู้เข้าร่วม', () => {
      expect(arenaJoinPlan({ alreadyJoined: false })).toEqual({ charge: true, mode: 'create', cost: 10 });
    });

    it('ส่งทีมเข้าซ้ำ (เปลี่ยนเด็ค) → หักค่าเข้าใหม่ + อัปเดตแถวเดิม', () => {
      expect(arenaJoinPlan({ alreadyJoined: true })).toEqual({ charge: true, mode: 'update', cost: 10 });
    });

    it('คำขอเดิมยิงซ้ำ (idempotency) → ไม่หักซ้ำ ไม่แตะข้อมูล', () => {
      expect(arenaJoinPlan({ alreadyJoined: false, idempotentDuplicate: true })).toEqual({
        charge: false,
        mode: 'skip',
        cost: 0,
      });
      expect(arenaJoinPlan({ alreadyJoined: true, idempotentDuplicate: true })).toEqual({
        charge: false,
        mode: 'skip',
        cost: 0,
      });
    });

    it('ค่าเข้าตรงกับ ARENA_JOIN_COST (10 Coin)', () => {
      expect(arenaJoinPlan({ alreadyJoined: true }).cost).toBe(10);
    });
  });

  describe('arenaJoinMessage — ข้อความแจ้งผล', () => {
    it('เข้าครั้งแรก → บอกว่าหักไปเท่าไร', () => {
      expect(arenaJoinMessage('ทีมด่วน 1', false, 10)).toContain('เข้าร่วมด้วยทีม "ทีมด่วน 1"');
      expect(arenaJoinMessage('ทีมด่วน 1', false, 10)).toContain('หัก 10 Coin');
    });

    it('เข้าซ้ำ → บอกว่าเปลี่ยนทีม และคิดค่าเข้าทุกครั้ง', () => {
      const msg = arenaJoinMessage('ทีม2', true, 10);
      expect(msg).toContain('เปลี่ยนทีมเป็น "ทีม2"');
      expect(msg).toContain('คิดค่าเข้าทุกครั้ง');
    });
  });
});
