// GET /api/inventory — กระเป๋าผู้เล่น (Phase 11.3 → Phase 26: เพิ่มเงิน + ไอเทมช่าง → Phase 43: แยก Item ต่อชิ้น)
//
// ผู้ใช้สั่ง 2026-09-27: "แล้วกระเป๋า Bag มีไว้ทำไม ถ้าไม่เอา Item ไปแสดง เอาเงินไปแสดง"
// ⇒ กระเป๋าต้องรวม 3 อย่าง: ยอดเงิน (Coin/Veil Shards/ฝุ่นเวท) · ไอเทมช่าง (ที่ใส่การ์ดได้) · ของสะสมจากกิจกรรม
// ผู้ใช้สั่ง 2026-10-04: "ในกระเป๋าก็แยก Item" ⇒ ไอเทมช่างแยกเป็น **กองตามระดับตีบวก**
//   (+0 ×3 กับ +2 ×1 = คนละแถว · สถานะ/ราคาขายคิดตามระดับของกองนั้น)
import { NextRequest, NextResponse } from 'next/server';
import { InventoryService } from '@/services/inventory';
import { ItemService } from '@/services/item';
import { sellQuote } from '@/lib/item-definitions';
import { VeilShardService } from '@/services/veil-shard';
import { WalletService } from '@/services/wallet';
import { resolveRequestUserId } from '@/lib/current-user';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = await resolveRequestUserId(request, searchParams.get('userId'));
    if (!userId) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ' }, { status: 401 });
    }

    const [items, summary, catalog, stacks, equippedByStack, legacyEquipped, veilShards, wallet] =
      await Promise.all([
        InventoryService.list(userId),
        InventoryService.summary(userId),
        ItemService.catalog(userId),
        ItemService.stacks(userId),
        ItemService.equippedCardsByStack(userId),
        // แถวเก่าที่ยังไม่ผูกกับชิ้น (ก่อน Phase 43) — นับเป็นของกองระดับสูงสุดแทน
        prisma.cardItemSlot.findMany({
          where: { userCard: { userId }, userItemId: null },
          select: { item: { select: { code: true } } },
        }),
        VeilShardService.balance(userId),
        WalletService.getWallet(userId),
      ]);

    const defByCode = new Map(catalog.rows.map((row) => [row.code, row]));
    const legacyCountByCode = new Map<string, number>();
    for (const slot of legacyEquipped) {
      legacyCountByCode.set(slot.item.code, (legacyCountByCode.get(slot.item.code) ?? 0) + 1);
    }

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
      /**
       * ไอเทมช่างที่มีอยู่ — **1 แถว = 1 กองตามระดับตีบวก** (Phase 43)
       * `owned` = จำนวนชิ้นในกองนั้น · `enhanceLevel` = ระดับของกอง · `equippedCards` = การ์ดที่ใช้ชิ้นจากกองนั้น
       */
      workshopItems: stacks.map((stack) => {
        const def = defByCode.get(stack.itemCode);
        const topLevel = def?.stacks[0]?.enhanceLevel ?? 0;
        // แถวเก่าที่ยังไม่ผูกชิ้น → แสดงรวมกับกองระดับสูงสุด (ตรงกับที่ระบบใช้คิดสถานะ)
        const legacyEquippedCards = stack.enhanceLevel === topLevel
          ? equippedByStack.get(ItemService.legacyEquipKey(stack.itemCode)) ?? []
          : [];
        const legacyCount = stack.enhanceLevel === topLevel ? legacyCountByCode.get(stack.itemCode) ?? 0 : 0;
        const equippedCount = stack.equippedCount + legacyCount;
        return {
          id: stack.id,
          code: stack.itemCode,
          nameTh: stack.nameTh,
          name: stack.name,
          slot: stack.slot,
          rarity: stack.rarity,
          icon: stack.icon,
          /** สถานะจริงของกองนี้ (รวมโบนัสตีบวก +8%/ระดับ) */
          stats: stack.stats,
          /** ระดับตีบวกของกอง (+0..+15) */
          enhanceLevel: stack.enhanceLevel,
          /** จำนวนชิ้นในกองนี้ */
          owned: stack.quantity,
          equippedCount,
          free: Math.max(0, stack.quantity - equippedCount),
          craftCost: def?.craftCost ?? 0,
          dustCost: def?.dustCost ?? 0,
          buyCost: def?.buyCost ?? null,
          /** Phase 34: ขายคืนได้วัตถุดิบ 50% (โชว์ยอดล่วงหน้าในกระเป๋า) */
          sellRefund: def ? sellQuote(def, 1) : { shards: 0, dust: 0, coins: 0, total: 0 },
          /** การ์ดที่ของกองนี้ใส่อยู่ (กดเพื่อไปถอดที่หน้าการ์ด) */
          equippedCards: [...(equippedByStack.get(stack.id) ?? []), ...legacyEquippedCards],
        };
      }),
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' }, { status: 500 });
  }
}
