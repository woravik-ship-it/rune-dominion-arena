// Ambience engine tests — Phase 21 (เสียงบรรยากาศที่สังเคราะห์เอง)
import {
  AMBIENCE_SEED,
  AMBIENCE_SHIMMER,
  ambiencePlan,
  generateNoiseSamples,
  mulberry32,
} from '@/lib/ambience';

describe('ตัวสร้างเลขสุ่ม (mulberry32)', () => {
  test('ค่าเดียวกันทุกครั้งเมื่อใช้ seed เดิม (เสียงบรรยากาศซ้ำได้)', () => {
    const a = mulberry32(AMBIENCE_SEED);
    const b = mulberry32(AMBIENCE_SEED);
    const first = [a(), a(), a()];
    const second = [b(), b(), b()];
    expect(first).toEqual(second);
  });

  test('ค่าอยู่ในช่วง 0..1', () => {
    const rnd = mulberry32(12345);
    for (let i = 0; i < 200; i += 1) {
      const value = rnd();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('generateNoiseSamples', () => {
  test('ได้จำนวนตัวอย่างตามที่ขอ และค่าอยู่ในย่าน -1..1', () => {
    const samples = generateNoiseSamples(500);
    expect(samples.length).toBe(500);
    for (const value of samples) {
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
  });

  test('ไม่มีค่าศูนย์ทั้งหมด (มีเสียงจริง) และไม่แบนเป็นค่าคงที่', () => {
    const samples = generateNoiseSamples(1000);
    const max = Math.max(...Array.from(samples, Math.abs));
    expect(max).toBeGreaterThan(0.001);
    const unique = new Set(Array.from(samples));
    expect(unique.size).toBeGreaterThan(50);
  });

  test('ให้ผลเหมือนเดิมทุกครั้ง (deterministic) — เทสต์เทียบสองรอบ', () => {
    expect(Array.from(generateNoiseSamples(200))).toEqual(Array.from(generateNoiseSamples(200)));
  });

  test('ขอ 0 ตัวอย่าง → ได้อาร์เรย์ว่าง (ไม่ throw)', () => {
    expect(generateNoiseSamples(0).length).toBe(0);
    expect(generateNoiseSamples(-5).length).toBe(0);
  });
});

describe('ambiencePlan (ลดเอฟเฟกต์รุนแรง)', () => {
  test('โหมดปกติใช้ค่าฐานของตัวกรอง', () => {
    const plan = ambiencePlan(false);
    expect(plan.filterFrequency).toBeGreaterThan(0);
    expect(plan.lfoDepth).toBeGreaterThan(0);
  });

  test('ตัวกรองอยู่ในย่านที่ลำโพงมือถือถ่ายทอดได้ (Phase 22 รอบ 2)', () => {
    // เดิม 260Hz — ลำโพงมือถือแทบไม่ออก ⇒ ผู้ใช้แจ้งว่า "Ambience เบามาก"
    const plan = ambiencePlan(false);
    expect(plan.filterFrequency).toBeGreaterThanOrEqual(350);
    expect(plan.filterFrequency).toBeLessThan(1000);
  });

  test('โหมดลดความเข้ม → แกว่งน้อยลง (LFO เบาลง)', () => {
    const normal = ambiencePlan(false);
    const reduced = ambiencePlan(true);
    expect(reduced.lfoDepth).toBeLessThan(normal.lfoDepth);
    expect(reduced.lfoFrequency).toBeLessThan(normal.lfoFrequency);
  });

  test('เสียงประกายอยู่ในย่านความถี่สูงและเบามาก', () => {
    expect(Math.min(...AMBIENCE_SHIMMER.frequencies)).toBeGreaterThan(1000);
    expect(AMBIENCE_SHIMMER.gain).toBeLessThan(0.05);
    expect(AMBIENCE_SHIMMER.everySeconds).toBeGreaterThan(5);
  });

  test('ประกายดังพอได้ยิน (Phase 22 รอบ 2 — เดิม 0.02 เบาจนไม่ได้ยิน)', () => {
    expect(AMBIENCE_SHIMMER.gain).toBeGreaterThan(0.02);
  });
});
