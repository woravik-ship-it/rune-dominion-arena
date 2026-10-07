// Item Service (Phase 25) — ร้านช่าง: แคตตาล็อก / ซื้อ / คราฟต์ / ใส่ Item 3 ช่อง
//
// ผู้ใช้สั่ง 2026-09-27: "ทำในส่วนของช่างใส่ Item เพิ่ม Status ให้ 3 ช่อง Item โจมตี, ป้องกัน, สนับสนุน
//   สำหรับใส่ Item ที่ได้รับ หรือ Craft มาได้"
//
// กฎของบริการนี้
//  - แคตตาล็อกมาจาก src/lib/item-definitions.ts (แหล่งเดียว) แล้ว upsert ลง DB ด้วย ensureCatalog()
//    ⇒ เพิ่ม Item ใหม่ในโค้ดแล้วรันเกม = มีของใหม่ทันที ไม่ต้องแก้ migration/seed มือ
//  - ซื้อ = จ่าย Veil Shards · คราฟต์ = จ่าย Veil Shards + ฝุ่นเวท (UserInventoryItem CRAFTING_DUST)
//  - ใส่ Item = 1 ช่องต่อ 1 ชิ้น (ATTACK/DEFENSE/SUPPORT) ต้องมีของในคลังก่อนใส่
//  - Status ของ Item ถูกบวกเข้าการ์ดจริง (ใช้ตอนต่อสู้/คิดพลังทีม) — ดู statsByCardIds()
import { prisma } from '@/lib/prisma';
import { InventoryItemType, ItemDefinition, ItemSlot, Prisma, UserItem } from '@prisma/client';
import { randomInt } from 'node:crypto';
import {
  ITEM_CATALOG,
  ITEM_SLOTS,
  applyItemStats,
  craftQuote,
  findItemDef,
  sellQuote,
  sumItemStats,
  type ItemDef,
  type ItemStats,
} from '@/lib/item-definitions';
import {
  ENHANCE_MAX_LEVEL,
  ENHANCE_SAFE_MAX,
  ENHANCE_JEWEL_NAME_TH,
  ENHANCE_JEWEL_TYPE,
  enhanceMove,
  enhanceQuote,
  enhanceStats,
} from '@/lib/item-enhance';
import { VeilShardService, creditVeilShards, debitVeilShards, type VeilShardDb } from '@/services/veil-shard';
import { creditWalletDb, debitWalletDb } from '@/services/wallet';
import { CRAFTING_DUST_CODE, CRAFTING_DUST_NAME_TH, ENHANCE_JEWEL_CODE, InventoryService } from '@/services/inventory';

/**
 * "กองของ" 1 กอง = ของชนิดเดียวกันที่ระดับบวกเดียวกัน (Phase 43)
 * ผู้ใช้สั่ง 2026-10-04: "การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
 * ⇒ กระเป๋า/ร้านช่างต้องแยกของเป็นกองตามระดับบวก และตีบวกทีละชิ้น
 */
export interface ItemStackView {
  /** id ของแถว UserItem (ใช้ระบุชิ้น/กองตอนตีบวก · ขาย · ใส่การ์ด) */
  id: string;
  itemCode: string;
  name: string;
  nameTh: string;
  descriptionTh: string;
  slot: ItemSlot;
  rarity: string;
  icon: string;
  /** ระดับตีบวกของกองนี้ (+0..+15) */
  enhanceLevel: number;
  /** จำนวนชิ้นในกอง */
  quantity: number;
  /** จำนวนชิ้นที่ใส่อยู่บนการ์ด (นับเฉพาะชิ้นจากกองนี้) */
  equippedCount: number;
  /** ชิ้นที่ยังว่างให้ใส่/ขายได้ = quantity − equippedCount */
  free: number;
  /** สถานะจริงของกองนี้ (คูณโบนัสตีบวกแล้ว) */
  stats: ItemStats;
}

export interface CatalogRow extends ItemDef {
  /** จำนวนที่ถืออยู่ทุกกองรวมกัน */
  owned: number;
  /** จำนวนที่ใส่อยู่บนการ์ด (ทุกใบ) */
  equippedCount: number;
  /** ระดับบวกสูงสุดที่มีในคลัง (0 = ยังไม่มีของตีบวก) */
  enhanceLevel: number;
  /** ของที่มี แยกเป็นกองตามระดับบวก (ว่าง = ยังไม่มีของ) */
  stacks: ItemStackView[];
  canBuy: boolean;
  canCraft: boolean;
  missingShards: number;
  missingDust: number;
}

export interface EquippedItemView {
  slot: ItemSlot;
  itemCode: string;
  nameTh: string;
  icon: string;
  rarity: string;
  /** ระดับบวกของชิ้นที่ใส่ (Phase 43) */
  enhanceLevel: number;
  stats: ItemStats;
}

