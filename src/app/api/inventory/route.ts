// GET /api/inventory — กระเป๋าผู้เล่น (Phase 11.3 → Phase 26: เพิ่มเงิน + ไอเทมช่าง)
//
// ผู้ใช้สั่ง 2026-09-27: "แล้วกระเป๋า Bag มีไว้ทำไม ถ้าไม่เอา Item ไปแสดง เอาเงินไปแสดง"
// ⇒ กระเป๋าต้องรวม 3 อย่าง: ยอดเงิน (Coin/Veil Shards/ฝุ่นเวท) · ไอเทมช่าง (ที่ใส่การ์ดได้) · ของสะสมจากกิจกรรม
import { NextRequest, NextResponse } from 'next/server';
import { InventoryService } from '@/services/inventory';
import { ItemService } from '@/services/item';
import { sellQuote } from '@/lib/item-definitions';
import { VeilShardService } from '@/services/veil-shard';
import { WalletService } from '@/services/wallet';
import { resolveRequestUserId } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await resolveRequestUserId(request, searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const [items, summary, catalog, equippedByItem, veilShards, wallet] = await Promise.all([
      InventoryService.list(userId),
      InventoryService.summary(userId),
      ItemService.catalog(userId),
      ItemService.equippedCardsByItem(userId),
      VeilShardService.balance(userId),
      WalletService.getWallet(userId),
    ]);

    return NextResponse.json({
      success: true,
      data: items,
      summary,
      /** ยอดเงินในกระเป๋า */
      balances: {
        coin: wallet.balance,
        veilShards,
        dust: catalog.dust,
      },
      /** ไอเทมช่างที่มีอยู่ (ของที่ยังไม่มีจะไม่แสดง) */
      workshopItems: catalog.rows
        .filter((row) => row.owned > 0)
        .map((row) => ({
          code: row.code,
          nameTh: row.nameTh,
          name: row.name,
          slot: row.slot,
          rarity: row.rarity,
          icon: row.icon,
          stats: { atk: row.atk, def: row.def, hp: row.hp, spd: row.spd },
          owned: row.owned,
          equippedCount: row.equippedCount,
          craftCost: row.craftCost,
          dustCost: row.dustCost,
          buyCost: row.buyCost,
          /** Phase 34: ขายคืนได้วัตถุดิบ 50% (โชว์ยอดล่วงหน้าในกระเป๋า) */
          sellRefund: sellQuote(row, 1),
          /** การ์ดที่ไอเทมชิ้นนี้ใส่อยู่ (กดเพื่อไปถอดที่หน้าการ์ด) */
          equippedCards: equippedByItem.get(row.code) ?? [],
        })),
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
