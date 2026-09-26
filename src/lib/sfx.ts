'use client';

// SFX Engine — Phase 12 (Audio Direction GDD §17)
// ใช้ Web Audio API สังเคราะห์เสียงเอง (ไม่ต้องมีไฟล์เสียง/License)
// รองรับ: Music / SFX / Ambience toggle + Reduce Intense Effects (accessibility)
// หมายเหตุสำคัญ: ต้องถูก "ปลดล็อก" ด้วย interaction แรกของผู้ใช้ (เบราว์เซอร์บล็อก autoplay)
//
// Phase 22 (ผู้ใช้สั่ง 2026-09-20: "เสียงเบามาก เปิดสุดแทบไม่ได้ยิน และเสียงตอนต่อสู้ก็ไม่มี
//                     ทำเป็นเสียงดาบ เสียงปล่อยสกอล หน่อย")
//  1) **ดังขึ้นจริง**: ทุกเสียงผ่านตัวคูณ `SFX_GAIN_BOOST` + เพดาน `MAX_TONE_GAIN`
//     (เดิม gain 0.11–0.16 × วอลุ่ม 0.7 = peak ~0.09 ⇒ เปิดสุดแล้วยังเบา)
//  2) **เสียงดาบ/เวท** ต้องมี "ลม" และ "โลหะ" ซึ่ง oscillator ล้วนทำไม่ได้
//     ⇒ ToneSpec รับ `noise` (เสียงรบกวนผ่านตัวกรองที่ไล่ความถี่ได้) ผสมกับคลื่นเสียงได้

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
  // Phase 22: เสียงในเทปต่อสู้ (ผู้ใช้ออกเสียงว่า "ทำเป็นเสียงดาบ เสียงปล่อยสกอล")
  | 'battle_sword'     // ฟันดาบ (ลมดาบ + คมโลหะ + กระแทกเข้าที่)
  | 'battle_clash'     // ดาบกระทบดาบ (โลหะชนกัน)
  | 'battle_cast'      // ปล่อยสกอล (ร่ายเวทไล่ความถี่ขึ้น + วาบพลัง)
  | 'battle_shield'    // กางโล่ (สกิล SHIELD)
  | 'battle_burn'      // ติดสถานะเผาไหม้
  | 'battle_heal'      // ฟื้นพลัง
  | 'battle_faint'     // ล้มหมดสภาพ
  | 'arena_join'
  | 'raid_hit'
  | 'raid_phase'
  | 'reward_claim'
  | 'coin'
  | 'notify';

/**
 * ชิ้นส่วนเสียงรบกวน (noise) — ใช้ทำเสียง "ลม/โลหะ/ไฟ" ที่ oscillator ทำไม่ได้
 * ตัวกรองไล่ความถี่ได้ (slideTo) ⇒ ได้เสียง whoosh ของดาบหรือวูบขึ้นของเวท
 */
export interface NoiseSpec {
  /** ชนิดตัวกรอง (bandpass = เสียงบาง ๆ แบบลมดาบ · lowpass = เสียงทึบแบบไฟ/กระแทก) */
  filter: BiquadFilterType;
  /** ความถี่ตัวกรองตอนเริ่ม (Hz) */
  frequency: number;
  /** เลื่อนความถี่ตัวกรองไปทางนี้ (Hz) */
  slideTo?: number;
  /** ความคมของตัวกรอง (สูง = เสียงบาง/โลหะชัด) */
  q?: number;
}

interface ToneSpec {
  /** ความถี่คลื่นเสียง (Hz) — ไม่ใส่ = ใช้เฉพาะส่วน noise */
  freq?: number;
  dur: number;
  /** ชนิดคลื่น (ไม่ใส่ = ใช้เฉพาะส่วน noise) */
  type?: OscillatorType;
  gain: number;
  /** เลื่อนขึ้น/ลงระหว่างเล่น (0 = คงที่) */
  slideTo?: number;
  delay?: number;
  /** ส่วนเสียงรบกวนที่ผสมเข้ามา (ดาบ/เวท/ไฟ) */
  noise?: NoiseSpec;
  /**
   * เวลาเปิดเสียง (วินาที) — Phase 24.2
   *   - 0.001–0.004 = "แรงกระแทก" (transient คม ทะลุผ่านเพลงได้) → ใช้กับดาบ/กระแทก/ชนโลหะ
   *   - 0.02–0.06 = "ลม" (ค่อย ๆ มา) → ใช้กับเสียงฟันลม/ร่ายเวท
   * ไม่ใส่ = 0.008 (ค่าเดิม)
   */
  attack?: number;
  /**
   * สัดส่วนเสียงสะท้อนห้อง (0..1) — Phase 24.2
   * 0 = แห้ง (ค่าเดิม) · 0.1–0.35 = มีระยะ/มิติแบบต่อสู้ในโถงหิน
   * ใช้ convolver + impulse ที่สร้างเอง (ดู buildReverbImpulse) ⇒ ไม่ต้องมีไฟล์เสียง
   */
  reverb?: number;
}

