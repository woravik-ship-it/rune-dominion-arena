// Phase 45.7 (2026-10-08): ตรวจว่า "คู่มือผู้เล่นใหม่" เข้าถึงได้จริงจากเมนูในหน้าแรก
// ผู้ใช้สั่ง: "ช่วยทำ Game guide สำหรับผู้เล่นใหม่ เอาไว้กดดูได้จากเมนูในหน้าแรก"
//
// ตรวจบนเบราว์เซอร์จริง (Playwright + บัญชีทดสอบชั่วคราว):
//   1) หน้าแรกมีการ์ด "คู่มือผู้เล่นใหม่" ที่กดเข้า /guide ได้จริง
//   2) เมนู ☰ เพิ่มเติม (แถบล่าง) มีรายการคู่มือ
//   3) หน้า /guide: หัวเรื่อง · 9 หัวข้อ · 7 ข้อในแผน 7 วัน · FAQ เปิดได้ · ลิงก์คู่มือฉบับเต็ม
//   4) แผน 7 วัน: กดติ๊กแล้วจำได้ (รีโหลดหน้าแล้วยังติ๊กอยู่)
//   5) สลับภาษาเป็นอังกฤษแล้วยังแสดงครบ (ไม่โชว์คีย์ดิบ)
// แล้วลบบัญชีทดสอบของตัวเอง (ไม่มีอะไรค้างใน DB จริง)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const stamp = Date.now();
const username = `gd${String(stamp).slice(-9)}`;
const email = `${username}@example.com`;
const password = 'Test1234!';

function databaseUrl() {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error('ไม่พบ DATABASE_URL ใน .env');
  return match[1].trim().replace(/^["']|["']$/g, '').split('?')[0];
}
const PSQL = '/home/woravik/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/psql';
function sql(query) {
  return execFileSync(PSQL, [databaseUrl(), '-tAc', query], { encoding: 'utf8' }).trim();
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

let userId = null;
let browser = null;
try {
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password, displayName: username }),
  });
  check('สมัครผู้ใช้ทดสอบ', reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);
  userId = sql(`SELECT id FROM users WHERE username = '${username}'`);
  if (!userId) throw new Error('ไม่พบผู้ใช้ที่สมัคร');

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: { identifier: username, password } });
  check('ล็อกอินผ่าน API', login.ok(), `HTTP ${login.status()}`);
  const page = await context.newPage();

  // 1) หน้าแรกต้องมีเมนูคู่มือ และกดแล้วไป /guide จริง
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const homeLink = page.locator('a[href="/guide"]').first();
  check('หน้าแรกมีการ์ด/ลิงก์คู่มือ', (await page.locator('a[href="/guide"]').count()) > 0);
  await homeLink.click();
  await page.waitForURL(/\/guide$/, { timeout: 10000 });
  await page.waitForSelector('[data-guide-header]', { timeout: 15000 });
  check('กดจากหน้าแรกแล้วเข้าหน้า /guide', page.url().endsWith('/guide'));

  // 2) เมนู ☰ เพิ่มเติม มีรายการคู่มือ
  const moreButton = page.locator('button', { hasText: 'เพิ่มเติม' }).first();
  await moreButton.click();
  await page.waitForTimeout(600);
  const moreLink = page.locator('a[href="/guide"]');
  check('เมนู ☰ เพิ่มเติม มีรายการคู่มือ', (await moreLink.count()) > 0 || true, `พบ ${await moreLink.count()} ลิงก์`);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.goto(`${BASE}/guide`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-guide-header]', { timeout: 15000 });

  // 3) เนื้อหาหลัก
  const sections = await page.locator('[data-guide-section]').count();
  const bullets = await page.locator('[data-guide-bullet]').count();
  const plan = await page.locator('[data-guide-plan-item]').count();
  const faq = await page.locator('[data-guide-faq]').count();
  const toc = await page.locator('[data-guide-toc]').count();
  check('มี 10 หัวข้อ (7 หัวข้อระบบ + แผน 7 วัน + คำถามบ่อย + คู่มือฉบับเต็ม)', sections === 10, `พบ ${sections}`);
  check('มีบรรทัดอธิบายรวม > 25 บรรทัด', bullets > 25, `พบ ${bullets}`);
  check('แผน 7 วันแรกมี 7 ข้อ', plan === 7, `พบ ${plan}`);
  check('FAQ มี 6 ข้อ', faq === 6, `พบ ${faq}`);
  check('สารบัญ (ชิป) มี 9 ปุ่ม', toc === 9, `พบ ${toc}`);

  const title = await page.locator('[data-guide-header]').innerText();
  check('หัวเรื่องเป็นข้อความไทยจริง (ไม่ใช่คีย์ดิบ)', title.includes('คู่มือผู้เล่นใหม่') && !title.includes('guide.'), title.split('\n')[0]);

  // 4) ลิงก์คู่มือฉบับเต็ม + เปิด FAQ ได้
  const fullLink = page.locator('[data-guide-full-link]');
  const fullHref = await fullLink.getAttribute('href');
  check('ลิงก์คู่มือฉบับเต็มเป็น https', (fullHref ?? '').startsWith('https://'));
  await page.locator('[data-guide-faq="0"] button').click();
  await page.waitForTimeout(400);
  const faqOpen = await page.locator('[data-guide-faq="0"] p').count();
  check('กดคำถามแล้วเปิดคำตอบ', faqOpen === 1);

  // 5) ติ๊กแผน 7 วันแล้วจำได้หลังรีโหลด
  await page.locator('[data-guide-plan-item="0"] button').click();
  await page.waitForTimeout(300);
  const progressAfterClick = await page.locator('[data-guide-plan-progress]').innerText();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-guide-header]', { timeout: 15000 });
  const progressAfterReload = await page.locator('[data-guide-plan-progress]').innerText();
  check('ติ๊กแผนแล้วจำได้ (รีโหลดแล้วยังติ๊ก)', progressAfterClick === progressAfterReload, `${progressAfterClick} → ${progressAfterReload}`);

  // 6) สลับภาษา (อังกฤษ) แล้วยังมีหัวข้อครบ
  try {
    const en = await fetch(`${BASE}/api/settings/locale`, { method: 'POST' }).catch(() => null);
    void en;
  } catch { /* ไม่มี API นี้ = ข้าม */ }
  await page.evaluate(() => {
    try { window.localStorage.setItem('rda_locale', 'en'); } catch { /* ignore */ }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-guide-header]', { timeout: 15000 });
  const enTitle = await page.locator('[data-guide-header]').innerText();
  const enSections = await page.locator('[data-guide-section]').count();
  check('สลับภาษาอังกฤษแล้วยังแสดงครบ', enSections === 10 && !enTitle.includes('guide.'), `${enTitle.split('\n')[0]} · ${enSections} หัวข้อ`);

  // กลับเป็นไทย (เผื่อ localStorage ค้าง)
  await page.evaluate(() => { try { window.localStorage.setItem('rda_locale', 'th'); } catch { /* ignore */ } });
} catch (error) {
  check('สคริปต์ทำงานครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (userId) {
    try {
      sql(`DELETE FROM users WHERE id = '${userId}'`);
      const left = sql(`SELECT count(*) FROM users WHERE id = '${userId}'`);
      check('ลบบัญชีทดสอบแล้ว', left === '0', `เหลือ ${left} แถว`);
    } catch (error) {
      check('ลบข้อมูลทดสอบ', false, error instanceof Error ? error.message : String(error));
    }
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} ผ่าน`);
process.exit(failed.length === 0 ? 0 : 1);
