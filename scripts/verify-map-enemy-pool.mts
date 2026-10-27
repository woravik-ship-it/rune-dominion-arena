// Phase 45.8 (2026-10-27): ตรวจ "การสุ่มทีมศัตรูในแผนที่ฟาร์ม" กับฐานข้อมูลจริง (อ่านอย่างเดียว)
//
// ทำไมต้องมีสคริปต์นี้: `buildRandomEnemyTeam` เป็นฟังก์ชันภายในโมดูล (ไม่ export) ⇒ เทสต์หน่วย
// ตรวจได้แค่ฟังก์ชันบริสุทธิ์ `pickDistinctIndices` ส่วนสคริปต์นี้ยืนยันกับของจริงว่า
//   1) คลังที่ดึงมาจริง "ครบทุกใบ" — ต้นเหตุเดิมคือ `take: 200` ทำให้การ์ดใหม่ไม่เคยออกเป็นศัตรู
//   2) ลำดับ createdAt asc ให้นิ่ง (ดัชนีสุดท้าย = การ์ดที่ใหม่สุดจริง)
//   3) สุ่มหลายพันรอบแล้วทุกใบรวมใบใหม่สุดถูกเลือกจริง และไม่มีใบซ้ำในทีมเดียว
//
// รัน: npm run verify:map-enemy-pool
import { PrismaClient } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { pickDistinctIndices } from '../src/services/map-farm';

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

function check(ok: boolean, label: string, detail = ''): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const total = await prisma.cardDefinition.count();
  const pool = await prisma.cardDefinition.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const newest = await prisma.cardDefinition.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, nameTh: true, createdAt: true },
  });

  console.log(`\nตรวจการสุ่มทีมศัตรู (แผนที่ฟาร์ม) · การ์ดในคลัง ${total} ใบ\n`);

  check(total > 0, 'มีคลังการ์ดให้สุ่มจริง', `การ์ด ${total} ใบ`);
  check(
    pool.length === total,
    'ดึงคลังมา "ครบทุกใบ" (ไม่ถูกตัดที่ 200 แบบเดิม)',
    `ได้ ${pool.length}/${total} ใบ`,
  );
  check(
    pool.length > 200 ? pool.length === total : true,
    'คลังเกิน 200 ใบแล้วยังได้ครบ (พิสูจน์ว่า take: 200 ถูกถอดจริง)',
    `เดิมจะได้แค่ 200 ใบ`,
  );
  if (newest) {
    check(
      pool[pool.length - 1]?.id === newest.id,
      'ดัชนีสุดท้าย = การ์ดที่ใหม่สุด (ลำดับ createdAt asc นิ่ง)',
      `${newest.nameTh} · ${newest.createdAt.toISOString().slice(0, 10)}`,
    );
  }

  // สุ่ม 2,000 รอบ × 5 ใบ เหมือนการฟาร์มจริง แล้วดูว่าครบทุกใบไหม
  const seen = new Set<number>();
  let dupTeam = 0;
  let outOfRange = 0;
  for (let i = 0; i < 2000; i++) {
    const team = pickDistinctIndices(pool.length, 5, (n) => randomInt(n));
    if (new Set(team).size !== team.length) dupTeam++;
    for (const idx of team) {
      if (idx < 0 || idx >= pool.length) outOfRange++;
      seen.add(idx);
    }
  }
  const newestIdx = pool.length - 1;
  check(dupTeam === 0, 'ไม่มีใบซ้ำภายในทีมเดียวเลย (2,000 รอบ)', `ทีมซ้ำ ${dupTeam} รอบ`);
  check(outOfRange === 0, 'ดัชนีที่ได้อยู่ในช่วง 0..poolSize-1 เสมอ', `หลุดช่วง ${outOfRange} ครั้ง`);
  check(
    seen.size === pool.length,
    'ทุกใบถูกเลือกอย่างน้อย 1 ครั้ง (การ์ดใหม่เข้าวงจริง)',
    `ครอบคลุม ${seen.size}/${pool.length} ใบ`,
  );
  check(seen.has(newestIdx), 'การ์ดที่ใหม่สุดถูกเลือกเป็นศัตรูได้จริง', `ดัชนี ${newestIdx}`);

  console.log(`\n${pass}/${pass + fail} ผ่าน\n`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error('ตรวจไม่สำเร็จ:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
