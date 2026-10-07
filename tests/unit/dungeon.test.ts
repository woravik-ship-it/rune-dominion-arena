// Dungeon (Phase 31) — นิยามดัน/สเกลทีมศัตรู/หน้าต่างเวลา/รางวัล
import {
  DUNGEONS, bossWeight, findDungeon, findFloor, floorBossCount, floorDifficulty, floorDustReward,
  freeEntryStatusTh, freeHourWindows, formatFreeWindowsTh, isFloorCleared, isFreeWindowOpen,
  isRewardFloor, isWinOnlyReward, nextDungeonFloor, nextFreeOpenAt, scaleStats, enemyTeamSize,
  floorHpBonus,
  DUNGEON_TEAM_SIZE,
} from '@/lib/dungeon-definitions';
import { buildEnemyTeam } from '@/services/dungeon';
import {
  artSlotKey, dungeonCardId, dungeonEnemyInfo, parseDungeonCardId, pickArtIndex, stableHash,
} from '@/lib/dungeon-art';
import { findItemDef } from '@/lib/item-definitions';

describe('dungeon-definitions', () => {
  it('มีดันครบทั้ง 3 แบบการเข้า และมีดันฟรีหลายระดับให้ไล่เก็บ', () => {
    const entries = DUNGEONS.map((d) => d.entry);
    expect([...new Set(entries)].sort()).toEqual(['COIN', 'FREE_ALWAYS', 'FREE_TIMED']);
    expect(DUNGEONS.length).toBeGreaterThanOrEqual(5);
    expect(entries.filter((e) => e !== 'COIN').length).toBeGreaterThanOrEqual(4);
  });

  it('ไอเทมที่ดันดรอปต้องมีอยู่จริงในแคตตาล็อกช่าง (หาไม่เจอ = ดรอปไม่ได้)', () => {
    for (const dungeon of DUNGEONS) {
      for (const floor of dungeon.floors) {
        if (!floor.reward.itemDropCode) continue;
        expect(findItemDef(floor.reward.itemDropCode)).not.toBeNull();
      }
    }
  });

  // Phase 31.5 — ผู้ใช้สั่ง: "เพิ่มชั้นของแต่ละดันเจี้ยนไปอีก 20-40 ชั้น"
  it('ทุกดันมีชั้นอย่างน้อย 25 ชั้น และชั้นต่อเนื่องไม่ข้ามเลข', () => {
    for (const dungeon of DUNGEONS) {
      expect(dungeon.floors.length).toBeGreaterThanOrEqual(25);
      dungeon.floors.forEach((floor, index) => {
        expect(floor.floor).toBe(index + 1);
      });
    }
  });

  it('ชั้นลึกต้องมี "บอส 2-3 ตัว" เป็นขั้นความยากจริง และทีมยัง 5 ใบเสมอ', () => {
    for (const dungeon of DUNGEONS) {
      const doubleBoss = dungeon.floors.filter((f) => floorBossCount(f) === 2);
      const tripleBoss = dungeon.floors.filter((f) => floorBossCount(f) === 3);
      expect(doubleBoss.length).toBeGreaterThan(0);
      // ดันเสียเงินตั้งใจให้สูงสุด 2 ตัว (ผู้ใช้สั่ง: ค่าเข้าต้องคุ้ม ⇒ ต้องผ่านได้ด้วยของระดับตำนาน)
      if (dungeon.entry !== 'COIN') expect(tripleBoss.length).toBeGreaterThan(0);
      for (const floor of dungeon.floors) {
        expect(enemyTeamSize(floor)).toBe(DUNGEON_TEAM_SIZE);
        expect(floor.minions).toBe(DUNGEON_TEAM_SIZE - floorBossCount(floor));
      }
    }
  });

  it('ความยากจริง (สเกล × จำนวนบอส) ต้องเพิ่มขึ้นทุกชั้นและไม่กระโดดเกิน 20%', () => {
    for (const dungeon of DUNGEONS) {
      for (let i = 1; i < dungeon.floors.length; i += 1) {
        const prev = floorDifficulty(dungeon.floors[i - 1]);
        const current = floorDifficulty(dungeon.floors[i]);
        // ยอมให้ต่างได้ ±0.2% เพราะการปัดเศษสเกลที่ติดเพดาน
        expect(current).toBeGreaterThanOrEqual(prev - 0.002);
        expect(current / prev - 1).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('รางวัลชั้นลึกเพิ่มขึ้นเรื่อย ๆ (ยิ่งลึกยิ่งคุ้ม) และไอเทมดรอปแรงขึ้นตามช่วงชั้น', () => {
    for (const dungeon of DUNGEONS) {
      const dusts = dungeon.floors.map((f) => f.reward.dust);
      expect(dusts[dusts.length - 1]).toBeGreaterThan(dusts[0]);
      // ชั้นลึกสุดต้องให้มากกว่าชั้น 5 อย่างชัดเจน
      expect(dungeon.floors[dungeon.floors.length - 1].reward.dust).toBeGreaterThan(dungeon.floors[4].reward.dust);
    }
  });

  it('ของ mythic ต้องดรอปจากชั้นที่คนใส่ของตำนานชนะได้ (ไม่เป็นไบ่วงจร)', () => {
    for (const code of ['GILDED_ABYSS', 'STORMREACH_SPIRE']) {
      const dungeon = findDungeon(code)!;
      const ladder = dungeon.deepFloors?.dropLadder ?? [];
      const mythicRows = ladder.filter((row) => findItemDef(row.code)?.rarity === 'MYTHIC');
      expect(mythicRows.length).toBeGreaterThan(0);
      // ดันเหรียญ (คนใส่ของตำนานผ่านได้): ของ mythic ต้องอยู่ชั้นที่มีบอส ≤ 2 เท่านั้น
      if (code === 'GILDED_ABYSS') {
        for (const row of mythicRows) {
          const floor = dungeon.floors.find((f) => f.floor === row.fromFloor)!;
          expect((floor.bosses ?? 1)).toBeLessThanOrEqual(2);
        }
      }
    }
  });
  it('ทีมศัตรูทุกชั้น = 5 ใบเท่าผู้เล่น (บอส 1 + ลูกน้อง 4 จนถึงชั้นลึกที่มีบอสเพิ่ม)', () => {
    for (const d of DUNGEONS) {
      const firstFloor = d.floors[0];
      expect(enemyTeamSize(firstFloor)).toBe(DUNGEON_TEAM_SIZE);
      expect(floorBossCount(firstFloor)).toBe(1);
      expect(firstFloor.minions).toBe(DUNGEON_TEAM_SIZE - 1);
    }
  });
  it('ความยากไต่ขึ้นทุกชั้น · scale ชดเชย HP/จำนวนบอสให้ "งบความยาก" ไม่เกินเพดาน', () => {
    for (const d of DUNGEONS) {
      // (ก) ความยากรวม (floorDifficulty) ต้องไม่ลดลงเลย — เป็นตัวเลขที่ผู้เล่นเห็นเป็น "ระดับ"
      const diffs = d.floors.map((f) => floorDifficulty(f));
      for (let i = 1; i < diffs.length; i += 1) {
        expect(diffs[i]).toBeGreaterThanOrEqual(diffs[i - 1]);
      }
      // (ข) HP ที่เพิ่มขึ้นต้องถูก "หักชดเชย" จาก scale: งบ scale × น้ำหนักบอส ต้องไม่เกินความยากรวม
      for (const f of d.floors) {
        expect(f.scale * bossWeight(floorBossCount(f))).toBeLessThanOrEqual(floorDifficulty(f) + 0.001);
      }
      // (ค) ภายในกลุ่มชั้นที่จำนวนบอสเท่ากัน งบความยากต้องไต่ขึ้นเสมอ (บอสเพิ่ม = งบชดเชย ไม่ใช่ฟรี)
      const byBosses = new Map<number, number[]>();
      for (const floor of d.floors) {
        const list = byBosses.get(floorBossCount(floor)) ?? [];
        list.push(floorDifficulty(floor));
        byBosses.set(floorBossCount(floor), list);
      }
      for (const values of byBosses.values()) {
        expect(values).toEqual([...values].sort((a, b) => a - b));
      }
    }
  });
  it('ดันตามเวลาเปิดเฉพาะชั่วโมงที่กำหนด', () => {
    const timed = findDungeon('MOONLESS_RIFT')!;
    expect(isFreeWindowOpen(timed, 12)).toBe(true);
    expect(isFreeWindowOpen(timed, 3)).toBe(false);
    expect(isFreeWindowOpen(findDungeon('EMBER_CRYPT')!, 3)).toBe(true);
  });
  it('scaleStats ปัดลงเป็น integer และไม่ต่ำกว่า 1', () => {
    expect(scaleStats({ atk: 60, def: 45, hp: 220, spd: 18 }, 1.45)).toEqual({ atk: 87, def: 65, hp: 319, spd: 26 });
  });
  it('ทีมศัตรูทุกชั้นมี 5 ใบ (บอสใบแรกเก่งสุด ชดเชยจำนวนเท่ากันด้วย status)', () => {
    const team = buildEnemyTeam(findDungeon('GILDED_ABYSS')!, 4);
    expect(team).toHaveLength(DUNGEON_TEAM_SIZE);
    expect(team[0].cardId).toContain(':boss');
    expect(team[0].atk).toBeGreaterThan(team[1].atk);
    expect(team[0].hp).toBeGreaterThan(team[1].hp);
  });
  it('findFloor คืน undefined เมื่อชั้นไม่มี', () => {
    expect(findFloor(findDungeon('EMBER_CRYPT')!, 99)).toBeUndefined();
  });
});

// Phase 31.1 — ผู้ใช้สั่ง: "ระยะเวลาเข้าดันเจี้ยนฟรีตามเวลา ต้องบอกเข้าได้เป็นช่วง เวลาไหน ถึงเวลาไหน"
describe('dungeon — ช่วงเวลาเข้าฟรี (บอกเป็นช่วง)', () => {
  const rift = findDungeon('MOONLESS_RIFT')!;

  it('รวมชั่วโมงที่ติดกันเป็นช่วง (12,13,20,21 → 12:00–14:00 และ 20:00–22:00)', () => {
    expect(freeHourWindows(rift)).toEqual([
      { startHour: 12, endHour: 14 },
      { startHour: 20, endHour: 22 },
    ]);
    expect(formatFreeWindowsTh(rift)).toBe('12:00–14:00 และ 20:00–22:00');
  });

  it('รองรับช่วงคร่อมเที่ยงคืน (22,23,0,1 → 22:00–02:00)', () => {
    const overnight = { entry: 'FREE_TIMED' as const, coinCost: 0, freeHours: [22, 23, 0, 1] };
    expect(freeHourWindows(overnight)).toEqual([{ startHour: 22, endHour: 26 }]);
    expect(formatFreeWindowsTh(overnight)).toBe('22:00–02:00');
  });

  it('ตอนเปิดอยู่ บอกเวลาที่ปิดของรอบนั้น', () => {
    const status = freeEntryStatusTh(rift, new Date(2026, 0, 5, 13, 10));
    expect(status.open).toBe(true);
    expect(status.labelTh).toContain('ถึง 14:00');
    expect(status.waitTextTh).toBe('');
  });

  it('ตอนปิด บอกช่วงเวลาถัดไป + นับถอยหลัง', () => {
    const status = freeEntryStatusTh(rift, new Date(2026, 0, 5, 11, 30));
    expect(status.open).toBe(false);
    expect(status.labelTh).toContain('12:00–14:00 และ 20:00–22:00');
    expect(status.waitTextTh).toBe('เปิดอีก 30 น.');
    expect(status.nextOpenAt?.getHours()).toBe(12);

    // 23:00 → รอบถัดไปคือเที่ยงวันของวันถัดไป
    const late = freeEntryStatusTh(rift, new Date(2026, 0, 5, 23, 0));
    expect(late.nextOpenAt?.getDate()).toBe(6);
    expect(late.nextOpenAt?.getHours()).toBe(12);
    expect(nextFreeOpenAt(rift, new Date(2026, 0, 5, 12, 0))).toBeNull();
  });

  it('ดันฟรีตลอด/ดันเหรียญ เปิดได้เสมอ และอธิบายค่าเข้าให้ผู้เล่น', () => {
    const always = freeEntryStatusTh(findDungeon('EMBER_CRYPT')!, new Date(2026, 0, 5, 3, 0));
    expect(always.open).toBe(true);
    expect(always.labelTh).toBe('เปิดฟรีตลอดเวลา');

    const coin = freeEntryStatusTh(findDungeon('GILDED_ABYSS')!, new Date(2026, 0, 5, 3, 0));
    expect(coin.open).toBe(true);
    expect(coin.labelTh).toContain('35 Coin');
  });
});

// Phase 31.2 — ผู้ใช้สั่ง: "ดันเจี้ยนฟรี แจก item เฉพาะชนะเท่านั้น"
describe('dungeon — รางวัลเฉพาะเมื่อชนะ (ดันฟรี)', () => {
  const freeAlways = findDungeon('EMBER_CRYPT')!;
  const freeTimed = findDungeon('MOONLESS_RIFT')!;
  const coin = findDungeon('GILDED_ABYSS')!;

  it('ดันฟรีทั้งสองแบบ = ให้รางวัลเฉพาะเมื่อชนะ (แพ้ได้ 0)', () => {
    for (const dungeon of [freeAlways, freeTimed]) {
      expect(isWinOnlyReward(dungeon)).toBe(true);
      expect(dungeon.lossDustRatio).toBe(0);
      for (const floor of dungeon.floors) {
        expect(floorDustReward(dungeon, floor, false)).toBe(0);
        expect(floorDustReward(dungeon, floor, true)).toBe(floor.reward.dust);
      }
    }
  });

  it('ดันที่จ่าย Coin เข้า ยังได้ฝุ่นปลอบใจ 1/4 ตอนแพ้', () => {
    expect(isWinOnlyReward(coin)).toBe(false);
    const floor = coin.floors[0];
    expect(floorDustReward(coin, floor, false)).toBe(Math.floor(floor.reward.dust / 4));
    expect(floorDustReward(coin, floor, false)).toBeGreaterThan(0);
  });
});

// Phase 31.3 — ผู้ใช้สั่ง: "ชั้นที่เคยชนะแล้วก็ไม่ได้รางวัลซ้ำ"
describe('dungeon — ชั้นที่ผ่านแล้วไม่ได้รางวัลซ้ำ', () => {
  it('ชั้น ≤ bestFloor = ผ่านแล้ว (ลุยซ้ำได้แต่ไม่มีสิทธิ์รับรางวัล)', () => {
    expect(isFloorCleared(0, 1)).toBe(false); // ยังไม่เคยชนะชั้นไหน → ชั้น 1 มีสิทธิ์
    expect(isRewardFloor(0, 1)).toBe(true);
    expect(isFloorCleared(1, 1)).toBe(true); // ชนะชั้น 1 แล้ว → ซ้ำ
    expect(isFloorCleared(1, 2)).toBe(false); // ชั้น 2 ยังไม่เคยชนะ → มีสิทธิ์
    expect(isFloorCleared(3, 2)).toBe(true); // ผ่านชั้น 3 แล้ว ⇒ ชั้น 2 ก็ผ่านมาก่อน
    expect(isFloorCleared(-1, 1)).toBe(false);
  });

  it('ทุกชั้นของทุกดัน: ผ่านแล้ว = ซ้ำ · ยังไม่ผ่าน = มีสิทธิ์', () => {
    for (const dungeon of DUNGEONS) {
      for (let bestFloor = 0; bestFloor <= dungeon.floors.length; bestFloor += 1) {
        for (const floor of dungeon.floors) {
          expect(isFloorCleared(bestFloor, floor.floor)).toBe(floor.floor <= bestFloor);
          expect(isRewardFloor(bestFloor, floor.floor)).toBe(floor.floor > bestFloor);
        }
      }
    }
  });
});

// Phase 31.1 — ผู้ใช้แจ้ง: "เข้าหน้าต่อสู้ไม่ได้จริง" (การ์ดศัตรูต้องมีรหัส/ภาพ/กรอบที่ใช้ได้จริง)
describe('dungeon-art — การ์ดศัตรู', () => {
  it('รหัสการ์ดศัตรูไป-กลับได้ (boss/minion)', () => {
    expect(dungeonCardId('EMBER_CRYPT', 2, 'boss')).toBe('dungeon:EMBER_CRYPT:f2:boss');
    expect(dungeonCardId('EMBER_CRYPT', 2, 'minion', 3)).toBe('dungeon:EMBER_CRYPT:f2:minion3');
    expect(parseDungeonCardId('dungeon:EMBER_CRYPT:f2:minion3')).toEqual({
      dungeonCode: 'EMBER_CRYPT', floor: 2, kind: 'minion', index: 3,
    });
    expect(parseDungeonCardId('cmub7df9u0009treocp586wwd')).toBeNull();
    expect(parseDungeonCardId(null)).toBeNull();
  });

  it('status บนใบการ์ด = ค่าเดียวกับที่ใช้ต่อสู้จริง (บอส/ลูกน้องตามชั้น)', () => {
    const dungeon = findDungeon('GILDED_ABYSS')!;
    const floor = findFloor(dungeon, 3)!;
    // Phase 45.4: HP ไล่ขึ้นทุกชั้น (floorHpBonus) — การ์ดที่วาดกับทีมที่สู้จริงใช้ค่าเดียวกันเสมอ
    const withHp = (stats: ReturnType<typeof scaleStats>) => ({
      ...stats,
      hp: Math.max(1, Math.floor(stats.hp * floorHpBonus(floor))),
    });
    const boss = dungeonEnemyInfo(dungeon, { dungeonCode: dungeon.code, floor: 3, kind: 'boss', index: 1 })!;
    expect(boss.stats).toEqual(withHp(scaleStats(dungeon.bossBase, floor.scale)));
    expect(boss.rarity).toBe('LEGENDARY');
    expect(boss.nameTh).toContain('บอสชั้น 3');

    const minion = dungeonEnemyInfo(dungeon, { dungeonCode: dungeon.code, floor: 3, kind: 'minion', index: 2 })!;
    expect(minion.stats).toEqual(withHp(scaleStats(dungeon.minionBase, floor.scale)));
    expect(minion.rarity).toBe('RARE');
    // ทีมที่ใช้สู้จริงต้องตรงกับรหัสที่ใช้วาดการ์ด
    const team = buildEnemyTeam(dungeon, 3);
    expect(team.map((c) => c.cardId)).toContain(minion.cardId);
  });

  it('เลือกภาพ deterministic และอยู่ในช่วงของคลังภาพ', () => {
    const key = artSlotKey('MOONLESS_RIFT', 'minion', 3);
    expect(key).toBe(artSlotKey('MOONLESS_RIFT', 'minion', 1));
    expect(pickArtIndex(key, 7)).toBe(pickArtIndex(key, 7));
    expect(pickArtIndex(key, 7)).toBeLessThan(7);
    expect(stableHash('same')).toBe(stableHash('same'));
  });
});

// Phase 38 — ผู้ใช้สั่ง: "หลังต่อสู้ดันเจี้ยนชนะชั้นปัจจุบัน มีปุ่มกดไปสู่ชั้นต่อไป"
describe('ชั้นถัดไปของดันเจี้ยน (ปุ่มไปชั้นต่อไปหลังชนะ)', () => {
  it('คืนชั้นถัดไปเมื่อยังไม่ใช่ชั้นสุดท้าย', () => {
    expect(nextDungeonFloor(1, 25)).toBe(2);
    expect(nextDungeonFloor(24, 25)).toBe(25);
  });

  it('ชั้นสุดท้าย = ไม่มีชั้นถัดไป (null)', () => {
    expect(nextDungeonFloor(25, 25)).toBeNull();
    expect(nextDungeonFloor(40, 40)).toBeNull();
    expect(nextDungeonFloor(1, 0)).toBeNull();
  });

  it('ทุกดัน: ชั้น 1 ต้องมีชั้นถัดไปเสมอ และชั้นสุดท้ายต้องไม่มี', () => {
    for (const dungeon of DUNGEONS) {
      expect(nextDungeonFloor(1, dungeon.floors.length)).toBe(2);
      expect(nextDungeonFloor(dungeon.floors.length, dungeon.floors.length)).toBeNull();
    }
  });
});
