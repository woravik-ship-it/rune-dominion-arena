#!/usr/bin/env node
// reset-dungeon-balance.mjs — Reset ความคืบหน้าดันเจี้ยน + ตั้งเงินในกระเป๋าเป็น 10 (Phase 37)
//
// ผู้ใช้สั่ง 2026-09-27: *"คนที่ทดลองเล่นแล้วผ่านดันเจี้ยนเดิมไปแล้วแบบง่ายๆ Reset ให้มาเริ่มใหม่
//   ปรับเงินในกระเป๋าลง ให้เหลือ 10 พอ"*
//
// ทำอะไร:
//   1) ล้างความคืบหน้าดันเจี้ยน (dungeon_progress) + ประวัติการลุย (dungeon_runs) ของทุกคน
//      ⇒ เริ่มนับ "ชั้นที่ผ่าน" ใหม่ทั้งหมด หลังปรับสมดุลความยากเป็นแบบบล็อก 5 ชั้น
//   2) ตั้งยอด Coin ในกระเป๋าทุกคนเป็น 10 (เพดานบนสุด) — ไม่แตะ Veil Shards/ฝุ่นเวท/EXP/การ์ด
//   3) บันทึกประวัติการปรับเป็น WalletTransaction (type=RESTORE) เพื่อให้ตรวจย้อนหลังได้
//
// วิธีใช้: node scripts/reset-dungeon-balance.mjs [--dry-run]
import { readFileSync } from 'node:fs';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* ไม่มี .env */ }

const DRY_RUN = process.argv.includes('--dry-run');
const COIN_CAP = 10;

if (!process.env.DATABASE_URL) {
  console.error('❌ ไม่พบ DATABASE_URL');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  const [progressRows, runRows, wallets] = await Promise.all([
    prisma.dungeonProgress.count(),
    prisma.dungeonRun.count(),
    prisma.wallet.findMany({ select: { id: true, userId: true, balance: true } }),
  ]);
  const toCut = wallets.filter((w) => w.balance > COIN_CAP);
  console.log(`🔎 ก่อนปรับ: ความคืบหน้าดัน ${progressRows} แถว · ประวัติลุย ${runRows} แถว · กระเป๋า ${wallets.length} ใบ (ต้องลด ${toCut.length} ใบ)`);

  if (DRY_RUN) {
    console.log(`🧪 โหมดทดลอง: จะล้างความคืบหน้า/ประวัติทั้งหมด และตั้ง Coin เป็น ${COIN_CAP} (ไม่เขียนฐานข้อมูล)`);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.dungeonRun.deleteMany({});
      await tx.dungeonProgress.deleteMany({});
      for (const wallet of toCut) {
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'REWARD',
            amount: -(wallet.balance - COIN_CAP),
            balanceBefore: wallet.balance,
            balanceAfter: COIN_CAP,
            referenceType: 'BALANCE_RESET',
            description: `ปรับสมดุล: ตั้งเงินในกระเป๋าเป็น ${COIN_CAP} Coin`,
            idempotencyKey: `balance-reset:${wallet.userId}`,
          },
        });
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: COIN_CAP } });
      }
    });
    console.log(`✅ ล้างความคืบหน้าดัน/ประวัติแล้ว · ตั้ง Coin เป็น ${COIN_CAP} จำนวน ${toCut.length} ใบ`);
  }
} catch (error) {
  console.error('❌ ทำงานไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