/** เวลาเปิดเสียงเริ่มต้น (วินาที) — เท่ากับค่าเดิม Phase 22 */
export const DEFAULT_TONE_ATTACK = 0.008;

/**
 * ความยาว/การยุบตัวของเสียงสะท้อน (Phase 24.2)
 * 0.55 วิ = ห้องหินขนาดกลาง — สั้นพอไม่กินเสียงถัดไปในการต่อสู้ที่เล่นรัว ๆ
 */
export const REVERB_SECONDS = 0.55;
export const REVERB_DECAY = 3.2;

/**
 * ตัวคูณความดังของ SFX (Phase 22)
 * ผู้ใช้แจ้ง 2026-09-20: "เสียงเบามาก เปิดสุดแทบไม่ได้ยิน"
 * ค่าตัวคูณนี้ทำให้ค่าที่ออกแบบไว้ในตาราง (0.11–0.18) กลายเป็นเสียงที่ได้ยินชัดบนมือถือ
 * โดยไม่ต้องแก้ทีละบรรทัด — ตัวเลขในตารางยังอ่านเทียบกันได้ว่าเสียงไหนดังกว่าเสียงไหน
 */
export const SFX_GAIN_BOOST = 1.6;

/**
 * ตัวคูณเฉพาะ "เสียงต่อสู้" (Phase 24.2)
 *
 * ผู้ใช้สั่ง 2026-09-26: "เสียงต่อสู้ เบา เสียง ไม่สมจริง แก้ไขด้วย"
 * เหตุผลที่ต้องยกเฉพาะกลุ่มนี้: เสียงต่อสู้ต้อง "ทะลุ" เพลงที่เล่นอยู่ตลอด (บัสเพลงสูงกว่า SFX)
 * และผู้เล่นสนใจเสียงต่อสู้มากที่สุด — เสียง UI ไม่แตะ (ดังเท่าเดิม ไม่รบกวน)
 */
export const SFX_BATTLE_GAIN = 1.35;

/** เพดานความดังต่อหนึ่งชั้นเสียง — กันเสียงแตกเมื่อหลายชั้นซ้อนกัน (master มี compressor ช่วยอีกชั้น) */
export const MAX_TONE_GAIN = 0.45;

/**
 * เสียงกลุ่ม "ต่อสู้" — ใช้คิดตัวคูณ SFX_BATTLE_GAIN + jitter (ให้แต่ละครั้งไม่เหมือนกันเป๊ะ)
 */
export const BATTLE_SFX_NAMES = [
  'battle_hit', 'battle_sword', 'battle_clash', 'battle_cast', 'battle_shield',
  'battle_burn', 'battle_heal', 'battle_faint', 'battle_win', 'battle_lose',
  'raid_hit', 'raid_phase',
] as const satisfies readonly SfxName[];

export function isBattleSfx(name: SfxName): boolean {
  return (BATTLE_SFX_NAMES as readonly string[]).includes(name);
}

/** ตัวคูณความดังตามกลุ่มเสียง (บริสุทธิ์ — เทสต์ได้) */
export function sfxGainScale(name: SfxName): number {
  return isBattleSfx(name) ? SFX_BATTLE_GAIN : 1;
}

/**
 * การสุ่มเสียงเล็กน้อยต่อการเล่นหนึ่งครั้ง (cents) — Phase 24.2
 * เสียงจริงในธรรมชาติไม่เคยเหมือนกันเป๊ะ · ถ้าเล่นซ้ำแล้วเหมือนเดิมทุกครั้งหูจะจับได้ทันทีว่า "สังเคราะห์"
 * ⇒ เสียงต่อสู้สุ่ม ±35 cents (ประมาณ 2%) · เสียง UI ไม่สุ่ม (ต้องคมและสม่ำเสมอ)
 */
export function sfxJitterCents(name: SfxName): number {
  return isBattleSfx(name) ? 35 : 0;
}

