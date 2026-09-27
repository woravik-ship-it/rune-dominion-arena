// แคตตาล็อก Item ของ "ช่างใส่ Item" (Phase 25)
//
// ผู้ใช้สั่ง 2026-09-27: "ทำในส่วนของช่างใส่ Item เพิ่ม Status ให้ 3 ช่อง Item โจมตี, ป้องกัน, สนับสนุน
//   สำหรับใส่ Item ที่ได้รับ หรือ Craft มาได้"
//
// หลักการ
//  - 1 การ์ดมี 3 ช่องตายตัว: ATTACK (โจมตี) / DEFENSE (ป้องกัน) / SUPPORT (สนับสนุน) — ใส่ได้ช่องละ 1 ชิ้น
//  - Item ทุกชิ้นมี Status (atk/def/hp/spd) บวกเข้า Status การ์ดจริงตอนต่อสู้ + คิดพลังทีม
//  - ได้มา 2 ทาง: "ซื้อตรง" ด้วย Veil Shards (ของพื้นฐาน) หรือ "คราฟต์" ด้วย Veil Shards + ฝุ่นเวท
//  - ไฟล์นี้บริสุทธิ์ (ไม่แตะ DB) ⇒ เทสต์ได้ และเป็นแหล่งความจริงเดียวของตัวเลข
import type { ItemSlot, Rarity } from '@prisma/client';

export interface ItemDef {
  code: string;
  name: string;
  nameTh: string;
  descriptionTh: string;
  slot: ItemSlot;
  rarity: Rarity;
  atk: number;
  def: number;
  hp: number;
  spd: number;
  icon: string;
  /** ราคาคราฟต์ (Veil Shards) */
  craftCost: number;
  /** ราคาคราฟต์ (ฝุ่นเวท) */
  dustCost: number;
  /** ราคาซื้อตรงด้วย Veil Shards (null = ซื้อไม่ได้ ต้องคราฟต์) */
  buyCost: number | null;
  /**
   * Coin ที่ต้องใช้ตอนคราฟต์ (Phase 39)
   * ผู้ใช้สั่ง 2026-09-27: *"ในการ Craft ของต้องใช้ Coins ด้วย"*
   * ⇒ คิดตามสูตร = 3 เท่าของ Veil Shards ที่ใช้คราฟต์ (ของยิ่งสูงยิ่งใช้ Coin มาก)
   */
  coinCost: number;
}

/** ลำดับช่องแบบตายตัว (ใช้ทั้ง UI และการตรวจสอบ) */
export const ITEM_SLOTS: ItemSlot[] = ['ATTACK', 'DEFENSE', 'SUPPORT'];

