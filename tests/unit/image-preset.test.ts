
import { resolveImagePreset, premiumRarities } from '@/lib/ai-image';

// Phase 14.5: ผู้ใช้กำหนดให้การ์ดทั่วไปใช้ "ประหยัดสุด" และให้เฉพาะ EPIC ขึ้นไปใช้สูงขึ้น
describe('resolveImagePreset (ค่าใช้จ่ายตามระดับความหายาก)', () => {
  const ORIGINAL = { ...process.env };

  const setEnv = (overrides: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  test('การ์ดทั่วไป (COMMON/UNCOMMON/RARE) → standard (ประหยัดสุด)', () => {
    setEnv({
      AI_IMAGE_MODEL: 'gpt-image-1-mini',
      AI_IMAGE_QUALITY: 'low',
      AI_IMAGE_PREMIUM_QUALITY: 'medium',
      AI_IMAGE_SIZE: '1536x1024',
      AI_IMAGE_PREMIUM_RARITIES: undefined,
    });

    for (const rarity of ['COMMON', 'UNCOMMON', 'RARE']) {
      const preset = resolveImagePreset(rarity);
      expect(preset.label).toBe('standard');
      expect(preset.model).toBe('gpt-image-1-mini');
      expect(preset.quality).toBe('low');
    }
  });

  test('EPIC/LEGENDARY/MYTHIC → premium (คุณภาพสูงขึ้นนิดหน่อย)', () => {
    setEnv({
      AI_IMAGE_MODEL: 'gpt-image-1-mini',
      AI_IMAGE_QUALITY: 'low',
      AI_IMAGE_PREMIUM_QUALITY: 'medium',
      AI_IMAGE_PREMIUM_RARITIES: undefined,
    });

    for (const rarity of ['EPIC', 'LEGENDARY', 'MYTHIC']) {
      const preset = resolveImagePreset(rarity);
      expect(preset.label).toBe('premium');
      expect(preset.quality).toBe('medium');
    }
  });

  test('ปรับรายชื่อระดับที่ใช้ premium ได้ผ่าน env', () => {
    setEnv({ AI_IMAGE_PREMIUM_RARITIES: 'MYTHIC', AI_IMAGE_QUALITY: 'low', AI_IMAGE_PREMIUM_QUALITY: 'high' });

    expect(resolveImagePreset('EPIC').label).toBe('standard');
    expect(resolveImagePreset('MYTHIC').label).toBe('premium');
    expect(resolveImagePreset('MYTHIC').quality).toBe('high');
  });

  test('ไม่ตั้งค่า env → ค่าเริ่มต้นคือ mini/low และ premium medium', () => {
    setEnv({
      AI_IMAGE_MODEL: 'gpt-image-1-mini',
      AI_IMAGE_QUALITY: undefined,
      AI_IMAGE_PREMIUM_QUALITY: undefined,
      AI_IMAGE_SIZE: undefined,
      AI_IMAGE_PREMIUM_RARITIES: undefined,
    });

    expect(resolveImagePreset('COMMON')).toMatchObject({ label: 'standard', quality: 'low', size: '1536x1024' });
    expect(resolveImagePreset('EPIC')).toMatchObject({ label: 'premium', quality: 'medium' });
    expect(premiumRarities()).toEqual(['EPIC', 'LEGENDARY', 'MYTHIC']);
  });
});
