#!/usr/bin/env node
/**
 * clean-test-users.mjs — เก็บกวาดบัญชีทดสอบที่สคริปต์/เทสต์สร้างค้างไว้ใน DB จริง
 *
 * ที่มา 2026-10-07: เทสต์ E2E/inspect ต่าง ๆ สมัครผู้ใช้ใหม่ทุกครั้งแล้วไม่ลบ
 * ⇒ ฐานข้อมูลจริงสะสมบัญชี `e2e_*`, `verify*`, `ntf_*`, `audio_*`, `itm_*` หลายสิบบัญชี
 * ซึ่งไปโผล่ในตารางจัดอันดับ/สถิติผู้เล่น
 *
 * ปลอดภัยโดยค่าเริ่มต้น: **dry-run** (แสดงรายการ + จำนวน) ต้องสั่ง --yes จึงลบจริง
 *
 * วิธีใช้:
 *   node scripts/clean-test-users.mjs               # ดูรายการ (ไม่ลบ)
 *   node scripts/clean-test-users.mjs --yes         # ลบจริง
 *   node scripts/clean-test-users.mjs --yes --prefix=e2e_   # เฉพาะ prefix ที่ระบุ
 *
 * ⚠️ การลบผู้ใช้จะลบข้อมูลที่ผูกกับผู้ใช้ (การ์ด/เด็ค/ประวัติต่อสู้) ตาม FK cascade
 *    ⇒ ควรมีไฟล์สำรองล่าสุดก่อน (npm run backup)
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ใช้ค่าจาก environment
}

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const DO_DELETE = args.includes('--yes');
const onlyPrefix = args.find((a) => a.startsWith('--prefix='))?.split('=')[1] ?? null;

/** prefix ที่สคริปต์/เทสต์ในโปรเจกต์นี้ใช้ตั้งชื่อบัญชีชั่วคราว */
const KNOWN_PREFIXES = ['e2e_', 'verify', 'ntf_', 'audio_', 'itm_', 'vae_', 'map_', 'item_'];

async function main() {
  const prefixes = onlyPrefix ? [onlyPrefix] : KNOWN_PREFIXES;
  const rows = await prisma.user.findMany({
    where: { OR: prefixes.map((p) => ({ username: { startsWith: p } })) },
    select: { id: true, username: true, role: true, createdAt: true, _count: { select: { cards: true, decks: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const totalUsers = await prisma.user.count();
  console.log(`ผู้ใช้ทั้งหมดใน DB: ${totalUsers} · เข้าเกณฑ์บัญชีทดสอบ: ${rows.length} (prefix: ${prefixes.join(', ')})`);
  const byPrefix = new Map();
  for (const r of rows) {
    const p = prefixes.find((x) => r.username.startsWith(x)) ?? '?';
    byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1);
  }
  for (const [p, n] of byPrefix) console.log(`  ${p} → ${n} บัญชี`);

  const admins = rows.filter((r) => r.role !== 'PLAYER');
  if (admins.length) {
    console.log(`\n⚠️ พบบัญชีทดสอบที่ไม่ใช่ PLAYER (จะไม่ถูกลบอัตโนมัติ): ${admins.map((a) => `${a.username}(${a.role})`).join(', ')}`);
  }

  if (!DO_DELETE) {
    console.log('\nตัวอย่าง 10 รายการแรก:');
    for (const r of rows.slice(0, 10)) {
      console.log(`  - ${r.username} · ${r.createdAt.toISOString().slice(0, 10)} · การ์ด ${r._count.cards} · เด็ค ${r._count.decks}`);
    }
    console.log('\n(dry-run) ยังไม่ลบอะไร — ใส่ --yes ถ้าต้องการลบจริง (แนะนำให้รัน npm run backup ก่อน)');
    return;
  }

  const deletable = rows.filter((r) => r.role === 'PLAYER').map((r) => r.id);
  if (deletable.length === 0) {
    console.log('\nไม่มีบัญชีทดสอบให้ลบ');
    return;
  }
  const { count } = await prisma.user.deleteMany({ where: { id: { in: deletable } } });
  console.log(`\n🧹 ลบบัญชีทดสอบแล้ว ${count} บัญชี (เหลือผู้ใช้ ${await prisma.user.count()} คน)`);
}

main()
  .catch((err) => { console.error('❌ ล้ม:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
