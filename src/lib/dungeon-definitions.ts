// Dungeon Definitions — Phase 31: ดันเจี้ยนหาวัตถุดิบคราฟต์
// ไฟล์บริสุทธิ์ (ไม่แตะ DB) — ศัตรูกำหนด status เอง ไม่ผูก CardDefinition
export type DungeonEntryKind = 'FREE_ALWAYS' | 'FREE_TIMED' | 'COIN';
export interface DungeonRewardDef {
  dust: number; shards: number;
  itemDropCode: string | null; itemDropChance: number;
}
export interface DungeonFloorDef {
  floor: number; nameTh: string;
  /** จำนวนลูกน้อง (รวมกับบอสแล้วต้องได้ 5 ใบ = ขนาดทีม) */
  minions: number;
  /** จำนวนบอสในชั้นนี้ (ไม่ระบุ = 1) — ชั้นลึกใช้ 2-3 ตัวเป็นขั้นความยากจริง */
  bosses?: number;
  scale: number;
  reward: DungeonRewardDef;
}

/** ชั้นลึกที่สร้างอัตโนมัติต่อจากชั้นที่เขียนมือ (ผู้ใช้สั่ง 2026-09-27: "เพิ่มชั้นไปอีก 20-40 ชั้น") */
export interface DungeonDeepFloorsDef {
  /** จำนวนชั้นลึกที่เพิ่มต่อจากชั้นที่เขียนมือ */
  extra: number;
  /**
   * เพดาน "ความยากจริง" (effective difficulty = scale × น้ำหนักจำนวนบอส)
   * ชั้นลึกจะไล่เข้าใกล้ค่านี้แบบ asymptotic แล้วค่อย ๆ นิ่ง
   */
  difficultyCap: number;
  /** อัตราเข้าใกล้เพดานต่อชั้น (0-1 · ยิ่งน้อยยิ่งชัน) */
  ratio: number;
  /** ตัวคูณรางวัล (ฝุ่นเวท) ต่อชั้น */
  rewardGrowth: number;
  /** ชั้นที่เริ่มมีบอส 2 ตัว / 3 ตัว (นับเลขชั้นจริง) */
  doubleBossAt: number;
  tripleBossAt: number;
  /** ชื่อชั้นลึก (วนใช้ตามลำดับ) */
  deepNames: string[];
  /** บันไดไอเทมดรอปตามชั้น (ใช้รายการสุดท้ายที่ fromFloor ≤ ชั้นนั้น) */
  dropLadder: Array<{ fromFloor: number; code: string; chance: number }>;
}

export interface DungeonDef {
  code: string; name: string; nameTh: string; descriptionTh: string; icon: string;
  entry: DungeonEntryKind; coinCost: number; freeHours: number[];
  minionBase: { atk: number; def: number; hp: number; spd: number };
  bossBase: { atk: number; def: number; hp: number; spd: number };
  elements: string[];
  /**
   * สัดส่วนฝุ่นเวทที่ได้เมื่อ "แพ้" (0 = ไม่ได้อะไรเลย)
   * ผู้ใช้สั่ง 2026-09-27: "ดันเจี้ยนฟรี แจก item เฉพาะชนะเท่านั้น"
   *  ⇒ ดันฟรี (ฟรีตลอด/ฟรีตามเวลา) = 0 · ดันที่จ่าย Coin เข้า = 1/4 (จ่ายไปแล้ว ได้ปลอบใจ)
   */
  lossDustRatio: number;
  floors: DungeonFloorDef[];
  /** ตัวสร้างชั้นลึก (ไม่ระบุ = ใช้ floors ที่เขียนมือเท่านั้น) */
  deepFloors?: DungeonDeepFloorsDef;
}

/** ขนาดทีมต่อศึก (ผู้เล่น 5 ใบ = ศัตรู 5 ใบ) */
export const DUNGEON_TEAM_SIZE = 5;

/** เพดานเลขชั้นสูงสุดที่รับได้ (ใช้ตรวจ input ของ API) */
export const DUNGEON_MAX_FLOOR = 60;

/**
 * ค่าที่ต้องใช้คิด "เวลาเข้าฟรี/ค่าเข้า"
 * — ประกาศแยกไว้เพื่อให้หน้าเว็บ (client) ใช้สูตรเดียวกันได้ โดยไม่ต้องโหลดนิยามทั้งก้อน
 * (Phase 31.1: เดิมหน้าเว็บพิมพ์เวลาเป็นรายชั่วโมง `12:00, 13:00, 20:00, 21:00` อ่านไม่รู้ว่าเข้าได้ถึงกี่โมง)
 */
