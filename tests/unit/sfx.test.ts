// SFX tests — Phase 12 (Audio Direction GDD §17)
// ทดสอบ pure logic ของตารางเสียง (ไม่ต้องมี AudioContext จริง)
import { playSfx, revealSfxFor, SFX_NAMES } from '@/lib/sfx';

describe('revealSfxFor (Card Reveal แยกตาม Rarity)', () => {
  test('rarity สูง → เสียงระดับสูงขึ้น', () => {
    expect(revealSfxFor('COMMON')).toBe('card_reveal_common');
    expect(revealSfxFor('UNCOMMON')).toBe('card_reveal_common');
    expect(revealSfxFor('RARE')).toBe('card_reveal_rare');
    expect(revealSfxFor('EPIC')).toBe('card_reveal_epic');
    expect(revealSfxFor('LEGENDARY')).toBe('card_reveal_legendary');
    expect(revealSfxFor('MYTHIC')).toBe('card_reveal_legendary');
  });

  test('rarity ที่ไม่รู้จัก → fallback เป็นระดับธรรมดา', () => {
    expect(revealSfxFor('UNKNOWN')).toBe('card_reveal_common');
    expect(revealSfxFor('')).toBe('card_reveal_common');
  });
});

describe('playSfx (guard กรณีไม่มี/ยังไม่ปลดล็อก audio)', () => {
  test('ไม่มี AudioContext → คืน false ไม่ throw', () => {
    expect(playSfx(null, 'ui_tap', { sfxEnabled: true, volume: 0.7, reduceIntense: false })).toBe(false);
  });

  test('ปิด SFX → ไม่เล่น', () => {
    const fake = { state: 'running', currentTime: 0 } as unknown as AudioContext;
    expect(playSfx(fake, 'ui_tap', { sfxEnabled: false, volume: 0.7, reduceIntense: false })).toBe(false);
  });

  test('audio ยังถูก suspend (autoplay block) → ไม่เล่น', () => {
    const fake = { state: 'suspended', currentTime: 0 } as unknown as AudioContext;
    expect(playSfx(fake, 'ui_tap', { sfxEnabled: true, volume: 0.7, reduceIntense: false })).toBe(false);
  });
});

describe('ตารางเสียง (Audio Direction)', () => {
  test('มีเสียงครบทุกหมวดที่ GDD §17 ระบุ', () => {
    for (const required of [
      'ui_tap', 'ui_back', 'ui_error',
      'rune_select', 'rune_discover',
      'card_reveal_common', 'card_reveal_rare', 'card_reveal_epic', 'card_reveal_legendary',
      'battle_hit', 'battle_win', 'battle_lose',
      'arena_join', 'raid_hit', 'raid_phase', 'reward_claim',
    ]) {
      expect(SFX_NAMES).toContain(required);
    }
  });

  test('ชื่อเสียงไม่ซ้ำกัน', () => {
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length);
  });
});