// ตารางเสียง: ออกแบบให้สั้น (0.06–0.5 วิ) และเบา (≤0.18 gain ก่อนคูณ SFX_GAIN_BOOST) ตาม Mobile Web
const SFX_TABLE: Record<SfxName, ToneSpec[]> = {
  ui_tap: [{ freq: 520, dur: 0.09, type: 'triangle', gain: 0.128 }],
  ui_back: [{ freq: 380, dur: 0.12, type: 'triangle', gain: 0.112, slideTo: 300 }],
  ui_error: [
    { freq: 200, dur: 0.12, type: 'sawtooth', gain: 0.16 },
    { freq: 160, dur: 0.16, type: 'sawtooth', gain: 0.144, delay: 0.10 },
  ],
  rune_select: [{ freq: 660, dur: 0.11, type: 'sine', gain: 0.112, slideTo: 880 }],
  rune_discover: [
    { freq: 300, dur: 0.25, type: 'sine', gain: 0.144, slideTo: 720 },
    { freq: 480, dur: 0.35, type: 'triangle', gain: 0.096, delay: 0.12, slideTo: 960 },
  ],
  card_reveal_common: [{ freq: 520, dur: 0.20, type: 'sine', gain: 0.144 }],
  card_reveal_rare: [
    { freq: 520, dur: 0.18, type: 'sine', gain: 0.144 },
    { freq: 660, dur: 0.22, type: 'sine', gain: 0.128, delay: 0.12 },
  ],
  card_reveal_epic: [
    { freq: 520, dur: 0.16, type: 'triangle', gain: 0.144 },
    { freq: 660, dur: 0.16, type: 'triangle', gain: 0.144, delay: 0.10 },
    { freq: 880, dur: 0.28, type: 'triangle', gain: 0.128, delay: 0.20 },
  ],
  card_reveal_legendary: [
    { freq: 440, dur: 0.16, type: 'sine', gain: 0.16 },
    { freq: 660, dur: 0.16, type: 'sine', gain: 0.16, delay: 0.10 },
    { freq: 880, dur: 0.18, type: 'sine', gain: 0.16, delay: 0.20 },
    { freq: 1320, dur: 0.40, type: 'sine', gain: 0.144, delay: 0.30 },
  ],
  // Phase 24.2 — ผู้ใช้สั่ง 2026-09-26: "เสียงต่อสู้ เบา เสียง ไม่สมจริง"
  // หลักการใหม่ของกลุ่มต่อสู้: ทุกเสียง = transient คม + เนื้อเสียง (body) + ทองแดง/โลหะ (inharmonic)
  // + หางเสียงสะท้อนห้อง ⇒ วัดได้ว่า "ดังขึ้นและมีมิติ" ไม่ใช่ click แห้ง ๆ เหมือนเดิม
  battle_hit: [
    { noise: { filter: 'lowpass', frequency: 1400, slideTo: 380, q: 0.9 }, dur: 0.13, gain: 0.18, attack: 0.001, reverb: 0.15 },
    { freq: 300, dur: 0.16, type: 'triangle', gain: 0.18, slideTo: 150, attack: 0.002, reverb: 0.12 },
    { noise: { filter: 'bandpass', frequency: 2500, q: 1.4 }, dur: 0.06, gain: 0.14, delay: 0.004, attack: 0.001 },
    { freq: 120, dur: 0.18, type: 'square', gain: 0.12, delay: 0.01 },
  ],
  battle_win: [
    { freq: 660, dur: 0.18, type: 'triangle', gain: 0.17, attack: 0.004, reverb: 0.3 },
    { freq: 880, dur: 0.34, type: 'triangle', gain: 0.15, delay: 0.14, attack: 0.004, reverb: 0.3 },
    { freq: 1320, dur: 0.44, type: 'triangle', gain: 0.12, delay: 0.26, attack: 0.005, reverb: 0.35 },
  ],
  battle_lose: [
    { freq: 440, dur: 0.30, type: 'triangle', gain: 0.15, slideTo: 300, attack: 0.004, reverb: 0.28 },
    { freq: 330, dur: 0.22, type: 'sine', gain: 0.14, slideTo: 220, attack: 0.004, reverb: 0.25 },
    { freq: 220, dur: 0.40, type: 'sine', gain: 0.12, delay: 0.18, slideTo: 150, attack: 0.006, reverb: 0.25 },
    { noise: { filter: 'lowpass', frequency: 1200, slideTo: 320, q: 0.9 }, dur: 0.35, gain: 0.12, delay: 0.10, attack: 0.02, reverb: 0.2 },
    { freq: 165, dur: 0.44, type: 'triangle', gain: 0.10, delay: 0.34, slideTo: 110, attack: 0.01, reverb: 0.2 },
  ],
  arena_join: [
    { freq: 440, dur: 0.14, type: 'triangle', gain: 0.144 },
    { freq: 590, dur: 0.24, type: 'triangle', gain: 0.128, delay: 0.12 },
  ],
  raid_hit: [
    { noise: { filter: 'lowpass', frequency: 1600, slideTo: 520, q: 1 }, dur: 0.20, gain: 0.18, attack: 0.002, reverb: 0.2 },
    { freq: 420, dur: 0.20, type: 'triangle', gain: 0.19, slideTo: 180, attack: 0.003, reverb: 0.15 },
    { noise: { filter: 'bandpass', frequency: 2400, q: 1.3 }, dur: 0.07, gain: 0.15, delay: 0.004, attack: 0.001 },
    { freq: 95, dur: 0.30, type: 'sine', gain: 0.09, delay: 0.06, attack: 0.004 },
  ],
  raid_phase: [
    { freq: 300, dur: 0.22, type: 'square', gain: 0.14, slideTo: 180, attack: 0.003, reverb: 0.25 },
    { freq: 200, dur: 0.44, type: 'sawtooth', gain: 0.12, delay: 0.18, slideTo: 120, attack: 0.01, reverb: 0.3 },
    { noise: { filter: 'bandpass', frequency: 1800, slideTo: 900, q: 1.2 }, dur: 0.40, gain: 0.11, delay: 0.16, attack: 0.02, reverb: 0.25 },
  ],
  reward_claim: [
    { freq: 700, dur: 0.12, type: 'sine', gain: 0.144 },
    { freq: 1050, dur: 0.26, type: 'sine', gain: 0.128, delay: 0.10 },
  ],
  // Phase 21: เสียงเพิ่มสำหรับ UX ที่ใช้บ่อย (เหรียญเข้า/แจ้งเตือนใหม่)
  coin: [
    { freq: 1180, dur: 0.10, type: 'triangle', gain: 0.128 },
    { freq: 1560, dur: 0.16, type: 'triangle', gain: 0.112, delay: 0.06 },
  ],
  notify: [
    { freq: 880, dur: 0.14, type: 'sine', gain: 0.128 },
    { freq: 1320, dur: 0.20, type: 'sine', gain: 0.112, delay: 0.09 },
  ],

  // ---------- Phase 22: เสียงต่อสู้ตามเหตุการณ์จริงในเทป ----------
  // Phase 24.2 เรียบเรียงใหม่ให้ "สมจริง" (ผู้ใช้แจ้ง 2026-09-26) — โครงของทุกเสียง:
  //   transient (attack 1–3 ms) → เนื้อเสียงกลาง 300–800Hz (มือถือออกได้) → โลหะ inharmonic → หางสะท้อน
  // "ฟันดาบ": ลมดาบ (noise bandpass ไถลลง) → คมโลหะ 3 ความถี่ไม่กลมกลืน → เนื้อกระแทก → ปลายลมสะบัด
  battle_sword: [
    { noise: { filter: 'bandpass', frequency: 1900, slideTo: 420, q: 1.05 }, dur: 0.24, gain: 0.16, attack: 0.02, reverb: 0.12 },
    { freq: 2140, dur: 0.19, type: 'triangle', gain: 0.15, slideTo: 1620, delay: 0.04, attack: 0.001, reverb: 0.28 },
    { freq: 3180, dur: 0.15, type: 'triangle', gain: 0.11, slideTo: 2600, delay: 0.045, attack: 0.001, reverb: 0.28 },
    { freq: 4760, dur: 0.10, type: 'sine', gain: 0.08, delay: 0.05, attack: 0.001, reverb: 0.22 },
    { freq: 340, dur: 0.17, type: 'triangle', gain: 0.19, slideTo: 170, delay: 0.10, attack: 0.002, reverb: 0.16 },
    { noise: { filter: 'bandpass', frequency: 2800, q: 1.3 }, dur: 0.08, gain: 0.16, delay: 0.102, attack: 0.001 },
    { noise: { filter: 'lowpass', frequency: 900, slideTo: 320, q: 0.8 }, dur: 0.20, gain: 0.13, delay: 0.11 },
    { freq: 110, dur: 0.20, type: 'square', gain: 0.11, delay: 0.105 },
  ],
  // "ดาบกระทบดาบ": โลหะชนกัน — เสียงบางความถี่ไม่กลมกลืน (inharmonic) จึงได้กลิ่นโลหะ + หางสั่นค้าง
  battle_clash: [
    { noise: { filter: 'highpass', frequency: 2600, q: 0.9 }, dur: 0.10, gain: 0.17, attack: 0.001, reverb: 0.2 },
    { freq: 1980, dur: 0.36, type: 'triangle', gain: 0.15, slideTo: 1880, attack: 0.001, reverb: 0.3 },
    { freq: 2790, dur: 0.30, type: 'triangle', gain: 0.12, delay: 0.004, slideTo: 2700, attack: 0.001, reverb: 0.3 },
    { freq: 4260, dur: 0.22, type: 'sine', gain: 0.09, delay: 0.008, attack: 0.001, reverb: 0.3 },
    { freq: 5960, dur: 0.13, type: 'sine', gain: 0.06, delay: 0.012, attack: 0.001 },
    { freq: 430, dur: 0.15, type: 'triangle', gain: 0.12, delay: 0.006, slideTo: 300, attack: 0.002, reverb: 0.16 },
  ],
  // "ปล่อยสกอล": ลมเวทไล่ขึ้น (whoosh) → โน้ตไล่ขึ้น → "ปล่อยออก" เป็นวาบพลัง + กระแทกลมทิ้งตัว
  battle_cast: [
    { noise: { filter: 'bandpass', frequency: 620, slideTo: 4300, q: 1.6 }, dur: 0.46, gain: 0.16, attack: 0.05, reverb: 0.18 },
    { freq: 340, dur: 0.42, type: 'sine', gain: 0.17, slideTo: 1180, attack: 0.03 },
    { freq: 510, dur: 0.40, type: 'triangle', gain: 0.12, slideTo: 1760, delay: 0.05, attack: 0.03 },
    { freq: 1240, dur: 0.28, type: 'sine', gain: 0.13, delay: 0.30, slideTo: 2480, attack: 0.02, reverb: 0.2 },
    { freq: 660, dur: 0.34, type: 'triangle', gain: 0.17, delay: 0.32, slideTo: 300, attack: 0.002, reverb: 0.25 },
    { noise: { filter: 'lowpass', frequency: 1500, slideTo: 420, q: 1.1 }, dur: 0.38, gain: 0.14, delay: 0.30, attack: 0.002, reverb: 0.25 },
  ],
  // "กางโล่": กระแทกตึ้บ (เนื้อเสียงกลาง) + สั่นสะท้อนโลหะ + ลมยกโล่
  battle_shield: [
    { freq: 320, dur: 0.30, type: 'triangle', gain: 0.19, slideTo: 200, attack: 0.002, reverb: 0.2 },
    { noise: { filter: 'lowpass', frequency: 1200, slideTo: 400, q: 0.9 }, dur: 0.24, gain: 0.15, attack: 0.002, reverb: 0.15 },
    { freq: 1640, dur: 0.42, type: 'sine', gain: 0.12, delay: 0.03, attack: 0.002, reverb: 0.3 },
    { noise: { filter: 'bandpass', frequency: 1800, q: 2 }, dur: 0.20, gain: 0.12, delay: 0.02, attack: 0.004, reverb: 0.25 },
    { freq: 840, dur: 0.22, type: 'triangle', gain: 0.11, delay: 0.01, slideTo: 620, attack: 0.006 },
  ],
  // "ติดเผาไหม้": ไฟลุกวูบ (noise lowpass ไถลลง) + เสียงแตกซ่าเป็นช่วง ๆ (ประกายไฟ) + ลมร้อนต่ำ
  battle_burn: [
    { noise: { filter: 'lowpass', frequency: 1600, slideTo: 520, q: 1.3 }, dur: 0.55, gain: 0.16, attack: 0.02, reverb: 0.18 },
    { noise: { filter: 'bandpass', frequency: 2600, q: 2.2 }, dur: 0.10, gain: 0.14, delay: 0.02, attack: 0.001 },
    { noise: { filter: 'bandpass', frequency: 3100, q: 2.6 }, dur: 0.08, gain: 0.12, delay: 0.11, attack: 0.001 },
    { noise: { filter: 'bandpass', frequency: 2200, q: 2.1 }, dur: 0.12, gain: 0.11, delay: 0.22, attack: 0.001, reverb: 0.15 },
    { freq: 190, dur: 0.42, type: 'sawtooth', gain: 0.12, slideTo: 95, delay: 0.03, attack: 0.012 },
  ],
  // "ฟื้นพลัง": ระฆังไล่ขึ้นเบา ๆ (คนละอารมณ์กับเสียงต่อสู้) + ประกายสูง
  battle_heal: [
    { freq: 660, dur: 0.26, type: 'sine', gain: 0.16, attack: 0.004, reverb: 0.3 },
    { freq: 990, dur: 0.32, type: 'sine', gain: 0.14, delay: 0.09, attack: 0.004, reverb: 0.3 },
    { freq: 1320, dur: 0.46, type: 'sine', gain: 0.12, delay: 0.18, attack: 0.005, reverb: 0.35 },
    { freq: 1980, dur: 0.30, type: 'sine', gain: 0.08, delay: 0.24, attack: 0.005, reverb: 0.35 },
  ],
  // "ล้มหมดสภาพ": เสียงทรุดลงต่ำ + ลมหลุด + กระแทกตอนล้มถึงพื้น
  battle_faint: [
    { freq: 300, dur: 0.55, type: 'sawtooth', gain: 0.15, slideTo: 70, attack: 0.01, reverb: 0.2 },
    { noise: { filter: 'lowpass', frequency: 800, slideTo: 180, q: 0.9 }, dur: 0.50, gain: 0.13, delay: 0.05, attack: 0.02, reverb: 0.2 },
    { freq: 380, dur: 0.16, type: 'triangle', gain: 0.15, delay: 0.30, slideTo: 120, attack: 0.002, reverb: 0.18 },
    { noise: { filter: 'lowpass', frequency: 700, slideTo: 260, q: 0.8 }, dur: 0.22, gain: 0.12, delay: 0.31, attack: 0.002 },
  ],
};

