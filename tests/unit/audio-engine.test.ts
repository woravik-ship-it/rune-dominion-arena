// Audio engine tests — Phase 21 (ผู้ใช้สั่ง: "มีเมนูเสียง แต่ไม่เห็นมีเสียงเลย ทำเสียงประกอบด้วย")
// ทดสอบส่วนที่บริสุทธิ์: การคำนวณระดับเสียงของแต่ละชั้น (ไม่ต้องมี AudioContext จริง)
import {
  applyLayerGains,
  BATTLE_DUCK,
  bandEnergyShare,
  duckedLayerGain,
  GAIN_RAMP_SECONDS,
  LAYER_BASE_GAIN,
  MASTER_BASE_GAIN,
  MASTER_COMPRESSOR,
  describeAudio,
  layerGain,
  type AudioGraph,
  type AudioLayerSettings,
} from '@/lib/audio-engine';

const base: AudioLayerSettings = {
  music: true,
  sfx: true,
  ambience: true,
  reduceIntense: false,
  volume: 1,
};

describe('ระดับเสียงของแต่ละชั้น (audio layers)', () => {
  test('สวิตช์ปิด → ชั้นนั้นเงียบ (0)', () => {
    expect(layerGain('music', { ...base, music: false })).toBe(0);
    expect(layerGain('sfx', { ...base, sfx: false })).toBe(0);
    expect(layerGain('ambience', { ...base, ambience: false })).toBe(0);
  });

  test('สเกลตามมาสเตอร์วอลุ่ม', () => {
    expect(layerGain('sfx', { ...base, volume: 0.5 })).toBe(Number((LAYER_BASE_GAIN.sfx * 0.5).toFixed(4)));
    expect(layerGain('music', { ...base, volume: 0 })).toBe(0);
  });

  test('วอลุ่มนอกช่วงถูก clamp (ติดลบ → 0, เกิน 1 → 1)', () => {
    expect(layerGain('sfx', { ...base, volume: -3 })).toBe(0);
    expect(layerGain('sfx', { ...base, volume: 9 })).toBe(LAYER_BASE_GAIN.sfx);
  });

  test('"ลดเอฟเฟกต์รุนแรง" ลดลงครึ่งหนึ่ง', () => {
    const normal = layerGain('music', base);
    const reduced = layerGain('music', { ...base, reduceIntense: true });
    expect(reduced).toBeCloseTo(normal / 2, 4);
  });

  test('เพลงต้องดังกว่าบรรยากาศ (กันปัญหา "ได้ยินแต่เสียงบรรยากาศซ่า ๆ")', () => {
    const music = layerGain('music', base);
    const ambience = layerGain('ambience', base);
    expect(music).toBeGreaterThan(ambience * 2);
  });

  test('บรรยากาศยังเป็นฉากหลังของจริง (ต่ำกว่าเพลงหลายเท่า)', () => {
    // Phase 22 รอบ 2: เกณฑ์เดิม "≤10% ของชั้นเสียงเต็ม" ไม่ใช้แล้ว — 0.1 เบาจนผู้ใช้ไม่ได้ยิน
    // เกณฑ์ใหม่ที่ตรงกับเจตนา: บรรยากาศต้องเบากว่าเพลงอย่างน้อย 3 เท่า
    expect(LAYER_BASE_GAIN.ambience * 3).toBeLessThan(LAYER_BASE_GAIN.music);
  });

  test('บัสเพลงสูงกว่า SFX ได้ — เพราะสัญญาณเพลงต่อเนื่องมี RMS ต่ำกว่าพีค SFX มาก', () => {
    // วัดจริง (วอลุ่ม 0.85): บัสเพลง 0.75 → เพลง peak RMS แค่ 0.049 ขณะที่ SFX peak 0.23
    // ⇒ ถ้าบังคับให้บัสเพลง < บัส SFX เพลงจะไม่มีทางดังเท่าที่ควร (ผู้ใช้แจ้ง 2026-09-20)
    expect(LAYER_BASE_GAIN.music).toBeGreaterThan(LAYER_BASE_GAIN.sfx);
  });

  test('describeAudio คืนค่าครบทั้งสามชั้น', () => {
    const described = describeAudio({ ...base, music: false });
    expect(Object.keys(described).sort()).toEqual(['ambience', 'music', 'sfx']);
    expect(described.music).toBe(0);
    expect(described.sfx).toBeGreaterThan(0);
  });

  test('ค่าเริ่มต้น (ทุกชั้นเปิด วอลุ่มเต็ม) มีเสียงออกทั้งสามชั้น', () => {
    const described = describeAudio(base);
    expect(described.sfx).toBeGreaterThan(0);
    expect(described.music).toBeGreaterThan(0);
    expect(described.ambience).toBeGreaterThan(0);
  });
});