/** รวมฝุ่นเวททั้งหมดของผู้เล่น (ของรางวัลจากกิจกรรม) */
export async function dustBalance(userId: string, db: VeilShardDb = prisma): Promise<number> {
  const rows = await db.userInventoryItem.findMany({
    where: { userId, itemType: InventoryItemType.CRAFTING_DUST },
    select: { quantity: true },
  });
  return rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
}

/** อ่านยอด Coin ใน transaction (ไม่สร้างกระเป๋าใหม่) */
async function currentCoins(db: VeilShardDb, userId: string): Promise<number> {
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return Math.max(0, wallet?.balance ?? 0);
}

/** หักฝุ่นเวท (ตัดจากรายการที่ได้มาก่อน — ทำซ้ำได้ผลเดิม) */
async function spendDust(db: Prisma.TransactionClient, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const rows = await db.userInventoryItem.findMany({
    where: { userId, itemType: InventoryItemType.CRAFTING_DUST },
    orderBy: { acquiredAt: 'asc' },
  });
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total < amount) throw new Error(`ฝุ่นเวทไม่พอ (ต้องใช้ ${amount} · มี ${total})`);

  let remaining = amount;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.quantity, remaining);
    remaining -= take;
    if (row.quantity === take) {
      await db.userInventoryItem.delete({ where: { id: row.id } });
    } else {
      await db.userInventoryItem.update({ where: { id: row.id }, data: { quantity: row.quantity - take } });
    }
  }
}

/** รวมอัญมณีตีบวกทั้งหมดของผู้เล่น (วัสดุเฉพาะไป +10..+15) */
export async function jewelsBalance(userId: string, db: VeilShardDb = prisma): Promise<number> {
  const rows = await db.userInventoryItem.findMany({
    where: { userId, itemType: ENHANCE_JEWEL_TYPE as InventoryItemType },
    select: { quantity: true },
  });
  return rows.reduce((sum, row) => sum + Math.max(0, row.quantity), 0);
}

/** หักอัญมณีตีบวก (ตัดจากรายการที่ได้มาก่อน — ทำซ้ำได้ผลเดิม) */
async function spendJewels(db: Prisma.TransactionClient, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const rows = await db.userInventoryItem.findMany({
    where: { userId, itemType: ENHANCE_JEWEL_TYPE as InventoryItemType },
    orderBy: { acquiredAt: 'asc' },
  });
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total < amount) throw new Error(`${ENHANCE_JEWEL_NAME_TH} ไม่พอ (ต้องใช้ ${amount} · มี ${total})`);

  let remaining = amount;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.quantity, remaining);
    remaining -= take;
    if (row.quantity === take) {
      await db.userInventoryItem.delete({ where: { id: row.id } });
    } else {
      await db.userInventoryItem.update({ where: { id: row.id }, data: { quantity: row.quantity - take } });
    }
  }
}

/**
 * เพิ่ม Item เข้าคลัง (Phase 43)
 *  - ของใหม่ลง "กอง +0" เสมอ (ของที่เพิ่งได้/คราฟต์/ซื้อ ยังไม่ตีบวก)
 *  - ของซ้ำ = บวกจำนวนในกองระดับนั้น (ไม่ใช่กองเดียวรวมทุกระดับ — ผู้ใช้สั่ง: แยก Item)
 */
async function grantItem(
  db: Pick<VeilShardDb, 'userItem'>,
  userId: string,
  itemId: string,
  quantity = 1,
  enhanceLevel = 0
): Promise<number> {
  const level = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(enhanceLevel) || 0));
  const updated = await db.userItem.upsert({
    where: { userId_itemId_enhanceLevel: { userId, itemId, enhanceLevel: level } },
    create: { userId, itemId, quantity, enhanceLevel: level },
    update: { quantity: { increment: quantity } },
  });
  return updated.quantity;
}

/** แปลงแถว UserItem (+ ItemDefinition) → มุมมอง "กองของ" ที่ UI ใช้ (สถานะคูณระดับบวกแล้ว) */
function toStackView(row: UserItem & { item: ItemDefinition }, equippedCount: number): ItemStackView {
  const quantity = Math.max(0, row.quantity);
  const equipped = Math.max(0, equippedCount);
  return {
    id: row.id,
    itemCode: row.item.code,
    name: row.item.name,
    nameTh: row.item.nameTh,
    descriptionTh: row.item.descriptionTh ?? '',
    slot: row.item.slot,
    rarity: row.item.rarity,
    icon: row.item.icon,
    enhanceLevel: row.enhanceLevel,
    quantity,
    equippedCount: equipped,
    free: Math.max(0, quantity - equipped),
    stats: enhanceStats(
      { atk: row.item.atk, def: row.item.def, hp: row.item.hp, spd: row.item.spd },
      row.enhanceLevel
    ),
  };
}

/**
 * ระดับบวกสูงสุดในคลังต่อ Item — ใช้เป็นค่าถอยหลังสำหรับช่องใส่ของเดิม
 * ที่ยังไม่ผูกกับ "ชิ้น" (`card_item_slots.user_item_id` เป็น null จากข้อมูลก่อน Phase 43)
 */
