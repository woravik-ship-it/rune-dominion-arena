// Phase 45.4 (2026-10-07): เทสต์เส้นความยากดันเจี้ยน "ไล่ทุกชั้น"
// ผู้ใช้สั่ง: "ช่วยปรับความยาก ดันเจี้ยน แต่ละชั้น ให้มีความต่างอย่างพอดี ให้รู้สึกว่าเปลี่ยนระดับ"
// ข้อที่ต้องกันไว้: (ก) ทุกชั้นต้อง "ต่างจากชั้นก่อน" จริง (ข) ต้องไม่ยากขึ้นจนเกินเพดานที่วัดได้
//                 (ค) รางวัลไล่ขึ้นทุกชั้นเช่นกัน แต่ปลายทางเท่าเดิม (เศรษฐกิจไม่เปลี่ยน)
import {
  DUNGEONS,
  HP_DIFFICULTY_WEIGHT,
  bossWeight,
  floorDifficulty,
  floorHpBonus,
  type DungeonDef,
} from '@/lib/dungeon-definitions';

/** ดันที่มีชั้นลึก (สร้างอัตโนมัติ) — คือดันที่ผู้เล่นเล่นจริง */
const DEEP: DungeonDef[] = DUNGEONS.filter((d) => (d.deepFloors?.extra ?? 0) > 0);

describe('ดันเจี้ยน: เส้นความยาก (Phase 45.4)', () => {
  it('มีดันเจี้ยนที่ใช้สูตรชั้นลึกครบ 5 แห่ง', () => {
    expect(DUNGEONS).toHaveLength(5);
    expect(DEEP).toHaveLength(5);
  });

  it.each(DEEP.map((d) => [d.nameTh, d] as const))(
    '%s — ความยากเพิ่มขึ้นทุกชั้น ไม่มีชั้นไหนเท่ากันเป๊ะ',
    (_name, dungeon) => {
      const diffs = dungeon.floors.map((f) => floorDifficulty(f));
      for (let i = 1; i < diffs.length; i += 1) {
        expect(diffs[i]).toBeGreaterThan(diffs[i - 1]);
      }
      // ยืนยันว่าไม่มี "บล็อก 5 ชั้นที่เท่ากันเป๊ะ" แบบเดิม
      expect(new Set(diffs).size).toBe(dungeon.floors.length);
    }
  );

  it.each(DEEP.map((d) => [d.nameTh, d] as const))(
    '%s — ชั้นสุดท้ายไม่ยากเกินเพดานที่วัดได้ (cap × น้ำหนักบอส × น้ำหนัก HP)',
    (_name, dungeon) => {
      const cap = dungeon.deepFloors!.difficultyCap;
      const hpCap = dungeon.deepFloors!.hpCap ?? 1.45;
      const raw = dungeon.floors.map(
        (f) => f.scale * bossWeight(Math.max(1, f.bosses ?? 1)) * (1 + (floorHpBonus(f) - 1) * HP_DIFFICULTY_WEIGHT)
      );
      // ชั้นสุดท้ายของดัน = cap เต็ม (ไม่เกิน) และไม่เกิน cap × ตัวคูณ HP สูงสุด
      expect(raw[raw.length - 1]).toBeLessThanOrEqual(cap * (1 + (hpCap - 1) * 0.5) + 0.001);
      // ชั้นแรกต้องไม่ยากเท่าชั้นสุดท้าย (มีระยะให้รู้สึกว่าไล่ระดับจริง)
      expect(raw[0]).toBeLessThan(raw[raw.length - 1]);
    }
  );

  it.each(DEEP.map((d) => [d.nameTh, d] as const))(
    '%s — HP ศัตรูไล่ขึ้นทุกชั้นและไม่เกินเพดาน',
    (_name, dungeon) => {
      const hpCap = dungeon.deepFloors!.hpCap ?? 1.45;
      const hps = dungeon.floors.map((f) => floorHpBonus(f));
      expect(hps[0]).toBeGreaterThanOrEqual(1);
      expect(hps[hps.length - 1]).toBeLessThanOrEqual(hpCap);
      for (let i = 1; i < hps.length; i += 1) {
        expect(hps[i]).toBeGreaterThanOrEqual(hps[i - 1]);
      }
      // ชั้นท้าย ๆ ต้องมี HP สูงกว่าชั้นแรกจริง (เป็นแกนความอึดที่ไล่ขึ้น)
      expect(hps[hps.length - 1]).toBeGreaterThan(hps[0]);
    }
  );

  it.each(DEEP.map((d) => [d.nameTh, d] as const))(
    '%s — รางวัล (ฝุ่น/เศษ veil) ไล่ขึ้นทุกชั้นแต่ไม่เกินปลายทางเดิม',
    (_name, dungeon) => {
      const dusts = dungeon.floors.map((f) => f.reward.dust);
      for (let i = 1; i < dusts.length; i += 1) {
        expect(dusts[i]).toBeGreaterThanOrEqual(dusts[i - 1]);
      }
      expect(dusts[dusts.length - 1]).toBeGreaterThan(dusts[0]);
      const shards = dungeon.floors.map((f) => f.reward.shards);
      expect(shards[shards.length - 1]).toBeGreaterThan(shards[0]);
    }
  );

  it('ชั้นที่มีบอส 2/3 ตัวยังเป็นหมุดหมายรายบล็อก (บล็อก 3 → 2 ตัว · บล็อก 5 → 3 ตัว)', () => {
    for (const dungeon of DEEP) {
      const def = dungeon.deepFloors!;
      const at = (floor: number) => Math.max(1, dungeon.floors[floor - 1]?.bosses ?? 1);
      expect(at((def.doubleBossBlock - 1) * 5 + 1)).toBe(2);
      expect(at((def.tripleBossBlock - 1) * 5 + 1)).toBe(3);
    }
  });
});
