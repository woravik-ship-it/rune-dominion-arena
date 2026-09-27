// Dungeon Balance (Phase 31.4) — กันความยากเพี้ยน
//
// ผู้ใช้สั่ง: "ปรับความยากของดันเจี้ยนลดลงหน่อย ชั้นแรกๆ ให้มือใหม่ได้ชนะบ้าง และปรับให้ยากขึ้นทีละนิด"
// → เทสต์นี้จำลอง "เด็คอ้างอิง" 3 ระดับ (มือใหม่ / นักสู้ / ติดของ) แล้ววัด % ชนะจากเอนจินจริง
//   เพื่อกันไม่ให้อนาคตมีใครแก้ตัวเลขจนมือใหม่แพ้ทุกครั้ง หรือดันสูงสุดกลายเป็นของเล่นเด็ก
import { buildBattleSeed, type CombatCard } from '@/services/combat';
import { simulateBattle } from '@/services/combat-engine';
import { DUNGEONS, findDungeon, floorDifficulty } from '@/lib/dungeon-definitions';
import { dungeonEnemyInfo, dungeonEnemySlots } from '@/lib/dungeon-art';

const ELEMENTS = ['EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'VEILMARKED'];

/** สร้างเด็คอ้างอิง 5 ใบ (status ต่อใบเท่ากัน — ค่าเฉลี่ยที่วัดจากเด็คจริงในคลังการ์ด) */
function referenceDeck(name: string, per: { atk: number; def: number; hp: number; spd: number }): CombatCard[] {
  return Array.from({ length: 5 }, (_, i) => ({
    cardId: `${name}-${i + 1}`,
    name: `${name} ${i + 1}`,
    nameTh: `${name} ${i + 1}`,
    element: ELEMENTS[i % ELEMENTS.length],
    atk: per.atk, def: per.def, hp: per.hp, spd: per.spd,
  }));
}

// วัดจากคลังการ์ดจริง 178 ใบ (ดู scripts/calibrate-dungeons.mts)
const BEGINNER = referenceDeck('มือใหม่', { atk: 50, def: 40, hp: 115, spd: 24 });
const VETERAN = referenceDeck('นักสู้', { atk: 100, def: 68, hp: 200, spd: 33 });
const GEARED = referenceDeck('ติดของ', { atk: 170, def: 133, hp: 355, spd: 76 }); // + Item ระดับตำนาน 3 ช่อง
const MYTHIC = referenceDeck('ติดของเทพ', { atk: 215, def: 208, hp: 510, spd: 119 }); // + Item ระดับ mythic 3 ช่อง (ดันสูงสุดต้องใช้ชุดนี้)

/** ดันระดับที่ชั้น 3 บอสเป็นเป้าหมายของคนติดของ mythic (ดันสูงสุดของเกม) */
function mythicTierDungeon(code: string): boolean {
  return code === 'GILDED_ABYSS';
}

function buildEnemy(code: string, floorNo: number): CombatCard[] {
  const dungeon = findDungeon(code)!;
  const floor = dungeon.floors.find((f) => f.floor === floorNo)!;
  return dungeonEnemySlots(floor).map((slot) => {
    const info = dungeonEnemyInfo(dungeon, {
      dungeonCode: code, floor: floorNo, kind: slot.kind, index: slot.index,
    })!;
    return {
      cardId: info.cardId, name: info.name, nameTh: info.nameTh, element: info.element,
      atk: info.stats.atk, def: info.stats.def, hp: info.stats.hp, spd: info.stats.spd,
    };
  });
}

/** % ชนะของเด็คอ้างอิงในชั้นนั้น */
function winRate(deck: CombatCard[], code: string, floorNo: number, battles = 24): number {
  const enemy = buildEnemy(code, floorNo);
  let wins = 0;
  for (let i = 0; i < battles; i += 1) {
    const seed = buildBattleSeed(`balance:${code}:f${floorNo}:${i}`, deck.map((c) => c.cardId), enemy.map((c) => c.cardId), 'balance');
    if (simulateBattle(deck, enemy, seed).winner === 'A') wins += 1;
  }
  return Math.round((wins / battles) * 100);
}

describe('ดันเจี้ยน — ความยากต้องให้มือใหม่ชนะชั้นแรกได้ และยากขึ้นทีละนิด', () => {
  test('ดันฝึกหัด (สุสานเพลิง) ชั้น 1 มือใหม่ต้องชนะได้บ่อย', () => {
    expect(winRate(BEGINNER, 'EMBER_CRYPT', 1)).toBeGreaterThanOrEqual(70);
  });

  test('ชั้นถัดไปยากขึ้น (อัตราชนะไม่เพิ่มขึ้น) และยังพอชนะได้บ้าง', () => {
    const rates = [1, 2, 3].map((floor) => winRate(BEGINNER, 'EMBER_CRYPT', floor));
    expect(rates[1]).toBeLessThanOrEqual(rates[0]);
    expect(rates[2]).toBeLessThanOrEqual(rates[1]);
    expect(rates[2]).toBeGreaterThanOrEqual(25);
  });

  test('สเต็ปความยากต่อชั้นไม่กระโดด (ความยากจริงต่างกันไม่เกิน 20%)', () => {
    for (const dungeon of DUNGEONS) {
      for (let i = 1; i < dungeon.floors.length; i += 1) {
        const step = floorDifficulty(dungeon.floors[i]) / floorDifficulty(dungeon.floors[i - 1]) - 1;
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(0.2);
      }
    }
  });

  test('ดันฟรีมีหลายระดับให้ไล่เก็บ (มือใหม่→กลาง→ท้าย) และของรางวัลเพิ่มตามระดับ', () => {
    const free = DUNGEONS.filter((d) => d.entry !== 'COIN');
    expect(free.length).toBeGreaterThanOrEqual(4);
    const firstFloorDust = free.map((d) => d.floors[0].reward.dust);
    expect(firstFloorDust).toEqual([...firstFloorDust].sort((a, b) => a - b));
    // ดันสูงสุดของดันฟรีต้องให้มากกว่าดันเหรียญชั้นแรก (เข้าฟรียากกว่าแต่คุ้มกว่า)
    const topFree = free[free.length - 1].floors[free[free.length - 1].floors.length - 1].reward.dust;
    expect(topFree).toBeGreaterThan(100);
  });

  test('ดันระดับกลางขึ้นไปต้องไม่ใช่ของเล่นของมือใหม่', () => {
    expect(winRate(BEGINNER, 'MOONLESS_RIFT', 1)).toBeLessThanOrEqual(60);
    expect(winRate(BEGINNER, 'STORMREACH_SPIRE', 1)).toBeLessThanOrEqual(20);
  });

  test('ดันสูงสุดยังต้องเป็นเป้าหมายของคนติดของ (ชนะได้แต่ไม่ง่าย)', () => {
    expect(winRate(VETERAN, 'GILDED_ABYSS', 1)).toBeLessThanOrEqual(50);
    expect(winRate(GEARED, 'STORMREACH_SPIRE', 1)).toBeGreaterThanOrEqual(50);
  });

  // Phase 31.5: ชั้นลึกต้องมีคนติดของชนะได้ (ไม่ใช่ชั้นที่ผ่านไม่ได้ตลอดกาล) แต่ต้องไม่ใช่ของเล่นมือใหม่
  test('ชั้นท้ายของดันกลาง-สูง: มือใหม่ชนะไม่ได้ · คนติดของต้องชนะได้', () => {
    for (const dungeon of DUNGEONS.filter((d) => d.code !== 'EMBER_CRYPT')) {
      const last = dungeon.floors[dungeon.floors.length - 1];
      // ชั้นที่ให้ของ mythic ตั้งใจให้เป็นเป้าหมายของคนที่ใส่ของ mythic แล้ว (ดันระดับสูงสุด)
      const geared = mythicTierDungeon(dungeon.code) && (last.bosses ?? 1) >= 3 ? MYTHIC : GEARED;
      expect(winRate(BEGINNER, dungeon.code, last.floor)).toBeLessThanOrEqual(30);
      expect(winRate(geared, dungeon.code, last.floor)).toBeGreaterThanOrEqual(50);
    }
  });

  test('ดันฝึกหัดไล่จนจบได้ด้วยเด็คเริ่มต้น (ไม่ใช่บันไดที่จบไม่ได้)', () => {
    const ember = findDungeon('EMBER_CRYPT')!;
    const last = ember.floors[ember.floors.length - 1];
    expect(winRate(BEGINNER, 'EMBER_CRYPT', last.floor)).toBeGreaterThanOrEqual(40);
    expect(winRate(GEARED, 'EMBER_CRYPT', last.floor)).toBeGreaterThanOrEqual(50);
  });

  test('ชั้นลึกมีบอส 2-3 ตัว และคนติดของยังผ่านได้ (ดันกลาง/สูง)', () => {
    for (const code of ['MOONLESS_RIFT', 'GILDED_ABYSS', 'STORMREACH_SPIRE']) {
      const dungeon = findDungeon(code)!;
      const twoBoss = dungeon.floors.filter((f) => (f.bosses ?? 1) === 2).pop()!;
      const threeBoss = dungeon.floors.filter((f) => (f.bosses ?? 1) === 3).pop()!;
      expect(winRate(GEARED, code, twoBoss.floor)).toBeGreaterThanOrEqual(50);
      const geared = mythicTierDungeon(code) ? MYTHIC : GEARED;
      expect(winRate(geared, code, threeBoss.floor)).toBeGreaterThanOrEqual(50);
    }
  });
});
