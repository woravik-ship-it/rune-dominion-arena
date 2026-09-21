/**
 * สร้างภาพการ์ดด้วย AI (ค่าเริ่มต้น: pollinations/Flux ใช้ฟรี ไม่ต้องมี key)
 * แล้วเก็บไฟล์ไว้ในเครื่อง + อัปเดต imageUrl ของการ์ด
 *
 * วิธีใช้:
 *   npm run images:generate                 # เฉพาะการ์ดที่ยังไม่มีภาพ AI
 *   npm run images:generate -- --all        # สร้างใหม่ทุกใบ (ทับของเดิม)
 *   npm run images:generate -- --limit 5    # จำกัดจำนวน (ทดลอง)
 *   npm run images:generate -- --ids a,b,c  # ระบุการ์ด
 *   npm run images:generate -- --delay 3000 # หน่วงระหว่างคำขอ (ms, ค่าเริ่มต้น 1500)
 *   npm run images:generate -- --dry        # ดูว่าจะทำใบไหน ไม่เรียก API
 *
 * หมายเหตุ: ทำแบบเรียงคำขอทีละใบ (ผู้ให้บริการฟรีจำกัด 1 งานพร้อมกัน/IP)
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { generateCardImageBytes, aiImageEnabled, buildCardImagePrompt } from '../src/lib/ai-image';
import { cardArtUrl, hasCardArt, saveCardArt } from '../src/lib/card-art-store';

// โหลด .env (ให้ AI_* / DATABASE_URL พร้อมใช้เมื่อรันผ่านสคริปต์)
for (const rawLine of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const prisma = new PrismaClient();

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const ALL = flag('--all');
const DRY = flag('--dry');
const LIMIT = Number(value('--limit') ?? 0);
const IDS = (value('--ids') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const DELAY_MS = Number(value('--delay') ?? 1500);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  if (!aiImageEnabled()) {
    console.warn('⚠️  AI ปิดอยู่ (AI_IMAGE_DISABLED=1 หรือ provider ไม่พร้อม) — จะใช้การ์ดวาดเองแทน');
    return;
  }

  const cards = await prisma.cardDefinition.findMany({
    // โหลดทั้งหมดแล้วให้ตัวตรวจไฟล์จริง (hasCardArt) เป็นตัวตัดสินว่าจะข้ามใบไหน
    // (ค่า imageUrl เป็นได้ทั้ง placeholder /api/cards/<id>/image และภาพ AI /api/cards/<id>/art)
    where: IDS.length ? { id: { in: IDS } } : {},
    select: {
      id: true, name: true, nameTh: true, element: true, rarity: true,
      role: true, loreTh: true, canonicalSeedHash: true, imageUrl: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const ownedRows = await prisma.userCard.groupBy({ by: ['cardId'], _count: { cardId: true } });
  const ownedCount = new Map(ownedRows.map((row) => [row.cardId, row._count.cardId]));

  // ให้ความสำคัญกับการ์ดที่ "ผู้เล่นถืออยู่จริง" ก่อน → คนเล่นเห็นภาพจริงเร็วที่สุด
  const targets = (LIMIT > 0 ? cards.slice(0, LIMIT) : cards).sort(
    (a, b) => (ownedCount.get(b.id) ?? 0) - (ownedCount.get(a.id) ?? 0)
  );
  const ownedTargets = targets.filter((card) => (ownedCount.get(card.id) ?? 0) > 0).length;

  console.log(`🎨 สร้างภาพ AI ให้การ์ด ${targets.length} ใบ (จากทั้งหมด ${cards.length}) — ในคลังผู้เล่น ${ownedTargets} ใบ`);
  console.log(`   provider: ${process.env.AI_IMAGE_PROVIDER ?? 'pollinations'} · model: ${process.env.AI_IMAGE_MODEL ?? 'sana'}`);
  if (DRY) {
    for (const card of targets.slice(0, 10)) {
      console.log(`   - ${card.nameTh ?? card.name} (${card.rarity}/${card.element})`);
    }
    console.log('   ... (โหมด --dry ไม่เรียก API)');
    return;
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;

  // ผู้ให้บริการแบบ API คิดเงิน (เช่น OpenAI) ยิงขนานได้ → เร็วขึ้นมาก
  // ส่วน pollinations ฟรีกักคิว 1 งาน/IP → ต้องยิงทีละใบ
  const batchFriendly =
    (process.env.AI_IMAGE_PROVIDER ?? '').toLowerCase() === 'generic' ||
    /openai\.com/.test(process.env.AI_IMAGE_API_URL ?? '');
  const CONCURRENCY = Math.max(1, Number(value('--concurrency') ?? (batchFriendly ? 4 : 1)));
  console.log(`   concurrency: ${CONCURRENCY} · delay: ${DELAY_MS}ms`);

  const queue = [...targets];

  const processOne = async (card: (typeof targets)[number]): Promise<void> => {
    // ข้ามใบที่มีไฟล์ภาพจริงอยู่แล้ว (ยกเว้น --all / --ids ที่สั่งชัดเจน)
    if (!ALL && !IDS.length && (await hasCardArt(card.id))) {
      skipped += 1;
      return;
    }

    const label = `${card.nameTh ?? card.name} (${card.rarity} · ${card.element})`;
    const started = Date.now();
    try {
      // บอกสถานะ "กำลังสร้าง" ก่อน → UI จะแสดงสถานะรอ ไม่โชว์การ์ดวาดเอง/ภาพเก่า
      await prisma.cardDefinition.update({
        where: { id: card.id },
        data: { imageStatus: 'PROCESSING' },
      });

      const generated = await generateCardImageBytes({
        name: card.name,
        nameTh: card.nameTh,
        element: card.element,
        rarity: card.rarity,
        role: card.role,
        loreTh: card.loreTh,
        canonicalSeedHash: card.canonicalSeedHash,
      });
      const url = await saveCardArt(card.id, generated.bytes, generated.contentType);

      await prisma.cardDefinition.update({
        where: { id: card.id },
        data: { imageUrl: url, imageStatus: 'READY' },
      });

      done += 1;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`   ✅ [${done + skipped + failed}/${targets.length}] ${label} → ${Math.round(generated.bytes.length / 1024)}KB ใน ${seconds}s`);
    } catch (error) {
      failed += 1;
      console.error(`   ❌ ${label}: ${error instanceof Error ? error.message : error}`);
      // ให้ UI บอกว่า "สร้างไม่สำเร็จ" (ไม่กลับไปโชว์การ์ดวาดเอง)
      await prisma.cardDefinition
        .update({ where: { id: card.id }, data: { imageStatus: 'FAILED' } })
        .catch(() => undefined);
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const card = queue.shift();
        if (!card) break;
        await processOne(card);
      }
    })
  );

  const remaining = await prisma.cardDefinition.count();
  const withArt = await prisma.cardDefinition.count({ where: { imageUrl: { startsWith: '/api/cards/' } } });

  console.log('='.repeat(60));
  console.log(`สร้างสำเร็จ : ${done}`);
  console.log(`ข้าม (มีแล้ว): ${skipped}`);
  console.log(`ล้มเหลว    : ${failed}`);
  console.log(`การ์ดทั้งหมด: ${remaining} · มีภาพ AI แล้ว: ${withArt}`);
  if (done > 0) console.log(`ตัวอย่าง URL: ${cardArtUrl('CARD_ID')}`);
}

main()
  .catch((error) => {
    console.error('สร้างภาพไม่สำเร็จ:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
