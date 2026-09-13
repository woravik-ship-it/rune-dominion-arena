import { PrismaClient } from '@prisma/client';
import { buildCanonicalString, hashSeed, createCardFromSeed } from '../src/services/seed';

const prisma = new PrismaClient();

// สร้างรูนแบบสุ่มสำหรับ Seed Script
function generateRandomRunes(): number[] {
  const count = Math.floor(Math.random() * 9) + 8; // 8-16 runes
  const runes: number[] = [];
  for (let i = 0; i < count; i++) {
    runes.push(Math.floor(Math.random() * 10000)); // 0-9999
  }
  return runes;
}

// ===== Phase 7: Quest Definitions =====
const QUEST_DEFS: Array<{
  code: string; name: string; nameTh: string; descriptionTh: string;
  type: 'DAILY' | 'WEEKLY' | 'ACHIEVEMENT' | 'EVENT';
  metric: 'DISCOVERY' | 'BATTLE' | 'BATTLE_WIN' | 'ARENA_WIN' | 'SPEND';
  targetValue: number; rewardAmount: number;
}> = [
  { code: 'DAILY_DISCOVERY_3', name: 'Daily Discovery', nameTh: 'ค้นหารูนประจำวัน', descriptionTh: 'ค้นพบการ์ด 3 ครั้งภายในวันนี้', type: 'DAILY', metric: 'DISCOVERY', targetValue: 3, rewardAmount: 30 },
  { code: 'DAILY_BATTLE_2', name: 'Daily Sparring', nameTh: 'ฝึกฝนประจำวัน', descriptionTh: 'ต่อสู้ 2 ครั้งภายในวันนี้', type: 'DAILY', metric: 'BATTLE', targetValue: 2, rewardAmount: 20 },
  { code: 'DAILY_WIN_1', name: 'Daily Victory', nameTh: 'ชนะประจำวัน', descriptionTh: 'ชนะการต่อสู้ 1 ครั้งภายในวันนี้', type: 'DAILY', metric: 'BATTLE_WIN', targetValue: 1, rewardAmount: 40 },
  { code: 'WEEKLY_DISCOVERY_15', name: 'Weekly Explorer', nameTh: 'นักสำรวจประจำสัปดาห์', descriptionTh: 'ค้นพบการ์ด 15 ครั้งภายในสัปดาห์นี้', type: 'WEEKLY', metric: 'DISCOVERY', targetValue: 15, rewardAmount: 120 },
  { code: 'WEEKLY_WIN_10', name: 'Weekly Champion', nameTh: 'นักสู้ประจำสัปดาห์', descriptionTh: 'ชนะการต่อสู้ 10 ครั้งภายในสัปดาห์นี้', type: 'WEEKLY', metric: 'BATTLE_WIN', targetValue: 10, rewardAmount: 200 },
  { code: 'WEEKLY_ARENA_1', name: 'Weekly Arena King', nameTh: 'ราชันอารีน่าประจำสัปดาห์', descriptionTh: 'คว้าแชมป์อารีน่า 1 ครั้งภายในสัปดาห์นี้', type: 'WEEKLY', metric: 'ARENA_WIN', targetValue: 1, rewardAmount: 250 },
  { code: 'ACHV_DISCOVERY_50', name: 'Rune Scholar', nameTh: 'นักปราชญ์แห่งรูน', descriptionTh: 'ค้นพบการ์ดรวมกัน 50 ครั้ง', type: 'ACHIEVEMENT', metric: 'DISCOVERY', targetValue: 50, rewardAmount: 500 },
  { code: 'ACHV_WIN_100', name: 'Unbroken Blade', nameTh: 'ดาบไร้เทียมทาน', descriptionTh: 'ชนะการต่อสู้รวมกัน 100 ครั้ง', type: 'ACHIEVEMENT', metric: 'BATTLE_WIN', targetValue: 100, rewardAmount: 1000 },
];

