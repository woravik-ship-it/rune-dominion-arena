// Audio Engine — กราฟเสียงกลางของเกม (Phase 21)
//
// ผู้ใช้สั่ง 2026-09-26: "Projects Game Card มีเมนูเสียง แต่ไม่เห็นมีเสียงเลย ทำเสียงประกอบด้วย"
//
// ปัญหาที่พบในของเดิม
//   1) เมนูมีสวิตช์ Music/Ambience แต่ **ไม่มีตัวเล่นเพลง/บรรยากาศเลย** (มีแต่ตาราง SFX)
//   2) เสียง SFX ถูกทิ้งเมื่อ AudioContext ยัง suspended (เสียงแรกที่กดจึงเงียบ)
//   3) ไม่มีมาสเตอร์วอลุ่ม/บัสแยกชั้น จึงปรับระดับเพลง–บรรยากาศ–เอฟเฟกต์แยกกันไม่ได้
//
// ไฟล์นี้มีทั้งส่วน "บริสุทธิ์" (คำนวณ gain — เทสต์ได้) และส่วนที่ต้องใช้ WebAudio
export interface AudioLayerSettings {
  music: boolean;
  sfx: boolean;
  ambience: boolean;
  reduceIntense: boolean;
  /** ระดับเสียงหลัก 0..1 */
  volume: number;
}

/**
 * สัดส่วนเสียงของแต่ละชั้น (ก่อนคูณมาสเตอร์วอลุ่ม)
 *
 * Phase 22 รอบ 2 (ผู้ใช้แจ้ง 2026-09-20: "เสียง Effect ดังแล้ว ส่วนเสียงดนตรีกับ Ambience ยังเบามาก"):
 * ⇒ **บัสเพลงสูงกว่า SFX ได้** (2.0 vs 1.0) เพราะตัวเลขนี้คูณ "สัญญาณดิบ" คนละแบบกัน
 *   - SFX = เสียงสั้น peak สูง (gain 0.2–0.4) → RMS ที่วัดได้จริงสูง
 *   - เพลง = pad ต่อเนื่อง gain ต่อโน้ตแค่ 0.05–0.14 → วัดจริงได้ peak RMS 0.049 ทั้งที่บัส 0.75
 *   ⇒ ถ้าตั้งเพลงให้ "น้อยกว่า SFX เสมอ" ตามสัดส่วนบัส เพลงจะไม่มีทางดังเท่าที่ควร
 *   วัดจริงหลังปรับ (วอลุ่ม 0.85): เพลง peak RMS ≈ 0.13 · บรรยากาศ ≈ 0.04 · SFX 0.14–0.33
 */
export const LAYER_BASE_GAIN = {
  sfx: 1.0,
  /**
   * Phase 35 (ผู้ใช้แจ้ง: "เพลงประกอบ ในโทรศัพท์ มีเสียงแตกหน่อยๆ"):
   * เดิม 1.8 × master 1.3 = 2.34 เท่า ของสัญญาณดิบ ⇒ ยอดคลื่นเกิน 0 dBFS ⇒ ตัดยอด (แตก)
   * ⇒ ลดเหลือ 1.55 พร้อม limiter หลัง compressor (ดู MASTER_LIMITER) · เกนต่อโน้ตก็ลดลงด้วย
   */
  music: 1.55,
  // บรรยากาศเป็น "ฉากหลัง" ของจริง — แต่ต้องได้ยิน ไม่ใช่ 0.07 ที่แทบไม่ได้ยิน (ดูหลักฐานใน DEVELOPMENT_PLAN Phase 22 รอบ 2)
  ambience: 0.3,
} as const;

export type AudioLayer = keyof typeof LAYER_BASE_GAIN;

/**
 * เกนรวมก่อนออกลำโพง (Phase 22) — เดิมตั้ง 1.0 ทำให้ "เปิดวอลุ่มสุดแล้วยังเบา"
 * ตัวเลขนี้ยกทั้งมิกซ์ขึ้นพร้อมกัน แล้วมี compressor ต่อท้ายกันเสียงแตก
 */
export const MASTER_BASE_GAIN = 1.1;

/**
 * ค่าตั้งของ compressor — กันเสียงแตกเมื่อเพลง + เอฟเฟกต์ + บรรยากาศดังพร้อมกัน
 * Phase 22 รอบ 2: ผ่อนเป็น ratio 2.5 / threshold -10 (เดิม 3 / -14) เพราะบัสเพลงถูกยกขึ้นมาก
 * เกณฑ์ที่ต่ำ+ratio สูงเกินไปจะ "บี้" เสียงเพลงที่ต่อเนื่องจนแบน (ดังแต่ไม่มีมิติ)
 */
export const MASTER_COMPRESSOR = {
  threshold: -10,
  knee: 10,
  ratio: 2.5,
  attack: 0.004,
  release: 0.3,
} as const;