// Phase 22 — ผู้ใช้แจ้ง 2026-09-20: "เสียงเบามาก เปิดสุดแทบไม่ได้ยิน"
describe('ความดังรวมของเกม (Phase 22)', () => {
  test('เกนรวมถูกยกขึ้นเกิน 1 (เดิม 1.0 ทำให้เปิดสุดแล้วยังเบา)', () => {
    expect(MASTER_BASE_GAIN).toBeGreaterThan(1);
  });

  test('มี compressor กันเสียงแตกเมื่อทุกชั้นดังพร้อมกัน', () => {
    expect(MASTER_COMPRESSOR.ratio).toBeGreaterThan(1);
    expect(MASTER_COMPRESSOR.threshold).toBeLessThan(0);
  });

  test('เพลงดังกว่าที่เคยตั้งไว้ (เดิม 0.45 / 0.75) — ผู้ใช้แจ้งว่าเงียบ', () => {
    expect(LAYER_BASE_GAIN.music).toBeGreaterThan(0.75);
  });

  test('บรรยากาศได้ยินจริงแต่ยังเบากว่าเพลง (เดิม 0.07/0.10 เบาจนไม่ได้ยิน)', () => {
    expect(LAYER_BASE_GAIN.ambience).toBeGreaterThan(0.1);
    expect(LAYER_BASE_GAIN.ambience * 3).toBeLessThan(LAYER_BASE_GAIN.music);
  });
});

// Phase 24.2 — ผู้ใช้สั่ง 2026-09-26: "เสียงต่อสู้ เบา"
describe('ducking เพลงขณะเสียงต่อสู้ดัง (Phase 24.2)', () => {
  test('ค่า duck อยู่ในช่วงที่สมเหตุสมผล (ลดลงจริง แต่ไม่ปิดเพลง)', () => {
    expect(BATTLE_DUCK.music).toBeGreaterThan(0);
    expect(BATTLE_DUCK.music).toBeLessThan(1);
    expect(BATTLE_DUCK.ambience).toBeGreaterThan(0);
    expect(BATTLE_DUCK.ambience).toBeLessThan(1);
    expect(BATTLE_DUCK.holdSeconds).toBeGreaterThan(0);
  });

  test('duck ต้องเร็วกว่าการปรับระดับปกติมาก (ไม่งั้นไม่ทันจังหวะกระแทก)', () => {
    // GAIN_RAMP_SECONDS = 0.6 (ค่าปรับระดับปกติ) — duck ลงใน 0.02 วิ และคืนใน 0.3 วิ
    expect(BATTLE_DUCK.attackSeconds).toBeLessThan(GAIN_RAMP_SECONDS);
    expect(BATTLE_DUCK.releaseSeconds).toBeLessThan(GAIN_RAMP_SECONDS);
    // และต้องสั้นพอกับจังหวะโจมตีในเทป (การโจมตีห่างกันราว 0.3–0.9 วิ) เพลงจึงไม่เบาทั้งศึก
    expect(BATTLE_DUCK.holdSeconds + BATTLE_DUCK.releaseSeconds).toBeLessThan(0.9);
  });

  test('duck ไม่ลึกเกินไป — เพลงยังได้ยินตลอดการต่อสู้', () => {
    expect(BATTLE_DUCK.music).toBeGreaterThanOrEqual(0.5);
    expect(BATTLE_DUCK.ambience).toBeGreaterThanOrEqual(0.5);
  });

  test('เพลง/บรรยากาศเบาลงเมื่อ duck · SFX ไม่ถูกแตะ', () => {
    expect(duckedLayerGain('music', base)).toBeLessThan(layerGain('music', base));
    expect(duckedLayerGain('music', base)).toBeGreaterThan(0);
    expect(duckedLayerGain('ambience', base)).toBeLessThan(layerGain('ambience', base));
    expect(duckedLayerGain('sfx', base)).toBe(layerGain('sfx', base));
  });

  test('ชั้นที่ปิดอยู่ยังเป็น 0 แม้ duck (ไม่ปลุกเสียงที่ผู้ใช้ปิด)', () => {
    expect(duckedLayerGain('music', { ...base, music: false })).toBe(0);
    expect(duckedLayerGain('ambience', { ...base, ambience: false })).toBe(0);
  });

  test('duck ยังเคารพ "ลดเอฟเฟกต์รุนแรง" (ครึ่งหนึ่งของครึ่ง)', () => {
    const normal = duckedLayerGain('music', base);
    const reduced = duckedLayerGain('music', { ...base, reduceIntense: true });
    expect(reduced).toBeCloseTo(normal / 2, 4);
  });
});