export const ITEM_CATALOG: ItemDef[] = [
  // ---------- ช่องโจมตี ----------
  {
    code: 'ATK_WHETSTONE', name: 'Whetstone Edge', nameTh: 'หินลับคม',
    descriptionTh: 'ของพื้นฐานของช่าง — เพิ่มพลังโจมตีเล็กน้อย', slot: 'ATTACK', rarity: 'COMMON',
    atk: 6, def: 0, hp: 0, spd: 0, icon: '🗡️', craftCost: 6, dustCost: 5, buyCost: 12, coinCost: 18,
  },
  {
    code: 'ATK_ASHEN_SPIKE', name: 'Ashen Spike', nameTh: 'หนามเถ้าถ่าน',
    descriptionTh: 'หนามที่หล่อจากเถ้าภูเขาไฟ — เพิ่มพลังโจมตีระดับกลาง', slot: 'ATTACK', rarity: 'UNCOMMON',
    atk: 11, def: 0, hp: 0, spd: 1, icon: '🪓', craftCost: 12, dustCost: 12, buyCost: 26, coinCost: 36,
  },
  {
    code: 'ATK_EMBER_FANG', name: 'Ember Fang', nameTh: 'เขี้ยวเพลิง',
    descriptionTh: 'คมเขี้ยวที่ยังอุ่นจากเตาหลอม — เพิ่มพลังโจมตีชัดเจน', slot: 'ATTACK', rarity: 'RARE',
    atk: 16, def: 0, hp: 0, spd: 0, icon: '🔥', craftCost: 20, dustCost: 25, buyCost: 45, coinCost: 60,
  },
  {
    code: 'ATK_MOONLESS_BLADE', name: 'Moonless Blade', nameTh: 'ดาบไร้จันทร์',
    descriptionTh: 'ดาบที่คมจนแสงไม่สะท้อน — เพิ่มโจมตีและความเร็ว', slot: 'ATTACK', rarity: 'EPIC',
    atk: 32, def: 0, hp: 0, spd: 4, icon: '🌙', craftCost: 60, dustCost: 60, buyCost: null, coinCost: 180,
  },
  {
    code: 'ATK_RIFTRENDER', name: 'Riftrender', nameTh: 'ดาบผ่ารอยแยก',
    descriptionTh: 'อาวุธระดับตำนาน — เพิ่มพลังโจมตีมากที่สุด', slot: 'ATTACK', rarity: 'LEGENDARY',
    atk: 60, def: 0, hp: 20, spd: 0, icon: '⚔️', craftCost: 160, dustCost: 150, buyCost: null, coinCost: 480,
  },

  {
    code: 'ATK_STORMFANG', name: 'Stormfang', nameTh: 'เขี้ยวพายุ',
    descriptionTh: 'อาวุธในตำนานจากยอดหอพายุ — โจมตีสูงที่สุดและออกตัวไวขึ้น', slot: 'ATTACK', rarity: 'MYTHIC',
    atk: 85, def: 0, hp: 30, spd: 6, icon: '⚡', craftCost: 240, dustCost: 220, buyCost: null, coinCost: 720,
  },

  {
    code: 'ATK_SPARK_SHARD', name: 'Spark Shard', nameTh: 'สะเก็ดประกาย',
    descriptionTh: 'เศษหินที่ยังมีประกายไฟ — ทางเลือกถูกของช่องโจมตี', slot: 'ATTACK', rarity: 'COMMON',
    atk: 7, def: 0, hp: 0, spd: 1, icon: '✳️', craftCost: 7, dustCost: 6, buyCost: 14, coinCost: 21,
  },
  {
    code: 'ATK_HUNTERS_TALON', name: "Hunter's Talon", nameTh: 'กรงเล็บนักล่า',
    descriptionTh: 'กรงเล็บที่ลับจนกรีดลมขาด — โจมตีและออกตัวไวขึ้น', slot: 'ATTACK', rarity: 'UNCOMMON',
    atk: 12, def: 0, hp: 0, spd: 2, icon: '🦅', craftCost: 14, dustCost: 14, buyCost: 30, coinCost: 42,
  },
  {
    code: 'ATK_FROSTBRAND', name: 'Frostbrand', nameTh: 'ดาบน้ำแข็ง',
    descriptionTh: 'ดาบเยือกแข็งที่ตีเกราะศัตรูให้เปราะ — โจมตีและป้องกัน', slot: 'ATTACK', rarity: 'RARE',
    atk: 18, def: 2, hp: 0, spd: 0, icon: '❄️', craftCost: 24, dustCost: 30, buyCost: 52, coinCost: 72,
  },
  {
    code: 'ATK_TEMPEST_EDGE', name: 'Tempest Edge', nameTh: 'ดาบวายุ',
    descriptionTh: 'คมดาบที่มาพร้อมลมพายุ — โจมตีและความเร็วสูง', slot: 'ATTACK', rarity: 'EPIC',
    atk: 34, def: 0, hp: 0, spd: 6, icon: '🌪️', craftCost: 70, dustCost: 70, buyCost: null, coinCost: 210,
  },
  {
    code: 'ATK_SUNFORGED', name: 'Sunforged Blade', nameTh: 'ดาบหลอมสุริยา',
    descriptionTh: 'ดาบที่หลอมในแสงอรุณ — โจมตีสูงและเพิ่ม HP', slot: 'ATTACK', rarity: 'LEGENDARY',
    atk: 62, def: 0, hp: 25, spd: 0, icon: '☀️', craftCost: 170, dustCost: 160, buyCost: null, coinCost: 510,
  },
  {
    code: 'ATK_VOIDREAVER', name: 'Voidreaver', nameTh: 'ดาบฉีกสุญญตา',
    descriptionTh: 'อาวุธระดับ mythic ที่ฉีกแม้ความว่างเปล่า', slot: 'ATTACK', rarity: 'MYTHIC',
    atk: 90, def: 0, hp: 25, spd: 8, icon: '🌌', craftCost: 260, dustCost: 240, buyCost: null, coinCost: 780,
  },

  // ---------- ช่องป้องกัน ----------
  {
    code: 'DEF_OAK_BUCKLER', name: 'Oak Buckler', nameTh: 'โล่ไม้โอ๊ก',
    descriptionTh: 'โล่เล็กที่ช่างทุกคนทำได้ — เพิ่มป้องกันและ HP', slot: 'DEFENSE', rarity: 'COMMON',
    atk: 0, def: 6, hp: 10, spd: 0, icon: '🛡️', craftCost: 6, dustCost: 5, buyCost: 12, coinCost: 18,
  },
  {
    code: 'DEF_IRONWEAVE', name: 'Ironweave Guard', nameTh: 'เกราะผ้าถักเหล็ก',
    descriptionTh: 'เกราะถักที่ช่างฝีมือทำได้ — ป้องกันและ HP ระดับกลาง', slot: 'DEFENSE', rarity: 'UNCOMMON',
    atk: 0, def: 11, hp: 18, spd: 0, icon: '🪖', craftCost: 12, dustCost: 12, buyCost: 26, coinCost: 36,
  },
  {
    code: 'DEF_TIDEWALL', name: 'Tidewall Shield', nameTh: 'โล่กำแพงน้ำ',
    descriptionTh: 'โล่ที่หนุนด้วยกระแสน้ำ — เพิ่มป้องกันและ HP ชัดเจน', slot: 'DEFENSE', rarity: 'RARE',
    atk: 0, def: 16, hp: 25, spd: 0, icon: '🌊', craftCost: 20, dustCost: 25, buyCost: 45, coinCost: 60,
  },
  {
    code: 'DEF_DAWNSTONE', name: 'Dawnstone Aegis', nameTh: 'โล่ศิลาอรุณ',
    descriptionTh: 'โล่ที่สลาย Veil Shield ได้ชั่วขณะ — ป้องกันสูง', slot: 'DEFENSE', rarity: 'EPIC',
    atk: 0, def: 30, hp: 50, spd: 0, icon: '✨', craftCost: 60, dustCost: 60, buyCost: null, coinCost: 180,
  },
  {
    code: 'DEF_VEILGUARD', name: 'Veilguard Bulwark', nameTh: 'โล่ผู้เฝ้าม่าน',
    descriptionTh: 'โล่ระดับตำนานของผู้เฝ้าประตู — ป้องกันและ HP สูงสุด', slot: 'DEFENSE', rarity: 'LEGENDARY',
    atk: 0, def: 55, hp: 95, spd: 3, icon: '🏰', craftCost: 160, dustCost: 150, buyCost: null, coinCost: 480,
  },

  {
    code: 'DEF_TITANHEART', name: 'Titanheart Aegis', nameTh: 'โล่หัวใจไททัน',
    descriptionTh: 'โล่ในตำนานที่ต้านได้ทุกธาตุ — ป้องกันและ HP สูงที่สุดในเกม', slot: 'DEFENSE', rarity: 'MYTHIC',
    atk: 0, def: 75, hp: 135, spd: 4, icon: '🗿', craftCost: 240, dustCost: 220, buyCost: null, coinCost: 720,
  },

  {
    code: 'DEF_PEBBLE_WARD', name: 'Pebble Ward', nameTh: 'เกราะกรวด',
    descriptionTh: 'เกราะหินก้อนเล็กที่ช่างทำได้ทุกคน', slot: 'DEFENSE', rarity: 'COMMON',
    atk: 0, def: 7, hp: 8, spd: 0, icon: '🪨', craftCost: 7, dustCost: 6, buyCost: 14, coinCost: 21,
  },
  {
    code: 'DEF_SCALEWARD', name: 'Scaleward Vest', nameTh: 'เกราะเกล็ด',
    descriptionTh: 'เกราะเกล็ดสัตว์น้ำ — ป้องกันและ HP ดีในราคาเบา', slot: 'DEFENSE', rarity: 'UNCOMMON',
    atk: 0, def: 12, hp: 20, spd: 0, icon: '🐚', craftCost: 14, dustCost: 14, buyCost: 30, coinCost: 42,
  },
  {
    code: 'DEF_STORMBULWARK', name: 'Storm Bulwark', nameTh: 'โล่พายุ',
    descriptionTh: 'โล่ที่พายุหุ้มไว้ — ป้องกันสูงขึ้นชัดเจน', slot: 'DEFENSE', rarity: 'RARE',
    atk: 0, def: 18, hp: 28, spd: 1, icon: '⛈️', craftCost: 24, dustCost: 30, buyCost: 52, coinCost: 72,
  },
  {
    code: 'DEF_MOONPLATE', name: 'Moonplate Armor', nameTh: 'เกราะจันทรา',
    descriptionTh: 'เกราะที่ส่องแสงจันทร์ — ป้องกันและ HP ระดับสูง', slot: 'DEFENSE', rarity: 'EPIC',
    atk: 0, def: 32, hp: 55, spd: 0, icon: '🌗', craftCost: 70, dustCost: 70, buyCost: null, coinCost: 210,
  },
  {
    code: 'DEF_ETERNAL_AEGIS', name: 'Eternal Aegis', nameTh: 'โล่นิรันดร์',
    descriptionTh: 'โล่ของผู้เฝ้านิรันดร์ — ป้องกันและ HP สูงมาก', slot: 'DEFENSE', rarity: 'LEGENDARY',
    atk: 0, def: 58, hp: 100, spd: 0, icon: '🛡️', craftCost: 170, dustCost: 160, buyCost: null, coinCost: 510,
  },
  {
    code: 'DEF_WORLDWALL', name: 'Worldwall', nameTh: 'กำแพงโลกา',
    descriptionTh: 'กำแพงระดับ mythic ที่กั้นได้ทุกธาตุ', slot: 'DEFENSE', rarity: 'MYTHIC',
    atk: 0, def: 80, hp: 145, spd: 2, icon: '🧱', craftCost: 260, dustCost: 240, buyCost: null, coinCost: 780,
  },

  // ---------- ช่องสนับสนุน ----------
  {
    code: 'SUP_SWIFT_CHARM', name: 'Swift Charm', nameTh: 'เครื่องรางว่องไว',
    descriptionTh: 'เครื่องรางเล็กที่ทำให้ออกตัวเร็วขึ้น', slot: 'SUPPORT', rarity: 'COMMON',
    atk: 0, def: 0, hp: 4, spd: 5, icon: '🪶', craftCost: 6, dustCost: 5, buyCost: 12, coinCost: 18,
  },
  {
    code: 'SUP_DUSKVEIL', name: 'Duskveil Charm', nameTh: 'เครื่องรางม่านสนธยา',
    descriptionTh: 'เครื่องรางที่ทำให้ทีมออกตัวไวขึ้นเล็กน้อย', slot: 'SUPPORT', rarity: 'UNCOMMON',
    atk: 0, def: 0, hp: 9, spd: 8, icon: '🕯️', craftCost: 12, dustCost: 12, buyCost: 26, coinCost: 36,
  },
  {
    code: 'SUP_MOONLIT_TONIC', name: 'Moonlit Tonic', nameTh: 'น้ำยาจันทร์',
    descriptionTh: 'น้ำยาที่ฟื้นกำลังและเพิ่มความเร็ว', slot: 'SUPPORT', rarity: 'RARE',
    atk: 0, def: 0, hp: 15, spd: 12, icon: '🧪', craftCost: 20, dustCost: 25, buyCost: 45, coinCost: 60,
  },
  {
    code: 'SUP_EMBERHEART', name: 'Emberheart Relic', nameTh: 'หัวใจเพลิง',
    descriptionTh: 'เศษหัวใจเพลิงที่ยังเต้นอยู่ — เพิ่มความเร็วและโจมตี', slot: 'SUPPORT', rarity: 'EPIC',
    atk: 6, def: 0, hp: 20, spd: 22, icon: '💎', craftCost: 60, dustCost: 60, buyCost: null, coinCost: 180,
  },
  {
    code: 'SUP_SELENE_SIGIL', name: "Selene's Sigil", nameTh: 'ตราเซลิน',
    descriptionTh: 'ตราของเซลิน ผู้ผนึกอรุณ — เพิ่มทุก Status', slot: 'SUPPORT', rarity: 'LEGENDARY',
    atk: 10, def: 10, hp: 40, spd: 40, icon: '🌕', craftCost: 160, dustCost: 150, buyCost: null, coinCost: 480,
  },
  {
    code: 'SUP_WORLDSEED', name: 'Worldseed Relic', nameTh: 'เมล็ดพันธุ์โลก',
    descriptionTh: 'ของในตำนานที่เพิ่มทุก Status ของการ์ด — ของคราฟต์สูงสุดในเกม', slot: 'SUPPORT', rarity: 'MYTHIC',
    atk: 14, def: 14, hp: 60, spd: 55, icon: '🌱', craftCost: 240, dustCost: 220, buyCost: null, coinCost: 720,
  },
  {
    code: 'SUP_TRAVELERS_AMULET', name: "Traveler's Amulet", nameTh: 'เครื่องรางนักเดินทาง',
    descriptionTh: 'เครื่องรางเล็กที่พกง่าย — เพิ่ม HP และความเร็วเล็กน้อย', slot: 'SUPPORT', rarity: 'COMMON',
    atk: 0, def: 0, hp: 5, spd: 4, icon: '🧭', craftCost: 7, dustCost: 6, buyCost: 14, coinCost: 21,
  },
  {
    code: 'SUP_WINDWHISPER', name: 'Windwhisper', nameTh: 'กระซิบลม',
    descriptionTh: 'เสียงลมที่เร่งฝีเท้าทีม — HP และความเร็วระดับกลาง', slot: 'SUPPORT', rarity: 'UNCOMMON',
    atk: 0, def: 0, hp: 10, spd: 9, icon: '🍃', craftCost: 14, dustCost: 14, buyCost: 30, coinCost: 42,
  },
  {
    code: 'SUP_GALE_TOTEM', name: 'Gale Totem', nameTh: 'โทเทมลมพัด',
    descriptionTh: 'โทเทมที่เรียกสายลมช่วย — โจมตีเล็กน้อยและออกตัวไว', slot: 'SUPPORT', rarity: 'RARE',
    atk: 4, def: 0, hp: 16, spd: 14, icon: '🪁', craftCost: 24, dustCost: 30, buyCost: 52, coinCost: 72,
  },
  {
    code: 'SUP_STARLIGHT_CORE', name: 'Starlight Core', nameTh: 'แกนแสงดาว',
    descriptionTh: 'แกนพลังงานจากดวงดาว — เร่งทั้งทีมและเพิ่ม HP', slot: 'SUPPORT', rarity: 'EPIC',
    atk: 8, def: 0, hp: 25, spd: 26, icon: '⭐', craftCost: 70, dustCost: 70, buyCost: null, coinCost: 210,
  },
  {
    code: 'SUP_DAWNHEART', name: 'Dawnheart', nameTh: 'หัวใจอรุณ',
    descriptionTh: 'หัวใจแห่งอรุณที่ปลุกกำลังทั้งทีม', slot: 'SUPPORT', rarity: 'LEGENDARY',
    atk: 12, def: 12, hp: 45, spd: 45, icon: '💗', craftCost: 170, dustCost: 160, buyCost: null, coinCost: 510,
  },
  {
    code: 'SUP_ORIGIN_RELIC', name: 'Origin Relic', nameTh: 'เศษต้นกำเนิด',
    descriptionTh: 'ของระดับ mythic ที่เพิ่มทุก Status สูงที่สุดในเกม', slot: 'SUPPORT', rarity: 'MYTHIC',
    atk: 16, def: 16, hp: 70, spd: 60, icon: '🌐', craftCost: 260, dustCost: 240, buyCost: null, coinCost: 780,
  },
];