export interface FreeEntryConfig {
  entry: DungeonEntryKind;
  coinCost: number;
  freeHours: number[];
}

/** ช่วงเวลาที่เข้าฟรี (หน่วยชั่วโมง) — ครอบ `[startHour, endHour)` · `endHour` เกิน 24 ได้เมื่อคร่อมเที่ยงคืน */
export interface FreeHourWindow {
  startHour: number;
  endHour: number;
}

export interface FreeEntryStatus {
  open: boolean;
  /** ประโยคบอกสถานะให้ผู้เล่นอ่าน (ไม่มีศัพท์หลังบ้าน/รหัสเทคนิค) */
  labelTh: string;
  /** ข้อความนับเวลาถอยหลังถึงรอบถัดไป ('' เมื่อเปิดอยู่แล้ว) */
  waitTextTh: string;
  /** เวลาที่จะเปิดรอบถัดไป (null = เปิดอยู่/ไม่ใช่ดันตามเวลา) */
  nextOpenAt: Date | null;
}

const BUILD_DUNGEONS: DungeonDef[] = [
  {
    code: 'EMBER_CRYPT', name: 'Ember Crypt', nameTh: 'สุสานเพลิง',
    descriptionTh: 'ดันฝึกหัด — เข้าฟรีตลอด ดรอปฝุ่นเวทสำหรับคราฟต์ของพื้นฐาน',
    icon: '🔥', entry: 'FREE_ALWAYS', coinCost: 0, freeHours: [], lossDustRatio: 0,
    minionBase: { atk: 26, def: 14, hp: 95, spd: 11 },
    bossBase: { atk: 52, def: 30, hp: 240, spd: 15 },
    elements: ['EMBERBOUND', 'ROOTFORGED'],
    floors: [
      { floor: 1, nameTh: 'ปากทางเถ้าถ่าน', minions: 4, scale: 1.0, reward: { dust: 10, shards: 2, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'โถงถ่านคุ', minions: 4, scale: 1.1, reward: { dust: 14, shards: 3, itemDropCode: 'ATK_WHETSTONE', itemDropChance: 15 } },
      { floor: 3, nameTh: 'ห้องบัลลังก์เพลิง', minions: 4, scale: 1.22, reward: { dust: 20, shards: 5, itemDropCode: 'ATK_WHETSTONE', itemDropChance: 25 } },
    ],
    // เพิ่มอีก 22 ชั้น → รวม 25 ชั้น (ผู้ใช้สั่ง: เพิ่มชั้นไปอีก 20-40 ชั้น)
    deepFloors: {
      extra: 22, difficultyCap: 1.38, ratio: 0.9, rewardGrowth: 1.06,
      doubleBossAt: 13, tripleBossAt: 21,
      deepNames: ['ห้วงเถ้าถ่าน', 'โถงถ่านหลอม', 'เหวเถ้าร้อน', 'ห้องธุลีเพลิง', 'ปล่องลาวา', 'บัลลังก์เถ้า'],
      dropLadder: [
        { fromFloor: 4, code: 'ATK_WHETSTONE', chance: 20 },
        { fromFloor: 7, code: 'DEF_OAK_BUCKLER', chance: 20 },
        { fromFloor: 10, code: 'SUP_SWIFT_CHARM', chance: 20 },
        { fromFloor: 14, code: 'ATK_ASHEN_SPIKE', chance: 18 },
        { fromFloor: 18, code: 'DEF_IRONWEAVE', chance: 18 },
        { fromFloor: 22, code: 'SUP_DUSKVEIL', chance: 18 },
        { fromFloor: 25, code: 'ATK_EMBER_FANG', chance: 15 },
      ],
    },
  },
  {
    code: 'TIDAL_SANCTUM', name: 'Tidal Sanctum', nameTh: 'วิหารน้ำขึ้น',
    descriptionTh: 'ดันกลาง — เข้าฟรีตลอด ดรอปฝุ่นเวทหนาและของช่างระดับกลาง',
    icon: '🌊', entry: 'FREE_ALWAYS', coinCost: 0, freeHours: [], lossDustRatio: 0,
    minionBase: { atk: 36, def: 22, hp: 128, spd: 15 },
    bossBase: { atk: 71, def: 44, hp: 323, spd: 21 },
    elements: ['TIDEBORN', 'SKYRIVEN', 'DAWNSWORN'],
    floors: [
      { floor: 1, nameTh: 'บันไดปะการัง', minions: 4, scale: 1.0, reward: { dust: 18, shards: 4, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'โถงน้ำตื้น', minions: 4, scale: 1.06, reward: { dust: 26, shards: 6, itemDropCode: 'DEF_IRONWEAVE', itemDropChance: 15 } },
      { floor: 3, nameTh: 'สระแสงจันทร์', minions: 4, scale: 1.12, reward: { dust: 36, shards: 9, itemDropCode: 'ATK_ASHEN_SPIKE', itemDropChance: 18 } },
      { floor: 4, nameTh: 'แก่นวิหาร', minions: 4, scale: 1.18, reward: { dust: 48, shards: 12, itemDropCode: 'SUP_DUSKVEIL', itemDropChance: 20 } },
    ],
    // เพิ่มอีก 24 ชั้น → รวม 28 ชั้น
    deepFloors: {
      extra: 24, difficultyCap: 1.42, ratio: 0.9, rewardGrowth: 1.06,
      doubleBossAt: 13, tripleBossAt: 22,
      deepNames: ['ห้วงน้ำลึก', 'ถ้ำปะการังดำ', 'สระแสงจันทร์ลึก', 'ระเบียงคลื่นเงียบ', 'แกนสมุทร', 'วังน้ำวน'],
      dropLadder: [
        { fromFloor: 5, code: 'DEF_IRONWEAVE', chance: 20 },
        { fromFloor: 8, code: 'ATK_ASHEN_SPIKE', chance: 20 },
        { fromFloor: 11, code: 'SUP_DUSKVEIL', chance: 20 },
        { fromFloor: 15, code: 'DEF_TIDEWALL', chance: 18 },
        { fromFloor: 19, code: 'ATK_EMBER_FANG', chance: 18 },
        { fromFloor: 23, code: 'SUP_MOONLIT_TONIC', chance: 18 },
        { fromFloor: 27, code: 'ATK_MOONLESS_BLADE', chance: 12 },
      ],
    },
  },
  {
    code: 'MOONLESS_RIFT', name: 'Moonless Rift', nameTh: 'รอยแยกไร้จันทร์',
    descriptionTh: 'ดันตามเวลา — เข้าฟรีเฉพาะช่วงที่กำหนด ดรอปของกลาง-แรง',
    icon: '🌙', entry: 'FREE_TIMED', coinCost: 0, freeHours: [12, 13, 20, 21], lossDustRatio: 0,
    minionBase: { atk: 55, def: 36, hp: 190, spd: 19 },
    bossBase: { atk: 110, def: 74, hp: 494, spd: 25 },
    elements: ['VEILMARKED', 'DAWNSWORN', 'SKYRIVEN'],
    floors: [
      { floor: 1, nameTh: 'ม่านชั้นนอก', minions: 4, scale: 1.0, reward: { dust: 28, shards: 6, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'ม่านชั้นกลาง', minions: 4, scale: 1.04, reward: { dust: 40, shards: 9, itemDropCode: 'ATK_ASHEN_SPIKE', itemDropChance: 15 } },
      { floor: 3, nameTh: 'ม่านชั้นใน', minions: 4, scale: 1.08, reward: { dust: 55, shards: 12, itemDropCode: 'ATK_EMBER_FANG', itemDropChance: 20 } },
      { floor: 4, nameTh: 'ใจกลางรอยแยก', minions: 4, scale: 1.12, reward: { dust: 72, shards: 16, itemDropCode: 'ATK_MOONLESS_BLADE', itemDropChance: 12 } },
    ],
    // เพิ่มอีก 24 ชั้น → รวม 28 ชั้น
    deepFloors: {
      extra: 24, difficultyCap: 1.5, ratio: 0.9, rewardGrowth: 1.06,
      doubleBossAt: 12, tripleBossAt: 21,
      deepNames: ['ม่านบิดเบี้ยว', 'โถงไร้ดาว', 'ซอกจันทราแตก', 'ห้วงคำสาป', 'ประตูไร้แสง', 'แกนม่านเงา'],
      dropLadder: [
        { fromFloor: 5, code: 'ATK_ASHEN_SPIKE', chance: 20 },
        { fromFloor: 8, code: 'SUP_DUSKVEIL', chance: 20 },
        { fromFloor: 11, code: 'ATK_EMBER_FANG', chance: 20 },
        { fromFloor: 15, code: 'DEF_DAWNSTONE', chance: 16 },
        { fromFloor: 19, code: 'SUP_MOONLIT_TONIC', chance: 18 },
        { fromFloor: 23, code: 'ATK_MOONLESS_BLADE', chance: 15 },
        { fromFloor: 27, code: 'SUP_EMBERHEART', chance: 12 },
      ],
    },
  },
  {
    code: 'GILDED_ABYSS', name: 'Gilded Abyss', nameTh: 'เหวลึกทองคำ',
    descriptionTh: 'ดันเหรียญ — จ่าย Coin เข้า ดรอปหนักที่สุด (ของคราฟต์ระดับสูง)',
    icon: '💰', entry: 'COIN', coinCost: 50, freeHours: [], lossDustRatio: 0.25,
    minionBase: { atk: 97, def: 65, hp: 331, spd: 23 },
    bossBase: { atk: 194, def: 132, hp: 878, spd: 29 },
    elements: ['TIDEBORN', 'DAWNSWORN', 'VEILMARKED', 'EMBERBOUND'],
    floors: [
      { floor: 1, nameTh: 'บันไดทอง', minions: 4, scale: 1.0, reward: { dust: 45, shards: 10, itemDropCode: 'DEF_TIDEWALL', itemDropChance: 12 } },
      { floor: 2, nameTh: 'คลังสมบัติ', minions: 4, scale: 1.05, reward: { dust: 62, shards: 14, itemDropCode: 'DEF_TIDEWALL', itemDropChance: 18 } },
      { floor: 3, nameTh: 'บัลลังก์เหว', minions: 4, scale: 1.10, reward: { dust: 85, shards: 18, itemDropCode: 'ATK_MOONLESS_BLADE', itemDropChance: 15 } },
      { floor: 4, nameTh: 'ก้นเหวทองคำ', minions: 4, scale: 1.16, reward: { dust: 110, shards: 24, itemDropCode: 'ATK_RIFTRENDER', itemDropChance: 12 } },
    ],
    // เพิ่มอีก 26 ชั้น → รวม 30 ชั้น
    deepFloors: {
      extra: 26, difficultyCap: 1.42, ratio: 0.9, rewardGrowth: 1.06,
      doubleBossAt: 12, tripleBossAt: 22,
      deepNames: ['อุโมงค์ทองคำ', 'คลังลึกลับ', 'เหวฉายทอง', 'บ่อหลอมสมบัติ', 'โลงทองคำ', 'ก้นเหวมรณะ'],
      dropLadder: [
        { fromFloor: 5, code: 'DEF_TIDEWALL', chance: 20 },
        { fromFloor: 8, code: 'ATK_EMBER_FANG', chance: 20 },
        { fromFloor: 12, code: 'ATK_MOONLESS_BLADE', chance: 18 },
        { fromFloor: 15, code: 'DEF_DAWNSTONE', chance: 18 },
        { fromFloor: 18, code: 'SUP_EMBERHEART', chance: 18 },
        { fromFloor: 21, code: 'SUP_SELENE_SIGIL', chance: 12 },
        // ของ mythic ต้องดรอปจากชั้นที่มีบอส ≤ 2 (ชั้นที่คนใส่ของตำนานชนะได้) ไม่งั้นจะไบ่วงจร
        { fromFloor: 14, code: 'ATK_STORMFANG', chance: 10 },
        { fromFloor: 17, code: 'DEF_TITANHEART', chance: 10 },
        { fromFloor: 20, code: 'SUP_WORLDSEED', chance: 10 },
      ],
    },
  },
  {
    code: 'STORMREACH_SPIRE', name: 'Stormreach Spire', nameTh: 'ยอดหอพายุ',
    descriptionTh: 'ดันสูงสุดที่มีให้เข้าฟรี — เปิดช่วงเย็น ดรอปฝุ่นเวทหนาและของระดับตำนาน',
    icon: '⚡', entry: 'FREE_TIMED', coinCost: 0, freeHours: [18, 19], lossDustRatio: 0,
    minionBase: { atk: 108, def: 74, hp: 371, spd: 27 },
    bossBase: { atk: 215, def: 149, hp: 993, spd: 33 },
    elements: ['SKYRIVEN', 'VEILMARKED', 'TIDEBORN', 'EMBERBOUND'],
    floors: [
      { floor: 1, nameTh: 'ลานลมกรด', minions: 4, scale: 1.0, reward: { dust: 70, shards: 16, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'บันไดเมฆ', minions: 4, scale: 1.04, reward: { dust: 92, shards: 20, itemDropCode: 'SUP_DUSKVEIL', itemDropChance: 20 } },
      { floor: 3, nameTh: 'หอคอยสายฟ้า', minions: 4, scale: 1.08, reward: { dust: 118, shards: 26, itemDropCode: 'DEF_TITANHEART', itemDropChance: 10 } },
      { floor: 4, nameTh: 'ยอดพายุ', minions: 4, scale: 1.12, reward: { dust: 150, shards: 32, itemDropCode: 'ATK_STORMFANG', itemDropChance: 10 } },
      { floor: 5, nameTh: 'ดวงตาพายุ', minions: 4, scale: 1.17, reward: { dust: 190, shards: 40, itemDropCode: 'SUP_WORLDSEED', itemDropChance: 8 } },
    ],
    // เพิ่มอีก 35 ชั้น → รวม 40 ชั้น
    deepFloors: {
      extra: 35, difficultyCap: 1.24, ratio: 0.9, rewardGrowth: 1.05,
      doubleBossAt: 10, tripleBossAt: 20,
      deepNames: ['บันไดฟ้าคำราม', 'หอคอยเมฆดำ', 'ห้วงลมกรด', 'ระเบียงสายฟ้า', 'ใจกลางพายุ', 'ดวงตาพายุ'],
      dropLadder: [
        { fromFloor: 6, code: 'SUP_DUSKVEIL', chance: 22 },
        { fromFloor: 10, code: 'DEF_IRONWEAVE', chance: 22 },
        { fromFloor: 14, code: 'ATK_ASHEN_SPIKE', chance: 22 },
        { fromFloor: 18, code: 'DEF_TIDEWALL', chance: 20 },
        { fromFloor: 22, code: 'ATK_MOONLESS_BLADE', chance: 18 },
        { fromFloor: 26, code: 'DEF_DAWNSTONE', chance: 18 },
        { fromFloor: 26, code: 'ATK_RIFTRENDER', chance: 14 },
        { fromFloor: 30, code: 'DEF_VEILGUARD', chance: 14 },
        { fromFloor: 34, code: 'SUP_SELENE_SIGIL', chance: 12 },
        { fromFloor: 38, code: 'SUP_WORLDSEED', chance: 10 },
      ],
    },
  },
];
export const DUNGEON_ENTRY_LABEL: Record<DungeonEntryKind, string> = {
  FREE_ALWAYS: 'เข้าฟรีตลอด', FREE_TIMED: 'เข้าฟรีตามเวลา', COIN: 'ใช้เหรียญเข้า',
};

/**
 * น้ำหนักความยากของ "องค์ประกอบทีม" (บอส 2-3 ตัว) — ค่าคงที่ที่วัดจากของจริง
 *
 * วัดด้วย `npm run calibrate:dungeons -- --scan <ดัน>:<ชั้น> --deck <legendary|mythic>`:
 * ทีม "บอส 2 + ลูกน้อง 3" ที่สเกล ×0.72 ≫ ยังชนะได้ แต่ ×0.9 เริ่มแพ้ ⇒ น้ำหนัก ≈ 1.4
 * และ "บอส 3 + ลูกน้อง 2" ที่ ×0.60 ยังชนะได้ แต่ ×0.75 เริ่มแพ้ ⇒ น้ำหนัก ≈ 1.7
 * (บอสมี HP/ATK ต่อใบสูงกว่าลูกน้องมาก ⇒ ทีมที่มีบอสเพิ่มจึงยากกว่าที่จำนวนใบบอก)
 */
export function bossWeight(bosses: number): number {
  if (bosses >= 3) return 1.7;
  if (bosses === 2) return 1.4;
  return 1;
}

/**
 * ตัวชี้วัด "ความยากจริง" ของชั้น = สเกล × น้ำหนักองค์ประกอบทีม
 * (ชั้นที่มีบอส 2-3 ตัวใช้สเกลต่ำกว่าชดเชย ⇒ ต้องดูคู่นี้จึงเทียบความยากได้)
 */
export function floorDifficulty(floor: DungeonFloorDef): number {
  return Math.round(floor.scale * bossWeight(floorBossCount(floor)) * 1000) / 1000;
}

/** จำนวนบอสของชั้น (ไม่ระบุ = 1) */
export function floorBossCount(floor: DungeonFloorDef): number {
  return Math.max(1, Math.trunc(floor.bosses ?? 1));
}

/** ขนาดทีมศัตรูของชั้นนี้ (บอส + ลูกน้อง = 5 ใบ เท่าฝั่งผู้เล่นเสมอ) */
export function enemyTeamSize(floor: DungeonFloorDef): number {
  return floorBossCount(floor) + floor.minions;
}

/**
 * สร้าง "ชั้นลึก" ต่อจากชั้นที่เขียนมือ (Phase 31.5 — ผู้ใช้สั่ง "เพิ่มชั้นไปอีก 20-40 ชั้น")
 *
 * เหตุผลที่ใช้สูตร ไม่เขียนมือทีละชั้น:
 *  - 5 ดัน × 20-40 ชั้น = 150+ บรรทัดข้อมูลที่ดูแลยาก และตัวเลขจะเพี้ยนเมื่อปรับสมดุล
 *  - ความยากไล่แบบ asymptotic: ยากขึ้นทุกชั้นแล้วค่อย ๆ นิ่งที่ `cap`
 *    (เอนจินต่อสู้ตัดสินด้วย "ใครตายก่อน" ⇒ เพิ่มสเกลมาก ๆ ต่อชั้นจะกลายเป็นแพ้ 100% ทันที)
 *  - ชั้นลึกเพิ่ม "จำนวนบอส" (2 → 3 ตัว) เป็นขั้นความยากจริง โดยลดสเกลลงชดเชย
 *    ⇒ ผู้เล่นยังรู้สึกว่ายากขึ้น แต่ไม่กระโดดข้ามกำแพง
 */
export function buildDeepFloors(dungeon: DungeonDef): DungeonFloorDef[] {
  const def = dungeon.deepFloors;
  const written = dungeon.floors;
  if (!def || def.extra <= 0) return written;
  const last = written[written.length - 1];
  const floors: DungeonFloorDef[] = [...written];

  for (let step = 1; step <= def.extra; step += 1) {
    const floorNo = last.floor + step;
    const bosses = floorNo >= def.tripleBossAt ? 3 : floorNo >= def.doubleBossAt ? 2 : 1;
    // "ความยากจริง" ไล่เข้าใกล้เพดาน แล้วแปลงกลับเป็นสเกลของชั้นนั้น
    // (ชั้นที่มีบอส 2-3 ตัวได้สเกลต่ำลง ⇒ ความยากต่อเนื่อง ไม่กระโดดข้ามกำแพง)
    const lastDifficulty = floorDifficulty(last);
    const difficulty = def.difficultyCap - (def.difficultyCap - lastDifficulty) * Math.pow(def.ratio, step);
    const scale = Number((difficulty / bossWeight(bosses)).toFixed(3));
    const growth = Math.pow(def.rewardGrowth, step);
    const drop = [...def.dropLadder].reverse().find((row) => row.fromFloor <= floorNo);
    floors.push({
      floor: floorNo,
      nameTh: def.deepNames[(step - 1) % def.deepNames.length],
      bosses,
      minions: DUNGEON_TEAM_SIZE - bosses,
      scale,
      reward: {
        dust: Math.round(last.reward.dust * growth),
        shards: Math.round(last.reward.shards * Math.pow(def.rewardGrowth, step * 0.8)),
        itemDropCode: drop?.code ?? null,
        itemDropChance: drop?.chance ?? 0,
      },
    });
  }
  return floors;
}

/** นิยามดันเจี้ยนทั้งหมด (ชั้น = ที่เขียนมือ + ชั้นลึกที่สร้างอัตโนมัติ) */
export const DUNGEONS: DungeonDef[] = BUILD_DUNGEONS.map((dungeon) => ({
  ...dungeon,
  floors: buildDeepFloors(dungeon),
}));

export function findDungeon(code: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.code === code);
}
export function findFloor(dungeon: DungeonDef, floor: number): DungeonFloorDef | undefined {
  return dungeon.floors.find((f) => f.floor === floor);
}
/** ตรวจว่าเข้าฟรีตามเวลาได้ไหม (ชั่วโมงเวลาเซิร์ฟเวอร์) */
export function isFreeWindowOpen(dungeon: DungeonDef, hour: number): boolean {
  if (dungeon.entry !== 'FREE_TIMED') return dungeon.entry === 'FREE_ALWAYS';
  return dungeon.freeHours.includes(hour);
}
/**
 * ฝุ่นเวทที่ได้จากชั้นนี้
 *  - ชนะ → เต็มตามนิยามชั้น
 *  - แพ้ → ตาม `lossDustRatio` ของดันนั้น (ดันฟรี = 0 ⇒ ได้เฉพาะเมื่อชนะ · ดันเหรียญ = 1/4)
 */
export function floorDustReward(dungeon: DungeonDef, floor: DungeonFloorDef, won: boolean): number {
  if (won) return floor.reward.dust;
  return Math.max(0, Math.floor(floor.reward.dust * dungeon.lossDustRatio));
}

/** ดันนี้ให้รางวัล "เฉพาะเมื่อชนะ" ไหม (ดันฟรี = ใช่ · ไม่มีฝุ่นปลอบใจตอนแพ้) */
export function isWinOnlyReward(dungeon: DungeonDef): boolean {
  return dungeon.lossDustRatio <= 0;
}

/**
 * ชั้นนี้ "เคยชนะแล้ว" หรือยัง — ใช้ตัดสินสิทธิ์รับรางวัล
 *
 * ผู้ใช้สั่ง 2026-09-27: *"ชั้นที่เคยชนะแล้วก็ไม่ได้รางวัลซ้ำ"*
 *  - ชั้นปลดล็อกตามลำดับ (เข้าชั้น N ได้ต้องชนะชั้น N-1) ⇒ `ชั้น ≤ bestFloor` = ผ่านแล้ว
 *  - ผ่านแล้วยังลุยซ้ำได้ (ซ้อม/เก็บเควส) แต่ **ไม่ได้รางวัล**
 */
export function isFloorCleared(bestFloor: number, floorNo: number): boolean {
  return floorNo <= Math.max(0, Math.trunc(bestFloor));
}

/** ชั้นนี้มีสิทธิ์รับรางวัลไหม (ต้องยังไม่เคยชนะชั้นนี้) */
export function isRewardFloor(bestFloor: number, floorNo: number): boolean {
  return !isFloorCleared(bestFloor, floorNo);
}

/** สเกล status ฐานด้วยตัวคูณชั้น (ปัดลงเป็น integer) */
export function scaleStats(
  base: { atk: number; def: number; hp: number; spd: number },
  scale: number
): { atk: number; def: number; hp: number; spd: number } {
  return {
    atk: Math.max(1, Math.floor(base.atk * scale)),
    def: Math.max(0, Math.floor(base.def * scale)),
    hp: Math.max(1, Math.floor(base.hp * scale)),
    spd: Math.max(1, Math.floor(base.spd * scale)),
  };
}

// ===== ช่วงเวลาเข้าฟรี (Phase 31.1) =====
// เดิมส่งให้หน้าเว็บเป็น "รายชั่วโมง" ผู้เล่นอ่านแล้วไม่รู้ว่าเข้าได้ถึงกี่โมง
// ⇒ รวมชั่วโมงที่ติดกันเป็น "ช่วง" แล้วแสดงเป็น 12:00–14:00 และ 20:00–22:00

/** จำนวนชั่วโมงที่ติดกัน → รวมเป็นช่วงเดียว (รองรับช่วงคร่อมเที่ยงคืน เช่น 22:00–02:00) */
export function freeHourWindows(config: FreeEntryConfig): FreeHourWindow[] {
  if (config.entry !== 'FREE_TIMED') return [];
  const hours = [...new Set(
    config.freeHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
  )].sort((a, b) => a - b);
  if (hours.length === 0) return [];

  const runs: FreeHourWindow[] = [];
  let start = hours[0];
  let prev = hours[0];
  for (const hour of hours.slice(1)) {
    if (hour === prev + 1) {
      prev = hour;
      continue;
    }
    runs.push({ startHour: start, endHour: prev + 1 });
    start = hour;
    prev = hour;
  }
  runs.push({ startHour: start, endHour: prev + 1 });

  // ชั่วโมงที่คร่อมเที่ยงคืน (มี 23 และ 0) → ต่อหัวกับท้ายเป็นช่วงเดียว
  if (runs.length > 1 && runs[0].startHour === 0 && runs[runs.length - 1].endHour === 24) {
    const first = runs.shift()!;
    const last = runs.pop()!;
    runs.unshift({ startHour: last.startHour, endHour: first.endHour + 24 });
  }
  return runs;
}

/** ชั่วโมง → 'HH:00' (ค่าตั้งแต่ 24 ขึ้นไปวนกลับเป็น 0x:00 ของวันถัดไป) */
export function formatHour(hour: number): string {
  const normalized = ((Math.trunc(hour) % 24) + 24) % 24;
  return `${String(normalized).padStart(2, '0')}:00`;
}

/** ช่วงเดียว → '12:00–14:00' */
export function formatFreeHourWindow(window: FreeHourWindow): string {
  return `${formatHour(window.startHour)}–${formatHour(window.endHour)}`;
}

/** ทุกช่วงของดันนี้ → '12:00–14:00 และ 20:00–22:00' ('' เมื่อไม่ใช่ดันตามเวลา/ไม่มีข้อมูล) */
export function formatFreeWindowsTh(config: FreeEntryConfig): string {
  return freeHourWindows(config).map(formatFreeHourWindow).join(' และ ');
}

function windowHasHour(window: FreeHourWindow, hour: number): boolean {
  return (
    (hour >= window.startHour && hour < window.endHour) ||
    (hour + 24 >= window.startHour && hour + 24 < window.endHour)
  );
}

/** เวลาที่จะเปิดรอบถัดไป (null = เปิดอยู่ตอนนี้ หรือไม่ใช่ดันตามเวลา) */
export function nextFreeOpenAt(config: FreeEntryConfig, now: Date): Date | null {
  if (config.entry !== 'FREE_TIMED') return null;
  if (isFreeWindowOpen(config as DungeonDef, now.getHours())) return null;
  const windows = freeHourWindows(config);
  if (windows.length === 0) return null;
  for (let step = 1; step <= 24; step += 1) {
    const hour = (now.getHours() + step) % 24;
    if (windows.some((window) => windowHasHour(window, hour))) {
      const target = new Date(now.getTime());
      target.setMinutes(0, 0, 0);
      target.setHours(target.getHours() + step);
      return target;
    }
  }
  return null;
}

/** 'เปิดอีก 2 ชม. 15 น.' — ใช้ให้ผู้เล่นรู้ว่าต้องรออีกนานเท่าไร */
export function waitUntilTextTh(now: Date, target: Date): string {
  const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `เปิดอีก ${hours} ชม. ${rest} น.`;
  if (hours > 0) return `เปิดอีก ${hours} ชม.`;
  return `เปิดอีก ${rest} น.`;
}

/**
 * สถานะการเข้า "ตอนนี้" พร้อมข้อความให้ผู้เล่นอ่าน
 * - ดันฟรีตลอด → เปิดฟรีตลอดเวลา
 * - ดันใช้เหรียญ → เปิดได้ตลอด แต่ต้องจ่าย Coin
 * - ดันตามเวลา → เปิดฟรีอยู่ (บอกเวลาปิดรอบนี้) / ปิดอยู่ (บอกช่วงเวลา + นับถอยหลัง)
 */
export function freeEntryStatusTh(config: FreeEntryConfig, now: Date): FreeEntryStatus {
  if (config.entry === 'FREE_ALWAYS') {
    return { open: true, labelTh: 'เปิดฟรีตลอดเวลา', waitTextTh: '', nextOpenAt: null };
  }
  if (config.entry === 'COIN') {
    return {
      open: true,
      labelTh: `เปิดได้ตลอด · ค่าเข้า ${config.coinCost} Coin ต่อครั้ง`,
      waitTextTh: '',
      nextOpenAt: null,
    };
  }
  const hour = now.getHours();
  const windows = freeHourWindows(config);
  if (isFreeWindowOpen(config as DungeonDef, hour)) {
    const current = windows.find((window) => windowHasHour(window, hour));
    const endHour = current ? current.endHour : hour + 1;
    return {
      open: true,
      labelTh: `เปิดฟรีอยู่ — เข้าได้ถึง ${formatHour(endHour)} น.`,
      waitTextTh: '',
      nextOpenAt: null,
    };
  }
  const next = nextFreeOpenAt(config, now);
  return {
    open: false,
    labelTh: `ปิดอยู่ — เข้าฟรี ${formatFreeWindowsTh(config)}`,
    waitTextTh: next ? waitUntilTextTh(now, next) : '',
    nextOpenAt: next,
  };
}