// Phase 24.2 — regression: applyLayerGains ต้องไม่ duck ค้าง (เคยพลาด: เพลงเบาลงถาวร)
describe('applyLayerGains (เขียนค่าเกนลงบัสจริง)', () => {
  const makeGraph = () => {
    const targets: Record<string, number> = {};
    const seconds: Record<string, number> = {};
    const param = (key: string) => ({
      value: 0,
      cancelScheduledValues: () => undefined,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: (value: number, time: number) => {
        targets[key] = value;
        seconds[key] = time;
      },
    });
    return {
      graph: {
        ctx: { currentTime: 0 } as AudioContext,
        sfxBus: { gain: param('sfx') },
        musicBus: { gain: param('music') },
        ambienceBus: { gain: param('ambience') },
      } as unknown as AudioGraph,
      targets,
      seconds,
    };
  };

  test('ducked = false → เพลง/บรรยากาศได้ระดับเต็มตามการตั้งค่า (ไม่ถูก duck ค้าง)', () => {
    const { graph, targets } = makeGraph();
    applyLayerGains(graph, base, false);
    expect(targets.music).toBe(layerGain('music', base));
    expect(targets.ambience).toBe(layerGain('ambience', base));
    expect(targets.sfx).toBe(layerGain('sfx', base));
    expect(targets.music).toBeGreaterThan(duckedLayerGain('music', base));
  });

  test('ducked = true → เพลง/บรรยากาศลดลง · SFX เท่าเดิม', () => {
    const { graph, targets } = makeGraph();
    applyLayerGains(graph, base, true);
    expect(targets.music).toBe(duckedLayerGain('music', base));
    expect(targets.ambience).toBe(duckedLayerGain('ambience', base));
    expect(targets.sfx).toBe(layerGain('sfx', base));
  });

  test('ส่ง rampSeconds ได้ (duck ใช้ค่าที่เร็วกว่าปกติ)', () => {
    const { graph, seconds } = makeGraph();
    applyLayerGains(graph, base, true, BATTLE_DUCK.attackSeconds);
    expect(seconds.music).toBeCloseTo(BATTLE_DUCK.attackSeconds, 4);
  });

  test('ค่าเริ่มต้นของ rampSeconds = GAIN_RAMP_SECONDS (พฤติกรรมเดิม)', () => {
    const { graph, seconds } = makeGraph();
    applyLayerGains(graph, base);
    expect(seconds.music).toBeCloseTo(GAIN_RAMP_SECONDS, 4);
  });
});

// Phase 24.2 — ยืนยันด้วยตัวเลขว่าเสียงอยู่ในย่านที่ลำโพงมือถือออกได้ (250–4000Hz)
describe('bandEnergyShare (วัดพลังงานเสียงตามย่านความถี่)', () => {
  const makeAnalyser = (
    sampleRate: number,
    binCount: number,
    energyDb: (hz: number) => number
  ): AnalyserNode =>
    ({
      frequencyBinCount: binCount,
      context: { sampleRate },
      getFloatFrequencyData(target: Float32Array) {
        for (let i = 0; i < binCount; i += 1) {
          const hz = (i * sampleRate) / 2 / binCount;
          target[i] = energyDb(hz);
        }
      },
    }) as unknown as AnalyserNode;

  test('เสียงที่อยู่ในย่าน 250–4000Hz → สัดส่วนสูง', () => {
    const analyser = makeAnalyser(48000, 1024, (hz) => (hz >= 500 && hz <= 1000 ? -30 : -100));
    expect(bandEnergyShare(analyser, 250, 4000)).toBeGreaterThan(0.9);
  });

  test('เสียงที่อยู่แต่ความถี่ต่ำ (<100Hz) → สัดส่วนในย่านต่ำ', () => {
    const analyser = makeAnalyser(48000, 1024, (hz) => (hz < 100 ? -30 : -100));
    expect(bandEnergyShare(analyser, 250, 4000)).toBeLessThan(0.05);
  });

  test('เงียบสนิท (-Infinity) → 0 (ไม่ใช่ NaN)', () => {
    const analyser = makeAnalyser(48000, 1024, () => Number.NEGATIVE_INFINITY);
    expect(bandEnergyShare(analyser, 250, 4000)).toBe(0);
  });

  test('analyser ที่อ่านสเปกตรัมไม่ได้ → null (สคริปต์ QA ข้ามการตรวจได้)', () => {
    const analyser = { frequencyBinCount: 32 } as unknown as AnalyserNode;
    expect(bandEnergyShare(analyser, 250, 4000)).toBeNull();
  });
});
