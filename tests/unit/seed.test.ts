import { buildCanonicalString, hashSeed, createCardFromSeed, validateRuneSequence } from '@/services/seed';

describe('Seed Service', () => {
  describe('buildCanonicalString', () => {
    it('should build canonical string with sorted and padded runes', () => {
      const runes = [182, 9931, 2045, 18, 5031, 744, 8800, 19];
      const result = buildCanonicalString(runes);
      expect(result).toBe('version=1|runes=0018,0019,0182,0744,2045,5031,8800,9931');
    });

    it('should handle single rune', () => {
      const runes = [42];
      const result = buildCanonicalString(runes);
      expect(result).toBe('version=1|runes=0042');
    });

    it('should handle runes at boundaries', () => {
      const runes = [0, 9999];
      const result = buildCanonicalString(runes);
      expect(result).toBe('version=1|runes=0000,9999');
    });
  });

  describe('hashSeed', () => {
    it('should produce consistent hash for same input', () => {
      const input = 'version=1|runes=0018,0019,0182,0744';
      const hash1 = hashSeed(input);
      const hash2 = hashSeed(input);
      expect(hash1).toBe(hash2);
    });

    it('should produce 64 character hex string', () => {
      const input = 'version=1|runes=0018,0019,0182,0744';
      const hash = hashSeed(input);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different inputs', () => {
      const input1 = 'version=1|runes=0018,0019';
      const input2 = 'version=1|runes=0019,0018';
      const hash1 = hashSeed(input1);
      const hash2 = hashSeed(input2);
      expect(hash1).toBe(hash2); // Same runes, same order after sorting
    });
  });

  describe('createCardFromSeed', () => {
    it('should create deterministic card from same hash', () => {
      const hash = 'abc123def456';
      const card1 = createCardFromSeed(hash);
      const card2 = createCardFromSeed(hash);
      expect(card1).toEqual(card2);
    });

    it('should create different cards from different hashes', () => {
      const hash1 = 'abc123def456';
      const hash2 = 'xyz789uvw012';
      const card1 = createCardFromSeed(hash1);
      const card2 = createCardFromSeed(hash2);
      expect(card1.name).not.toBe(card2.name);
    });

    it('should have valid element', () => {
      const hash = 'test-hash';
      const card = createCardFromSeed(hash);
      expect(['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'DAWNSWORN', 'VEILMARKED']).toContain(card.element);
    });

    it('should have valid rarity', () => {
      const hash = 'test-hash';
      const card = createCardFromSeed(hash);
      expect(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']).toContain(card.rarity);
    });

    it('should have valid role', () => {
      const hash = 'test-hash';
      const card = createCardFromSeed(hash);
      expect(['WARRIOR', 'MAGE', 'HEALER', 'TANK', 'ASSASSIN', 'SUPPORT']).toContain(card.role);
    });

    it('should have positive stats', () => {
      const hash = 'test-hash';
      const card = createCardFromSeed(hash);
      expect(card.atk).toBeGreaterThan(0);
      expect(card.def).toBeGreaterThan(0);
      expect(card.hp).toBeGreaterThan(0);
      expect(card.spd).toBeGreaterThan(0);
      expect(card.manaCost).toBeGreaterThan(0);
    });

    it('should have at least one skill', () => {
      const hash = 'test-hash';
      const card = createCardFromSeed(hash);
      expect(card.skills.length).toBeGreaterThanOrEqual(1);
    });

    it('should include canonical seed hash', () => {
      const hash = 'test-hash';
      const card = createCardFromSeed(hash);
      expect(card.canonicalSeedHash).toBe(hash);
    });
  });

  describe('validateRuneSequence', () => {
    it('should accept valid sequence with 8 runes', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7, 8];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(true);
    });

    it('should accept valid sequence with 16 runes', () => {
      const runes = Array.from({ length: 16 }, (_, i) => i);
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(true);
    });

    it('should reject sequence with less than 8 runes', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8-16');
    });

    it('should reject sequence with more than 16 runes', () => {
      const runes = Array.from({ length: 17 }, (_, i) => i);
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8-16');
    });

    it('should reject non-integer runes', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7, 8.5];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('integer');
    });

    it('should reject runes below 0', () => {
      const runes = [-1, 2, 3, 4, 5, 6, 7, 8];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0 and 9999');
    });

    it('should reject runes above 9999', () => {
      const runes = [1, 2, 3, 4, 5, 6, 7, 10000];
      const result = validateRuneSequence(runes);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('0 and 9999');
    });

    it('should reject non-array input', () => {
      const result = validateRuneSequence('not an array' as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('array');
    });
  });
});