async function seedQuests(): Promise<void> {
  console.log('\n📜 Seeding quests...');
  for (const q of QUEST_DEFS) {
    await prisma.quest.upsert({
      where: { code: q.code },
      create: {
        code: q.code,
        name: q.name,
        nameTh: q.nameTh,
        descriptionTh: q.descriptionTh,
        type: q.type,
        metric: q.metric,
        targetValue: q.targetValue,
        rewardAmount: q.rewardAmount,
      },
      update: {
        nameTh: q.nameTh,
        descriptionTh: q.descriptionTh,
        metric: q.metric,
        targetValue: q.targetValue,
        rewardAmount: q.rewardAmount,
      },
    });
    console.log(`   ✅ ${q.code} (+${q.rewardAmount} coins)`);
  }
}


async function main() {
  console.log('🌱 Seeding database...');
  console.log('='.repeat(50));

  await seedQuests();

  // สร้างการ์ด 100 ใบ
  const cardCount = 100;
  let successCount = 0;
  let failCount = 0;
  const usedHashes = new Set<string>();

  for (let i = 0; i < cardCount; i++) {
    const runes = generateRandomRunes();
    const canonicalString = buildCanonicalString(runes);
    const seedHash = hashSeed(canonicalString);
    
    // ข้ามถ้าซ้ำกับที่มีแล้ว
    if (usedHashes.has(seedHash)) {
      console.log(`  ⚠️  Card #${i + 1}: Duplicate hash, skipped`);
      failCount++;
      continue;
    }

    const card = createCardFromSeed(seedHash);

    try {
      await prisma.cardDefinition.create({
        data: {
          canonicalSeedHash: seedHash,
          name: card.name,
          nameTh: card.nameTh,
          description: card.description,
          descriptionTh: card.descriptionTh,
          lore: card.lore,
          loreTh: card.loreTh,
          element: card.element,
          rarity: card.rarity,
          role: card.role,
          atk: card.atk,
          def: card.def,
          hp: card.hp,
          spd: card.spd,
          manaCost: card.manaCost,
          skill1Name: card.skills[0]?.name,
          skill1Desc: card.skills[0]?.description,
          skill1ManaCost: card.skills[0]?.manaCost,
          skill2Name: card.skills[1]?.name,
          skill2Desc: card.skills[1]?.description,
          skill2ManaCost: card.skills[1]?.manaCost,
          imageUrl: null,
          imageStatus: 'PENDING',
        },
      });
      usedHashes.add(seedHash);
      successCount++;
      
      // แสดงสถานะทุก 10 ใบ
      if ((i + 1) % 10 === 0) {
        console.log(`  ✅ Created ${i + 1}/${cardCount} cards`);
      }
    } catch (error) {
      console.error(`  ❌ Card #${i + 1} failed:`, error);
      failCount++;
    }
  }

  console.log('='.repeat(50));
  console.log('📊 Seed Summary:');
  console.log(`   ✅ Successfully created: ${successCount} cards`);
  console.log(`   ❌ Failed/Duplicates: ${failCount}`);
  console.log(`   📦 Total unique hashes: ${usedHashes.size}`);
  
  // นับตาม Rarity
  const rarityStats = await prisma.cardDefinition.groupBy({
    by: ['rarity'],
    _count: { rarity: true },
  });
  
  console.log('\n🎴 Cards by Rarity:');
  for (const stat of rarityStats.sort((a, b) => a.rarity.localeCompare(b.rarity))) {
    console.log(`   ${stat.rarity}: ${stat._count.rarity} cards`);
  }
  
  // นับตาม Element
  const elementStats = await prisma.cardDefinition.groupBy({
    by: ['element'],
    _count: { element: true },
  });
  
  console.log('\n🔥 Cards by Element:');
  for (const stat of elementStats.sort((a, b) => a.element.localeCompare(b.element))) {
    console.log(`   ${stat.element}: ${stat._count.element} cards`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
