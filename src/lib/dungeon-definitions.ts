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
  /**
   * ตัวคูณ status ของ "บอส" ในชั้นนี้ (ไม่ระบุ = 1)
   * ใช้คง "งบ status รวมของทีมศัตรู" ให้เท่ากับทีมบอส 1 ตัว ⇒ จำนวนบอสไม่ทำให้ความยากแกว่ง
   */
  bossScale?: number;
  /**
   * ตัวคูณ HP ของศัตรูในชั้นนี้ (ไม่ระบุ = 1)
   * ผู้ใช้สั่ง 2026-10-07: *"ปรับความยากดันเจี้ยน แต่ละชั้น ให้มีความต่างอย่างพอดี ให้รู้สึกว่าเปลี่ยนระดับ"*
   * ⇒ ใช้ HP เป็น "แกนความอึด" ที่ไล่ขึ้นทุกชั้น (ต่อสู้ยาวขึ้น = รู้สึกว่ายากขึ้น) โดยไม่ดัน ATK
   *   เกินเพดานที่วัดได้ (ATK สูงเกิน = ผู้เล่นแพ้ทันที ไม่ใช่ยากขึ้นอย่างพอดี)
   */
  hpBonus?: number;
  scale: number;
  reward: DungeonRewardDef;
}

/**
 * ชั้นดันเจี้ยน: ความยาก "เป็นบล็อกละ 5 ชั้น" (Phase 37)
 *
 * ผู้ใช้สั่ง 2026-09-27: *"ดันเจี้ยน…ควรทำให้เป็น Step 5 ชั้น แล้วขยับ ให้เก่งขึ้นแบบเห็นได้ชัด"*
 *  ⇒ 5 ชั้นในบล็อกเดียวกันใช้ status ชุดเดียวกัน (เล่นได้หลายรอบไม่รู้สึกวืด)
 *    แล้ว **กระโดดชัดเจนที่ชั้นแรกของบล็อกถัดไป** (blockStep ~+10-14% ต่อบล็อก)
 *    + บอสเพิ่มเป็น 2 ตัวที่บล็อก 3 และ 3 ตัวที่บล็อก 5 → เป็นหมุดหมายที่ผู้เล่นเห็นชัด
 */
export const FLOOR_BLOCK_SIZE = 5;

export interface DungeonDeepFloorsDef {
  /** จำนวนชั้นทั้งหมดของดัน (ไม่รวมชั้นที่เขียนมือที่ถูกเขียนทับด้วยความยากแบบบล็อกแล้ว) */
  extra: number;
  /** ตัวคูณความยากต่อบล็อก (5 ชั้น) — Phase 45.4: เลิกใช้เป็นบันไดความยาก เก็บไว้คิด "ปลายทางรางวัล" ให้เท่าเดิม */
  blockStep: number;
  /** เพดาน "ความยากจริง" (effective difficulty = scale × น้ำหนักจำนวนบอส × น้ำหนัก HP) */
  difficultyCap: number;
  /**
   * สัดส่วนความยากของ "ชั้นแรก" เทียบกับเพดาน (ไม่ระบุ = 0.85)
   * ผู้ใช้สั่ง 2026-10-07: "ปรับความยากดันเจี้ยน แต่ละชั้น ให้มีความต่างอย่างพอดี ให้รู้สึกว่าเปลี่ยนระดับ"
   * ⇒ ทั้งดันไล่จาก cap×startRatio (ชั้น 1) → cap (ชั้นสุดท้าย) ทุกชั้น ไม่มีชั้นไหน status เท่ากันแล้ว
   */
  startRatio?: number;
  /** รูปร่างเส้นโค้งความยาก (t^gamma · t = 0..1 ตามชั้น) — ไม่ระบุ = 0.9 (ไต่เร็วช่วงต้นแล้วค่อยนิ่ง) */
  curveGamma?: number;
  /** HP ศัตรูเพิ่มต่อชั้น (ไม่ระบุ = 0.012 = +1.2%/ชั้น · เพดานที่ hpCap) */
  hpStep?: number;
  /** เพดานตัวคูณ HP ของศัตรู (ไม่ระบุ = 1.45) */
  hpCap?: number;
  /** ตัวคูณรางวัล "ฝุ่นเวท" ต่อบล็อก (5 ชั้น) — ใช้เป็น "ปลายทาง" ของเส้นรางวัล */
  blockRewardStep: number;
  /**
   * สัดส่วนฝุ่นเวทเทียบกับค่าฐานในนิยาม (Phase 40)
   * ผู้ใช้สั่ง: *"ลดของรางวัล ฝุ่นเวท ลงอีก เอาแค่ 20% จากตอนนี้"* ⇒ ตั้ง 0.2 ให้ทุกดัน
   */
  dustRatio?: number;
  /** ตัวคูณรางวัล "Veil Shards" ต่อบล็อก (ช้ากว่าฝุ่น เพื่อกันเงินเฟ้อ) */
  blockShardStep: number;
  /** บล็อกที่เริ่มมีบอส 2 ตัว / 3 ตัว (นับจาก 1) */
  doubleBossBlock: number;
  tripleBossBlock: number;
  /** ชื่อชั้น (วนใช้ตามบล็อก) */
  deepNames: string[];
  /** บันไดไอเทมดรอปตามชั้น (ใช้รายการสุดท้ายที่ fromFloor ≤ ชั้นนั้น) */
  dropLadder: Array<{ fromFloor: number; code: string; chance: number }>;
}

