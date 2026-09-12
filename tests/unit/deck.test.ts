import { validateDeck, validatePositions, calculateTeamPower, getLineupForPosition } from '@/services/deck';

const mk = (
  cardId: string,
  element = 'EMBERBOUND',
  stats = { atk: 100, def: 80, hp: 200, spd: 50 }
) => ({ cardId, element, ...stats });

describe('Deck Builder Service', () => {
  describe('validateDeck', () => {
    it('ทีม 5 ใบถูกต้อง ผ่าน', () => {
      const cards = [
        mk('c1', 'EMBERBOUND'),
        mk('c2', 'TIDEBORN'),
        mk('c3', 'SKYRIVEN'),
        mk('c4', 'ROOTFORGED'),
        mk('c5', 'DAWNSWORN'),
      ];
      expect(validateDeck(cards).valid).toBe(true);
    });

    it('ทีมไม่ครบ 5 ใบ ไม่ผ่าน', () => {
      const result = validateDeck([mk('c1'), mk('c2'), mk('c3')]);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('5 ใบ');
    });

    it('ทีมเกิน 5 ใบ ไม่ผ่าน', () => {
      const cards = [mk('c1'), mk('c2'), mk('c3'), mk('c4'), mk('c5'), mk('c6')];
      expect(validateDeck(cards).valid).toBe(false);
    });

    it('การ์ดซ้ำ ไม่ผ่าน', () => {
      const cards = [mk('c1'), mk('c1'), mk('c3'), mk('c4'), mk('c5')];
      const result = validateDeck(cards);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('ซ้ำ');
    });

    it('ธาตุเดียวกันเกิน 3 ใบ ไม่ผ่าน', () => {
      const cards = [
        mk('c1', 'EMBERBOUND'),
        mk('c2', 'EMBERBOUND'),
        mk('c3', 'EMBERBOUND'),
        mk('c4', 'EMBERBOUND'),
        mk('c5', 'TIDEBORN'),
      ];
      const result = validateDeck(cards);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toContain('EMBERBOUND');
    });

    it('ธาตุเดียวกัน 3 ใบพอดี ผ่าน', () => {
      const cards = [
        mk('c1', 'EMBERBOUND'),
        mk('c2', 'EMBERBOUND'),
        mk('c3', 'EMBERBOUND'),
        mk('c4', 'TIDEBORN'),
        mk('c5', 'SKYRIVEN'),
      ];
      expect(validateDeck(cards).valid).toBe(true);
    });
  });

  describe('calculateTeamPower', () => {
    it('รวมสเตตัสทั้งหมดเป็น Integer', () => {
      const cards = [mk('c1'), mk('c2')];
      // 100+80+200+50 = 430 ต่อใบ × 2 = 860
      expect(calculateTeamPower(cards)).toBe(860);
    });

    it('ทีมว่างพลังเป็น 0', () => {
      expect(calculateTeamPower([])).toBe(0);
    });

    it('ปัดค่าทศนิยมทิ้ง (Integer only)', () => {
      const cards = [{ cardId: 'c1', element: 'EMBERBOUND', atk: 10.9, def: 5.5, hp: 20.2, spd: 3.7 }];
      expect(calculateTeamPower(cards)).toBe(10 + 5 + 20 + 3);
      expect(Number.isInteger(calculateTeamPower(cards))).toBe(true);
    });
  });

  describe('getLineupForPosition', () => {
    it('0,1 = FRONTLINE / 2,3 = MIDLINE / 4 = BACKLINE', () => {
      expect(getLineupForPosition(0)).toBe('FRONTLINE');
      expect(getLineupForPosition(1)).toBe('FRONTLINE');
      expect(getLineupForPosition(2)).toBe('MIDLINE');
      expect(getLineupForPosition(3)).toBe('MIDLINE');
      expect(getLineupForPosition(4)).toBe('BACKLINE');
    });
  });

  describe('validatePositions', () => {
    it('ตำแหน่ง 0-4 ครบ ผ่าน', () => {
      expect(validatePositions([0, 1, 2, 3, 4]).valid).toBe(true);
    });

    it('ตำแหน่งซ้ำ ไม่ผ่าน', () => {
      expect(validatePositions([0, 0, 2, 3, 4]).valid).toBe(false);
    });

    it('ตำแหน่งเกิน 4 ไม่ผ่าน', () => {
      expect(validatePositions([0, 1, 2, 3, 5]).valid).toBe(false);
    });

    it('ไม่ครบ 5 ตำแหน่ง ไม่ผ่าน', () => {
      expect(validatePositions([0, 1, 2]).valid).toBe(false);
    });
  });
});
