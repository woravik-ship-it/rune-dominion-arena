// SFX tests — Phase 12 (Audio Direction GDD §17) · ปรับปรุง Phase 21
// ทดสอบ pure logic ของตารางเสียง + ตารางที่คำนวณล่วงหน้า (ไม่ต้องมี AudioContext จริง)
import {
  BATTLE_SFX_NAMES,
  battleSfxFor,
  buildReverbImpulse,
  DEFAULT_TONE_ATTACK,
  isBattleSfx,
  isSfxName,
  MAX_TONE_GAIN,
  playSfx,
  REVERB_SECONDS,
  revealSfxFor,
  SFX_BATTLE_GAIN,
  SFX_GAIN_BOOST,
  sfxGainScale,
  sfxJitterCents,
  SFX_NAMES,
  sfxSchedule,
} from '@/lib/sfx';

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

describe('sfxSchedule (คำนวณเสียงก่อนเล่น)', () => {
  test('เสียงหลายชั้น (ui_error) มีเวลาเริ่มไล่กันตาม delay', () => {
    const tones = sfxSchedule('ui_error', { volume: 1, reduceIntense: false });
    expect(tones.length).toBeGreaterThan(1);
    expect(tones[0].at).toBe(0);
    expect(tones[1].at).toBeGreaterThan(tones[0].at);
  });

  test('วอลุ่มสเกลความดังลงตามจริง', () => {
    const full = sfxSchedule('ui_tap', { volume: 1, reduceIntense: false });
    const half = sfxSchedule('ui_tap', { volume: 0.5, reduceIntense: false });
    expect(half[0].gain).toBeCloseTo(full[0].gain / 2, 3);
  });

  test('วอลุ่ม 0 → ไม่มีเสียงให้เล่น', () => {
    expect(sfxSchedule('ui_tap', { volume: 0, reduceIntense: false })).toEqual([]);
  });

  test('"ลดเอฟเฟกต์รุนแรง" เหลือชั้นเดียวและเบาลงครึ่ง', () => {
    const normal = sfxSchedule('card_reveal_legendary', { volume: 1, reduceIntense: false });
    const reduced = sfxSchedule('card_reveal_legendary', { volume: 1, reduceIntense: true });
    expect(reduced.length).toBe(1);
    expect(reduced[0].gain).toBeCloseTo(normal[0].gain / 2, 3);
  });

  test('ทุกเสียงมีค่า gain > 0 (ไม่มีเสียงเงียบในตาราง)', () => {
    for (const name of SFX_NAMES) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      expect(tones.length).toBeGreaterThan(0);
      for (const tone of tones) expect(tone.gain).toBeGreaterThan(0);
    }
  });
});

describe('playSfx (guard กรณีไม่มี audio)', () => {
  test('ไม่มี AudioContext → คืน false ไม่ throw', () => {
    expect(playSfx(null, 'ui_tap', { sfxEnabled: true, volume: 0.7, reduceIntense: false })).toBe(false);
  });

  test('ปิด SFX → ไม่เล่น', () => {
    const fake = { state: 'running', currentTime: 0 } as unknown as AudioContext;
    expect(playSfx(fake, 'ui_tap', { sfxEnabled: false, volume: 0.7, reduceIntense: false })).toBe(false);
  });

  test('วอลุ่ม 0 → ไม่เล่น (ไม่มีเสียงออกจริง)', () => {
    const fake = { state: 'running', currentTime: 0 } as unknown as AudioContext;
    expect(playSfx(fake, 'ui_tap', { sfxEnabled: true, volume: 0, reduceIntense: false })).toBe(false);
  });
});

