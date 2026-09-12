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

async function main() {
  console.log('🌱 Seeding database...');
  console.log('='.repeat(50));

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
