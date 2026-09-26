import {
  DEFAULT_GENERATION_SECONDS,
  MAX_GENERATION_SECONDS,
  MIN_GENERATION_SECONDS,
  estimateEtaSeconds,
  etaPhraseKey,
  etaPhraseVars,
  normalizeAvgSeconds,
} from '@/lib/image-eta';

describe('ประมาณเวลาสร้างภาพการ์ด (Phase 20)', () => {
  it('ไม่มีข้อมูลเวลาเฉลี่ย → ใช้ค่าตั้งต้น', () => {
    expect(normalizeAvgSeconds(null)).toBe(DEFAULT_GENERATION_SECONDS);
    expect(normalizeAvgSeconds(0)).toBe(DEFAULT_GENERATION_SECONDS);
    expect(normalizeAvgSeconds(-5)).toBe(DEFAULT_GENERATION_SECONDS);
    expect(normalizeAvgSeconds(Number.NaN)).toBe(DEFAULT_GENERATION_SECONDS);
  });

  it('จำกัดค่าที่ผิดปกติให้อยู่ในช่วงที่สมเหตุสมผล', () => {
    expect(normalizeAvgSeconds(0.5)).toBe(MIN_GENERATION_SECONDS);
    expect(normalizeAvgSeconds(9999)).toBe(MAX_GENERATION_SECONDS);
    expect(normalizeAvgSeconds(30)).toBe(30);
  });

  it('งานที่อยู่คิวแรกและไม่มีงานกำลังทำ = รอ 1 เท่าของเวลาเฉลี่ย', () => {
    expect(estimateEtaSeconds({ queuePosition: 0, inFlight: false, avgSeconds: 20 })).toBe(20);
  });

  it('มีงานกำลังทำอยู่ → รอทั้งงานที่ทำอยู่และงานของตัวเอง (2 เท่า)', () => {
    expect(estimateEtaSeconds({ queuePosition: 0, inFlight: true, avgSeconds: 20 })).toBe(40);
  });

  it('มีงานรอข้างหน้า 3 งาน + งานกำลังทำ → 5 เท่าของเวลาเฉลี่ย', () => {
    expect(estimateEtaSeconds({ queuePosition: 3, inFlight: true, avgSeconds: 15 })).toBe(75);
  });

  it('ค่า queuePosition ติดลบถือเป็น 0', () => {
    expect(estimateEtaSeconds({ queuePosition: -4, inFlight: false, avgSeconds: 10 })).toBe(10);
  });

  it('เลือกหน่วยข้อความตามจำนวนวินาที', () => {
    expect(etaPhraseKey(30)).toBe('image.etaSeconds');
    expect(etaPhraseKey(90)).toBe('image.etaMinutes');
    expect(etaPhraseKey(0)).toBe('image.etaUnknown');
    expect(etaPhraseVars(45)).toBe(45);
    expect(etaPhraseVars(90)).toBe(2); // ปัดเป็นนาที
    expect(etaPhraseVars(0)).toBe(0);
  });
});