describe('ตารางเสียง (Audio Direction)', () => {
  test('มีเสียงครบทุกหมวดที่ GDD §17 ระบุ + เสียงใหม่ Phase 21', () => {
    for (const required of [
      'ui_tap', 'ui_back', 'ui_error',
      'rune_select', 'rune_discover',
      'card_reveal_common', 'card_reveal_rare', 'card_reveal_epic', 'card_reveal_legendary',
      'battle_hit', 'battle_win', 'battle_lose',
      'arena_join', 'raid_hit', 'raid_phase', 'reward_claim',
      'coin', 'notify',
    ]) {
      expect(SFX_NAMES).toContain(required);
    }
  });

  test('มีเสียงต่อสู้ตามที่ผู้ใช้ขอ (Phase 22): ดาบ + ปล่อยสกอล', () => {
    for (const required of [
      'battle_sword', 'battle_clash', 'battle_cast',
      'battle_shield', 'battle_burn', 'battle_heal', 'battle_faint',
    ]) {
      expect(SFX_NAMES).toContain(required);
    }
  });

  test('เสียงดาบ/สกอลมี "เสียงรบกวน" ผสม (oscillator ล้วนทำเสียงลม/โลหะไม่ได้)', () => {
    for (const name of ['battle_sword', 'battle_clash', 'battle_cast', 'battle_burn'] as const) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      expect(tones.some((t) => t.noise)).toBe(true);
    }
  });

  test('เสียงดาบมีทั้งส่วนลม (noise) และส่วนคมโลหะ (oscillator) ในเสียงเดียว', () => {
    const tones = sfxSchedule('battle_sword', { volume: 1, reduceIntense: false });
    expect(tones.some((t) => t.noise)).toBe(true);
    expect(tones.some((t) => t.freq !== undefined && t.type !== undefined)).toBe(true);
  });

  test('ชื่อเสียงไม่ซ้ำกัน', () => {
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length);
  });

  test('isSfxName ตรวจชื่อได้ถูกต้อง (ใช้กับ debug API)', () => {
    expect(isSfxName('ui_tap')).toBe(true);
    expect(isSfxName('battle_sword')).toBe(true);
    expect(isSfxName('not_a_sound')).toBe(false);
  });
});

describe('battleSfxFor (เลือกเสียงตามเหตุการณ์ในเทปต่อสู้ — Phase 22)', () => {
  test('โจมตี → เสียงดาบ', () => {
    expect(battleSfxFor('attack')).toBe('battle_sword');
  });

  test('ใช้สกิล → เสียงปล่อยสกอล (สกิลโล่ใช้เสียงกางโล่)', () => {
    expect(battleSfxFor('skill')).toBe('battle_cast');
    expect(battleSfxFor('skill', 'BURN')).toBe('battle_cast');
    expect(battleSfxFor('skill', 'WEAKEN')).toBe('battle_cast');
    expect(battleSfxFor('skill', 'SHIELD')).toBe('battle_shield');
  });

  test('เหตุการณ์อื่นมีเสียงเฉพาะตัว', () => {
    expect(battleSfxFor('burn')).toBe('battle_burn');
    expect(battleSfxFor('heal')).toBe('battle_heal');
    expect(battleSfxFor('faint')).toBe('battle_faint');
  });

  test('เหตุการณ์ที่ไม่ต้องมีเสียง (info/ไม่รู้จัก) → null', () => {
    expect(battleSfxFor('info')).toBeNull();
    expect(battleSfxFor('something_else')).toBeNull();
  });

  // Phase 24.2 — ผู้ใช้สั่ง 2026-09-26: "เสียง ไม่สมจริง" (เล่นเสียงเดิมซ้ำทุกครั้ง = ฟังออกว่าเทป)
  test('โจมตีสลับเสียง ดาบ ↔ ดาบกระทบดาบ (ทุกครั้งที่ 3)', () => {
    const names = [0, 1, 2, 3, 4, 5].map((i) => battleSfxFor('attack', null, i));
    expect(names).toEqual([
      'battle_sword', 'battle_sword', 'battle_clash',
      'battle_sword', 'battle_sword', 'battle_clash',
    ]);
  });

  test('hitIndex เพี้ยน (NaN/ติดลบ) → ยังใช้เสียงดาบได้ ไม่พังเทป', () => {
    expect(battleSfxFor('attack', null, Number.NaN)).toBe('battle_sword');
    expect(battleSfxFor('attack', null, -4)).toBe('battle_sword');
  });
});

