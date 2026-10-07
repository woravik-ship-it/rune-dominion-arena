// เทสต์ระบบแผนที่ฟาร์ม (Map) 2026-10-03 · รอบ 3: 5 แผนที่แยกกัน × 15 จุด
//  - Stamina หลอด 100 · 1 พลังค้นหา = +20 · ค่าเดินทางคิดจากจุดที่ยืนอยู่จริง (ข้ามแผนที่แพงกว่า)
//  - ศัตรูสุ่ม 1-5 ใบ · ดรอปโค้ดต้องมีจริง · rollMapRewards ตรงกฎ
import {
  MAP_NODES,
  MAP_ZONES,
  STAMINA_MAX,
  STAMINA_PER_ENERGY,
  findMapNode,
  nodesInZone,
  pickEnemyCount,
  travelStaminaCost,
} from '@/lib/map-zones';
import { rollMapRewards } from '@/services/map-farm';
import { findItemDef } from '@/lib/item-definitions';

describe('map-zones — โครงสร้าง (5 แผนที่ × 15 จุด = 75)', () => {
  it('Stamina คงที่ 100/20 · 75 จุด id ไม่ซ้ำ · 5 แผนที่', () => {
    expect(STAMINA_MAX).toBe(100);
    expect(STAMINA_PER_ENERGY).toBe(20);
    expect(MAP_NODES).toHaveLength(75);
    expect(new Set(MAP_NODES.map((n) => n.id)).size).toBe(75);
    expect(new Set(MAP_NODES.map((n) => n.zone)).size).toBe(5);
    expect(MAP_ZONES.map((z) => z.id)).toEqual([
      'EMBERFIELD', 'SUNSCAR', 'FROSTREACH', 'MOONFALL', 'VOIDGATE',
    ]);
  });

  it('โค้ด Item ที่ดรอปทุกตัวมีอยู่จริงในแคตตาล็อก', () => {
    for (const node of MAP_NODES) {
      for (const drop of node.drops) {
        expect(findItemDef(drop.code)).not.toBeNull();
      }
    }
  });

  it('ทุกแผนที่มี 15 จุด และจุดในแผนที่เดียวกันไม่ซ้อนพิกัดกัน (กระจายดี)', () => {
    const counts = new Map<string, number>();
    for (const node of MAP_NODES) counts.set(node.zone, (counts.get(node.zone) ?? 0) + 1);
    for (const zone of MAP_ZONES) expect(counts.get(zone.id)).toBe(15);
    for (const zone of MAP_ZONES) {
      const coords = nodesInZone(zone.id).map((n) => `${n.x},${n.y}`);
      expect(new Set(coords).size).toBe(15);
    }
  });

  it('Stamina คิดจากจุดที่ยืนอยู่จริง (ย้ายจุด → ค่าเดินทางเปลี่ยนตามระยะ)', () => {
    const n1 = findMapNode('EMBERFIELD-n1')!; // มุมซ้ายบน (x5,y9)
    const n8 = findMapNode('EMBERFIELD-n8')!; // กลางแผนที่ (x36,y5)
    const far = findMapNode('EMBERFIELD-n14')!; // ปลายขวาสุดของแผนที่ (x58,y16)
    const fromN1 = travelStaminaCost(n1, far);
    const fromN8 = travelStaminaCost(n8, far);
    // ยืนใกล้กว่า → ถูกกว่า / ยืนไกลกว่า → แพงกว่า (ไม่ได้ใช้ค่าประจำจุดตายตัว)
    expect(fromN8).toBeLessThan(fromN1);
    // ยืนปลายแผนที่ → ไปจุดใกล้เสีย Stamina น้อยกว่าไปจุดไกลฝั่งตรงข้าม
    expect(travelStaminaCost(far, findMapNode('EMBERFIELD-n13')!)).toBeLessThan(
      travelStaminaCost(far, n1)
    );
  });

  it('ข้ามแผนที่เสีย Stamina มากกว่าเดินภายในแผนที่เดิม (แผนที่แยกจากกัน)', () => {
    const ember = findMapNode('EMBERFIELD-n1')!;
    const emberFar = findMapNode('EMBERFIELD-n14')!;
    const sun = findMapNode('SUNSCAR-n1')!;
    // จากจุดเดิม: ไปต่างแผนที่ (ไกล) แพงกว่าไปปลายแผนที่เดิม
    expect(travelStaminaCost(ember, sun)).toBeGreaterThan(travelStaminaCost(ember, emberFar));
    // จากจุดเริ่มต้น: แผนที่ถัดไปแพงกว่าแผนที่แรก
    expect(travelStaminaCost(null, sun)).toBeGreaterThan(travelStaminaCost(null, ember));
  });

  it('รางวัลไกลไกลดีขึ้น (jewelWeight/ฝุ่น/Shards เพิ่มตามลำดับจุด)', () => {
    const nodes = nodesInZone('VOIDGATE');
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i].jewelWeight).toBeGreaterThan(nodes[i - 1].jewelWeight);
      expect(nodes[i].dust).toBeGreaterThan(nodes[i - 1].dust);
      expect(nodes[i].shards).toBeGreaterThanOrEqual(nodes[i - 1].shards);
    }
  });

  it('ศัตรูสุ่มอยู่ในช่วง 1..5 เสมอ', () => {
    for (let i = 0; i < 30; i += 1) {
      const count = pickEnemyCount((n) => 0);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it('ทุกจุดดรอปอัญมณีตีบวกได้ (jewelWeight > 0 — หาได้จากแผนที่เท่านั้น ไม่มีการขาย)', () => {
    for (const node of MAP_NODES) {
      expect(node.jewelWeight).toBeGreaterThan(0);
    }
  });
});

describe('rollMapRewards — ดรอป', () => {
  const node = {
    dust: 10,
    shards: 2,
    drops: [
      { code: 'ATK_WHETSTONE', weight: 100 },
      { code: 'ATK_STORMFANG', weight: 1 },
    ],
    jewelWeight: 500,
  };

  it('rnd=0 → ได้ชิ้นแรก + ดรอปอัญมณี (0 < 500)', () => {
    const r = rollMapRewards(node, () => 0);
    expect(r.itemCode).toBe('ATK_WHETSTONE');
    expect(r.dust).toBe(10);
    expect(r.shards).toBe(2);
    expect(r.jewel).toBe(1);
  });

  it('rnd สูง (≥ jewelWeight) → ไม่ได้อัญมณี', () => {
    const r = rollMapRewards(node, (n: number) => (n > 1 ? 999 : 0));
    expect(r.jewel).toBe(0);
    expect(r.itemCode).toBe('ATK_STORMFANG');
  });
});