/**
 * เลือกเสียงต่อสู้ตามเหตุการณ์ใน log (Phase 22 · เพิ่มความหลากหลาย Phase 24.2) — บริสุทธิ์ เทสต์ได้
 *  - attack → ฟันดาบ · skill → ปล่อยสกอล (สกิลโล่ใช้เสียงกางโล่) · burn/heal/faint → เสียงเฉพาะ
 *  - 'info' หรือเหตุการณ์ที่ไม่รู้จัก → ไม่เล่นเสียง (คืน null) เพื่อไม่ให้เทปรก
 *  - hitIndex: ลำดับการโจมตี — ทุกครั้งที่ 3 ใช้เสียง "ดาบกระทบดาบ" แทนการฟัน
 *    (Phase 24.2: เล่นเสียงเดิมซ้ำทุกครั้ง = ฟังออกทันทีว่าสังเคราะห์ ผู้ใช้บ่นว่า "ไม่สมจริง")
 */
export function battleSfxFor(
  action: string,
  statusApplied?: string | null,
  hitIndex = 0
): SfxName | null {
  switch (action) {
    case 'attack': {
      const index = Number.isFinite(hitIndex) ? Math.max(0, Math.floor(hitIndex)) : 0;
      return index % 3 === 2 ? 'battle_clash' : 'battle_sword';
    }
    case 'skill':
      return statusApplied === 'SHIELD' ? 'battle_shield' : 'battle_cast';
    case 'burn':
      return 'battle_burn';
    case 'heal':
      return 'battle_heal';
    case 'faint':
      return 'battle_faint';
    default:
      return null;
  }
}

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

