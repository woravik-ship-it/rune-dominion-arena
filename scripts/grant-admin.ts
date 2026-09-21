/**
 * ตั้ง/ถอดสิทธิ์ผู้ดูแลระบบ (User.role) — Phase 13
 *
 * ระบบแอดมินของเกมยึด `users.role` (PLAYER | MODERATOR | ADMIN) เป็นหลัก
 * (ไม่มีการสมัครเป็นแอดมินเอง — ต้องตั้งจากฝั่ง server เท่านั้น)
 *
 * วิธีใช้:
 *   npm run admin:grant -- --list                 # ดูว่าใครเป็นอะไรอยู่
 *   npm run admin:grant -- woravik                # ตั้งเป็น ADMIN
 *   npm run admin:grant -- woravik MODERATOR      # ตั้งเป็น MODERATOR
 *   npm run admin:grant -- woravik PLAYER         # ถอดสิทธิ์กลับเป็นผู้เล่น
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const VALID_ROLES = ['PLAYER', 'MODERATOR', 'ADMIN'] as const;
type Role = (typeof VALID_ROLES)[number];

async function listUsers(): Promise<void> {
  const users = await prisma.user.findMany({
    select: { username: true, email: true, role: true, createdAt: true },
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
  });

  console.log('บทบาทปัจจุบันของผู้ใช้ทั้งหมด');
  console.log('='.repeat(64));
  for (const user of users) {
    const marker = user.role === 'PLAYER' ? '   ' : ' ★ ';
    console.log(`${marker}${user.role.padEnd(9)} ${user.username.padEnd(18)} ${user.email}`);
  }
  const admins = users.filter((u) => u.role === 'ADMIN').length;
  const mods = users.filter((u) => u.role === 'MODERATOR').length;
  console.log('='.repeat(64));
  console.log(`ADMIN: ${admins} · MODERATOR: ${mods} · ทั้งหมด: ${users.length}`);
  if (admins === 0 && mods === 0) {
    console.log('⚠️  ยังไม่มีผู้ดูแลระบบ — ตั้งด้วย: npm run admin:grant -- <username>');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (process.argv.includes('--list') || args.length === 0) {
    await listUsers();
    return;
  }

  const [identifier, roleArg] = args;
  const role = (roleArg ?? 'ADMIN').toUpperCase() as Role;

  if (!VALID_ROLES.includes(role)) {
    throw new Error(`role ต้องเป็นหนึ่งใน ${VALID_ROLES.join(' | ')} (ได้รับ: ${roleArg})`);
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: identifier }, { email: identifier }] },
    select: { id: true, username: true, email: true, role: true },
  });

  if (!user) {
    throw new Error(`ไม่พบผู้ใช้ "${identifier}" (ใช้ username หรือ email ก็ได้)`);
  }

  if (user.role === role) {
    console.log(`ℹ️  ${user.username} เป็น ${role} อยู่แล้ว — ไม่มีอะไรเปลี่ยน`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });

  console.log(`✅ อัปเดตสิทธิ์: ${user.username} (${user.email}) ${user.role} → ${role}`);
  if (role === 'PLAYER') {
    console.log('   หมายเหตุ: session ที่ล็อกอินค้างอยู่จะยังถือ role เดิมจนหมดอายุ/ล็อกอินใหม่');
  } else {
    console.log('   เข้าแผงแอดมินได้ที่ /admin (session ที่ล็อกอินอยู่ต้องล็อกอินใหม่เพื่อให้ role ใหม่มีผล)');
  }
}

main()
  .catch((error) => {
    console.error('ตั้งสิทธิ์ไม่สำเร็จ:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