export function findItemDef(code: string): ItemDef | null {
  return ITEM_CATALOG.find((item) => item.code === code) ?? null;
}

export function itemsForSlot(slot: ItemSlot): ItemDef[] {
  return ITEM_CATALOG.filter((item) => item.slot === slot);
}

export interface ItemStats {
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

/** รวม Status ของ Item ที่ใส่ไว้ (บริสุทธิ์) */
export function sumItemStats(items: Array<Partial<ItemStats>>): ItemStats {
  const total: ItemStats = { atk: 0, def: 0, hp: 0, spd: 0 };
  for (const item of items) {
    total.atk += Math.trunc(item.atk ?? 0);
    total.def += Math.trunc(item.def ?? 0);
    total.hp += Math.trunc(item.hp ?? 0);
    total.spd += Math.trunc(item.spd ?? 0);
  }
  return total;
}

/** Status จริงของการ์ด = Status พื้นฐาน + Item ที่ใส่ (integer เท่านั้น) */
export function applyItemStats<T extends ItemStats>(base: T, bonuses: ItemStats): T {
  return {
    ...base,
    atk: Math.trunc(base.atk) + bonuses.atk,
    def: Math.trunc(base.def) + bonuses.def,
    hp: Math.trunc(base.hp) + bonuses.hp,
    spd: Math.trunc(base.spd) + bonuses.spd,
  };
}

/** Item ชิ้นนี้ใส่ช่องนั้นได้ไหม (ช่องต้องตรงกับชนิดของ Item) */
export function slotAcceptsItem(slot: ItemSlot, itemSlot: ItemSlot): boolean {
  return slot === itemSlot;
}

export interface CraftQuote {
  /** คราฟต์ได้ตอนนี้ไหม */
  ok: boolean;
  missingShards: number;
  missingDust: number;
  /** Coin ที่ยังขาด (Phase 39: คราฟต์ต้องใช้ Coin ด้วย) */
  missingCoins: number;
}

/** ประเมินว่าคราฟต์ได้ไหมจากยอดที่มี (ใช้ทั้ง UI และ API — กฎเดียวกัน) */
export function craftQuote(
  def: Pick<ItemDef, 'craftCost' | 'dustCost'> & Partial<Pick<ItemDef, 'coinCost'>>,
  have: { veilShards: number; dust: number; coins?: number }
): CraftQuote {
  const missingShards = Math.max(0, def.craftCost - Math.trunc(have.veilShards));
  const missingDust = Math.max(0, def.dustCost - Math.trunc(have.dust));
  const missingCoins = Math.max(0, (def.coinCost ?? 0) - Math.trunc(have.coins ?? 0));
  return {
    ok: missingShards === 0 && missingDust === 0 && missingCoins === 0,
    missingShards, missingDust, missingCoins,
  };
}

/**
 * ขาย Item คืนวัตถุดิบได้กี่ % ของสูตรคราฟต์ (ผู้ใช้สั่ง 2026-09-27)
 * "ขาย Item ได้วัตถุดิบกลับมา 50%" ⇒ คืนทั้ง Veil Shards และฝุ่นเวท อย่างละ 50% (ปัดลง)
 * หมายเหตุ: ต่ำกว่า 100% เสมอ ⇒ คราฟต์แล้วขายคืนไม่มีทางกำไร (กันปั๊มของ)
 */
export const ITEM_SELL_REFUND_RATE = 0.5;

export interface ItemSellQuote {
  /** Veil Shards ที่ได้คืน */
  shards: number;
  /** ฝุ่นเวทที่ได้คืน */
  dust: number;
  /** Coin ที่ได้คืน (Phase 39: คราฟต์จ่าย Coin ด้วย ⇒ ขายคืนได้ 50% เช่นกัน) */
  coins: number;
  /** รวมเป็น "มูลค่าวัตถุดิบ" (shards + dust) ไว้โชว์ */
  total: number;
}

/** วัตถุดิบที่จะได้คืนเมื่อขาย Item (คืน 50% ของสูตรคราฟต์ · ปัดลงเป็นจำนวนเต็ม) */
export function sellQuote(
  def: Pick<ItemDef, 'craftCost' | 'dustCost'> & Partial<Pick<ItemDef, 'coinCost'>>,
  quantity = 1
): ItemSellQuote {
  const count = Math.max(1, Math.trunc(Number.isFinite(quantity) ? quantity : 1));
  const shards = Math.floor(Math.max(0, Math.trunc(def.craftCost)) * ITEM_SELL_REFUND_RATE) * count;
  const dust = Math.floor(Math.max(0, Math.trunc(def.dustCost)) * ITEM_SELL_REFUND_RATE) * count;
  const coins = Math.floor(Math.max(0, Math.trunc(def.coinCost ?? 0)) * ITEM_SELL_REFUND_RATE) * count;
  return { shards, dust, coins, total: shards + dust };
}

/** ราคาถูกที่สุดของ Item นี้ (โชว์ใน UI เพื่อเทียบทางซื้อ/คราฟต์) */
export function cheapestPrice(def: ItemDef): number | null {
  const prices = [def.craftCost > 0 ? def.craftCost : null, def.buyCost].filter(
    (value): value is number => typeof value === 'number'
  );
  return prices.length ? Math.min(...prices) : null;
}
