// Backfill ภาพการ์ดที่ยังไม่มี — เข้าคิว + ประมวลผลจนหมด
// รัน: npm run db:seed-style → npx tsx prisma/backfill-images.ts
import { ImageService } from '../src/services/image';
import { prisma } from '../src/lib/prisma';

async function main() {
  let queuedTotal = 0;
  let completedTotal = 0;

  for (let round = 0; round < 20; round++) {
    const queued = await ImageService.enqueueMissing(50);
    queuedTotal += queued;
    if (queued === 0) break;
    const results = await ImageService.processBatch(50);
    completedTotal += results.filter((r) => r.status === 'COMPLETED').length;
    console.log(`round ${round + 1}: queued ${queued}, processed ${results.length}`);
  }

  const remaining = await prisma.cardDefinition.count({ where: { imageUrl: null } });
  console.log(`✅ queued=${queuedTotal}, completed=${completedTotal}, cards without image=${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