async function topLevelsByItem(userId: string, itemIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.userItem.findMany({
    where: { userId, itemId: { in: ids } },
    select: { itemId: true, enhanceLevel: true },
  });
  const out = new Map<string, number>();
  for (const row of rows) {
    out.set(row.itemId, Math.max(out.get(row.itemId) ?? 0, row.enhanceLevel));
  }
  return out;
}

export class ItemService {
  /**
   * ซิงก์แคตตาล็อกจากโค้ด → DB (idempotent)
   * เรียกก่อนอ่านแคตตาล็อกทุกครั้ง (ไม่กี่สิบแถว) ⇒ ของใหม่ในโค้ดมีผลทันทีโดยไม่ต้อง seed มือ
   */
  static async ensureCatalog(): Promise<number> {
    let count = 0;
    for (const def of ITEM_CATALOG) {
      const data = {
        name: def.name,
        nameTh: def.nameTh,
        descriptionTh: def.descriptionTh,
        slot: def.slot,
        rarity: def.rarity,
        atk: def.atk,
        def: def.def,
        hp: def.hp,
        spd: def.spd,
        icon: def.icon,
        craftCost: def.craftCost,
        dustCost: def.dustCost,
        buyCost: def.buyCost,
        coinCost: def.coinCost,
        isActive: true,
      };
      await prisma.itemDefinition.upsert({
        where: { code: def.code },
        create: { code: def.code, ...data },
        update: data,
      });
      count += 1;
    }
    return count;
  }

  /**
   * ของในคลัง แยกเป็น "กองตามระดับบวก" (Phase 43)
   *  - กระเป๋า (Bag) และแท็บ "ตีบวก" ของร้านช่างใช้ตัวนี้ ⇒ ของ +0/+2/+9 แยกแถวกัน
   *  - นับ `equippedCount` ต่อกอง (ผูกด้วย card_item_slots.user_item_id)
   */
  static async stacks(userId: string): Promise<ItemStackView[]> {
    const rows = await prisma.userItem.findMany({
      where: { userId, quantity: { gt: 0 } },
      include: { item: true, equippedBy: { select: { id: true } } },
      orderBy: [{ enhanceLevel: 'asc' }],
    });
    return rows.map((row) => toStackView(row, row.equippedBy.length));
  }

