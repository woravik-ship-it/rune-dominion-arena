// Phase 45.6 (2026-10-08): กลไก "บอสคู่พยุงกัน" — ผู้ใช้สั่ง "ทำกลไก บอส 2 ตัว"
//
// ที่มา: วัดจริง (60 ศึก/ช่อง · คลังการ์ดจริง) ว่าชั้นบอส 2 ตัวของดันฝึกหัด **ง่ายกว่า**
//   ชั้นบอส 1 ตัวก่อนหน้า (มือใหม่ชนะ 100% ที่ชั้น 15/20 เทียบ 92% ที่ชั้น 10)
//   เพราะ scale ของชั้นถูกหารด้วยน้ำหนักจำนวนบอส ⇒ ลูกน้องที่เหลืออ่อนลงมาก
// ⇒ เพิ่มกฎ: ชั้นบอสคู่ของดันที่ "วัดแล้วมีที่ว่าง" (EMBER_CRYPT) บอสทุกตัวได้พลัง ×1.25
//   ส่วนดันอื่นไม่เปิด เพราะชั้นบอสคู่ของดันนั้นเด็คเป้าหมายชนะ 82-100% = ชนกำแพงอยู่แล้ว
import {
  DUNGEONS,
  bossSynergy,
  findDungeon,
  floorBossCount,
} from '@/lib/dungeon-definitions';
import { dungeonEnemyInfo, dungeonEnemySlots } from '@/lib/dungeon-art';

/** ผลรวม stat ของการ์ดศัตรู 1 ใบ */
function powerOfStats(stats: { atk: number; def: number; hp: number; spd: number }): number {
  return stats.atk + stats.def + stats.hp + stats.spd;
}

describe('ดันเจี้ยน: กลไกบอสคู่พยุงกัน (Phase 45.6)', () => {
  it('เปิดใช้เฉพาะดันฝึกหัด (ดันอื่นปิด เพื่อไม่ให้ชั้นบอสคู่กลายเป็นกำแพงที่ผ่านไม่ได้)', () => {
    const enabled = DUNGEONS.filter((d) => d.pairedBossBoost === true).map((d) => d.code);
    expect(enabled).toEqual(['EMBER_CRYPT']);
    for (const dungeon of DUNGEONS) {
      // ชั้นบอสเดียว/บอสสาม ไม่ได้รับโบนัสนี้ (กฎคือ "บอสคู่" เท่านั้น)
      expect(bossSynergy(dungeon, 1)).toBe(1);
      expect(bossSynergy(dungeon, 3)).toBe(1);
      if (dungeon.pairedBossBoost) expect(bossSynergy(dungeon, 2)).toBeGreaterThan(1);
      else expect(bossSynergy(dungeon, 2)).toBe(1);
    }
  });

  it('บอสในชั้นบอสคู่ของดันฝึกหัด ต้องแรงกว่าบอสตัวเดียวกันที่ไม่ถูกเปิดโบนัส', () => {
    const dungeon = findDungeon('EMBER_CRYPT')!;
    const floor = dungeon.floors.find((f) => floorBossCount(f) >= 2)!;
    const boss = dungeonEnemyInfo(dungeon, {
      dungeonCode: dungeon.code, floor: floor.floor, kind: 'boss', index: 1,
    })!;
    // บอสตัวเดียวกันถ้าไม่ถูกคูณโบนัส — สูตรเดียวกับที่ระบบใช้ (scaleStats ปัดลง)
    const base = dungeon.bossBase;
    const without = {
      atk: Math.max(1, Math.trunc(base.atk * floor.scale)),
      def: Math.max(1, Math.trunc(base.def * floor.scale)),
      hp: Math.max(1, Math.trunc(base.hp * floor.scale)),
      spd: Math.max(1, Math.trunc(base.spd * floor.scale)),
    };
    expect(powerOfStats(boss.stats)).toBeGreaterThan(powerOfStats(without));
  });

  it('ชั้นบอสคู่มีบอส 2 ตัวจริง และบอสทุกตัวได้โบนัสเท่ากัน', () => {
    const dungeon = findDungeon('EMBER_CRYPT')!;
    const floor = dungeon.floors.find((f) => floorBossCount(f) === 2)!;
    const bosses = dungeonEnemySlots(floor).filter((slot) => slot.kind === 'boss');
    expect(bosses).toHaveLength(2);
    const infos = bosses.map((slot) =>
      dungeonEnemyInfo(dungeon, {
        dungeonCode: dungeon.code, floor: floor.floor, kind: 'boss', index: slot.index,
      })!
    );
    expect(infos[0].stats.atk).toBe(infos[1].stats.atk);
    expect(infos[0].stats.hp).toBe(infos[1].stats.hp);
  });

  it('ลูกน้องในชั้นบอสคู่ไม่ได้รับโบนัส (โบนัสเฉพาะบอส)', () => {
    const dungeon = findDungeon('EMBER_CRYPT')!;
    const floor = dungeon.floors.find((f) => floorBossCount(f) === 2)!;
    const minion = dungeonEnemyInfo(dungeon, {
      dungeonCode: dungeon.code, floor: floor.floor, kind: 'minion', index: 1,
    })!;
    expect(minion.stats.atk).toBe(Math.max(1, Math.trunc(dungeon.minionBase.atk * floor.scale)));
    expect(minion.stats.spd).toBe(Math.max(1, Math.trunc(dungeon.minionBase.spd * floor.scale)));
  });
});
