#!/usr/bin/env node
/**
 * shoot-collection.mjs — ถ่ายภาพหน้า /cards (คอลเลคชั่นการ์ด) จากของจริงด้วย Playwright
 *
 * ใช้: node scripts/shoot-collection.mjs [--out=<dir>]
 * - สร้างผู้ใช้ทดสอบชั่วคราว (ได้การ์ดเริ่มต้น 5 ใบ) → ลบเมื่อจบ
 * - ถ่ายจอใหญ่ (1280×900) + จอมือถือ (390×740) และหน้าแท็บ "ยังไม่มี" (โชว์การ์ดล็อก 🔒)
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { chromium } from '@playwright/test';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT_DIR = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] ?? '/home/woravik/E2_Lab/reports';
const prisma = new PrismaClient();
const suffix = Date.now().toString().slice(-7);
const username = `shot_${suffix}`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@e2lab.test`, password: `Sh!${suffix}zz` }),
  });
  if (reg.status !== 201) throw new Error(`สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${reg.status}) — เซิร์ฟเวอร์ ${BASE} รันอยู่ไหม`);
  const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0];
  const userId = (await reg.json()).data.user.id;

  const browser = await chromium.launch();
  const shots = [];

  // จอใหญ่ — หน้าแรกของคอลเลคชั่น
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await desktop.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE }]);
  const p1 = await desktop.newPage();
  await p1.goto(`${BASE}/cards`, { waitUntil: 'networkidle' });
  await p1.locator('[data-collection-tab="owned"]').click();
  await p1.locator('[data-collection-card]').first().waitFor({ timeout: 20_000 });
  // รอให้ภาพการ์ดโหลดครบก่อนถ่าย (ไม่งั้นภาพจะยังเป็นกล่องดำ)
  await p1
    .waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('[data-collection-card] img'));
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0);
      },
      { timeout: 25_000 }
    )
    .catch(() => undefined);
  await p1.waitForTimeout(800);
  const file1 = `${OUT_DIR}/collection-desktop.png`;
  await p1.screenshot({ path: file1, fullPage: false });
  shots.push([file1, 'จอใหญ่ 1280×900 · แท็บ "ที่มีอยู่"']);

  // จอมือถือ — แท็บ "ยังไม่มี" (โชว์การ์ดที่ยังไม่ค้นพบ 🔒)
  const mobile = await browser.newContext({ viewport: { width: 390, height: 740 }, locale: 'th-TH', timezoneId: 'Asia/Bangkok' });
  await mobile.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE }]);
  const p2 = await mobile.newPage();
  await p2.goto(`${BASE}/cards`, { waitUntil: 'networkidle' });
  await p2.locator('[data-collection-card]').first().waitFor({ timeout: 20_000 });
  const file2 = `${OUT_DIR}/collection-mobile.png`;
  await p2.screenshot({ path: file2, fullPage: false });
  shots.push([file2, 'จอมือถือ 390×740 · แท็บ "การ์ดทั้งหมด"']);

  // จอมือถือ — แท็บ "ยังไม่มี" (การ์ดล็อก 🔒)
  const p3 = await mobile.newPage();
  await p3.goto(`${BASE}/cards`, { waitUntil: 'networkidle' });
  await p3.locator('[data-collection-tab="missing"]').click();
  await p3.locator('[data-collection-card]').first().waitFor({ timeout: 20_000 });
  const file3 = `${OUT_DIR}/collection-mobile-missing.png`;
  await p3.screenshot({ path: file3, fullPage: false });
  shots.push([file3, 'จอมือถือ 390×740 · แท็บ "ยังไม่มี"']);

  await browser.close();
  console.log(`👤 ผู้ใช้ทดสอบ: ${username}`);
  for (const [file, label] of shots) console.log(`📸 ${label} → ${file}`);

  await prisma.user.delete({ where: { id: userId } }).catch((e) => console.log('ลบผู้ใช้ทดสอบไม่สำเร็จ:', e.message));
  console.log('🧹 ลบผู้ใช้ทดสอบแล้ว');
}

main()
  .catch((e) => {
    console.error('❌ ล้ม:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
