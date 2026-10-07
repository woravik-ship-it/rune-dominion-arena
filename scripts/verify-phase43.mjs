#!/usr/bin/env node
/**
 * verify-phase43.mjs — ตรวจของจริง (production http://localhost:3000 + DB จริง)
 *
 * ผู้ใช้สั่ง 2026-10-04: "Workshop แยกเมนู Craft กับ Upgrade · ในกระเป๋าก็แยก Item ·
 *   การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
 *
 * สิ่งที่ตรวจ:
 *   1) GET /api/items → แคตตาล็อกมี `stacks` (แยกกองตามระดับบวก)
 *   2) มีของ 1 ชิ้น (+2) แล้ว **ตีบวกได้** (เดิมบังคับ ≥2 ชิ้น) — และจำนวนรวมไม่หาย
 *   3) กอง +0 ×3 ตีบวก 1 ครั้ง → ยอดรวมเท่าเดิม · ในกองที่เหลือไม่ถูกบวกทั้งกอง
 *   4) GET /api/inventory → `workshopItems` แยกเป็นหลายแถวตามระดับ (+0 กับ +2 คนละแถว)
 *   5) ใส่ชิ้น +N ลงการ์ด → /api/cards/<id>/equipment ตอบ enhanceLevel=N + สถานะคูณตามระดับ
 *   6) ขายเฉพาะกองที่เลือกระดับ → กองอื่นไม่หาย
 *
 * วิธีใช้: node scripts/verify-phase43.mjs            (ลบผู้เล่นทดสอบเมื่อจบ)
 *          node scripts/verify-phase43.mjs --keep
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ใช้ค่าจาก environment
}

const BASE = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3000').replace(/\/$/, '');
const KEEP = process.argv.includes('--keep');
const prisma = new PrismaClient();

const results = [];
let cookie = '';
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json, setCookie: res.headers.get('set-cookie') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const suffix = Date.now().toString().slice(-7);

async function main() {
  // ---- 1) สมัครผู้เล่นทดสอบ ----
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: `p43_${suffix}`,
      email: `p43_${suffix}@example.com`,
      password: 'Test12345!',
      displayName: 'Phase43 Tester',
    }),
  });
  if (!reg.ok) throw new Error(`สมัครไม่สำเร็จ: ${reg.status} ${JSON.stringify(reg.json)}`);
  cookie = (reg.setCookie ?? '').split(';')[0];
  const userId = reg.json.data.user.id;
  check('สมัครผู้เล่นทดสอบ + ได้ session', Boolean(cookie && userId), `userId=${userId}`);

  // ---- เตรียมของ/เงินสำหรับทดสอบ (จำลองของที่ฟาร์มมา) ----
  const item = await prisma.itemDefinition.findUnique({ where: { code: 'ATK_WHETSTONE' } });
  if (!item) throw new Error('ไม่พบ Item ATK_WHETSTONE — เรียก GET /api/items ก่อน');
  await prisma.user.update({ where: { id: userId }, data: { veilShards: 5000 } });
  await prisma.wallet.update({ where: { userId }, data: { balance: 500000 } });
  await prisma.userInventoryItem.createMany({
    data: [
      { userId, itemType: 'CRAFTING_DUST', code: 'CRAFTING_DUST', nameTh: 'ฝุ่นเวท', quantity: 5000, source: 'PHASE43_VERIFY' },
      { userId, itemType: 'ENHANCE_JEWEL', code: 'JEWELRY', nameTh: 'Jewelry', quantity: 100, source: 'PHASE43_VERIFY' },
    ],
  });
  // กอง +0 ×3 และ +2 ×1 (ทดสอบว่า "ของ 1 ชิ้นตีบวกได้" + "แยกกอง")
  await prisma.userItem.createMany({
    data: [
      { userId, itemId: item.id, quantity: 3, enhanceLevel: 0 },
      { userId, itemId: item.id, quantity: 1, enhanceLevel: 2 },
    ],
  });

  const stacksOf = async () =>
    (
      await prisma.userItem.findMany({
        where: { userId, itemId: item.id },
        select: { enhanceLevel: true, quantity: true },
        orderBy: { enhanceLevel: 'asc' },
      })
    ).map((r) => ({ level: r.enhanceLevel, qty: r.quantity }));
  const totalQty = async () =>
    (await prisma.userItem.aggregate({ where: { userId, itemId: item.id }, _sum: { quantity: true } }))._sum.quantity ?? 0;

  const before = await stacksOf();
  // ---- 2) GET /api/items → มี stacks ----
  check(
    'เตรียมของ 2 กอง (+0 ×3 · +2 ×1)',
    JSON.stringify(before) === JSON.stringify([{ level: 0, qty: 3 }, { level: 2, qty: 1 }]),
    JSON.stringify(before)
  );
  const catalog = await api('/api/items');
  const row = (catalog.json?.data?.rows ?? []).find((r) => r.code === 'ATK_WHETSTONE');
  check(
    'GET /api/items ส่ง stacks แยกกองตามระดับ',
    Array.isArray(row?.stacks) && row.stacks.length === 2 && row.owned === 4,
    `stacks=${JSON.stringify((row?.stacks ?? []).map((s) => `+${s.enhanceLevel}x${s.quantity}`))} owned=${row?.owned}`
  );

  // ---- 3) ตีบวก "ของกองละ 1 ชิ้น" (+2) ได้ (เดิมบังคับ ≥2 ชิ้น) ----
  let singleResult = null;
  for (let i = 0; i < 6 && !singleResult; i++) {
    const res = await api('/api/items/enhance', {
      method: 'POST',
      body: JSON.stringify({ itemCode: 'ATK_WHETSTONE', enhanceLevel: 2 }),
    });
    if (!res.ok) {
      check('ตีบวกกอง +2 (มีชิ้นเดียว) ผ่าน API', false, `${res.status} ${JSON.stringify(res.json)}`);
      break;
    }
    singleResult = res.json.data;
    await sleep(300);
  }
  check(
    'ตีบวกกองที่มีชิ้นเดียวได้ (ไม่บังคับ ≥2 ชิ้นแล้ว)',
    Boolean(singleResult) && singleResult.quantity === 0 && singleResult.resultQuantity >= 1,
    singleResult
      ? `+2→+${singleResult.newLevel} · สำเร็จ=${singleResult.success} · กองเดิมเหลือ ${singleResult.quantity} · กองใหม่ ${singleResult.resultQuantity}`
      : 'ไม่มีผล'
  );

  // ---- 4) กอง +0 ×3 ตีบวก 1 ครั้ง → กองอื่นไม่ถูกบวกทั้งกอง + ยอดรวมคงที่ ----
  const totalBefore = await totalQty();
  const stacksBefore = await stacksOf();
  let threeResult = null;
  for (let i = 0; i < 6 && !threeResult; i++) {
    const res = await api('/api/items/enhance', {
      method: 'POST',
      body: JSON.stringify({ itemCode: 'ATK_WHETSTONE', enhanceLevel: 0 }),
    });
    if (!res.ok) {
      check('ตีบวกกอง +0 ผ่าน API', false, `${res.status} ${JSON.stringify(res.json)}`);
      break;
    }
    if (res.json.data.success) threeResult = res.json.data;
    await sleep(300);
  }
  const totalAfter = await totalQty();
  check('ยอดรวมของทั้งชนิดไม่หาย/ไม่เพิ่ม (ชิ้นย้ายกองเท่านั้น)', totalBefore === totalAfter, `${totalBefore} → ${totalAfter}`);

  const stacksAfter = await stacksOf();
  const level0Before = stacksBefore.find((s) => s.level === 0)?.qty ?? 0;
  const level0After = stacksAfter.find((s) => s.level === 0)?.qty ?? 0;
  const level1After = stacksAfter.find((s) => s.level === 1)?.qty ?? 0;
  check(
    'สำเร็จแล้วกอง +0 ลด 1 และเกิดกองใหม่ (ไม่ใช่ทั้งกอง)',
    Boolean(threeResult) && level0After === level0Before - 1 && level1After >= 1,
    `+0: ${level0Before}→${level0After} · +1 ×${level1After} · กองทั้งหมด=${JSON.stringify(stacksAfter)}`
  );

  // ---- 5) GET /api/inventory → กระเป๋าแยก Item เป็นกอง ----
  const bag = await api('/api/inventory');
  const bagStacks = (bag.json?.workshopItems ?? []).filter((r) => r.code === 'ATK_WHETSTONE');
  check(
    'กระเป๋าแยก Item เป็นกองตามระดับ (หลายแถว + บอกระดับ/จำนวนของกอง)',
    bagStacks.length >= 2 &&
      bagStacks.every((r) => typeof r.enhanceLevel === 'number' && typeof r.owned === 'number') &&
      new Set(bagStacks.map((r) => r.enhanceLevel)).size === bagStacks.length,
    bagStacks.map((r) => `+${r.enhanceLevel}×${r.owned}`).join(' · ')
  );

  // ---- 6) ใส่ชิ้น +N ลงการ์ด → ใช้ระดับของ "ชิ้นนั้น" ----
  const card = await prisma.userCard.findFirst({ where: { userId }, select: { cardId: true } });
  const targetLevel = stacksAfter.find((s) => s.level > 0)?.level ?? 0;
  const equip = await api(`/api/cards/${card.cardId}/equipment`, {
    method: 'POST',
    body: JSON.stringify({ slot: 'ATTACK', itemCode: 'ATK_WHETSTONE', enhanceLevel: targetLevel }),
  });
  const eq = await api(`/api/cards/${card.cardId}/equipment`);
  const equippedView = (eq.json?.data?.equipped ?? []).find((r) => r.slot === 'ATTACK');
  const expectedAtk = Math.round(item.atk * (1 + 0.08 * targetLevel));
  check(
    'ใส่ Item ระดับที่เลือกแล้วใช้สถานะของชิ้นนั้น',
    equip.ok && equippedView?.enhanceLevel === targetLevel && equippedView?.stats?.atk === expectedAtk,
    `ต้องการ +${targetLevel} (ATK ${expectedAtk}) · ได้ +${equippedView?.enhanceLevel} (ATK ${equippedView?.stats?.atk})`
  );

  // ---- 7) ขายเฉพาะกองที่เลือก ----
  const qtyLevel0Before = (await stacksOf()).find((s) => s.level === 0)?.qty ?? 0;
  const sell = await api('/api/items/sell', {
    method: 'POST',
    body: JSON.stringify({ code: 'ATK_WHETSTONE', quantity: 1, enhanceLevel: 0 }),
  });
  const qtyLevel0After = (await stacksOf()).find((s) => s.level === 0)?.qty ?? 0;
  const higherStack = (await stacksOf()).find((s) => s.level === targetLevel);
  check(
    'ขายจากกองที่เลือกระดับ — กองอื่นไม่หาย',
    sell.ok && qtyLevel0After === qtyLevel0Before - 1 && (higherStack?.qty ?? 0) >= 1,
    `+0: ${qtyLevel0Before}→${qtyLevel0After} · +${targetLevel} ยังมี ${higherStack?.qty ?? 0} ชิ้น`
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? '🎉' : '⚠️'} ผ่าน ${results.length - failed}/${results.length} ข้อ`);

  if (!KEEP) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log('🧹 ลบผู้เล่นทดสอบแล้ว (ใช้ --keep เพื่อเก็บไว้)');
  } else {
    console.log(`ℹ️ เก็บผู้เล่นทดสอบไว้: p43_${suffix}`);
  }
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error('❌ ตรวจไม่สำเร็จ:', error);
  await prisma.$disconnect();
  process.exit(1);
});
