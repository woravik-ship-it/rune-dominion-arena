// Deck Compare (Phase 41) — เทียบการ์ดว่าดีขึ้น/แย่ลง ก่อนเปลี่ยนในทีม
// ผู้ใช้สั่ง: "ส่วนการ์ดที่จะเปลี่ยนควรมีระบบเปรียบเทียบว่าดีขึ้นหรือแย่ลง"
import { compareCardStats, compareVerdictLabel, deltaLabel, statScore } from '@/lib/deck-compare';

const base = { atk: 50, def: 40, hp: 120, spd: 20 };

describe('เปรียบเทียบการ์ดก่อนเปลี่ยน', () => {
  test('การ์ดใหม่แรงกว่าชัดเจน → ดีขึ้น และมี Δ ต่อค่า', () => {
    const cmp = compareCardStats(base, { atk: 60, def: 40, hp: 120, spd: 20 });
    expect(cmp.verdict).toBe('better');
    expect(cmp.lines.find((l) => l.key === 'atk')?.delta).toBe(10);
    expect(cmp.lines.find((l) => l.key === 'atk')?.trend).toBe('up');
    expect(cmp.better).toBe(1);
    expect(cmp.worse).toBe(0);
    expect(cmp.scoreDelta).toBeGreaterThan(0);
  });

  test('การ์ดใหม่ด้อยกว่า → แย่ลง', () => {
    const cmp = compareCardStats(base, { atk: 30, def: 40, hp: 120, spd: 20 });
    expect(cmp.verdict).toBe('worse');
    expect(cmp.lines.find((l) => l.key === 'atk')?.trend).toBe('down');
    expect(cmp.worse).toBe(1);
  });

  test('ต่างกันนิดเดียว → พอ ๆ กัน (ยอมรับความต่าง ±1%)', () => {
    const cmp = compareCardStats(base, { atk: 50, def: 40, hp: 120, spd: 20 });
    expect(cmp.verdict).toBe('equal');
    expect(cmp.scoreDelta).toBe(0);
  });

  test('ช่องว่าง (from = null) → ทุกค่าที่มากกว่า 0 = ดีขึ้น', () => {
    const cmp = compareCardStats(null, base);
    expect(cmp.verdict).toBe('better');
    expect(cmp.better).toBe(4);
    expect(cmp.fromScore).toBe(0);
  });

  test('คะแนนถ่วงน้ำหนักตามสูตรเดียวกัน (ATK 2 · DEF 1.2 · HP 0.35 · SPD 1.8)', () => {
    expect(statScore({ atk: 10, def: 10, hp: 10, spd: 10 })).toBe(Math.round(10 * 2 + 10 * 1.2 + 10 * 0.35 + 10 * 1.8));
  });

  test('ป้ายข้อความ/Δ ที่ UI ใช้', () => {
    expect(compareVerdictLabel('better')).toBe('ดีขึ้น');
    expect(compareVerdictLabel('worse')).toBe('แย่ลง');
    expect(compareVerdictLabel('equal')).toBe('พอ ๆ กัน');
    expect(deltaLabel(12)).toBe('+12');
    expect(deltaLabel(-5)).toBe('-5');
    expect(deltaLabel(0)).toBe('=');
  });
});
