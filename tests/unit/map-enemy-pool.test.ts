// Phase 45.8 (2026-10-27): เทสต์การสุ่มทีมศัตรูของแผนที่ฟาร์ม
//
// ที่มา: ผู้ใช้สั่ง "ให้ ChatGPT รีวิวโค้ด" → รีวิวชี้ว่าการสุ่มศัตรูเดิม (take: 200 + slice ติดกัน)
// ทำให้การ์ดที่ค้นพบใหม่ไม่มีทางออกเป็นศัตรู และทีมไม่ใช่การสุ่มจริง
// เทสต์ชุดนี้ล็อกพฤติกรรมของฟังก์ชันบริสุทธิ์ `pickDistinctIndices` (แกนของการแก้)
// หมายเหตุ: `buildRandomEnemyTeam` เป็นฟังก์ชันภายในโมดูล ⇒ ตรวจปลายทางด้วย
// `npm run verify:map-enemy-pool` (ยิงฐานข้อมูลจริง อ่านอย่างเดียว)
import { pickDistinctIndices } from '@/services/map-farm';
import { randomInt } from 'node:crypto';

describe('map farm · pickDistinctIndices (Phase 45.8)', () => {
  test('ทีมเดียวไม่มีใบซ้ำ', () => {
    for (let i = 0; i < 200; i++) {
      const team = pickDistinctIndices(255, 5, randomInt);
      expect(team).toHaveLength(5);
      expect(new Set(team).size).toBe(5);
    }
  });

  test('count มากกว่า pool → คืนเท่าที่มี (ไม่ throw)', () => {
    const result = pickDistinctIndices(3, 10, () => 0);
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
    expect([...result].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  test('pool ว่าง · count 0 · count ติดลบ → ไม่เลือกดัชนี', () => {
    expect(pickDistinctIndices(0, 5, randomInt)).toEqual([]);
    expect(pickDistinctIndices(255, 0, randomInt)).toEqual([]);
    expect(pickDistinctIndices(255, -1, randomInt)).toEqual([]);
  });

  test('สุ่ม 2,000 ครั้งบน 255 ใบ → ครอบคลุมทุกใบ รวมใบใหม่สุด (ดัชนี 254)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      for (const index of pickDistinctIndices(255, 5, randomInt)) seen.add(index);
    }
    expect(seen.size).toBe(255);
    expect(seen.has(254)).toBe(true);
  });

  test('ฉีด rnd ที่กำหนดได้ → ผลคงที่ (deterministic)', () => {
    const sequence = [4, 1, 2];
    const run = () => {
      let i = 0;
      return pickDistinctIndices(8, 3, () => sequence[i++]);
    };
    expect(run()).toEqual([4, 1, 2]);
    expect(run()).toEqual(run());
  });

  test('ดัชนีทุกตัวอยู่ในช่วง 0..poolSize-1', () => {
    for (const poolSize of [1, 2, 5, 255, 500]) {
      for (let i = 0; i < 50; i++) {
        const result = pickDistinctIndices(poolSize, 5, randomInt);
        expect(result.every((index) => index >= 0 && index < poolSize)).toBe(true);
      }
    }
  });

  test('ไม่เอนเอียงไปที่ใบใดใบหนึ่ง (ทุกดัชนีถูกเลือกในสัดส่วนที่ใกล้เคียงกัน)', () => {
    const poolSize = 60;
    const draws = 12_000;
    const hits = new Array<number>(poolSize).fill(0);
    for (let i = 0; i < draws; i++) {
      for (const index of pickDistinctIndices(poolSize, 5, randomInt)) hits[index] += 1;
    }
    const expected = (draws * 5) / poolSize;
    const min = Math.min(...hits);
    const max = Math.max(...hits);
    // การสุ่มสม่ำเสมอ: ค่าต่ำสุด/สูงสุดไม่ควรห่างจากค่าคาดหมายเกิน ±20%
    expect(min).toBeGreaterThan(expected * 0.8);
    expect(max).toBeLessThan(expected * 1.2);
  });

  test('count = poolSize → ได้ทุกดัชนีพอดี (ลำดับสลับได้)', () => {
    const result = pickDistinctIndices(7, 7, randomInt);
    expect([...result].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test('ปฏิเสธ rnd ที่คืนค่าผิดช่วง', () => {
    expect(() => pickDistinctIndices(3, 1, () => 3)).toThrow(RangeError);
    expect(() => pickDistinctIndices(3, 1, () => -1)).toThrow(RangeError);
  });
});
