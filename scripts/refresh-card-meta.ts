/**
 * รีเฟรชชื่อ/คำอธิบาย/lore ของการ์ดเดิมให้ตรงกับตัวสร้างชื่อรุ่นใหม่ (ธีม Aetherra)
 *
 * ใช้เมื่อปรับคลังคำใน `src/services/seed.ts` แล้วอยากให้การ์ดที่มีอยู่ในฐานข้อมูล
 * ได้ชื่อใหม่ที่หลากหลายขึ้น — **ไม่แตะค่า gameplay** (element/rarity/role/stats/skills ถูก
 * ตรวจเทียบก่อนเขียน ถ้าไม่ตรงจะข้ามและรายงาน เพราะนั่นแปลว่า hash กับข้อมูลไม่สัมพันธ์กัน)
 *
 * วิธีใช้:  npm run db:refresh-meta            # อัปเดตจริง
 *           npm run db:refresh-meta -- --dry   # ดูตัวอย่าง ไม่เขียน DB
 */
import { PrismaClient } from '@prisma/client';
import { createCardFromSeed } from '../src/services/seed';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry');

async function main(): Promise<void> {
  console.log(DRY_RUN ? '🔍 โหมด --dry (ไม่เขียนฐานข้อมูล)' : '✍️  อัปเดตชื่อ/คำอธิบายการ์ดทั้งหมด');

  const cards = await prisma.cardDefinition.findMany({
    select: {
      id: true, canonicalSeedHash: true, name: true, nameTh: true,
      element: true, rarity: true, role: true,
      atk: true, def: true, hp: true, spd: true, manaCost: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  let skipped = 0;
  const sample: string[] = [];
  const names = new Set<string>();

  for (const card of cards) {
    const fresh = createCardFromSeed(card.canonicalSeedHash);

    // ความปลอดภัย: ต้องไม่เปลี่ยนค่า gameplay ของการ์ดเดิม
    const sameGameplay =
      fresh.element === card.element &&
      fresh.rarity === card.rarity &&
      fresh.role === card.role &&
      fresh.atk === card.atk &&
      fresh.def === card.def &&
      fresh.hp === card.hp &&
      fresh.spd === card.spd &&
      fresh.manaCost === card.manaCost;

    if (!sameGameplay) {
      skipped += 1;
      console.warn(`   ⚠️  ข้าม ${card.id} — ค่าที่คำนวณใหม่ไม่ตรงกับข้อมูลเดิม (hash ไม่สัมพันธ์กับการ์ด)`);
      continue;
    }

    names.add(fresh.nameTh);

    if (fresh.nameTh === card.nameTh && fresh.name === card.name) {
      continue;
    }

    if (!DRY_RUN) {
      await prisma.cardDefinition.update({
        where: { id: card.id },
        data: {
          name: fresh.name,
          nameTh: fresh.nameTh,
          description: fresh.description,
          descriptionTh: fresh.descriptionTh,
          lore: fresh.lore,
          loreTh: fresh.loreTh,
          skill1Name: fresh.skills[0]?.name,
          skill1Desc: fresh.skills[0]?.description,
          skill1ManaCost: fresh.skills[0]?.manaCost,
          skill2Name: fresh.skills[1]?.name,
          skill2Desc: fresh.skills[1]?.description,
          skill2ManaCost: fresh.skills[1]?.manaCost,
        },
      });
    }

    updated += 1;
    if (sample.length < 8) sample.push(`${card.nameTh}  →  ${fresh.nameTh}`);
  }

  console.log('='.repeat(60));
  console.log(`การ์ดทั้งหมด      : ${cards.length}`);
  console.log(`ชื่อไม่ซ้ำ (ใหม่)  : ${names.size}`);
  console.log(DRY_RUN ? `จะอัปเดต          : ${updated}` : `อัปเดตแล้ว         : ${updated}`);
  console.log(`ข้าม (ค่าไม่ตรง)   : ${skipped}`);
  if (sample.length) {
    console.log('\nตัวอย่าง:');
    for (const line of sample) console.log(`   ${line}`);
  }
}

main()
  .catch((error) => {
    console.error('อัปเดตไม่สำเร็จ:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
