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
import { InventoryItemType, ItemSlot, Prisma } from '@prisma/client';
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
import { VeilShardService, creditVeilShards, debitVeilShards, type VeilShardDb } from '@/services/veil-shard';
import { CRAFTING_DUST_CODE, CRAFTING_DUST_NAME_TH, InventoryService } from '@/services/inventory';

export interface CatalogRow extends ItemDef {
  /** จำนวนที่ถืออยู่ */
  owned: number;
  /** จำนวนที่ใส่อยู่บนการ์ด (ทุกใบ) */
  equippedCount: number;
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

/** เพิ่ม Item เข้าคลังผู้เล่น (ของซ้ำ = บวกจำนวน) */
async function grantItem(
  db: Pick<VeilShardDb, 'userItem'>,
  userId: string,
  itemId: string,
  quantity = 1
): Promise<number> {
  const existing = await db.userItem.findUnique({
    where: { userId_itemId: { userId, itemId } },
  });
  if (existing) {
    const updated = await db.userItem.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    });
    return updated.quantity;
  }
  const created = await db.userItem.create({ data: { userId, itemId, quantity } });
  return created.quantity;
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

  /** แคตตาล็อก + ของที่มี + สถานะซื้อ/คราฟต์ได้ (ใช้ในหน้า /items) */
  static async catalog(
    userId: string
  ): Promise<{ veilShards: number; dust: number; rows: CatalogRow[] }> {
    await this.ensureCatalog();
    const [defs, owned, equipped, user, dust] = await Promise.all([
      prisma.itemDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ slot: 'asc' }, { craftCost: 'asc' }],
      }),
      prisma.userItem.findMany({ where: { userId }, select: { itemId: true, quantity: true } }),
      prisma.cardItemSlot.groupBy({
        by: ['itemId'],
        where: { userCard: { userId } },
        _count: { _all: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { veilShards: true } }),
      dustBalance(userId),
    ]);

    const ownedByItem = new Map(owned.map((row) => [row.itemId, row.quantity]));
    const equippedByItem = new Map(equipped.map((row) => [row.itemId, row._count._all]));
    const balance = Math.max(0, user?.veilShards ?? 0);

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
      };
      const quote = craftQuote(def, { veilShards: balance, dust });
      return {
        ...def,
        owned: ownedByItem.get(row.id) ?? 0,
        equippedCount: equippedByItem.get(row.id) ?? 0,
        canBuy: row.buyCost !== null && balance >= row.buyCost,
        canCraft: quote.ok,
        missingShards: quote.missingShards,
        missingDust: quote.missingDust,
      };
    });

    return { veilShards: balance, dust, rows };
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
  ): Promise<{ balance: number; dust: number; quantity: number; nameTh: string }> {
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
      const quantity = await grantItem(tx, userId, row.id, 1);
      const dust = await dustBalance(userId, tx);
      return { balance: paid.balance, dust, quantity, nameTh: row.nameTh };
    });
  }

  /**
   * ขาย Item คืนร้าน → ได้วัตถุดิบกลับมา 50% (Veil Shards + ฝุ่นเวท ตามสูตรคราฟต์)
   *
   * ผู้ใช้สั่ง 2026-09-27: "เพิ่มระบบขาย Item ได้วัตถุดิบกลับมา 50%"
   *  - คืนตาม `sellQuote()` (pure) ⇒ UI/API/เทสต์ใช้ตัวเลขชุดเดียวกัน
   *  - กันของที่ "ใส่อยู่บนการ์ด" ไม่ให้ขายจนไม่พอใช้ (owned − ขาย ≥ จำนวนที่ใส่อยู่)
   *  - ทำใน transaction เดียว: ตัดของ → คืน Veil Shards → คืนฝุ่นเวท
   */
  static async sell(
    userId: string,
    itemCode: string,
    quantity = 1
  ): Promise<{
    nameTh: string; sold: number; refundShards: number; refundDust: number;
    balance: number; dust: number; remaining: number;
  }> {
    await this.ensureCatalog();
    const row = await prisma.itemDefinition.findUnique({ where: { code: itemCode } });
    const def = findItemDef(itemCode);
    if (!row || !def || !row.isActive) throw new Error('ไม่พบ Item นี้');

    const owned = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId, itemId: row.id } },
      select: { id: true, quantity: true },
    });
    if (!owned || owned.quantity <= 0) throw new Error('ยังไม่มี Item นี้ในคลัง');

    const want = Math.max(1, Math.trunc(Number.isFinite(quantity) ? quantity : 1));
    const sold = Math.min(want, owned.quantity);
    const equippedCount = await prisma.cardItemSlot.count({
      where: { itemId: row.id, userCard: { userId } },
    });
    if (owned.quantity - sold < equippedCount) {
      throw new Error('Item ชิ้นนี้ใส่อยู่บนการ์ด — ถอดออกก่อนขาย (หรือขายให้น้อยลง)');
    }

    const quote = sellQuote(def, sold);
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
          description: `ขาย ${row.nameTh} คืนร้าน ${sold} ชิ้น`,
        });
        balance = credited.balance;
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
        refundShards: quote.shards,
        refundDust: quote.dust,
        balance,
        dust,
        remaining: owned.quantity - sold,
      };
    });
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
      include: { item: true },
    });
    return ITEM_SLOTS.flatMap((slot) => {
      const found = slots.find((row) => row.slot === slot);
      if (!found) return [];
      const stats: ItemStats = {
        atk: found.item.atk,
        def: found.item.def,
        hp: found.item.hp,
        spd: found.item.spd,
      };
      const view: EquippedItemView = {
        slot,
        itemCode: found.item.code,
        nameTh: found.item.nameTh,
        icon: found.item.icon,
        rarity: found.item.rarity,
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
      include: { item: true },
    });
    const byUserCard = new Map<string, ItemStats[]>();
    for (const row of slots) {
      const list = byUserCard.get(row.userCardId) ?? [];
      list.push({ atk: row.item.atk, def: row.item.def, hp: row.item.hp, spd: row.item.spd });
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

  /** ใส่ Item ลงช่อง (ต้องมีของในคลัง + ช่องต้องตรงกับชนิดของ Item) */
  static async equip(params: {
    userId: string;
    cardId: string;
    slot: ItemSlot;
    itemCode: string;
  }): Promise<{ message: string }> {
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

    const owned = await prisma.userItem.findUnique({
      where: { userId_itemId: { userId: params.userId, itemId: item.id } },
    });
    if (!owned || owned.quantity <= 0) throw new Error('ยังไม่มี Item นี้ในคลัง — ซื้อหรือคราฟต์ก่อน');

    // 1 ชิ้นใส่ได้ครั้งเดียว (ของซ้ำ → ซื้อ/คราฟต์เพิ่มเพื่อใส่หลายการ์ด)
    const currentSlot = await prisma.cardItemSlot.findUnique({
      where: { userCardId_slot: { userCardId: userCard.id, slot: params.slot } },
    });
    const alreadySame = currentSlot?.itemId === item.id;
    if (!alreadySame) {
      const equippedCount = await prisma.cardItemSlot.count({
        where: { itemId: item.id, userCard: { userId: params.userId } },
      });
      if (equippedCount >= owned.quantity) {
        throw new Error('Item ชิ้นนี้ถูกใส่บนการ์ดอื่นอยู่ — คราฟต์เพิ่มอีกชิ้นก่อน');
      }
    }

    await prisma.cardItemSlot.upsert({
      where: { userCardId_slot: { userCardId: userCard.id, slot: params.slot } },
      create: { userCardId: userCard.id, slot: params.slot, itemId: item.id },
      update: { itemId: item.id },
    });
    return { message: `ใส่ ${item.nameTh} ในช่อง ${params.slot} แล้ว` };
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
