// Phase 45.7 (2026-10-08): เทสต์คู่มือผู้เล่นใหม่ — ผู้ใช้สั่ง "ทำ Game guide สำหรับผู้เล่นใหม่
// เอาไว้กดดูได้จากเมนูในหน้าแรก"
//
// กันอะไร:
//  (ก) คีย์ i18n ที่หน้าคู่มือใช้ ต้องมีในพจนานุกรม **ทั้ง 2 ภาษา** ⇒ ผู้เล่นไม่มีทางเห็นคีย์ดิบ
//  (ข) โครงข้อมูล (หัวข้อ/แผน 7 วัน/FAQ) ต้องครบและลิงก์ต้องเป็นเส้นทางในเกมจริง
import { TH } from '@/lib/i18n/dict-th';
import { EN } from '@/lib/i18n/dict-en';
import {
  GUIDE_FAQ,
  GUIDE_FULL_MANUAL_URL,
  GUIDE_PLAN,
  GUIDE_SECTIONS,
  guideI18nKeys,
} from '@/lib/guide';

describe('คู่มือผู้เล่นใหม่ (guide)', () => {
  it('มีหัวข้อหลักอย่างน้อย 7 หัวข้อ · id ไม่ซ้ำ · ทุกหัวข้อมีบรรทัดอธิบาย', () => {
    expect(GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(7);
    const ids = GUIDE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of GUIDE_SECTIONS) {
      expect(section.icon.length).toBeGreaterThan(0);
      expect(section.bullets.length).toBeGreaterThanOrEqual(3);
      for (const link of section.links ?? []) {
        expect(link.href.startsWith('/')).toBe(true);
      }
    }
    // 3 ขั้นแรกต้องมีปุ่มพาไปทำจริง
    const start = GUIDE_SECTIONS.find((s) => s.id === 'start')!;
    expect(start.links?.map((l) => l.href)).toEqual(['/discover', '/decks', '/battle']);
  });

  it('แผน 7 วันแรกมี 7 ข้อ และลิงก์ทุกข้อชี้ไปหน้าในเกม', () => {
    expect(GUIDE_PLAN).toHaveLength(7);
    for (const step of GUIDE_PLAN) {
      expect(step.href.startsWith('/')).toBe(true);
      expect(step.dayKey.startsWith('guide.plan.')).toBe(true);
    }
    expect(GUIDE_PLAN.map((s) => s.href)).toContain('/dungeons');
    expect(GUIDE_PLAN.map((s) => s.href)).toContain('/arena');
  });

  it('FAQ มีอย่างน้อย 5 ข้อ (คำถาม-คำตอบคู่กัน)', () => {
    expect(GUIDE_FAQ.length).toBeGreaterThanOrEqual(5);
    for (const faq of GUIDE_FAQ) {
      expect(faq.qKey.endsWith(faq.aKey.replace('.a', '.q'))).toBe(true);
    }
  });

  it('คีย์ i18n ทุกตัวที่หน้าคู่มือใช้ มีครบทั้งพจนานุกรมไทยและอังกฤษ', () => {
    const keys = guideI18nKeys();
    expect(keys.length).toBeGreaterThan(60);
    const missingTh = keys.filter((key) => !(key in TH));
    const missingEn = keys.filter((key) => !(key in EN));
    expect(missingTh).toEqual([]);
    expect(missingEn).toEqual([]);
    // ข้อความต้องไม่ว่างและต้องไม่ใช่คีย์ตัวเอง (พิมพ์ผิดจนโชว์คีย์)
    for (const key of keys) {
      expect((TH as Record<string, string>)[key].trim().length).toBeGreaterThan(0);
      expect((EN as Record<string, string>)[key].trim().length).toBeGreaterThan(0);
      expect((TH as Record<string, string>)[key]).not.toBe(key);
    }
  });

  it('เมนู "คู่มือผู้เล่นใหม่" มีคีย์ชื่อเมนูทั้ง 2 ภาษา และลิงก์คู่มือฉบับเต็มเป็น https', () => {
    expect(TH['nav.guide' as keyof typeof TH]).toBeTruthy();
    expect(EN['nav.guide' as keyof typeof EN]).toBeTruthy();
    expect(GUIDE_FULL_MANUAL_URL.startsWith('https://')).toBe(true);
    expect(GUIDE_FULL_MANUAL_URL).toContain('docs/manual/index.html');
  });
});
