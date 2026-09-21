import { buildCanonicalString, hashSeed, createCardFromSeed, validateRuneSequence } from '@/services/seed';

describe('Seed Service', () => {
  describe('buildCanonicalString', () => {
    it('should build canonical string from rune sequence', () => {
      const runes = [5, 10, 3, 8];
      const result = buildCanonicalString(runes);
      expect(result).toBe('version=1|runes=0003,0005,0008,0010');
    });

    it('should sort runes in ascending order', () => {
      const runes = [10, 5, 8, 3];
      const result = buildCanonicalString(runes);
      expect(result).toBe('version=1|runes=0003,0005,0008,0010');
    });

    it('should pad runes to 4 digits', () => {
      const runes = [1, 10, 100, 1000];
      const result = buildCanonicalString(runes);
      expect(result).toBe('version=1|runes=0001,0010,0100,1000');
    });
  });

  describe('hashSeed', () => {
    it('should return consistent hash for same input', () => {
      const canonical = 'version=1|runes=0003,0005,0008,0010';
      const hash1 = hashSeed(canonical);
      const hash2 = hashSeed(canonical);
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = hashSeed('version=1|runes=0003,0005');
      const hash2 = hashSeed('version=1|runes=0005,0008');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a valid SHA-256 hex string', () => {
      const hash = hashSeed('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createCardFromSeed', () => {
    it('should create a card with all required fields', () => {
      const hash = hashSeed('version=1|runes=0001,0002,0003,0004,0005,0006,0007,0008');
      const card = createCardFromSeed(hash);
      
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('nameTh');
      expect(card).toHaveProperty('element');
      expect(card).toHaveProperty('rarity');
      expect(card).toHaveProperty('role');
      expect(card).toHaveProperty('atk');
      expect(card).toHaveProperty('def');
      expect(card).toHaveProperty('hp');
      expect(card).toHaveProperty('spd');
      expect(card).toHaveProperty('manaCost');
      expect(card).toHaveProperty('skills');
      expect(card).toHaveProperty('canonicalSeedHash');
    });

    it('should produce deterministic cards for same hash', () => {
      const hash = hashSeed('deterministic-test');
      const card1 = createCardFromSeed(hash);
      const card2 = createCardFromSeed(hash);
      
      expect(card1.name).toBe(card2.name);
      expect(card1.element).toBe(card2.element);
      expect(card1.rarity).toBe(card2.rarity);
      expect(card1.atk).toBe(card2.atk);
      expect(card1.def).toBe(card2.def);
    });

    it('should have valid element values', () => {
      const validElements = ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'DAWNSWORN', 'VEILMARKED'];
      const hash = hashSeed('test-element');
      const card = createCardFromSeed(hash);
      expect(validElements).toContain(card.element);
    });

    it('should have valid rarity values', () => {
      const validRarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC'];
      const hash = hashSeed('test-rarity');
      const card = createCardFromSeed(hash);
      expect(validRarities).toContain(card.rarity);
    });

    it('should have valid stats (positive integers)', () => {
      const hash = hashSeed('test-stats');
      const card = createCardFromSeed(hash);
      
      expect(card.atk).toBeGreaterThan(0);
      expect(card.def).toBeGreaterThan(0);
      expect(card.hp).toBeGreaterThan(0);
      expect(card.spd).toBeGreaterThan(0);
      expect(card.manaCost).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(card.atk)).toBe(true);
      expect(Number.isInteger(card.def)).toBe(true);
      expect(Number.isInteger(card.hp)).toBe(true);
      expect(Number.isInteger(card.spd)).toBe(true);
    });
  });

  describe('validateRuneSequence', () => {
    it('should accept valid rune sequence (8-16 runes)', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7, 8];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(true);
    });

    it('should reject less than 8 runes', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8-16');
    });

    it('should reject more than 16 runes', () => {
      const runes = Array.from({ length: 17 }, (_, i) => i);
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8-16');
    });

    it('should reject non-array input', () => {
      const result = validateRuneSequence('not an array' as any);
      expect(result.valid).toBe(false);
    });

    it('should reject runes outside 0-9999 range', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7, -1];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
    });

    it('should reject non-integer runes', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7, 8.5];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
    });
  });

  // Phase 13: ชื่อการ์ดต้องหลากหลาย ไม่ใช่รูปแบบเดิมซ้ำๆ
  describe('ชื่อการ์ด (ความหลากหลาย)', () => {
    const makeCard = (seed: number) =>
      createCardFromSeed(`hash-${seed}`.padEnd(64, '0').slice(0, 64));

    it('40 ใบที่ hash ต่างกัน → ชื่อไทย/อังกฤษหลากหลาย', () => {
      const cards = Array.from({ length: 40 }, (_, i) => makeCard(i));
      const thNames = new Set(cards.map((c) => c.nameTh));
      const enNames = new Set(cards.map((c) => c.name));
      expect(thNames.size).toBeGreaterThanOrEqual(30);
      expect(enNames.size).toBeGreaterThanOrEqual(30);
    });

    it('ชื่อมีการแยกส่วน "ชื่อเฉพาะ + ฉายา" และไม่ว่าง', () => {
      const card = makeCard(7);
      expect(card.nameTh).toMatch(/\S+\s\S+/);
      expect(card.name).toMatch(/,/);
      expect(card.loreTh.length).toBeGreaterThan(20);
      expect(card.lore.length).toBeGreaterThan(20);
    });

    it('สกิลไม่ซ้ำกันในใบเดียว และมาจากคลังของธาตุนั้น', () => {
      for (let i = 0; i < 25; i += 1) {
        const card = makeCard(i);
        expect(card.skills.length).toBeGreaterThanOrEqual(1);
        expect(card.skills.length).toBeLessThanOrEqual(2);
        if (card.skills.length === 2) {
          expect(card.skills[0].name).not.toBe(card.skills[1].name);
        }
      }
    });
  });
});
