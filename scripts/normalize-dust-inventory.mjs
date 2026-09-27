#!/usr/bin/env node
// normalize-dust-inventory.mjs — รวม "ฝุ่นเวท" ที่กระจายอยู่หลายแถวให้เป็นไอเทมเดียว (Phase 31.1)
//
// เหตุการณ์จริง (ผู้ใช้แจ้ง 2026-09-27): "ฝุ่นเวทที่ได้จากดันเจี้ยนมีสัญลักษณ์ไม่เหมือนที่เคยทำไว้
// จะทำให้คนเล่นสับสนว่าเป็นคนละ item"
//   → เดิมดันเจี้ยนแจกด้วยรหัสของตัวเอง เช่น `DUNGEON_EMBER_CRYPT_F1` ชื่อ 'ฝุ่นเวท (สุสานเพลิง ชั้น 1)'
//     ในกระเป๋าจึงเห็นเป็นคนละแถว/คนละไอเทมกับ 'ฝุ่นเวท' ที่ได้จากกิจกรรม
//
// สคริปต์นี้ (แก้ข้อมูลย้อนหลัง):
//   - รวมทุกแถว itemType = CRAFTING_DUST ของผู้เล่น 1 คน → แถวเดียว
//     code = inventoryCode('ฝุ่นเวท') (รหัสกลางตัวเดียวกับที่โค้ดใช้แจกใหม่) · nameTh = 'ฝุ่นเวท'
//   - ยอดรวมเท่าเดิม (บวกทุกแถว) · เก็บ acquiredAt ของแถวที่เก่าสุดไว้
//
// วิธีใช้: node scripts/normalize-dust-inventory.mjs [--dry-run]
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* ไม่มี .env → ใช้ค่าจาก environment */ }

const DRY_RUN = process.argv.includes('--dry-run');

/** คัดลอกสูตรจาก src/services/inventory.ts (ชื่อไทยล้วน → ITEM_<hash8>) */
const DUST_NAME_TH = 'ฝุ่นเวท';
const DUST_CODE = `ITEM_${createHash('sha256').update(DUST_NAME_TH).digest('hex').slice(0, 8).toUpperCase()}`;

if (!process.env.DATABASE_URL) {
  console.error('❌ ไม่พบ DATABASE_URL (ต้องรันในโฟลเดอร์โปรเจกต์ที่มี .env)');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  const rows = await prisma.userInventoryItem.findMany({
    where: { itemType: 'CRAFTING_DUST' },
    orderBy: [{ userId: 'asc' }, { acquiredAt: 'asc' }],
  });

  const byUser = new Map();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  let merged = 0;
  let touchedUsers = 0;
  console.log(`🔎 พบผู้เล่นที่มีฝุ่นเวท: ${byUser.size} คน · แถวทั้งหมด ${rows.length} แถว · รหัสกลาง = ${DUST_CODE}`);

  for (const [userId, list] of byUser) {
    const canonical = list.find((row) => row.code === DUST_CODE);
    const total = list.reduce((sum, row) => sum + row.quantity, 0);
    const alreadySingle = list.length === 1 && canonical;
    if (alreadySingle && canonical.nameTh === DUST_NAME_TH) continue;

    touchedUsers += 1;
    const target = canonical ?? list[0];
    const others = list.filter((row) => row.id !== target.id);
    merged += others.length;
    console.log(
      `  • ผู้เล่น ${userId}: ${list.length} แถว (${list.map((r) => `${r.code}×${r.quantity}`).join(', ')})` +
      ` → 1 แถว (${DUST_CODE}×${total})`
    );
    if (DRY_RUN) continue;

    await prisma.$transaction(async (tx) => {
      for (const row of others) await tx.userInventoryItem.delete({ where: { id: row.id } });
      await tx.userInventoryItem.update({
        where: { id: target.id },
        data: { code: DUST_CODE, nameTh: DUST_NAME_TH, quantity: total },
      });
    });
  }

  console.log(
    DRY_RUN
      ? `🧪 โหมดทดลอง: จะแก้ ${touchedUsers} คน · รวม ${merged} แถว (ยังไม่เขียนลงฐานข้อมูล)`
      : `✅ รวมแล้ว ${touchedUsers} คน · ลบแถวซ้ำ ${merged} แถว`
  );
} catch (error) {
  console.error('❌ ทำงานไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