export interface SfxOptions {
  sfxEnabled: boolean;
  volume: number;
  reduceIntense: boolean;
  /** ปลายทางเสียง (บัส SFX ของเกม) — ไม่ส่ง = ต่อลำโพงตรง */
  destination?: AudioNode | null;
}

/** เสียงหนึ่งตัวที่พร้อมจะเล่น (คำนวณล่วงหน้าแล้ว) */
export interface ScheduledTone {
  /** ความถี่คลื่นเสียง — ไม่มี = ชั้นนี้เป็นเสียงรบกวนล้วน */
  freq?: number;
  slideTo?: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  /** ส่วนเสียงรบกวนที่ผสมอยู่ (ดาบ/เวท/ไฟ) */
  noise?: NoiseSpec;
  gain: number;
  /** เวลาเปิดเสียง (วินาที) — 1–3 ms = กระแทกคม · 20–60 ms = ลม (Phase 24.2) */
  attack: number;
  /** สัดส่วนส่งเข้าเสียงสะท้อนห้อง 0..1 (Phase 24.2) */
  reverb: number;
}

/**
 * แปลงชื่อเสียง → ตารางเสียงที่จะเล่นจริง (บริสุทธิ์ เทสต์ได้)
 *  - "ลดเอฟเฟกต์รุนแรง" = เหลือชั้นแรกสุด + ความดัง 50%
 *  - volume 0 → ไม่มีเสียงให้เล่นเลย
 *  - ความดังจริง = ค่าตาราง × วอลุ่ม × SFX_GAIN_BOOST × ตัวคูณกลุ่มเสียง (Phase 24.2) ไม่เกิน MAX_TONE_GAIN
 */
