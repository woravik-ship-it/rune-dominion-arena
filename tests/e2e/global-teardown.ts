/**
 * global-teardown — เก็บกวาด "ผู้ใช้ทดสอบ" ที่ **การรันรอบนี้** สร้างขึ้น
 *
 * ทำไมต้องมี (2026-10-07): ก่อนหน้านี้เทสต์ E2E สมัครผู้ใช้ใหม่ทุกครั้งแล้วไม่ลบ
 * ⇒ ฐานข้อมูลจริงมีบัญชีทดสอบ `e2e_*` ค้างถึง 46 บัญชี (ตั้งแต่ 2026-09-21) ซึ่งไปโผล่ใน
 * ตารางจัดอันดับ/สถิติผู้เล่นจริง → teardown นี้ลบเฉพาะบัญชีที่เพิ่งสร้างในรอบนี้
 * (ใช้เวลาที่ global-setup บันทึกไว้เป็นเส้นแบ่ง) ⇒ ไม่แตะบัญชีเดิมของผู้ใช้
 *
 * ⚠️ ไม่ลบบัญชีที่ไม่ตรงรูปแบบ `e2e_%` และไม่ลบบัญชีที่สร้างก่อนรอบนี้
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { RUN_START_FILE } from './helpers';

export default async function globalTeardown() {
  let startedAt: Date;
  try {
    startedAt = new Date(JSON.parse(fs.readFileSync(RUN_START_FILE, 'utf8')).startedAt);
    if (Number.isNaN(startedAt.getTime())) throw new Error('startedAt ไม่ถูกต้อง');
  } catch {
    // ไม่มี marker → ไม่ลบอะไรเลย (ปลอดภัยไว้ก่อน)
    // eslint-disable-next-line no-console
    console.log('[global-teardown] ไม่พบ marker ของรอบนี้ — ข้ามการลบผู้ใช้ทดสอบ');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const stale = await prisma.user.findMany({
      where: {
        username: { startsWith: 'e2e_' },
        createdAt: { gte: new Date(startedAt.getTime() - 60_000) },
      },
      select: { id: true, username: true },
    });
    if (stale.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[global-teardown] ไม่มีผู้ใช้ทดสอบของรอบนี้ให้ลบ');
      return;
    }

    // ตารางที่ FK เป็น RESTRICT (ไม่ cascade) ต้องลบลูกก่อน — ไม่งั้นลบผู้ใช้ไม่ผ่าน
    // (เทสต์สายต่อสู้/อารีน่าสร้าง battle_logs + arena_rooms ผูกกับผู้ใช้ทดสอบ)
    const ids = stale.map((u) => u.id);
    const battles = await prisma.battleLog.deleteMany({
      where: { OR: [{ attackerId: { in: ids } }, { defenderId: { in: ids } }] },
    });
    const rooms = await prisma.arenaRoom.deleteMany({ where: { hostId: { in: ids } } });

    const { count } = await prisma.user.deleteMany({ where: { id: { in: ids } } });
    // eslint-disable-next-line no-console
    console.log(
      `[global-teardown] ลบผู้ใช้ทดสอบของรอบนี้ ${count} บัญชี ` +
        `(ประวัติต่อสู้ ${battles.count} แถว · ห้องอารีน่า ${rooms.count} ห้อง) — ${stale.map((u) => u.username).join(', ')}`
    );
  } finally {
    await prisma.$disconnect();
  }
}