describe('ความดังของเสียง (Phase 22 — ผู้ใช้แจ้ง "เปิดสุดแทบไม่ได้ยิน")', () => {
  test('ตัวคูณ SFX ทำให้เสียงดังกว่าค่าตารางเดิม', () => {
    expect(SFX_GAIN_BOOST).toBeGreaterThan(1.5);
  });

  test('เสียงกดปุ่มทั่วไปดังพอได้ยินที่วอลุ่มเต็ม (≥ 0.15)', () => {
    const tones = sfxSchedule('ui_tap', { volume: 1, reduceIntense: false });
    expect(tones[0].gain).toBeGreaterThanOrEqual(0.15);
  });

  test('เสียงดังกว่าค่าที่ออกแบบไว้ในตาราง (มีการขยายจริง)', () => {
    // ค่าตาราง ui_tap = 0.128 → ต้องได้มากกว่านั้นหลังคูณตัวขยาย
    expect(sfxSchedule('ui_tap', { volume: 1, reduceIntense: false })[0].gain).toBeGreaterThan(0.128);
  });

  test('ไม่มีเสียงไหนเกินเพดาน (กันเสียงแตกเมื่อหลายชั้นซ้อน)', () => {
    for (const name of SFX_NAMES) {
      for (const tone of sfxSchedule(name, { volume: 1, reduceIntense: false })) {
        expect(tone.gain).toBeLessThanOrEqual(MAX_TONE_GAIN);
      }
    }
  });
});

// Phase 24.2 — ผู้ใช้สั่ง 2026-09-26: "เสียงต่อสู้ เบา เสียง ไม่สมจริง แก้ไขด้วย"
describe('เสียงต่อสู้ดังขึ้น + สมจริงขึ้น (Phase 24.2)', () => {
  test('กลุ่มเสียงต่อสู้ถูกยกความดังเฉพาะกลุ่ม (UI ไม่ถูกแตะ)', () => {
    expect(SFX_BATTLE_GAIN).toBeGreaterThan(1);
    for (const name of BATTLE_SFX_NAMES) {
      expect(isBattleSfx(name)).toBe(true);
      expect(sfxGainScale(name)).toBe(SFX_BATTLE_GAIN);
    }
    expect(isBattleSfx('ui_tap')).toBe(false);
    expect(sfxGainScale('ui_tap')).toBe(1);
    expect(sfxGainScale('card_reveal_legendary')).toBe(1);
  });

  test('ชื่อใน BATTLE_SFX_NAMES มีอยู่จริงทุกตัว และไม่ซ้ำ', () => {
    expect(new Set(BATTLE_SFX_NAMES).size).toBe(BATTLE_SFX_NAMES.length);
    for (const name of BATTLE_SFX_NAMES) expect(isSfxName(name)).toBe(true);
  });

  test('เสียงต่อสู้ดังกว่าเดิมจริง (เทียบกับ UI ที่ค่าเดียวกัน)', () => {
    const battle = sfxSchedule('battle_sword', { volume: 1, reduceIntense: false });
    const boost = SFX_GAIN_BOOST * SFX_BATTLE_GAIN;
    // ชั้นแรกของดาบ (noise ลมดาบ) = ค่าตาราง 0.16 × ตัวขยาย
    expect(battle[0].gain).toBeCloseTo(Math.min(MAX_TONE_GAIN, 0.16 * boost), 4);
  });

  test('ทุกเสียงต่อสู้มี "แรงกระแทก" คม (attack ≤ 5ms) อย่างน้อยหนึ่งชั้น', () => {
    for (const name of BATTLE_SFX_NAMES) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      expect(Math.min(...tones.map((t) => t.attack))).toBeLessThanOrEqual(0.005);
    }
  });

  test('ทุกเสียงต่อสู้มี "เนื้อเสียง" ยาวพอ — ไม่ใช่ click แห้ง', () => {
    for (const name of BATTLE_SFX_NAMES) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      const spanMs = (Math.max(...tones.map((t) => t.at + t.dur)) - Math.min(...tones.map((t) => t.at))) * 1000;
      expect(spanMs).toBeGreaterThanOrEqual(150);
    }
  });

  test('ทุกเสียงต่อสู้มีพลังงานย่านที่มือถือออกได้ (250–4000Hz)', () => {
    for (const name of BATTLE_SFX_NAMES) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      const inBand = tones.some((tone) => {
        if (tone.freq !== undefined) return tone.freq >= 250 && tone.freq <= 4000;
        if (tone.noise) {
          return (tone.noise.frequency >= 250 || (tone.noise.slideTo ?? 0) >= 250);
        }
        return false;
      });
      expect({ name, inBand }).toEqual({ name, inBand: true });
    }
  });

  test('ทุกเสียงต่อสู้มีหางเสียงสะท้อน (reverb > 0) — เอาความแห้ง/ความสังเคราะห์ออก', () => {
    for (const name of BATTLE_SFX_NAMES) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      expect(Math.max(...tones.map((t) => t.reverb))).toBeGreaterThan(0);
    }
  });

  test('เสียง UI ไม่มี reverb (ต้องคมและแห้ง — ไม่ก้อง)', () => {
    for (const name of ['ui_tap', 'ui_back', 'ui_error', 'coin', 'notify'] as const) {
      const tones = sfxSchedule(name, { volume: 1, reduceIntense: false });
      expect(tones.every((t) => t.reverb === 0)).toBe(true);
    }
  });

  test('ค่า attack ของทุกเสียงสมเหตุสมผล (ไม่ยาวเกินครึ่งของเสียง)', () => {
    for (const name of SFX_NAMES) {
      for (const tone of sfxSchedule(name, { volume: 1, reduceIntense: false })) {
        expect(tone.attack).toBeGreaterThan(0);
        expect(tone.attack).toBeLessThanOrEqual(tone.dur * 0.5);
      }
    }
  });

  test('เสียงที่ไม่ระบุ attack ใช้ค่าเดิม (0.008) — ไม่กระทบเสียงเดิม', () => {
    const tones = sfxSchedule('ui_tap', { volume: 1, reduceIntense: false });
    expect(tones[0].attack).toBe(DEFAULT_TONE_ATTACK);
  });

  test('เสียงต่อสู้มี jitter (ไม่ซ้ำเป๊ะทุกครั้ง) · เสียง UI ไม่มี', () => {
    expect(sfxJitterCents('battle_sword')).toBeGreaterThan(0);
    expect(sfxJitterCents('ui_tap')).toBe(0);
  });

  test('"ลดเอฟเฟกต์รุนแรง" ยังทำงานกับเสียงต่อสู้ (เบาลงครึ่ง + เหลือชั้นเดียว)', () => {
    const normal = sfxSchedule('battle_clash', { volume: 1, reduceIntense: false });
    const reduced = sfxSchedule('battle_clash', { volume: 1, reduceIntense: true });
    expect(reduced.length).toBe(1);
    expect(reduced[0].gain).toBeCloseTo(normal[0].gain / 2, 3);
  });
});