export function sfxSchedule(name: SfxName, opts: Pick<SfxOptions, 'volume' | 'reduceIntense'>): ScheduledTone[] {
  const specs = SFX_TABLE[name];
  if (!specs) return [];
  const volume = Math.min(1, Math.max(0, opts.volume));
  if (volume <= 0) return [];
  const used = opts.reduceIntense ? specs.slice(0, 1) : specs;
  const scale =
    volume * (opts.reduceIntense ? 0.5 : 1) * SFX_GAIN_BOOST * sfxGainScale(name);
  let cursor = 0;
  return used.map((spec) => {
    // delay สัมพัทธ์ → เวลาเริ่มจริงในหน่วยวินาที
    const at = spec.delay ?? cursor;
    cursor = at;
    return {
      freq: spec.freq,
      slideTo: spec.slideTo,
      at,
      dur: spec.dur,
      type: spec.type,
      noise: spec.noise,
      attack: spec.attack ?? DEFAULT_TONE_ATTACK,
      reverb: spec.reverb ?? 0,
      gain: Math.max(0.0002, Number(Math.min(MAX_TONE_GAIN, spec.gain * scale).toFixed(5))),
    };
  });
}

/** บัฟเฟอร์ white noise ต่อ AudioContext (สร้างครั้งเดียว ใช้ซ้ำ) — ใช้ทำเสียงลม/โลหะ/ไฟ */
const NOISE_BUFFER_SECONDS = 1;
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

