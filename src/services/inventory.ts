// Inventory Service — Phase 11.3
// ปลายทางของรางวัลที่ไม่ใช่ Coin: การ์ดพิเศษ / เครื่องประดับ / ฉายา / วัตถุดิบ / บทเนื้อเรื่อง
// หลักการ: idempotent (upsert ตาม userId+type+code), integer เท่านั้น, เพิ่มจำนวนแบบ atomic
import { prisma } from '@/lib/prisma';
import { InventoryItemType, EventRewardType } from '@prisma/client';
import { createHash } from 'node:crypto';

export interface InventoryView {
  id: string;
  itemType: InventoryItemType;
  code: string;
  nameTh: string;
  quantity: number;
  source: string | null;
  eventId: string | null;
  acquiredAt: string;
}

/** แปลง reward type ของ event → ประเภทของในกระเป๋า (null = ไม่ใช่ของสะสม) */
export function inventoryTypeForReward(rewardType: EventRewardType): InventoryItemType | null {
  switch (rewardType) {
    case 'CARD': return 'CARD';
    case 'COSMETIC': return 'COSMETIC';
    case 'TITLE': return 'TITLE';
    case 'CRAFTING_DUST': return 'CRAFTING_DUST';
    case 'STORY_CHAPTER': return 'STORY_CHAPTER';
    default: return null; // COIN / VEIL_SHARDS เข้ากระเป๋าเงิน/กิจกรรมโดยตรง
  }
}

/** code จากชื่อรางวัล — ใช้เทียบความซ้ำได้อย่างคงที่ (ชื่อไทยล้วนใช้ hash กันชนกัน) */
export function inventoryCode(code: string): string {
  const slug = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  // ชื่อที่ไม่มีอักษรละตินเลย (เช่นชื่อไทย) → เติม hash 8 ตัวท้ายเพื่อไม่ให้ชนกัน
  if (!/[A-Z0-9]/.test(slug) || slug === 'ITEM') {
    const hash = createHash('sha256').update(code.trim()).digest('hex').slice(0, 8).toUpperCase();
    return `ITEM_${hash}`;
  }
  return slug;
}

export class InventoryService {
  /** เพิ่มของเข้าคลัง (idempotent — มีอยู่แล้วบวกจำนวน) */
  static async grant(params: {
    userId: string;
    itemType: InventoryItemType;
    code: string;
    nameTh: string;
    quantity?: number;
    source?: string;
    eventId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ created: boolean; quantity: number; id: string }> {
    const quantity = Math.max(1, Math.trunc(params.quantity ?? 1));
    const code = inventoryCode(params.code);

    const existing = await prisma.userInventoryItem.findUnique({
      where: {
        userId_itemType_code: { userId: params.userId, itemType: params.itemType, code },
      },
    });

    if (existing) {
      const updated = await prisma.userInventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: quantity } },
      });
      return { created: false, quantity: updated.quantity, id: updated.id };
    }

    const created = await prisma.userInventoryItem.create({
      data: {
        userId: params.userId,
        itemType: params.itemType,
        code,
        nameTh: params.nameTh,
        quantity,
        source: params.source ?? null,
        eventId: params.eventId ?? null,
        metadata: (params.metadata ?? undefined) as unknown as object | undefined,
      },
    });
    return { created: true, quantity: created.quantity, id: created.id };
  }

  /**
   * จ่ายรางวัลตามประเภทของ event ให้ครบทุกช่องทาง
   * - COIN / VEIL_SHARDS: ไม่จัดการที่นี่ (route เป็นคนจ่ายให้)
   * - อื่น ๆ: เข้าคลังผู้เล่น
   */
  static async grantEventReward(params: {
    userId: string;
    rewardType: EventRewardType;
    rewardAmount: number;
    rewardLabel: string | null;
    titleTh: string;
    source: string;
    eventId: string;
  }): Promise<{ granted: boolean; itemType?: InventoryItemType; code?: string; quantity?: number }> {
    const itemType = inventoryTypeForReward(params.rewardType);
    if (!itemType) return { granted: false };

    const label = params.rewardLabel ?? params.titleTh;
    const quantity = params.rewardType === 'CRAFTING_DUST'
      ? Math.max(1, Math.trunc(params.rewardAmount))
      : 1;

    const result = await this.grant({
      userId: params.userId,
      itemType,
      code: label,
      nameTh: label,
      quantity,
      source: params.source,
      eventId: params.eventId,
    });

    return { granted: true, itemType, code: inventoryCode(label), quantity: result.quantity };
  }

  /** รายการของสะสมของผู้เล่น (แบ่งกลุ่มตามประเภท) */
  static async list(userId: string): Promise<InventoryView[]> {
    const items = await prisma.userInventoryItem.findMany({
      where: { userId },
      orderBy: [{ itemType: 'asc' }, { acquiredAt: 'desc' }],
    });
    return items.map((i) => ({
      id: i.id,
      itemType: i.itemType,
      code: i.code,
      nameTh: i.nameTh,
      quantity: i.quantity,
      source: i.source,
      eventId: i.eventId,
      acquiredAt: i.acquiredAt.toISOString(),
    }));
  }

  /** สรุปจำนวนตามประเภท */
  static async summary(userId: string): Promise<Record<string, number>> {
    const items = await this.list(userId);
    const out: Record<string, number> = {};
    for (const i of items) {
      out[i.itemType] = (out[i.itemType] ?? 0) + i.quantity;
    }
    return out;
  }
}