export interface DungeonDef {
  code: string; name: string; nameTh: string; descriptionTh: string; icon: string;
  entry: DungeonEntryKind; coinCost: number; freeHours: number[];
  minionBase: { atk: number; def: number; hp: number; spd: number };
  bossBase: { atk: number; def: number; hp: number; spd: number };
  /** รายการธาตุของศัตรูในดันนี้ (วนตามลำดับ) */
  elements: string[];
  /**
   * Phase 45.6: เปิด "บอสคู่พยุงกัน" (บอส ×1.25 เมื่อชั้นนั้นมีบอส 2 ตัว)
   * เปิดเฉพาะดันที่วัดแล้วว่ายังมี "ที่ว่างให้ยากขึ้น" (ดูคอมเมนต์ bossSynergy)
   */
  pairedBossBoost?: boolean;
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

/**
 * ค่าเข้าดันเสียเงิน (Coin) — Phase 37: ลดจาก 50 → 35
 * ผู้ใช้แจ้ง: *"แบบเสียเงินก็มากเกินไป จนค่าเข้าไม่คุ้มกับรางวัล"*
 * ⇒ ลดค่าเข้า + เพิ่มรางวัลต่อชั้น (blockRewardBonus) + **แพ้คืนค่าเข้า 50%** (ดู DUNGEON_LOSS_REFUND)
 */
export const DUNGEON_COIN_ENTRY = 35;

/** สัดส่วนค่าเข้าที่คืนให้เมื่อ "แพ้" ดันเสียเงิน (ไม่ให้ผู้เล่นเจ็บตัวหนักจากการลอง) */
export const DUNGEON_LOSS_REFUND = 0.5;

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
    minionBase: { atk: 32, def: 18, hp: 119, spd: 14 },
    bossBase: { atk: 65, def: 38, hp: 300, spd: 19 },
    elements: ['EMBERBOUND', 'ROOTFORGED'],
    // Phase 45.6 (ผู้ใช้สั่ง "ทำกลไก บอส 2 ตัว"): ดันฝึกหัดเป็นดันเดียวที่ "วัดแล้วมีที่ว่าง"
    // (ชั้นบอสคู่มือใหม่ชนะ 100% เทียบชั้นบอสเดี่ยว 92%) ⇒ เปิดกลไกบอสคู่พยุงกัน (บอส ×1.25)
    // ดันอื่นไม่เปิด เพราะชั้นบอสคู่ของดันนั้นเด็คเป้าหมายชนะ 82-100% = ชนกำแพงอยู่แล้ว
    pairedBossBoost: true,
    floors: [
      { floor: 1, nameTh: 'ปากทางเถ้าถ่าน', minions: 4, scale: 1.0, reward: { dust: 10, shards: 2, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'โถงถ่านคุ', minions: 4, scale: 1.1, reward: { dust: 14, shards: 3, itemDropCode: 'ATK_WHETSTONE', itemDropChance: 15 } },
      { floor: 3, nameTh: 'ห้องบัลลังก์เพลิง', minions: 4, scale: 1.22, reward: { dust: 20, shards: 5, itemDropCode: 'ATK_WHETSTONE', itemDropChance: 25 } },
    ],
    // เพิ่มอีก 22 ชั้น → รวม 25 ชั้น (ผู้ใช้สั่ง: เพิ่มชั้นไปอีก 20-40 ชั้น)
    deepFloors: {
      extra: 25, blockStep: 1.05, difficultyCap: 0.98, blockRewardStep: 1.3, blockShardStep: 1.2, dustRatio: 0.2,
      doubleBossBlock: 3, tripleBossBlock: 5,
      deepNames: ['ปากทางเถ้าถ่าน', 'ห้วงเถ้าถ่าน', 'เหวเถ้าร้อน', 'ปล่องลาวา', 'บัลลังก์เถ้า'],
      dropLadder: [
        { fromFloor: 4, code: 'ATK_WHETSTONE', chance: 20 },
        { fromFloor: 5, code: 'ATK_SPARK_SHARD', chance: 20 },
        { fromFloor: 9, code: 'DEF_PEBBLE_WARD', chance: 20 },
        { fromFloor: 16, code: 'SUP_TRAVELERS_AMULET', chance: 18 },
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
    minionBase: { atk: 54, def: 33, hp: 192, spd: 22 },
    bossBase: { atk: 106, def: 66, hp: 484, spd: 32 },
    elements: ['TIDEBORN', 'SKYRIVEN', 'DAWNSWORN'],
    floors: [
      { floor: 1, nameTh: 'บันไดปะการัง', minions: 4, scale: 1.0, reward: { dust: 18, shards: 4, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'โถงน้ำตื้น', minions: 4, scale: 1.06, reward: { dust: 26, shards: 6, itemDropCode: 'DEF_IRONWEAVE', itemDropChance: 15 } },
      { floor: 3, nameTh: 'สระแสงจันทร์', minions: 4, scale: 1.12, reward: { dust: 36, shards: 9, itemDropCode: 'ATK_ASHEN_SPIKE', itemDropChance: 18 } },
      { floor: 4, nameTh: 'แก่นวิหาร', minions: 4, scale: 1.18, reward: { dust: 48, shards: 12, itemDropCode: 'SUP_DUSKVEIL', itemDropChance: 20 } },
    ],
    // เพิ่มอีก 24 ชั้น → รวม 28 ชั้น
    deepFloors: {
      extra: 28, blockStep: 1.05, difficultyCap: 1.02, blockRewardStep: 1.3, blockShardStep: 1.2, dustRatio: 0.2,
      doubleBossBlock: 3, tripleBossBlock: 5,
      deepNames: ['บันไดปะการัง', 'ห้วงน้ำลึก', 'สระแสงจันทร์ลึก', 'แกนสมุทร', 'วังน้ำวน', 'ห้วงอเวจี'],
      dropLadder: [
        { fromFloor: 5, code: 'DEF_IRONWEAVE', chance: 20 },
        { fromFloor: 6, code: 'DEF_SCALEWARD', chance: 18 },
        { fromFloor: 16, code: 'SUP_WINDWHISPER', chance: 18 },
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
    minionBase: { atk: 82, def: 54, hp: 285, spd: 28 },
    bossBase: { atk: 165, def: 111, hp: 741, spd: 38 },
    elements: ['VEILMARKED', 'DAWNSWORN', 'SKYRIVEN'],
    floors: [
      { floor: 1, nameTh: 'ม่านชั้นนอก', minions: 4, scale: 1.0, reward: { dust: 28, shards: 6, itemDropCode: null, itemDropChance: 0 } },
      { floor: 2, nameTh: 'ม่านชั้นกลาง', minions: 4, scale: 1.04, reward: { dust: 40, shards: 9, itemDropCode: 'ATK_ASHEN_SPIKE', itemDropChance: 15 } },
      { floor: 3, nameTh: 'ม่านชั้นใน', minions: 4, scale: 1.08, reward: { dust: 55, shards: 12, itemDropCode: 'ATK_EMBER_FANG', itemDropChance: 20 } },
      { floor: 4, nameTh: 'ใจกลางรอยแยก', minions: 4, scale: 1.12, reward: { dust: 72, shards: 16, itemDropCode: 'ATK_MOONLESS_BLADE', itemDropChance: 12 } },
    ],
    // เพิ่มอีก 24 ชั้น → รวม 28 ชั้น
    deepFloors: {
      extra: 28, blockStep: 1.06, difficultyCap: 1.05, blockRewardStep: 1.32, blockShardStep: 1.2, dustRatio: 0.2,
      doubleBossBlock: 3, tripleBossBlock: 5,
      deepNames: ['ม่านชั้นนอก', 'ม่านบิดเบี้ยว', 'ซอกจันทราแตก', 'ประตูไร้แสง', 'แกนม่านเงา', 'ใจกลางรอยแยก'],
      dropLadder: [
        { fromFloor: 5, code: 'ATK_ASHEN_SPIKE', chance: 20 },
        { fromFloor: 6, code: 'ATK_HUNTERS_TALON', chance: 18 },
        { fromFloor: 17, code: 'SUP_GALE_TOTEM', chance: 16 },
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
    icon: '💰', entry: 'COIN', coinCost: DUNGEON_COIN_ENTRY, freeHours: [], lossDustRatio: 0.25,
    minionBase: { atk: 107, def: 72, hp: 364, spd: 25 },
    bossBase: { atk: 213, def: 145, hp: 966, spd: 32 },
    elements: ['TIDEBORN', 'DAWNSWORN', 'VEILMARKED', 'EMBERBOUND'],
    floors: [
      { floor: 1, nameTh: 'บันไดทอง', minions: 4, scale: 1.0, reward: { dust: 45, shards: 10, itemDropCode: 'DEF_TIDEWALL', itemDropChance: 12 } },
      { floor: 2, nameTh: 'คลังสมบัติ', minions: 4, scale: 1.05, reward: { dust: 62, shards: 14, itemDropCode: 'DEF_TIDEWALL', itemDropChance: 18 } },
      { floor: 3, nameTh: 'บัลลังก์เหว', minions: 4, scale: 1.10, reward: { dust: 85, shards: 18, itemDropCode: 'ATK_MOONLESS_BLADE', itemDropChance: 15 } },
      { floor: 4, nameTh: 'ก้นเหวทองคำ', minions: 4, scale: 1.16, reward: { dust: 110, shards: 24, itemDropCode: 'ATK_RIFTRENDER', itemDropChance: 12 } },
    ],
    // เพิ่มอีก 26 ชั้น → รวม 30 ชั้น
    // Phase 45.5 (2026-10-08): difficultyCap 1.15 → 1.0 — วัดใหม่หลังแก้ "น้ำหนักจำนวนบอส" (1.7 → 1.25)
    // ชั้นบอส 3 ตัวได้ scale สูงขึ้น ~36% ⇒ ที่ cap 1.15 เด็ค mythic (คลังจริง 240 ใบ) ชนะ 0% ที่ชั้น 30
    // (วัดด้วย --scan GILDED_ABYSS:30 --deck mythic: 100% ที่ scale ≤0.63 · 0% ที่ 0.70 = จุดตัด ~0.95×ของเดิม)
    deepFloors: {
      extra: 30, blockStep: 1.04, difficultyCap: 1.0, blockRewardStep: 1.35, blockShardStep: 1.25, dustRatio: 0.2,
      doubleBossBlock: 4, tripleBossBlock: 6,
      deepNames: ['บันไดทอง', 'คลังลึกลับ', 'เหวฉายทอง', 'โลงทองคำ', 'ก้นเหวสมบัติ', 'ก้นเหวมรณะ'],
      dropLadder: [
        { fromFloor: 5, code: 'DEF_TIDEWALL', chance: 20 },
        { fromFloor: 10, code: 'DEF_STORMBULWARK', chance: 18 },
        { fromFloor: 19, code: 'SUP_STARLIGHT_CORE', chance: 14 },
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
    minionBase: { atk: 162, def: 111, hp: 556, spd: 40 },
    bossBase: { atk: 322, def: 224, hp: 1490, spd: 50 },
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
      extra: 40, blockStep: 1.03, difficultyCap: 0.72, blockRewardStep: 1.3, blockShardStep: 1.2, dustRatio: 0.2,
      doubleBossBlock: 3, tripleBossBlock: 5,
      deepNames: ['ลานลมกรด', 'หอคอยเมฆดำ', 'ระเบียงสายฟ้า', 'ใจกลางพายุ', 'ดวงตาพายุ', 'บัลลังก์พายุ', 'ฟากฟ้าดำ', 'ยอดจักรวาล'],
      dropLadder: [
        { fromFloor: 6, code: 'SUP_DUSKVEIL', chance: 22 },
        { fromFloor: 10, code: 'DEF_IRONWEAVE', chance: 22 },
        { fromFloor: 14, code: 'ATK_ASHEN_SPIKE', chance: 22 },
        { fromFloor: 12, code: 'ATK_FROSTBRAND', chance: 20 },
        { fromFloor: 22, code: 'DEF_MOONPLATE', chance: 16 },
        { fromFloor: 32, code: 'SUP_DAWNHEART', chance: 14 },
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
 * งบ status ของทีมศัตรูเมื่อมีบอสหลายตัว (Phase 37)
 *
 * ที่มา: วัดจริงพบว่า "เพดานความยาก" ของเด็คที่ใส่ของครบอยู่ราวสเกล 1.15
 * ⇒ ถ้าดันสเกลขึ้นเรื่อย ๆ ชั้นลึกจะผ่านไม่ได้เลยทุกเด็ค (9 วัด: mythic 0% ที่สเกล 1.19)
 * วิธีที่ถูกคือ: สเกลไล่ช้า ๆ (+4-6% ต่อบล็อก) แล้วให้ **ขนาดทีมศัตรู** เป็นขั้นความยากที่เห็นชัด
 *   บอส 1 ตัว = งบมาตรฐาน · บอส 2 ตัว = +12% · บอส 3 ตัว = +25%
 */
/**
 * "บอสคู่พยุงกัน" — Phase 45.6 (2026-10-08): ผู้ใช้สั่ง "ทำกลไก บอส 2 ตัว"
 *
 * ที่มา (วัดจริง 60 ศึก/ช่อง · คลังการ์ดจริง): ชั้นบอส 2 ตัวของ **ดันฝึกหัด** ง่ายกว่าชั้นบอส 1 ตัว
 * ก่อนหน้า (มือใหม่ชนะ 100% ที่ชั้น 15/20 เทียบ 92% ที่ชั้น 10) เพราะ scale ของชั้นถูกหารด้วย
 * น้ำหนักจำนวนบอส ⇒ ลูกน้องที่เหลืออ่อนลงมาก
 * ⇒ ชั้นบอสคู่ของดันที่ผู้เล่นยังมี "ที่ว่างให้ยากขึ้น" จะเพิ่มพลังบอสทุกตัว ×1.25 (บอสคู่พยุงกัน)
 *
 * ⚠️ เปิดใช้เฉพาะดันที่ "วัดแล้วมีที่ว่าง" (`pairedBossBoost: true`) เท่านั้น:
 *   ดันระดับสูงมีชั้นบอสคู่ที่เด็คเป้าหมายชนะอยู่ 82-100% = ชนกำแพงอยู่แล้ว (วัดได้: TIDAL ชั้น 15
 *   ท็อป+ของ 100% → 0% เมื่อเพิ่ม ×1.25) ⇒ ใส่กลไกนี้ไปจะกลายเป็นกำแพงที่ผ่านไม่ได้ ไม่ใช่ความยากที่พอดี
 */
export function bossSynergy(dungeon: DungeonDef, bosses = 1): number {
  if (!dungeon.pairedBossBoost) return 1;
  return bosses === 2 ? 1.25 : 1;
}

export function bossWeight(bosses = 1): number {
  // Phase 45.5 (2026-10-08): **วัดใหม่แล้ว** — ค่าเดิม 1.4/1.7 หักชดเชยเกินจริงมาก
  //   วิธีวัด (scripts/calibrate-dungeons.mts --boss-weights · 120 ศึก/จุด):
  //     หา scale ที่ทีม "บอส 1 + ลูกน้อง 4" ให้เด็คเป้าหมายชนะ 50% แล้วเทียบว่าทีม "บอส 2/3 ตัว"
  //     ที่ scale เดียวกันเทียบเท่าบอส 1 ตัวที่คูณกี่เท่า
  //   ผลวัด (EMBER_CRYPT · GILDED_ABYSS × เด็ค มือใหม่/กลาง/ท็อปดิบ): บอส 2 ตัว ×1.1 ×1.1 ×1.1 ×1.1 ×1.0 ×1.25
  //     และบอส 3 ตัว ×1.1 ×1.1 ×1.1 ×1.1 ×1.0 ×1.25 ⇒ ค่ากลาง = 1.1 (ช่วงที่วัดได้ 1.0-1.25)
  //   ค่าเดิม 1.7 ทำให้ชั้นบอส 3 ตัวได้ scale ต่ำกว่าที่ควร ~35% ⇒ ชั้นลึกของดันที่ควรหินกลับง่ายกว่า
  //   (อาการที่ผู้ใช้เห็น: ชั้นบอส 2-3 ตัวง่ายกว่าชั้นบอส 1 ตัวที่งบเท่ากัน)
  if (bosses >= 3) return 1.25;
  if (bosses === 2) return 1.12;
  return 1;
}

/**
 * น้ำหนักของ HP ต่อ "งบความยาก" — ใช้สองที่ให้สอดคล้องกัน:
 *  1) คิดตัวคูณ scale ที่ต้อง "หักชดเชย" เมื่อ HP สูงขึ้น (ไม่ให้ความแข็งแกร่งรวมเกินเพดานเดิม)
 *  2) ตัวเลขความยากที่โชว์ผู้เล่น (floorDifficulty)
 * 0.9 = เพิ่ม HP 10% นับเป็นความยาก +9% (ใกล้เคียงการเพิ่ม ATK เพราะต่อสู้ยาวขึ้นเท่ากับเจ็บมากขึ้น)
 * ค่าที่วัดได้จริง: ถ้าไม่หักชดเชย (ใช้ 0) ชั้นท้ายของดันกลาง-สูงจะชนะ 0%
 *   → ดู tests/unit/dungeon-balance.test.ts เป็นด่านตรวจ
 */
export const HP_DIFFICULTY_WEIGHT = 0.9;

/** ตัวคูณ HP ของชั้น (ค่าเริ่มต้น 1 = ไม่เพิ่ม) — ไล่ขึ้นทุกชั้นตาม hpStep ของดันนั้น */
export function floorHpBonus(floor: DungeonFloorDef): number {
  const raw = floor.hpBonus ?? 1;
  return Math.min(3, Math.max(1, raw));
}

/**
 * ความยากจริงของชั้น = scale × น้ำหนักจำนวนบอส × (HP ที่เพิ่มขึ้น × น้ำหนัก 0.5)
 * ใช้คู่กับ floorDifficulty() เป็นตัวชี้วัดเดียวที่เทียบข้ามชั้นได้
 */
export function floorDifficultyRaw(floor: DungeonFloorDef): number {
  const hpFactor = 1 + (floorHpBonus(floor) - 1) * HP_DIFFICULTY_WEIGHT;
  return floor.scale * bossWeight(floorBossCount(floor)) * hpFactor;
}

/**
 * ตัวชี้วัด "ความยากจริง" ของชั้น = สเกล × น้ำหนักองค์ประกอบทีม
 * (ชั้นที่มีบอส 2-3 ตัวใช้สเกลต่ำกว่าชดเชย ⇒ ต้องดูคู่นี้จึงเทียบความยากได้)
 */
export function floorDifficulty(floor: DungeonFloorDef): number {
  return Math.round(floorDifficultyRaw(floor) * 1000) / 1000;
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
  const first = written[0];
  const totalFloors = def.extra;
  const floors: DungeonFloorDef[] = [];
  // ---- Phase 45.4: เส้นความยาก "ไล่ทุกชั้น" (เดิมใช้บันไดบล็อก ⇒ 5 ชั้นติดกัน status เท่ากันเป๊ะ) ----
  // ผู้ใช้สั่ง 2026-10-07: "ปรับความยากดันเจี้ยน แต่ละชั้น ให้มีความต่างอย่างพอดี ให้รู้สึกว่าเปลี่ยนระดับ"
  //  - ความยากจริงของชั้น t (0=ชั้นแรก, 1=ชั้นสุดท้าย) = cap × (startRatio + (1−startRatio) × t^gamma)
  //  - HP ศัตรูไล่ขึ้นทุกชั้นตาม hpStep (เพดาน hpCap) = แกน "ความอึด" ที่ทำให้รู้สึกว่ายากขึ้นโดยไม่ unfair
  //  - จำนวนบอส (1 → 2 → 3) ยังเป็นหมุดหมายรายบล็อก ⇒ ผู้เล่นเห็น "ระดับใหม่" ชัดเป็นช่วง ๆ
  const startRatio = def.startRatio ?? 0.85;
  const gamma = def.curveGamma ?? 0.9;
  const hpStep = def.hpStep ?? 0.012;
  const hpCap = def.hpCap ?? 1.45;
  const blocks = Math.max(1, Math.ceil(totalFloors / FLOOR_BLOCK_SIZE));
  // ปลายทางรางวัล = ค่าเดิมของสูตรบล็อก (ชั้นสุดท้ายได้เท่าเดิม ⇒ เศรษฐกิจไม่เปลี่ยน)
  const dustEnd = Math.pow(def.blockRewardStep, blocks - 1);
  const shardEnd = Math.pow(def.blockShardStep, blocks - 1);
  const dustRatio = def.dustRatio ?? 1;

  for (let floorNo = 1; floorNo <= totalFloors; floorNo += 1) {
    // บล็อกที่ 1 = ชั้น 1-5, บล็อกที่ 2 = ชั้น 6-10, ... (หมุดหมายจำนวนบอส)
    const block = Math.floor((floorNo - 1) / FLOOR_BLOCK_SIZE) + 1;
    const bosses = block >= def.tripleBossBlock ? 3 : block >= def.doubleBossBlock ? 2 : 1;

    const t = totalFloors <= 1 ? 1 : (floorNo - 1) / (totalFloors - 1);
    const shaped = Math.pow(t, gamma);
    // "งบความยาก" ของชั้นนี้ = เพดานที่วัดได้ว่าเด็คเป้าหมายผ่าน (ไล่จาก cap×startRatio → cap ทุกชั้น)
    const targetDifficulty = def.difficultyCap * (startRatio + (1 - startRatio) * shaped);
    const hpBonus = Number(Math.min(hpCap, 1 + hpStep * (floorNo - 1)).toFixed(3));
    // แบ่งงบเป็น 2 แกน: HP ที่อึดขึ้น + scale (ATK/DEF/SPD) — scale หักชดเชย HP ที่เพิ่มขึ้น
    // ⇒ ความแข็งแกร่ง "รวม" ยังอยู่ใต้เพดานเดิม (ไม่ทำลายสมดุลที่วัดไว้) แต่ทุกชั้นยังต่างกันจริง
    const hpWeight = 1 + (hpBonus - 1) * HP_DIFFICULTY_WEIGHT;
    const scale = Number((targetDifficulty / bossWeight(bosses) / hpWeight).toFixed(3));
    const bossScale = 1;

    // รางวัลไล่ทุกชั้น (ปลายทางเท่าเดิม) — เดิมกระโดดเป็นบล็อก ทำให้ชั้นในบล็อกให้ของเท่ากันเป๊ะ
    const dust = Math.max(1, Math.round(first.reward.dust * dustRatio * (1 + (dustEnd - 1) * shaped)));
    const shards = Math.max(1, Math.round(first.reward.shards * (1 + (shardEnd - 1) * shaped)));
    const drop = [...def.dropLadder].reverse().find((row) => row.fromFloor <= floorNo);
    const writtenFloor = written.find((row) => row.floor === floorNo);
    floors.push({
      floor: floorNo,
      // ชั้นที่เขียนมือเก็บชื่อเดิมไว้ (ผู้เล่นคุ้นเคย) · ชั้นถัดไปใช้ชื่อของบล็อกนั้น
      nameTh:
        writtenFloor?.nameTh ??
        def.deepNames[(block - 1) % def.deepNames.length],
      bosses,
      bossScale,
      hpBonus,
      minions: DUNGEON_TEAM_SIZE - bosses,
      scale,
      reward: {
        dust,
        shards,
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

/**
 * ชั้นถัดไปของดัน (Phase 38) — ผู้ใช้สั่ง: "หลังต่อสู้ดันเจี้ยนชนะชั้นปัจจุบัน มีปุ่มกดไปสู่ชั้นต่อไป"
 * คืน null เมื่ออยู่ชั้นสุดท้ายแล้ว
 */
export function nextDungeonFloor(currentFloor: number, totalFloors: number): number | null {
  const current = Math.max(1, Math.trunc(currentFloor));
  const total = Math.max(0, Math.trunc(totalFloors));
  return current < total ? current + 1 : null;
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