  /** แคตตาล็อก + ของที่มี (แยกกอง) + สถานะซื้อ/คราฟต์ได้ (ใช้ในหน้า /items) */
  static async catalog(
    userId: string
  ): Promise<{ veilShards: number; dust: number; coins: number; jewels: number; rows: CatalogRow[] }> {
    await this.ensureCatalog();
    const [defs, stacks, user, dust, wallet, jewels] = await Promise.all([
      prisma.itemDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ slot: 'asc' }, { craftCost: 'asc' }],
      }),
      this.stacks(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { veilShards: true } }),
      dustBalance(userId),
      prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
      jewelsBalance(userId),
    ]);

    const stacksByItem = new Map<string, ItemStackView[]>();
    for (const stack of stacks) {
      const list = stacksByItem.get(stack.itemCode) ?? [];
      list.push(stack);
      stacksByItem.set(stack.itemCode, list);
    }
    const balance = Math.max(0, user?.veilShards ?? 0);
    const coins = Math.max(0, wallet?.balance ?? 0);

    const rows: CatalogRow[] = defs.map((row) => {
      const def: ItemDef = {
        code: row.code,
        name: row.name,
        nameTh: row.nameTh,
        descriptionTh: row.descriptionTh ?? '',
        slot: row.slot,
        rarity: row.rarity,
        atk: row.atk,
        def: row.def,
        hp: row.hp,
        spd: row.spd,
        icon: row.icon,
        craftCost: row.craftCost,
        dustCost: row.dustCost,
        buyCost: row.buyCost,
        coinCost: row.coinCost,
      };
      const quote = craftQuote(def, { veilShards: balance, dust, coins });
      // ระดับสูงก่อนเสมอ (ของแรงสุดอยู่บนสุด) — กระเป๋า/ร้านโชว์ตามลำดับนี้
      const mine = [...(stacksByItem.get(row.code) ?? [])].sort((a, b) => b.enhanceLevel - a.enhanceLevel);
      return {
        ...def,
        owned: mine.reduce((sum, stack) => sum + stack.quantity, 0),
        equippedCount: mine.reduce((sum, stack) => sum + stack.equippedCount, 0),
        enhanceLevel: mine[0]?.enhanceLevel ?? 0,
        stacks: mine,
        canBuy: row.buyCost !== null && balance >= row.buyCost,
        canCraft: quote.ok,
        missingShards: quote.missingShards,
        missingDust: quote.missingDust,
        missingCoins: quote.missingCoins,
      };
    });

    return { veilShards: balance, dust, coins, jewels, rows };
  }

  /** ซื้อ Item ด้วย Veil Shards (buyCost = null → ซื้อไม่ได้ ต้องคราฟต์) */
  static async buy(
    userId: string,
    itemCode: string
  ): Promise<{ balance: number; quantity: number; nameTh: string }> {
    await this.ensureCatalog();
    const row = await prisma.itemDefinition.findUnique({ where: { code: itemCode } });
    const def = findItemDef(itemCode);
    if (!row || !def || !row.isActive) throw new Error('ไม่พบ Item นี้');
    if (row.buyCost === null || row.buyCost <= 0) {
      throw new Error('Item นี้ซื้อตรงไม่ได้ — ต้องคราฟต์ด้วย Veil Shards + ฝุ่นเวท');
    }

    return prisma.$transaction(async (tx) => {
      const paid = await debitVeilShards(tx, {
        userId,
        amount: row.buyCost as number,
        source: 'ITEM_BUY',
        description: `ซื้อ ${row.nameTh}`,
      });
      const quantity = await grantItem(tx, userId, row.id, 1);
      return { balance: paid.balance, quantity, nameTh: row.nameTh };
    });
  }

  /** คราฟต์ Item ด้วย Veil Shards + ฝุ่นเวท */
  static async craft(
    userId: string,
    itemCode: string
  ): Promise<{ balance: number; dust: number; coins: number; quantity: number; nameTh: string }> {
    await this.ensureCatalog();
    const row = await prisma.itemDefinition.findUnique({ where: { code: itemCode } });
    const def = findItemDef(itemCode);
    if (!row || !def || !row.isActive) throw new Error('ไม่พบ Item นี้');
    if (row.craftCost <= 0 && row.dustCost <= 0) throw new Error('Item นี้คราฟต์ไม่ได้');

    return prisma.$transaction(async (tx) => {
      const paid = await debitVeilShards(tx, {
        userId,
        amount: row.craftCost,
        source: 'ITEM_CRAFT',
        description: `คราฟต์ ${row.nameTh}`,
      });
      await spendDust(tx, userId, row.dustCost);
      // Phase 39: คราฟต์ต้องใช้ Coin ด้วย (ผู้ใช้สั่ง)
      const wallet = await debitWalletDb(tx, {
        userId,
        amount: row.coinCost,
        type: 'PURCHASE',
        referenceType: 'ITEM_CRAFT',
        description: `คราฟต์ ${row.nameTh}`,
      });
      const quantity = await grantItem(tx, userId, row.id, 1);
      const dust = await dustBalance(userId, tx);
      return { balance: paid.balance, dust, coins: wallet.balance, quantity, nameTh: row.nameTh };
    });
  }

  /**
   * ขาย Item คืนร้าน → ได้วัตถุดิบกลับมา 50% (Veil Shards + ฝุ่นเวท ตามสูตรคราฟต์)
   *
   * ผู้ใช้สั่ง 2026-09-27: "เพิ่มระบบขาย Item ได้วัตถุดิบกลับมา 50%"
   * ผู้ใช้สั่ง 2026-10-04: "ในกระเป๋าก็แยก Item" ⇒ ขายเป็น **กองตามระดับบวก** (`enhanceLevel`)
   *  - คืนตาม `sellQuote()` (pure) ⇒ UI/API/เทสต์ใช้ตัวเลขชุดเดียวกัน
   *  - กันของที่ "ใส่อยู่บนการ์ด" ไม่ให้ขายจนไม่พอใช้ (ในกองนั้น: quantity − ขาย ≥ จำนวนที่ใส่จากกองนั้น)
   *  - ทำใน transaction เดียว: ตัดของ → คืน Veil Shards/Coin → คืนฝุ่นเวท
   */
  static async sell(
    userId: string,
    itemCode: string,
    quantity = 1,
    enhanceLevel = 0
  ): Promise<{
    nameTh: string; sold: number; enhanceLevel: number;
    refundShards: number; refundDust: number; refundCoins: number;
    balance: number; dust: number; coins: number; remaining: number;
  }> {
    await this.ensureCatalog();
    const row = await prisma.itemDefinition.findUnique({ where: { code: itemCode } });
    const def = findItemDef(itemCode);
    if (!row || !def || !row.isActive) throw new Error('ไม่พบ Item นี้');

    const level = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(enhanceLevel) || 0));
    const owned = await prisma.userItem.findUnique({
      where: { userId_itemId_enhanceLevel: { userId, itemId: row.id, enhanceLevel: level } },
      select: { id: true, quantity: true },
    });
    if (!owned || owned.quantity <= 0) {
      throw new Error(level > 0 ? `ยังไม่มีของระดับ +${level} ในคลัง` : 'ยังไม่มี Item นี้ในคลัง');
    }

    const want = Math.max(1, Math.trunc(Number.isFinite(quantity) ? quantity : 1));
    const sold = Math.min(want, owned.quantity);
    // นับ "ชิ้นที่ใส่การ์ด" เฉพาะที่มาจากกองนี้ (Phase 43: ผูกด้วย user_item_id)
    const equippedCount = await prisma.cardItemSlot.count({ where: { userItemId: owned.id } });
    if (owned.quantity - sold < equippedCount) {
      throw new Error('Item ชิ้นนี้ใส่อยู่บนการ์ด — ถอดออกก่อนขาย (หรือขายให้น้อยลง)');
    }

    const quote = sellQuote(def, sold);
    const levelSuffix = level > 0 ? ` +${level}` : '';
    return prisma.$transaction(async (tx) => {
      if (owned.quantity === sold) {
        await tx.userItem.delete({ where: { id: owned.id } });
      } else {
        await tx.userItem.update({ where: { id: owned.id }, data: { quantity: owned.quantity - sold } });
      }

      let balance = await VeilShardService.balance(userId, tx);
      if (quote.shards > 0) {
        const credited = await creditVeilShards(tx, {
          userId,
          amount: quote.shards,
          source: 'ITEM_SELL',
          description: `ขาย ${row.nameTh}${levelSuffix} คืนร้าน ${sold} ชิ้น`,
        });
        balance = credited.balance;
      }
      let coins = await currentCoins(tx, userId);
      if (quote.coins > 0) {
        const refunded = await creditWalletDb(tx, {
          userId,
          amount: quote.coins,
          type: 'REWARD',
          referenceType: 'ITEM_SELL',
          description: `ขาย ${row.nameTh}${levelSuffix} คืนร้าน ${sold} ชิ้น`,
        });
        coins = refunded.balance;
      }
      if (quote.dust > 0) {
        await InventoryService.grant(
          {
            userId,
            itemType: 'CRAFTING_DUST',
            code: CRAFTING_DUST_CODE,
            nameTh: CRAFTING_DUST_NAME_TH,
            quantity: quote.dust,
            source: 'ITEM_SELL',
          },
          tx
        );
      }
      const dust = await dustBalance(userId, tx);
      return {
        nameTh: row.nameTh,
        sold,
        enhanceLevel: level,
        refundShards: quote.shards,
        refundDust: quote.dust,
        refundCoins: quote.coins,
        coins,
        balance,
        dust,
        remaining: owned.quantity - sold,
      };
    });
  }

  /** มอบ Item (อุปกรณ์ช่าง) ตาม code — ใช้ตอนฟาร์มแผนที่ (Map) ให้ของที่ยังไม่มี/ซ้ำเป็นจำนวน */
  static async grantItemByCode(
    userId: string,
    code: string,
    quantity = 1,
    db: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<number> {
    const row = await db.itemDefinition.findUnique({ where: { code } });
    if (!row) throw new Error('ไม่พบ Item นี้');
    return grantItem(db, userId, row.id, Math.max(1, Math.trunc(quantity)));
  }

  /**
   * ตีบวก Item **ทีละชิ้น** (ผู้ใช้สั่ง 2026-10-03 → แก้เป็นต่อชิ้น 2026-10-04)
   *
   * ผู้ใช้สั่ง 2026-10-04: "การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
   *  - เลือกได้ว่า "กองระดับไหน" (`enhanceLevel`) จะตีบวก → ดึง 1 ชิ้นจากกองนั้นไปเป็นชิ้นที่ระดับใหม่
   *    เช่น กอง +0 ×3 ตีบวกสำเร็จ → กอง +0 เหลือ ×2 และได้ +1 ×1 (ของชิ้นอื่นไม่ถูกบวกตาม)
   *  - +1..+6 พลาด = ระดับคงเดิม (ชิ้นกลับกองเดิม) · พยายามไป +7 ขึ้นไป พลาด = หล่น +6
   *  - พยายามไป +10..+15 ต้องใช้ "อัญมณีตีบวก" (ENHANCE_JEWEL)
   *  - ม้วนผลที่เซิร์ฟเวอร์ (randomInt) — client ส่งผลไม่ได้ (กันแก้/เดา)
   *  - ทำใน transaction เดียว: หัก Coin + ฝุ่นเวท (+อัญมณี) → ย้ายชิ้นระหว่างกอง
   */
  static async enhance(
    userId: string,
    itemCode: string,
    enhanceLevel = 0
  ): Promise<{
    oldLevel: number;
    newLevel: number;
    success: boolean;
    moved: boolean;
    chancePercent: number;
    /** จำนวนชิ้นที่เหลือในกองเดิมหลังตีบวก */
    quantity: number;
    /** จำนวนชิ้นในกองปลายทางหลังตีบวก */
    resultQuantity: number;
    coins: number;
    dust: number;
    jewels: number;
    nameTh: string;
    message: string;
  }> {
    await this.ensureCatalog();
    const row = await prisma.itemDefinition.findUnique({ where: { code: itemCode } });
    const def = findItemDef(itemCode);
    if (!row || !def || !row.isActive) throw new Error('ไม่พบ Item นี้');

    const level = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(enhanceLevel) || 0));
    const stack = await prisma.userItem.findUnique({
      where: { userId_itemId_enhanceLevel: { userId, itemId: row.id, enhanceLevel: level } },
      select: { id: true, quantity: true, enhanceLevel: true },
    });
    if (!stack || stack.quantity <= 0) throw new Error(`ไม่พบของระดับ +${level} ในคลัง`);
    if (stack.enhanceLevel >= ENHANCE_MAX_LEVEL) {
      throw new Error(`Item ชิ้นนี้ตีบวกถึงระดับสูงสุด (+${ENHANCE_MAX_LEVEL}) แล้ว`);
    }

    const quote = enhanceQuote(stack.enhanceLevel);
    // 1 ครั้งใช้ 1 ชิ้น (คือ "ชิ้นที่ตีบวก" เอง) — เหลือในกองต้องพอสำหรับชิ้นที่ใส่อยู่การ์ด
    const equippedCount = await prisma.cardItemSlot.count({ where: { userItemId: stack.id } });
    if (stack.quantity - quote.pieces < equippedCount) {
      throw new Error('ชิ้นที่เหลือในกองนี้ถูกใส่การ์ดอยู่ — ต้องมีชิ้นว่างให้ตีบวกก่อน');
    }

    const [chkCoins, chkDust, chkJewels] = await Promise.all([
      currentCoins(prisma, userId),
      dustBalance(userId),
      jewelsBalance(userId),
    ]);
    if (chkCoins < quote.coin) throw new Error(`Coin ไม่พอ (ต้องใช้ ${quote.coin})`);
    if (chkDust < quote.dust) throw new Error(`ฝุ่นเวทไม่พอ (ต้องใช้ ${quote.dust})`);
    if (chkJewels < quote.jewels) throw new Error(`${ENHANCE_JEWEL_NAME_TH} ไม่พอ (ต้องใช้ ${quote.jewels})`);

    const success = randomInt(100) < quote.chancePercent;
    const move = enhanceMove(stack.enhanceLevel, success);

    const result = await prisma.$transaction(async (tx) => {
      await debitWalletDb(tx, {
        userId,
        amount: quote.coin,
        type: 'PURCHASE',
        referenceType: 'ITEM_ENHANCE',
        description: `ตีบวก ${row.nameTh} +${stack.enhanceLevel}→+${quote.target}`,
      });
      await spendDust(tx, userId, quote.dust);
      if (quote.jewels > 0) await spendJewels(tx, userId, quote.jewels);

      // ย้าย "1 ชิ้น" ระหว่างกอง (ระดับไม่เปลี่ยน = ชิ้นกลับกองเดิม ไม่ต้องย้าย)
      let remaining = stack.quantity;
      let resultQuantity = move.moved ? 0 : stack.quantity;
      if (move.moved) {
        remaining = stack.quantity - quote.pieces;
        if (remaining <= 0) {
          await tx.userItem.delete({ where: { id: stack.id } });
        } else {
          await tx.userItem.update({ where: { id: stack.id }, data: { quantity: remaining } });
        }
        const target = await tx.userItem.upsert({
          where: {
            userId_itemId_enhanceLevel: { userId, itemId: row.id, enhanceLevel: move.resultLevel },
          },
          create: { userId, itemId: row.id, quantity: quote.pieces, enhanceLevel: move.resultLevel },
          update: { quantity: { increment: quote.pieces } },
        });
        resultQuantity = target.quantity;
      }

      return {
        coins: await currentCoins(tx, userId),
        dust: await dustBalance(userId, tx),
        jewels: await jewelsBalance(userId, tx),
        remaining,
        resultQuantity,
      };
    });

    const message = success
      ? `ตีบวกสำเร็จ! ${row.nameTh} +${stack.enhanceLevel} → +${move.resultLevel} (ชิ้นนี้บวกแล้ว กองอื่นไม่เปลี่ยน)`
      : stack.enhanceLevel >= ENHANCE_SAFE_MAX
        ? `ไม่สำเร็จ... ชิ้นนี้หล่นเป็น +${move.resultLevel}`
        : `ไม่สำเร็จ... ชิ้นนี้ยังอยู่ที่ +${move.resultLevel}`;

    return {
      oldLevel: stack.enhanceLevel,
      newLevel: move.resultLevel,
      success,
      moved: move.moved,
      chancePercent: quote.chancePercent,
      quantity: result.remaining,
      resultQuantity: result.resultQuantity,
      nameTh: row.nameTh,
      message,
      coins: result.coins,
      dust: result.dust,
      jewels: result.jewels,
    };
  }

  /**
  /**
   * การ์ดที่ "กองของ" แต่ละกองใส่อยู่ (Phase 34 → Phase 43: แยกตามชิ้น/กอง)
   * ผู้ใช้สั่ง: "item ที่ใส่อยู่สามารถกดแล้วไปที่การ์ดที่ใส่อยู่ได้ ถ้ามี Item เดียวกันหลายชิ้น
   *   ใส่หลายใบ ก็ให้มีตัวเลือก"
   * ⇒ คืน Map<userItemId, รายการการ์ดที่ชิ้นจากกองนั้นใส่อยู่ (cardId + ชื่อ + ช่อง)>
   *    แถวเก่าที่ยังไม่ผูกชิ้น → ใช้คีย์ `legacy:<itemCode>` (ผู้เรียกแสดงรวมกับกองระดับสูงสุด)
   */
  static async equippedCardsByStack(
    userId: string
  ): Promise<Map<string, Array<{ cardId: string; nameTh: string; slot: ItemSlot; imageUrl: string | null; imageStatus: string; rarity: string }>>> {
    const slots = await prisma.cardItemSlot.findMany({
      where: { userCard: { userId } },
      include: {
        item: { select: { code: true } },
        userCard: { include: { card: { select: { id: true, nameTh: true, name: true, imageUrl: true, imageStatus: true, rarity: true } } } },
      },
    });
    const out = new Map<string, Array<{ cardId: string; nameTh: string; slot: ItemSlot; imageUrl: string | null; imageStatus: string; rarity: string }>>();
    for (const row of slots) {
      const key = row.userItemId ?? `legacy:${row.item.code}`;
      const list = out.get(key) ?? [];
      list.push({
        cardId: row.userCard.card.id,
        nameTh: row.userCard.card.nameTh ?? row.userCard.card.name,
        slot: row.slot,
        imageUrl: row.userCard.card.imageUrl,
        imageStatus: row.userCard.card.imageStatus,
        rarity: row.userCard.card.rarity,
      });
      out.set(key, list);
    }
    for (const list of out.values()) list.sort((a, b) => a.nameTh.localeCompare(b.nameTh));
    return out;
  }

  /** คีย์ของ "กอง" ใน Map จาก equippedCardsByStack สำหรับแถวเก่าที่ยังไม่ผูกชิ้น */
  static legacyEquipKey(itemCode: string): string {
    return `legacy:${itemCode}`;
  }

  /** ของที่ใส่ไว้บนการ์ดใบหนึ่ง (เรียงตามช่อง ATTACK/DEFENSE/SUPPORT) */
  static async equipmentForCard(userId: string, cardId: string): Promise<EquippedItemView[]> {
    const userCard = await prisma.userCard.findUnique({
      where: { userId_cardId: { userId, cardId } },
      select: { id: true },
    });
    if (!userCard) return [];

    const slots = await prisma.cardItemSlot.findMany({
      where: { userCardId: userCard.id },
      include: { item: true, userItem: { select: { enhanceLevel: true } } },
    });
    // ระดับตีบวกมาจาก "ชิ้นที่ใส่จริง" (Phase 43) · แถวเก่าที่ยังไม่ผูกชิ้น → ใช้กองระดับสูงสุดของผู้เล่น
    const legacyLevels = slots.some((row) => !row.userItem)
      ? await topLevelsByItem(userId, slots.map((row) => row.itemId))
      : new Map<string, number>();
    return ITEM_SLOTS.flatMap((slot) => {
      const found = slots.find((row) => row.slot === slot);
      if (!found) return [];
      const level = found.userItem?.enhanceLevel ?? legacyLevels.get(found.itemId) ?? 0;
      const stats: ItemStats = enhanceStats(
        { atk: found.item.atk, def: found.item.def, hp: found.item.hp, spd: found.item.spd },
        level
      );
      const view: EquippedItemView = {
        slot,
        itemCode: found.item.code,
        nameTh: found.item.nameTh,
        icon: found.item.icon,
        rarity: found.item.rarity,
        enhanceLevel: level,
        stats,
      };
      return [view];
    });
  }

  /** สรุป Status ที่ได้จาก Item ของการ์ด (ใช้บวกเข้าสถานะจริง) */
  static async statsForCard(userId: string, cardId: string): Promise<ItemStats> {
    const equipped = await this.equipmentForCard(userId, cardId);
    return sumItemStats(equipped.map((row) => row.stats));
  }

  /**
   * Status จาก Item ของหลายการ์ดพร้อมกัน (ใช้ตอนต่อสู้/คิดพลังทีม)
   * คืน Map<cardId (CardDefinition), ItemStats> — การ์ดที่ไม่มี Item จะไม่มีคีย์
   */
  static async statsByCardIds(userId: string, cardIds: string[]): Promise<Map<string, ItemStats>> {
    const unique = [...new Set(cardIds)];
    const out = new Map<string, ItemStats>();
    if (unique.length === 0) return out;

    const userCards = await prisma.userCard.findMany({
      where: { userId, cardId: { in: unique } },
      select: { id: true, cardId: true },
    });
    if (userCards.length === 0) return out;

    const slots = await prisma.cardItemSlot.findMany({
      where: { userCardId: { in: userCards.map((row) => row.id) } },
      include: { item: true, userItem: { select: { enhanceLevel: true } } },
    });
    // คูณสถานะด้วยระดับบวก "ของชิ้นที่ใส่" (Phase 43) · แถวเก่า → กองระดับสูงสุดของผู้เล่น
    const legacyLevels = slots.some((row) => !row.userItem)
      ? await topLevelsByItem(userId, slots.map((row) => row.itemId))
      : new Map<string, number>();
    const byUserCard = new Map<string, ItemStats[]>();
    for (const row of slots) {
      const list = byUserCard.get(row.userCardId) ?? [];
      list.push(enhanceStats(
        { atk: row.item.atk, def: row.item.def, hp: row.item.hp, spd: row.item.spd },
        row.userItem?.enhanceLevel ?? legacyLevels.get(row.itemId) ?? 0
      ));
      byUserCard.set(row.userCardId, list);
    }
    for (const card of userCards) {
      const stats = byUserCard.get(card.id);
      if (stats && stats.length > 0) out.set(card.cardId, sumItemStats(stats));
    }
    return out;
  }

  /** เอา Status พื้นฐานของการ์ด + Item → Status จริง (ใช้ร่วมกันทุกที่ที่คิดพลัง) */
  static mergeStats<T extends ItemStats>(base: T, bonuses?: ItemStats): T {
    return bonuses ? applyItemStats(base, bonuses) : base;
  }

  /** ใส่ Item ลงช่อง (เลือกกอง/ระดับบวกได้ — Phase 43: ผูกกับ "ชิ้น" จริง) */
  static async equip(params: {
    userId: string;
    cardId: string;
    slot: ItemSlot;
    itemCode: string;
    /** ระดับบวกของกองที่จะดึงชิ้นมาใส่ (ค่าเริ่มต้น +0) */
    enhanceLevel?: number;
  }): Promise<{ message: string; enhanceLevel: number }> {
    if (!ITEM_SLOTS.includes(params.slot)) throw new Error('ช่องใส่ Item ไม่ถูกต้อง');

    const [userCard, item] = await Promise.all([
      prisma.userCard.findUnique({
        where: { userId_cardId: { userId: params.userId, cardId: params.cardId } },
        select: { id: true },
      }),
      prisma.itemDefinition.findUnique({ where: { code: params.itemCode } }),
    ]);
    if (!userCard) throw new Error('คุณไม่มีการ์ดใบนี้ในคลัง');
    if (!item || !item.isActive) throw new Error('ไม่พบ Item นี้');
    if (item.slot !== params.slot) throw new Error('Item นี้ใส่ช่องนี้ไม่ได้');

    const level = Math.max(0, Math.min(ENHANCE_MAX_LEVEL, Math.trunc(params.enhanceLevel ?? 0) || 0));
    const owned = await prisma.userItem.findUnique({
      where: { userId_itemId_enhanceLevel: { userId: params.userId, itemId: item.id, enhanceLevel: level } },
    });
    if (!owned || owned.quantity <= 0) {
      throw new Error(level > 0 ? `ไม่มีของระดับ +${level} ในคลัง` : 'ยังไม่มี Item นี้ในคลัง — ซื้อหรือคราฟต์ก่อน');
    }

    // 1 ชิ้นใส่ได้ครั้งเดียว — นับเฉพาะชิ้นจากกองระดับนี้ (ของกองอื่นใช้แยกกันได้)
    const currentSlot = await prisma.cardItemSlot.findUnique({
      where: { userCardId_slot: { userCardId: userCard.id, slot: params.slot } },
    });
    const alreadySame = currentSlot?.userItemId === owned.id;
    if (!alreadySame) {
      const equippedCount = await prisma.cardItemSlot.count({ where: { userItemId: owned.id } });
      if (equippedCount >= owned.quantity) {
        throw new Error('ชิ้นระดับนี้ถูกใส่บนการ์ดอื่นอยู่ — ตีบวก/คราฟต์เพิ่มอีกชิ้นก่อน');
      }
    }

    await prisma.cardItemSlot.upsert({
      where: { userCardId_slot: { userCardId: userCard.id, slot: params.slot } },
      create: { userCardId: userCard.id, slot: params.slot, itemId: item.id, userItemId: owned.id },
      update: { itemId: item.id, userItemId: owned.id },
    });
    return {
      message: `ใส่ ${item.nameTh}${level > 0 ? ` +${level}` : ''} ในช่อง ${params.slot} แล้ว`,
      enhanceLevel: level,
    };
  }

  /** ถอด Item ออกจากช่อง */
  static async unequip(params: {
    userId: string;
    cardId: string;
    slot: ItemSlot;
  }): Promise<{ message: string }> {
    const userCard = await prisma.userCard.findUnique({
      where: { userId_cardId: { userId: params.userId, cardId: params.cardId } },
      select: { id: true },
    });
    if (!userCard) throw new Error('คุณไม่มีการ์ดใบนี้ในคลัง');

    const deleted = await prisma.cardItemSlot.deleteMany({
      where: { userCardId: userCard.id, slot: params.slot },
    });
    if (deleted.count === 0) throw new Error('ช่องนี้ว่างอยู่แล้ว');
    return { message: `ถอด Item ออกจากช่อง ${params.slot} แล้ว` };
  }
}
