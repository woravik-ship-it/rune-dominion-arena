/**
 * นับจำนวนการ์ดที่ "ยังไม่มีไฟล์ภาพ AI" (ใช้โดย scripts/run-image-generation.sh เพื่อเช็คว่าครบหรือยัง)
 * พิมพ์ตัวเลขจำนวนเดียวออกทาง stdout
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { hasCardArt } from '../src/lib/card-art-store';

for (const rawLine of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const prisma = new PrismaClient();

try {
  const cards = await prisma.cardDefinition.findMany({ select: { id: true } });
  let missing = 0;
  for (const card of cards) {
    if (!(await hasCardArt(card.id))) missing += 1;
  }
  console.log(missing);
} catch (error) {
  console.error('นับการ์ดที่ยังไม่มีภาพไม่สำเร็จ:', error);
  console.log('?');
} finally {
  await prisma.$disconnect();
}