/**
 * Limiter กันเสียงแตก (Phase 35) — ต่อท้าย compressor
 *
 * compressor เดิม (ratio 2.5) ยังปล่อยยอดถึง ~0 dBFS ได้ ⇒ บนมือถือ (ลำโพงเล็ก + DAC จำกัด)
 * ยอดที่แตะ 0 dBFS จะได้ยินเป็น "เสียงแตก" ชัดเจน · limiter ratio 20 + threshold -1.5 dB
 * จะดึงยอดไว้ใต้ 0 dBFS โดยไม่เปลี่ยนความดังที่รับรู้ (ทำงานเฉพาะพีค)
 */
export const MASTER_LIMITER = {
  threshold: -1.5,
  knee: 0,
  ratio: 20,
  attack: 0.002,
  release: 0.12,
} as const;

/**
 * ระดับเสียงของชั้นหนึ่ง ๆ
 *  - ชั้นที่ปิดอยู่ = 0
 *  - "ลดเอฟเฟกต์รุนแรง" = ลดลงครึ่งหนึ่ง (เข้าถึงง่ายขึ้นสำหรับผู้ที่ไวต่อเสียง)
 */
export function layerGain(layer: AudioLayer, settings: AudioLayerSettings): number {
  const enabled = settings[layer];
  if (!enabled) return 0;
  const base = LAYER_BASE_GAIN[layer];
  const volume = Math.min(1, Math.max(0, settings.volume));
  const scale = settings.reduceIntense ? 0.5 : 1;
  return Number((base * volume * scale).toFixed(4));
}

/**
 * Sidechain ducking (Phase 24.2) — ลดเพลง/บรรยากาศชั่วคราวขณะมีเสียงกระแทกในการต่อสู้
 *
 * ผู้ใช้สั่ง 2026-09-26: "เสียงต่อสู้ เบา"
 * บัสเพลงตั้งไว้สูงกว่า SFX โดยตั้งใจ (เพลงต้องได้ยิน — Phase 22 รอบ 2) แต่ตอนกระบี่กระทบกัน
 * เสียงต่อสู้ต้อง "เด่น": ใช้เทคนิคเดียวกับมิกซ์เพลงจริง (duck) ⇒ ไม่ต้องเพิ่มความดังจนแตก
 *
 * ค่าที่เลือก (วัดจากเทปจริง: การโจมตีห่างกันราว 300–900 ms):
 *   - ลดลงเร็วมาก (20 ms) เพื่อให้ทันจังหวะกระแทก
 *   - ลดแค่ 40% (music 0.6) — ไม่ใช่ตัดเพลงทิ้ง ยังได้ยินดนตรีตลอดการต่อสู้
 *   - คืนระดับใน 0.3 วิ ⇒ ระหว่างจังหวะโจมตีเพลงกลับมา จึงไม่ใช่ "เพลงเบาทั้งศึก"
 */
export const BATTLE_DUCK = {
  music: 0.6,
  ambience: 0.7,
  /** ระยะเวลาที่ลดค้างไว้ก่อนคืนระดับ (วินาที) */
  holdSeconds: 0.15,
  /** ระยะเวลาที่ลดลง (วินาที) — ต้องเร็วกว่าการปรับระดับปกติมาก */
  attackSeconds: 0.02,
  /** ระยะเวลาที่คืนระดับ (วินาที) */
  releaseSeconds: 0.3,
} as const;


/** ระดับเสียงของชั้นนั้นเมื่อถูก duck (เฉพาะเพลง/บรรยากาศ · SFX ไม่ถูกแตะ) */
export function duckedLayerGain(layer: AudioLayer, settings: AudioLayerSettings): number {
  const base = layerGain(layer, settings);
  if (layer === 'sfx') return base;
  const factor = layer === 'music' ? BATTLE_DUCK.music : BATTLE_DUCK.ambience;
  return Number((base * factor).toFixed(4));
}

/** ค่าที่ใช้ปรับกราฟเสียงจริง (ใช้ smoothing เพื่อไม่ให้เสียงกระตุก) */
export const GAIN_RAMP_SECONDS = 0.6;

export interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  /** กันเสียงแตกเมื่อทุกชั้นดังพร้อมกัน (Phase 22) */
  compressor: DynamicsCompressorNode;
  /** Limiter กันยอดคลื่นแตะ 0 dBFS (Phase 35 — ต้นเหตุเสียงแตกบนมือถือ) */
  limiter: DynamicsCompressorNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  ambienceBus: GainNode;
  /** ใช้ตรวจว่ามีเสียงออกจริงไหม (แผง debug/QA) */
  analyser: AnalyserNode;
}

function ramp(param: AudioParam, value: number, ctx: AudioContext, seconds = GAIN_RAMP_SECONDS): void {
  const now = ctx.currentTime;
  const duration = Math.max(0.005, seconds);
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + duration);
}

