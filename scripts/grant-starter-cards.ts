/**
 * ให้การ์ดเริ่มต้นแก่ผู้เล่นที่มีการ์ดในคลังน้อยกว่า 5 ใบ
 * (ใช้กับบัญชีที่สมัครไว้ก่อน Phase 13 — ผู้เล่นใหม่ได้การ์ดเริ่มต้นตอนสมัครอยู่แล้ว)
 *
 * วิธีใช้:  npm run db:grant-starter           # เติมให้ทุกคนที่ยังไม่ครบ 5 ใบ
 *           npm run db:grant-starter -- --dry  # ดูรายชื่อก่อน ไม่เขียน DB
 */
import { PrismaClient } from '@prisma/client';
import { StarterService } from '../src/services/starter';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry');
const MIN_CARDS = 5;

async function main(): Promise<void> {
  console.log(DRY_RUN ? '🔍 โหมด --dry (ไม่เขียนฐานข้อมูล)' : '🎁 เติมการ์ดเริ่มต้นให้ผู้เล่นที่ยังไม่ครบ 5 ใบ');

  const users = await prisma.user.findMany({
    select: { id: true, username: true },
    orderBy: { createdAt: 'asc' },
  });

  let grantedUsers = 0;
  let grantedCards = 0;

  for (const user of users) {
    const count = await prisma.userCard.count({ where: { userId: user.id } });
    if (count >= MIN_CARDS) continue;

    if (DRY_RUN) {
      console.log(`   ${user.username}: มี ${count} ใบ → เติมอีก ${MIN_CARDS - count} ใบ`);
      grantedUsers += 1;
      continue;
    }

    const needed = MIN_CARDS - count;
    const granted = await StarterService.grantStarterCards(user.id, needed);
    console.log(`   ${user.username}: มี ${count} ใบ → เพิ่ม ${granted.length} ใบ (${granted.map((c) => c.nameTh).join(', ')})`);
    grantedUsers += 1;
    grantedCards += granted.length;
  }

  console.log('='.repeat(60));
  console.log(`ผู้เล่นทั้งหมด      : ${users.length}`);
  console.log(`ผู้เล่นที่ต้องเติม  : ${grantedUsers}`);
  if (!DRY_RUN) console.log(`การ์ดที่มอบ         : ${grantedCards}`);
}

main()
  .catch((error) => {
    console.error('เติมการ์ดเริ่มต้นไม่สำเร็จ:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