function noiseBufferFor(ctx: AudioContext): AudioBuffer | null {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  if (typeof ctx.createBuffer !== 'function') return null;
  const length = Math.max(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

/**
 * สร้าง impulse ของเสียงสะท้อนห้องด้วยคณิตศาสตร์ล้วน (ไม่ต้องมีไฟล์เสียง — Phase 24.2)
 *
 * วิธีคิด: เสียงสะท้อนในห้องจริง = noise ที่ "จางลงตามเวลา" แบบ exponential
 *   sample[i] = (สุ่ม -1..1) × (1 - i/N)^decay
 * ทำให้เสียงแห้ง ๆ ของ oscillator มี "ระยะ/มิติ" ขึ้นทันที (ผู้ใช้บ่นว่าเสียงไม่สมจริง)
 *
 * เป็นฟังก์ชันบริสุทธิ์ (รับ random เข้ามา) ⇒ เทสต์ได้โดยไม่ต้องมี AudioContext
 */
export function buildReverbImpulse(
  sampleRate: number,
  seconds: number = REVERB_SECONDS,
  decay: number = REVERB_DECAY,
  random: () => number = Math.random
): Float32Array {
  const length = Math.max(1, Math.floor(sampleRate * Math.max(0.02, seconds)));
  const data = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const falloff = Math.pow(1 - i / length, Math.max(0.1, decay));
    data[i] = (random() * 2 - 1) * falloff;
  }
  return data;
}

/** บัฟเฟอร์ impulse ของ reverb ต่อ AudioContext (สร้างครั้งเดียว ใช้ซ้ำ) */
const reverbImpulses = new WeakMap<AudioContext, AudioBuffer>();

function reverbImpulseFor(ctx: AudioContext): AudioBuffer | null {
  const cached = reverbImpulses.get(ctx);
  if (cached) return cached;
  if (typeof ctx.createBuffer !== 'function') return null;
  const samples = buildReverbImpulse(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(samples);
  reverbImpulses.set(ctx, buffer);
  return buffer;
}

/**
 * เล่นเสียงตามตาราง — คืน false ถ้าเล่นไม่ได้
 *
 * ⚠️ ไม่ปฏิเสธเมื่อ AudioContext ยัง "suspended": จะตั้งเวลาไว้เลย แล้วเสียงจะดังทันที
 * ที่ผู้ใช้แตะหน้าจอ (provider เรียก resume ให้) — เดิมเช็คแล้วคืน false ทำให้ "เสียงแรก" หาย
 *
 * Phase 22: หนึ่งชั้นเสียง = คลื่นเสียง (oscillator) +/หรือ noise ที่ผ่านตัวกรอง
 * Phase 24.2 (ผู้ใช้สั่ง: "เสียงต่อสู้ เบา เสียง ไม่สมจริง"):
 *   - **attack** ต่อชั้นเสียง (1–3 ms = transient คมทะลุเพลง · 20–60 ms = ลม)
 *   - **reverb** ส่งเสียงเข้าห้องสะท้อน (convolver + impulse ที่สร้างเอง)
 *   - **jitter** สุ่มเสียง ±35 cents ต่อการเล่นหนึ่งครั้ง (เสียงต่อสู้) — ไม่ให้ซ้ำเป๊ะทุกครั้ง
 *   - noise สุ่มจุดเริ่มในบัฟเฟอร์ ⇒ เสียงดาบ/ไฟแต่ละครั้งไม่เหมือนกัน
 */
export function playSfx(ctx: AudioContext | null, name: SfxName, opts: SfxOptions): boolean {
  if (!ctx || !opts.sfxEnabled) return false;
  const tones = sfxSchedule(name, opts);
  if (tones.length === 0) return false;

  const now = ctx.currentTime;
  const out = opts.destination ?? ctx.destination;
  const noiseBuffer = tones.some((t) => t.noise) ? noiseBufferFor(ctx) : null;
  const jitterCents = sfxJitterCents(name);

  // ห้องสะท้อน: สร้าง convolver ตัวเดียวต่อการเล่น แล้วให้ทุกชั้นที่ต้องการส่งเข้ามาใช้ร่วมกัน
  const reverbBuffer = tones.some((t) => t.reverb > 0) ? reverbImpulseFor(ctx) : null;
  const convolver =
    reverbBuffer && typeof ctx.createConvolver === 'function' ? ctx.createConvolver() : null;
  if (convolver && reverbBuffer) {
    convolver.buffer = reverbBuffer;
    convolver.connect(out);
  }

  for (const tone of tones) {
    const gain = ctx.createGain();
    const start = now + tone.at;
    const end = start + tone.dur;

    // envelope: attack → คงระดับ (sustain) → คลายแบบ exponential
    const attack = Math.min(Math.max(0.0005, tone.attack), tone.dur * 0.5);
    const sustainUntil = start + Math.max(attack + 0.015, tone.dur * 0.45);
    gain.gain.setValueAtTime(0.0002, start);
    gain.gain.exponentialRampToValueAtTime(tone.gain, start + attack);
    gain.gain.setValueAtTime(tone.gain, Math.min(sustainUntil, end - 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0002, end);
    gain.connect(out);

    // ชั้นที่ต้องการ "ระยะห้อง" → ส่งสัญญาณชุดเดียวกันเข้า convolver ด้วย
    if (convolver && tone.reverb > 0) {
      const wet = ctx.createGain();
      wet.gain.value = Math.min(1, tone.reverb);
      gain.connect(wet);
      wet.connect(convolver);
    }

    // ส่วนคลื่นเสียง (โน้ต) — สุ่มเสียงเล็กน้อยให้แต่ละครั้งไม่เหมือนกันเป๊ะ
    if (tone.type !== undefined && tone.freq !== undefined) {
      const osc = ctx.createOscillator();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq, start);
      if (jitterCents > 0 && typeof osc.detune?.setValueAtTime === 'function') {
        osc.detune.setValueAtTime((Math.random() * 2 - 1) * jitterCents, start);
      }
      if (tone.slideTo !== undefined) {
        osc.frequency.linearRampToValueAtTime(tone.slideTo, end);
      }
      osc.connect(gain);
      osc.start(start);
      osc.stop(end + 0.02);
    }

    // ส่วนเสียงรบกวน (ลม/โลหะ/ไฟ) — กรองด้วยตัวกรองที่ไล่ความถี่ได้
    if (tone.noise && noiseBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = tone.noise.filter;
      filter.Q.value = tone.noise.q ?? 0.7;
      filter.frequency.setValueAtTime(tone.noise.frequency, start);
      if (tone.noise.slideTo !== undefined) {
        filter.frequency.linearRampToValueAtTime(tone.noise.slideTo, end);
      }
      source.connect(filter);
      filter.connect(gain);
      // Phase 24.2: เริ่มอ่าน noise ที่ตำแหน่งสุ่ม (ไม่เกินความยาวที่เหลือ)
      // ⇒ เสียงดาบ/ไฟแต่ละครั้งได้ลมคนละแบบ ไม่ซ้ำเป๊ะเหมือนเดิม
      const maxOffset = Math.max(0, NOISE_BUFFER_SECONDS - (tone.dur + 0.05));
      source.start(start, maxOffset > 0 ? Math.random() * maxOffset : 0);
      source.stop(end + 0.02);
    }
  }
  return true;
}

export const SFX_NAMES = Object.keys(SFX_TABLE) as SfxName[];

/** ตรวจว่าชื่อเสียงนี้มีในตารางไหม (ใช้กับ debug API / หน้าตั้งค่า) */
export function isSfxName(value: string): value is SfxName {
  return Object.prototype.hasOwnProperty.call(SFX_TABLE, value);
}