/** สร้างกราฟเสียงกลาง (เรียกครั้งเดียวต่อ AudioContext) */
export function createAudioGraph(ctx: AudioContext): AudioGraph {
  const master = ctx.createGain();
  master.gain.value = MASTER_BASE_GAIN;

  // compressor/limiter: ทำหน้าที่สองอย่าง — กันเสียงแตกเมื่อชั้นเสียงซ้อนกัน
  // และทำให้ "เปิดวอลุ่มสุด" ดังกว่าที่เคยโดยไม่บี้เสียง (Phase 22)
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = MASTER_COMPRESSOR.threshold;
  compressor.knee.value = MASTER_COMPRESSOR.knee;
  compressor.ratio.value = MASTER_COMPRESSOR.ratio;
  compressor.attack.value = MASTER_COMPRESSOR.attack;
  compressor.release.value = MASTER_COMPRESSOR.release;

  // Phase 35: limiter ต่อท้าย compressor — กันยอดคลื่นแตะ 0 dBFS (ต้นเหตุ "เสียงแตก" บนมือถือ)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = MASTER_LIMITER.threshold;
  limiter.knee.value = MASTER_LIMITER.knee;
  limiter.ratio.value = MASTER_LIMITER.ratio;
  limiter.attack.value = MASTER_LIMITER.attack;
  limiter.release.value = MASTER_LIMITER.release;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  master.connect(compressor);
  compressor.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(ctx.destination);

  const makeBus = (): GainNode => {
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);
    return bus;
  };

  return { ctx, master, compressor, limiter, sfxBus: makeBus(), musicBus: makeBus(), ambienceBus: makeBus(), analyser };
}

/** อ่านระดับเสียงปัจจุบัน (RMS 0..1) — ใช้ยืนยันว่าเสียงออกจริง */
export function readLevel(analyser: AnalyserNode): number {
  const count = analyser.frequencyBinCount;
  const data = new Float32Array(count);
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < count; i += 1) sum += data[i] * data[i];
  return Number(Math.sqrt(sum / count).toFixed(5));
}

/**
 * สัดส่วนพลังงานเสียงในช่วงความถี่ที่กำหนด (0..1) — Phase 24.2
 *
 * ทำไมต้องวัด: ลำโพงมือถือออกเสียงย่านต่ำ (<250Hz) ได้น้อยมาก
 * ถ้าเสียงกระแทกมีแต่ความถี่ต่ำ ค่าที่วัดได้ (RMS) จะสูงแต่ "หูไม่ได้ยิน" ⇒ ต้องมีพลังงานย่าน 250–4000Hz
 * ใช้ในสคริปต์ QA (window.__rdaAudio.bands) ว่ายืนยันได้ด้วยตัวเลข ไม่ใช่การเดา
 * คืน null ถ้าอ่านสเปกตรัมไม่ได้ (analyser ไม่รองรับ)
 */
export function bandEnergyShare(
  analyser: AnalyserNode,
  lowHz: number,
  highHz: number
): number | null {
  if (typeof analyser.getFloatFrequencyData !== 'function') return null;
  const count = analyser.frequencyBinCount;
  const data = new Float32Array(count);
  analyser.getFloatFrequencyData(data);
  const sampleRate = analyser.context?.sampleRate ?? 44100;
  const nyquist = sampleRate / 2;
  const binHz = nyquist / count;
  let inBand = 0;
  let total = 0;
  for (let i = 1; i < count; i += 1) {
    const hz = i * binHz;
    if (hz >= nyquist) break;
    const db = data[i];
    const power = Number.isFinite(db) ? Math.pow(10, db / 10) : 0;
    total += power;
    if (hz >= lowHz && hz <= highHz) inBand += power;
  }
  if (total <= 0) return 0;
  return Number((inBand / total).toFixed(4));
}

/**
 * ปรับกราฟเสียงให้ตรงกับการตั้งค่าปัจจุบัน
 *  - ducked = true → ลดเพลง/บรรยากาศชั่วคราว (ใช้ตอนเสียงต่อสู้ดัง)
 *  - rampSeconds → ความเร็วในการเปลี่ยนระดับ (duck ใช้ค่าที่เร็วกว่าปกติมาก)
 */
export function applyLayerGains(
  graph: AudioGraph,
  settings: AudioLayerSettings,
  ducked = false,
  rampSeconds = GAIN_RAMP_SECONDS
): void {
  // ⚠️ ต้องเลือกค่าตาม `ducked` ทุกชั้น — ถ้าลืมเลือก ชั้นเพลง/บรรยากาศจะถูก duck ค้างตลอดเวลา
  // (เคยพลาดมาแล้วรอบแรกของ Phase 24.2: เพลงเบาลง 40% ไม่มีวันคืน — ตัวตรวจ ducking จับได้)
  ramp(graph.sfxBus.gain, layerGain('sfx', settings), graph.ctx, rampSeconds);
  ramp(
    graph.musicBus.gain,
    ducked ? duckedLayerGain('music', settings) : layerGain('music', settings),
    graph.ctx,
    rampSeconds
  );
  ramp(
    graph.ambienceBus.gain,
    ducked ? duckedLayerGain('ambience', settings) : layerGain('ambience', settings),
    graph.ctx,
    rampSeconds
  );
}


/** สรุปการตั้งค่าเสียงสำหรับแสดง/ตรวจสอบ (ใช้ในเทสต์และ debug API) */
export function describeAudio(settings: AudioLayerSettings): Record<AudioLayer, number> {
  return {
    sfx: layerGain('sfx', settings),
    music: layerGain('music', settings),
    ambience: layerGain('ambience', settings),
  };
}