describe('buildReverbImpulse (เสียงสะท้อนห้องสร้างเอง — Phase 24.2)', () => {
  test('ความยาวตรงกับวินาที × sampleRate', () => {
    expect(buildReverbImpulse(48000, 0.5).length).toBe(24000);
    expect(buildReverbImpulse(44100, REVERB_SECONDS).length).toBe(Math.floor(44100 * REVERB_SECONDS));
  });

  test('จางลงตามเวลา (ช่วงต้นดังกว่าช่วงท้ายมาก)', () => {
    const impulse = buildReverbImpulse(48000, 0.5, 3.2, () => 1); // random = 1 → ทุก sample = +falloff
    const head = impulse[Math.floor(impulse.length * 0.02)];
    const tail = impulse[impulse.length - 1];
    expect(head).toBeGreaterThan(0);
    expect(tail).toBeLessThan(head * 0.05);
  });

  test('ค่าอยู่ในช่วง -1..1 และไม่เป็น NaN', () => {
    const impulse = buildReverbImpulse(8000, 0.2);
    for (const value of impulse) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
  });

  test('ใส่ random เองได้ (ทำซ้ำได้ → เทสต์ได้)', () => {
    const a = buildReverbImpulse(100, 0.1, 2, () => 0.25);
    const b = buildReverbImpulse(100, 0.1, 2, () => 0.25);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test('ค่ายาวเกิน/สั้นเกินถูกกันไว้ (ไม่สร้างบัฟเฟอร์ 0)', () => {
    expect(buildReverbImpulse(48000, 0).length).toBeGreaterThan(0);
    expect(buildReverbImpulse(48000, -3).length).toBeGreaterThan(0);
  });
});

