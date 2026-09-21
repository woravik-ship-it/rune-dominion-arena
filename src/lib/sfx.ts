'use client';

// SFX Engine — Phase 12 (Audio Direction GDD §17)
// ใช้ Web Audio API สังเคราะห์เสียงเอง (ไม่ต้องมีไฟล์เสียง/License)
// รองรับ: Music / SFX / Ambience toggle + Reduce Intense Effects (accessibility)
// หมายเหตุสำคัญ: ต้องถูก "ปลดล็อก" ด้วย interaction แรกของผู้ใช้ (เบราว์เซอร์บล็อก autoplay)

export type SfxName =
  | 'ui_tap'        // กดปุ่มทั่วไป
  | 'ui_back'       // ย้อนกลับ
  | 'ui_error'      // ผิดพลาด
  | 'rune_select'   // เลือกรูน
  | 'rune_discover' // กดถอดรหัสรูน
  | 'card_reveal_common'
  | 'card_reveal_rare'
  | 'card_reveal_epic'
  | 'card_reveal_legendary'
  | 'battle_hit'
  | 'battle_win'
  | 'battle_lose'
  | 'arena_join'
  | 'raid_hit'
  | 'raid_phase'
  | 'reward_claim';

interface ToneSpec {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  /** เลื่อนขึ้น/ลงระหว่างเล่น (0 = คงที่) */
  slideTo?: number;
  delay?: number;
}

// ตารางเสียง: ออกแบบให้สั้น (0.06–0.5 วิ) และเบา (≤0.18 gain) ตาม Mobile Web
const SFX_TABLE: Record<SfxName, ToneSpec[]> = {
  ui_tap: [{ freq: 520, dur: 0.06, type: 'triangle', gain: 0.08 }],
  ui_back: [{ freq: 380, dur: 0.08, type: 'triangle', gain: 0.07, slideTo: 300 }],
  ui_error: [
    { freq: 200, dur: 0.12, type: 'sawtooth', gain: 0.10 },
    { freq: 160, dur: 0.16, type: 'sawtooth', gain: 0.09, delay: 0.10 },
  ],
  rune_select: [{ freq: 660, dur: 0.07, type: 'sine', gain: 0.07, slideTo: 880 }],
  rune_discover: [
    { freq: 300, dur: 0.25, type: 'sine', gain: 0.09, slideTo: 720 },
    { freq: 480, dur: 0.35, type: 'triangle', gain: 0.06, delay: 0.12, slideTo: 960 },
  ],
  card_reveal_common: [{ freq: 520, dur: 0.20, type: 'sine', gain: 0.09 }],
  card_reveal_rare: [
    { freq: 520, dur: 0.18, type: 'sine', gain: 0.09 },
    { freq: 660, dur: 0.22, type: 'sine', gain: 0.08, delay: 0.12 },
  ],
  card_reveal_epic: [
    { freq: 520, dur: 0.16, type: 'triangle', gain: 0.09 },
    { freq: 660, dur: 0.16, type: 'triangle', gain: 0.09, delay: 0.10 },
    { freq: 880, dur: 0.28, type: 'triangle', gain: 0.08, delay: 0.20 },
  ],
  card_reveal_legendary: [
    { freq: 440, dur: 0.16, type: 'sine', gain: 0.10 },
    { freq: 660, dur: 0.16, type: 'sine', gain: 0.10, delay: 0.10 },
    { freq: 880, dur: 0.18, type: 'sine', gain: 0.10, delay: 0.20 },
    { freq: 1320, dur: 0.40, type: 'sine', gain: 0.09, delay: 0.30 },
  ],
  battle_hit: [
    { freq: 180, dur: 0.09, type: 'square', gain: 0.08 },
    { freq: 120, dur: 0.12, type: 'triangle', gain: 0.07, delay: 0.05 },
  ],
  battle_win: [
    { freq: 660, dur: 0.16, type: 'triangle', gain: 0.10 },
    { freq: 880, dur: 0.30, type: 'triangle', gain: 0.09, delay: 0.14 },
  ],
  battle_lose: [
    { freq: 330, dur: 0.20, type: 'sine', gain: 0.09, slideTo: 220 },
    { freq: 220, dur: 0.35, type: 'sine', gain: 0.08, delay: 0.18, slideTo: 150 },
  ],
  arena_join: [
    { freq: 440, dur: 0.14, type: 'triangle', gain: 0.09 },
    { freq: 590, dur: 0.24, type: 'triangle', gain: 0.08, delay: 0.12 },
  ],
  raid_hit: [
    { freq: 140, dur: 0.14, type: 'sawtooth', gain: 0.10 },
    { freq: 90, dur: 0.22, type: 'sawtooth', gain: 0.09, delay: 0.08 },
  ],
  raid_phase: [
    { freq: 300, dur: 0.20, type: 'square', gain: 0.08, slideTo: 180 },
    { freq: 200, dur: 0.40, type: 'sawtooth', gain: 0.07, delay: 0.18, slideTo: 120 },
  ],
  reward_claim: [
    { freq: 700, dur: 0.12, type: 'sine', gain: 0.09 },
    { freq: 1050, dur: 0.26, type: 'sine', gain: 0.08, delay: 0.10 },
  ],
};

/** เลือกเสียงเปิดการ์ดตาม rarity (GDD §17: Card Reveal แยกตาม Rarity) */
export function revealSfxFor(rarity: string): SfxName {
  switch (rarity) {
    case 'MYTHIC':
    case 'LEGENDARY': return 'card_reveal_legendary';
    case 'EPIC': return 'card_reveal_epic';
    case 'RARE': return 'card_reveal_rare';
    default: return 'card_reveal_common';
  }
}

interface SfxOptions {
  sfxEnabled: boolean;
  volume: number;
  reduceIntense: boolean;
}

/** เล่นเสียงตามตาราง (คืน false ถ้าเล่นไม่ได้ เช่น ยังไม่ปลดล็อก audio) */
export function playSfx(ctx: AudioContext | null, name: SfxName, opts: SfxOptions): boolean {
  if (!ctx || !opts.sfxEnabled) return false;
  if (ctx.state === 'suspended') return false;

  const specs = SFX_TABLE[name];
  if (!specs) return false;
  // Reduce Intense Effects: ลดจำนวนเสียงซ้อนและความดังลง 50%
  const used = opts.reduceIntense ? specs.slice(0, 1) : specs;
  const gainScale = opts.reduceIntense ? 0.5 : 1;

  const now = ctx.currentTime;
  for (const spec of used) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + (spec.delay ?? 0);
    const end = start + spec.dur;

    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, start);
    if (spec.slideTo !== undefined) {
      osc.frequency.linearRampToValueAtTime(spec.slideTo, end);
    }
    // envelope: attack สั้น + decay แบบ exponential (ไม่เกิดคลิก)
    const peak = spec.gain * opts.volume * gainScale;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
  return true;
}

export const SFX_NAMES = Object.keys(SFX_TABLE) as SfxName[];
