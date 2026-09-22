/**
 * Image worker tick — ทำงานเป็นรอบ (เรียกจาก systemd timer ทุก 2 นาที หรือ cron)
 *
 * ทำ 2 อย่าง:
 *  1) ประมวลผล "งานในคิว" (ImageJob = PENDING) — รวมงานที่แอดมินกด "สร้างรูปใหม่"
 *     ซึ่งก่อนหน้านี้ไม่มีใครหยิบ → การ์ดค้างสถานะ PROCESSING หมุนไม่จบ
 *  2) การ์ดที่ยังไม่มีไฟล์ภาพเลย → เข้าคิว + สร้าง
 *
 * วิธีใช้:  npx tsx scripts/image-worker-tick.mts [--batch 8]
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { ImageService } from '../src/services/image';
import { aiImageEnabled } from '../src/lib/ai-image';
import { cardArtUrl, hasCardArt } from '../src/lib/card-art-store';

for (const rawLine of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const argv = process.argv.slice(2);
const batchIndex = argv.indexOf('--batch');
const BATCH = batchIndex >= 0 ? Math.max(1, Number(argv[batchIndex + 1]) || 8) : Number(process.env.WORKER_BATCH ?? 8);

const prisma = new PrismaClient();

try {
  const pending = await prisma.imageJob.count({ where: { status: 'PENDING' } });
  console.log(`⚙️  worker tick — งานในคิว ${pending} งาน · provider: ${aiImageEnabled() ? (process.env.AI_IMAGE_MODEL ?? 'ai') : 'placeholder'}`);

  // 0.5) ดึงงานที่ค้างสถานะ PROCESSING นานเกิน 5 นาที กลับเข้าคิว
  //      (เกิดเมื่อโปรเซสผู้สร้างถูก restart/ตายกลางทาง → งานถูกล็อกไว้ตลอดไป)
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const reclaimed = await prisma.imageJob.updateMany({
    where: { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
    data: { status: 'PENDING', errorMessage: 'ดึงกลับเข้าคิว (งานค้างสถานะ PROCESSING เกิน 5 นาที)' },
  });
  if (reclaimed.count > 0) {
    console.log(`   ดึงงานค้างกลับเข้าคิว: ${reclaimed.count} งาน`);
  }

  // 0) เก็บกวาด "สถานะค้าง" — การ์ดที่ขึ้น PROCESSING/PENDING แต่ไม่มีงานในคิวแล้ว
  //    (สาเหตุที่การ์ดหมุนค้าง: งานถูกยกเลิก/หายไป แต่สถานะยังไม่กลับเป็น READY)
  const stale = await prisma.cardDefinition.findMany({
    where: {
      imageStatus: { in: ['PROCESSING', 'PENDING'] },
      imageJobs: { none: { status: { in: ['PENDING', 'PROCESSING'] } } },
    },
    select: { id: true, imageUrl: true },
  });
  let reconciled = 0;
  for (const card of stale) {
    if (await hasCardArt(card.id)) {
      // มีไฟล์ภาพอยู่แล้ว → คืนสถานะเป็น READY + เติม version ให้ URL (กันแคชเก่า)
      const url = card.imageUrl && card.imageUrl.startsWith('/api/cards/') ? card.imageUrl : cardArtUrl(card.id);
      await prisma.cardDefinition.update({ where: { id: card.id }, data: { imageStatus: 'READY', imageUrl: url } });
      reconciled += 1;
    } else {
      // ไม่มีไฟล์จริง → เข้าคิวใหม่ (แล้วจะถูกประมวลผลในข้อ 1)
      await ImageService.enqueue(card.id);
    }
  }
  if (stale.length > 0) {
    console.log(`   เก็บกวาดสถานะค้าง: ${stale.length} ใบ → คืนเป็น READY ${reconciled} ใบ · เข้าคิวใหม่ ${stale.length - reconciled} ใบ`);
  }

  // 1) งานในคิว (รวมงาน regenerate ที่แอดมินสั่ง)
  const fromQueue = await ImageService.processBatch(BATCH);
  const completed = fromQueue.filter((r) => r.status === 'COMPLETED').length;
  const retrying = fromQueue.filter((r) => r.status === 'RETRY').length;
  const failed = fromQueue.filter((r) => r.status === 'FAILED').length;
  console.log(`   คิว: ทำ ${fromQueue.length} งาน → สำเร็จ ${completed} · รอ retry ${retrying} · ล้มเหลว ${failed}`);

  // 2) การ์ดที่ยังไม่มีภาพเลย → เข้าคิวแล้วสร้าง
  const queued = await ImageService.enqueueMissing(BATCH);
  if (queued > 0) {
    const fromCards = await ImageService.processBatch(Math.min(BATCH, queued));
    console.log(`   การ์ดที่ไม่มีภาพ: เข้าคิว ${queued} → สำเร็จ ${fromCards.filter((r) => r.status === 'COMPLETED').length}`);
  }

  const remaining = await prisma.imageJob.count({ where: { status: 'PENDING' } });
  const processing = await prisma.cardDefinition.count({ where: { imageStatus: 'PROCESSING' } });
  console.log(`   เหลือในคิว ${remaining} งาน · การ์ดสถานะ PROCESSING ${processing} ใบ`);
} catch (error) {
  console.error('worker tick ล้มเหลว:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
