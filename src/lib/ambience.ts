// Ambience Engine — เสียงบรรยากาศแบบสังเคราะห์เอง (Phase 21)
//
// เป้าหมาย: ให้ "โซน" ต่าง ๆ มีเสียงพื้นหลังเบา ๆ (ลมกว้างของ Aetherra) โดยไม่ใช้ไฟล์เสียง
// วิธี: สร้าง noise buffer แบบกำหนดผลได้ (seeded) → กรอง bandpass ที่ถูกขยับด้วย LFO ช้า ๆ
//       + เสียงประกาย (shimmer) เป็นครั้งคราวจากออสซิลเลเตอร์ความถี่สูง
//
// ส่วนบริสุทธิ์ (สร้างตัวอย่างเสียง + แปลงค่า) แยกไว้ให้เทสต์ได้โดยไม่ต้องมี WebAudio
export const AMBIENCE_SEED = 0x5eed_a11;

/** PRNG แบบ deterministic (mulberry32) — ทำให้เสียงบรรยากาศเหมือนเดิมทุกครั้ง */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** สร้างตัวอย่างเสียง noise (ค่าอยู่ในช่วง -1..1) — บริสุทธิ์ เทสต์ได้ */
export function generateNoiseSamples(count: number, seed: number = AMBIENCE_SEED): Float32Array {
  const rnd = mulberry32(seed);
  const out = new Float32Array(Math.max(0, Math.floor(count)));
  // ใช้ low-pass ง่าย ๆ (moving average) ให้เสียงนุ่มแบบ "ลม" ไม่ใช่ noise แข็ง
  let previous = 0;
  for (let i = 0; i < out.length; i += 1) {
    const white = rnd() * 2 - 1;
    previous = previous * 0.92 + white * 0.08;
    out[i] = previous;
  }
  return out;
}

// เดิมใช้ bandpass 520Hz → ได้ยินเป็น "เสียงซ่า" กลบเพลง
// แก้เป็น lowpass ต่ำ ๆ (เสียงลมไกล) + LFO ค่อย ๆ เปิด-ปิดความถี่ + หายใจด้วย tremolo
// ผู้ใช้แจ้ง 2026-09-26: "ไม่มีเสียงอะไรเลยนอกจากเสียง Ambience ซ่าๆ"
// Phase 22 รอบ 2 (ผู้ใช้: "Ambience ยังเบามาก"): 260 → 400Hz — ลำโพงมือถือแทบไม่ถ่ายทอดย่านต่ำกว่า 300Hz
export const AMBIENCE_FILTER = {
  type: 'lowpass' as BiquadFilterType,
  baseFrequency: 400,
  baseQ: 0.5,
  /** LFO ขยับความถี่ ± Hz เพื่อให้ลมพัดเป็นจังหวะ */
  lfoFrequency: 0.05,
  lfoDepth: 90,
};

/** หายใจของเสียงลม — ปรับความดังขึ้น-ลงช้า ๆ ไม่ให้เป็น noise นิ่ง ๆ รำคาญ */
export const AMBIENCE_TREMOLO = {
  frequency: 0.07,
  /** ลึก 0 = นิ่ง, 1 = ดัง-เงียบสุดขั้ว (0.4 = ลมพัดเบา ๆ · ลึกน้อยลง = ระดับเฉลี่ยดังขึ้น) */
  depth: 0.4,
};

export const AMBIENCE_SHIMMER = {
  everySeconds: 14,
  durationSeconds: 2.4,
  // Phase 22 รอบ 2: 0.02 → 0.045 (เดิมเบาจนไม่ได้ยิน) — ยังเป็น "ประกายบาง ๆ" ไม่ใช่เสียงหลัก
  gain: 0.045,
  /** คู่ความถี่ที่ใช้ (Hz) — เสียงประกายบาง ๆ */
  frequencies: [1174, 1568] as readonly number[],
};

export interface AmbiencePlan {
  noiseSeconds: number;
  filterType: BiquadFilterType;
  filterFrequency: number;
  filterQ: number;
  lfoFrequency: number;
  lfoDepth: number;
  tremoloFrequency: number;
  tremoloDepth: number;
}

/** ค่าที่ใช้ตั้งกราฟบรรยากาศ (ลดความเข้มเมื่อเปิด "ลดเอฟเฟกต์รุนแรง") */
export function ambiencePlan(reduceIntense: boolean, noiseSeconds = 4): AmbiencePlan {
  return {
    noiseSeconds,
    filterType: AMBIENCE_FILTER.type,
    filterFrequency: AMBIENCE_FILTER.baseFrequency,
    filterQ: reduceIntense ? AMBIENCE_FILTER.baseQ * 0.7 : AMBIENCE_FILTER.baseQ,
    lfoFrequency: reduceIntense ? AMBIENCE_FILTER.lfoFrequency * 0.6 : AMBIENCE_FILTER.lfoFrequency,
    lfoDepth: reduceIntense ? AMBIENCE_FILTER.lfoDepth * 0.5 : AMBIENCE_FILTER.lfoDepth,
    // โหมดลดความเข้ม: ลมหายใจตื้นลง (นิ่งขึ้น ไม่รบกวน)
    tremoloFrequency: AMBIENCE_TREMOLO.frequency,
    tremoloDepth: reduceIntense ? AMBIENCE_TREMOLO.depth * 0.5 : AMBIENCE_TREMOLO.depth,
  };
}
