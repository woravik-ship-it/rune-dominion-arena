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
}

/** ลำดับช่องแบบตายตัว (ใช้ทั้ง UI และการตรวจสอบ) */
export const ITEM_SLOTS: ItemSlot[] = ['ATTACK', 'DEFENSE', 'SUPPORT'];

export const ITEM_CATALOG: ItemDef[] = [
  // ---------- ช่องโจมตี ----------
  {
    code: 'ATK_WHETSTONE', name: 'Whetstone Edge', nameTh: 'หินลับคม',
    descriptionTh: 'ของพื้นฐานของช่าง — เพิ่มพลังโจมตีเล็กน้อย', slot: 'ATTACK', rarity: 'COMMON',
    atk: 6, def: 0, hp: 0, spd: 0, icon: '🗡️', craftCost: 6, dustCost: 5, buyCost: 12,
  },
  {
    code: 'ATK_EMBER_FANG', name: 'Ember Fang', nameTh: 'เขี้ยวเพลิง',
    descriptionTh: 'คมเขี้ยวที่ยังอุ่นจากเตาหลอม — เพิ่มพลังโจมตีชัดเจน', slot: 'ATTACK', rarity: 'RARE',
    atk: 16, def: 0, hp: 0, spd: 0, icon: '🔥', craftCost: 20, dustCost: 25, buyCost: 45,
  },
  {
    code: 'ATK_MOONLESS_BLADE', name: 'Moonless Blade', nameTh: 'ดาบไร้จันทร์',
    descriptionTh: 'ดาบที่คมจนแสงไม่สะท้อน — เพิ่มโจมตีและความเร็ว', slot: 'ATTACK', rarity: 'EPIC',
    atk: 32, def: 0, hp: 0, spd: 4, icon: '🌙', craftCost: 60, dustCost: 60, buyCost: null,
  },
  {
    code: 'ATK_RIFTRENDER', name: 'Riftrender', nameTh: 'ดาบผ่ารอยแยก',
    descriptionTh: 'อาวุธระดับตำนาน — เพิ่มพลังโจมตีมากที่สุด', slot: 'ATTACK', rarity: 'LEGENDARY',
    atk: 60, def: 0, hp: 20, spd: 0, icon: '⚔️', craftCost: 160, dustCost: 150, buyCost: null,
  },

  // ---------- ช่องป้องกัน ----------
  {
    code: 'DEF_OAK_BUCKLER', name: 'Oak Buckler', nameTh: 'โล่ไม้โอ๊ก',
    descriptionTh: 'โล่เล็กที่ช่างทุกคนทำได้ — เพิ่มป้องกันและ HP', slot: 'DEFENSE', rarity: 'COMMON',
    atk: 0, def: 6, hp: 10, spd: 0, icon: '🛡️', craftCost: 6, dustCost: 5, buyCost: 12,
  },
  {
    code: 'DEF_TIDEWALL', name: 'Tidewall Shield', nameTh: 'โล่กำแพงน้ำ',
    descriptionTh: 'โล่ที่หนุนด้วยกระแสน้ำ — เพิ่มป้องกันและ HP ชัดเจน', slot: 'DEFENSE', rarity: 'RARE',
    atk: 0, def: 16, hp: 25, spd: 0, icon: '🌊', craftCost: 20, dustCost: 25, buyCost: 45,
  },
  {
    code: 'DEF_DAWNSTONE', name: 'Dawnstone Aegis', nameTh: 'โล่ศิลาอรุณ',
    descriptionTh: 'โล่ที่สลาย Veil Shield ได้ชั่วขณะ — ป้องกันสูง', slot: 'DEFENSE', rarity: 'EPIC',
    atk: 0, def: 30, hp: 50, spd: 0, icon: '✨', craftCost: 60, dustCost: 60, buyCost: null,
  },
  {
    code: 'DEF_VEILGUARD', name: 'Veilguard Bulwark', nameTh: 'โล่ผู้เฝ้าม่าน',
    descriptionTh: 'โล่ระดับตำนานของผู้เฝ้าประตู — ป้องกันและ HP สูงสุด', slot: 'DEFENSE', rarity: 'LEGENDARY',
    atk: 0, def: 55, hp: 95, spd: 3, icon: '🏰', craftCost: 160, dustCost: 150, buyCost: null,
  },

  // ---------- ช่องสนับสนุน ----------
  {
    code: 'SUP_SWIFT_CHARM', name: 'Swift Charm', nameTh: 'เครื่องรางว่องไว',
    descriptionTh: 'เครื่องรางเล็กที่ทำให้ออกตัวเร็วขึ้น', slot: 'SUPPORT', rarity: 'COMMON',
    atk: 0, def: 0, hp: 4, spd: 5, icon: '🪶', craftCost: 6, dustCost: 5, buyCost: 12,
  },
  {
    code: 'SUP_MOONLIT_TONIC', name: 'Moonlit Tonic', nameTh: 'น้ำยาจันทร์',
    descriptionTh: 'น้ำยาที่ฟื้นกำลังและเพิ่มความเร็ว', slot: 'SUPPORT', rarity: 'RARE',
    atk: 0, def: 0, hp: 15, spd: 12, icon: '🧪', craftCost: 20, dustCost: 25, buyCost: 45,
  },
  {
    code: 'SUP_EMBERHEART', name: 'Emberheart Relic', nameTh: 'หัวใจเพลิง',
    descriptionTh: 'เศษหัวใจเพลิงที่ยังเต้นอยู่ — เพิ่มความเร็วและโจมตี', slot: 'SUPPORT', rarity: 'EPIC',
    atk: 6, def: 0, hp: 20, spd: 22, icon: '💎', craftCost: 60, dustCost: 60, buyCost: null,
  },
  {
    code: 'SUP_SELENE_SIGIL', name: "Selene's Sigil", nameTh: 'ตราเซลิน',
    descriptionTh: 'ตราของเซลิน ผู้ผนึกอรุณ — เพิ่มทุก Status', slot: 'SUPPORT', rarity: 'LEGENDARY',
    atk: 10, def: 10, hp: 40, spd: 40, icon: '🌕', craftCost: 160, dustCost: 150, buyCost: null,
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
}

/** ประเมินว่าคราฟต์ได้ไหมจากยอดที่มี (ใช้ทั้ง UI และ API — กฎเดียวกัน) */
export function craftQuote(
  def: Pick<ItemDef, 'craftCost' | 'dustCost'>,
  have: { veilShards: number; dust: number }
): CraftQuote {
  const missingShards = Math.max(0, def.craftCost - Math.trunc(have.veilShards));
  const missingDust = Math.max(0, def.dustCost - Math.trunc(have.dust));
  return { ok: missingShards === 0 && missingDust === 0, missingShards, missingDust };
}

/** ราคาถูกที่สุดของ Item นี้ (โชว์ใน UI เพื่อเทียบทางซื้อ/คราฟต์) */
export function cheapestPrice(def: ItemDef): number | null {
  const prices = [def.craftCost > 0 ? def.craftCost : null, def.buyCost].filter(
    (value): value is number => typeof value === 'number'
  );
  return prices.length ? Math.min(...prices) : null;
}
