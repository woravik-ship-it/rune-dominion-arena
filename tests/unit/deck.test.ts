import { validateDeck, validatePositions, calculateTeamPower, getLineupForPosition, planQuickAdd, buildLegalTeam } from '@/services/deck';

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

  // Phase 13: ปุ่ม "เพิ่มลงทีม" — ตรรกะวางแผนแบบ pure
  describe('planQuickAdd / buildLegalTeam', () => {
    const card = (id: string, element = 'EMBERBOUND') => mk(id, element);

    it('การ์ดอยู่ในทีมแล้ว → already-in-deck (ไม่เพิ่มซ้ำ)', () => {
      const plan = planQuickAdd({
        card: card('c1'),
        decks: [{ id: 'd1', name: 'ทีม 1', positions: [0, 1], slots: [card('c1'), card('c2', 'TIDEBORN')] }],
        owned: [],
      });
      expect(plan.action).toBe('already-in-deck');
    });

    it('มีทีมที่ยังไม่ครบ 5 ใบและเพิ่มได้ → add-to-deck ที่ช่องว่างแรก', () => {
      const plan = planQuickAdd({
        card: card('c9', 'SKYRIVEN'),
        decks: [{
          id: 'd1',
          name: 'ทีม 1',
          positions: [0, 1, 3],
          slots: [card('c1'), card('c2', 'TIDEBORN'), card('c3', 'ROOTFORGED')],
        }],
        owned: [],
      });
      expect(plan).toMatchObject({ action: 'add-to-deck', deckId: 'd1', position: 2, filled: 4 });
    });

    it('ทีมที่ธาตุเดียวกันครบ 3 ใบแล้ว → ไม่เติมเข้าทีมนั้น (สร้างทีมใหม่แทน)', () => {
      const plan = planQuickAdd({
        card: card('c9', 'EMBERBOUND'),
        decks: [{
          id: 'd1',
          name: 'ทีมไฟ',
          positions: [0, 1, 2],
          slots: [card('c1'), card('c2'), card('c3')],
        }],
        owned: [card('c1'), card('c2'), card('c3'), card('c4', 'TIDEBORN'), card('c5', 'SKYRIVEN')],
      });
      expect(plan.action).toBe('create-deck');
    });

    it('ยังไม่มีทีม + มีการ์ดในคลังครบ 5 ใบ → สร้างทีมใหม่ที่ผ่านกติกา', () => {
      const owned = [
        card('c1', 'EMBERBOUND'), card('c2', 'EMBERBOUND'), card('c3', 'TIDEBORN'),
        card('c4', 'SKYRIVEN'), card('c5', 'ROOTFORGED'),
      ];
      const plan = planQuickAdd({ card: card('c1', 'EMBERBOUND'), decks: [], owned });
      expect(plan.action).toBe('create-deck');
      if (plan.action === 'create-deck') {
        expect(plan.slots).toHaveLength(5);
        expect(plan.slots.some((c) => c.cardId === 'c1')).toBe(true);
        expect(validateDeck(plan.slots).valid).toBe(true);
      }
    });

    it('การ์ดในคลังไม่พอจัดทีม → impossible พร้อมเหตุผล', () => {
      const owned = [card('c1'), card('c2'), card('c3')];
      const plan = planQuickAdd({ card: card('c1'), decks: [], owned });
      expect(plan.action).toBe('impossible');
      if (plan.action === 'impossible') expect(plan.reason).toContain('5');
    });

    it('buildLegalTeam กระจายธาตุไม่ให้เกิน 3 ใบต่อธาตุ', () => {
      // มีไฟ 6 ใบ + น้ำ 2 + ลม 1 → ต้องเลือกไฟไม่เกิน 3 ใบถึงจะผ่านกติกา
      const owned = [
        card('c1', 'EMBERBOUND'), card('c2', 'EMBERBOUND'), card('c3', 'EMBERBOUND'),
        card('c4', 'EMBERBOUND'), card('c5', 'EMBERBOUND'), card('c6', 'EMBERBOUND'),
        card('c7', 'TIDEBORN'), card('c8', 'TIDEBORN'), card('c9', 'SKYRIVEN'),
      ];
      const team = buildLegalTeam(owned, card('c1', 'EMBERBOUND'));

      expect(team).not.toBeNull();
      const chosen = team as ReturnType<typeof mk>[];
      expect(validateDeck(chosen).valid).toBe(true);
      expect(chosen.filter((c) => c.element === 'EMBERBOUND').length).toBeLessThanOrEqual(3);
      expect(chosen.some((c) => c.cardId === 'c1')).toBe(true);
    });

    it('คลังมีธาตุเดียวและต้องใส่ใบที่เพิ่งได้ → จัดทีมไม่ได้ (คืน null)', () => {
      const owned = [card('c1'), card('c2'), card('c3'), card('c4'), card('c5')];
      expect(buildLegalTeam(owned, card('c1'))).toBeNull();
    });
  });
});
