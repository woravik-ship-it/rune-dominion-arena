// เทสต์ภาพพื้นหลังแผนที่ (Map 2026-10-03) — prompt กำหนดผลได้จากโซน และปลอดภัยต่อการ gen
import { buildMapBackgroundPrompt } from '@/lib/ai-image';
import { isPromptSafe } from '@/lib/image-placeholder';
import { MAP_ZONES } from '@/lib/map-zones';

describe('map background prompt', () => {
  test('prompt มีคำสำคัญฉากกว้าง + ห้าม UI/text และผ่านการตรวจเนื้อหา', () => {
    const zone = MAP_ZONES[0];
    const prompt = buildMapBackgroundPrompt({
      id: zone.id, nameTh: zone.nameTh, name: zone.name,
      descriptionTh: zone.descriptionTh, tier: zone.tier,
      palette: zone.palette, mood: zone.mood,
    });
    expect(prompt.toLowerCase()).toContain('map background');
    expect(prompt.toLowerCase()).toMatch(/no (text|ui)/);
    expect(prompt.length).toBeGreaterThan(0);
    expect(isPromptSafe(prompt)).toBe(true);
  });

  test('ทุกโซนทั้ง 5 สร้าง prompt ที่ปลอดภัยได้ (พร้อม gen) + มีชื่อโซนอยู่ใน prompt', () => {
    for (const zone of MAP_ZONES) {
      const prompt = buildMapBackgroundPrompt({
        id: zone.id, nameTh: zone.nameTh, name: zone.name,
        descriptionTh: zone.descriptionTh, tier: zone.tier,
        palette: zone.palette, mood: zone.mood,
      });
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain(zone.nameTh);
      expect(isPromptSafe(prompt)).toBe(true);
    }
  });
});