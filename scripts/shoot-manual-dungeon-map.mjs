// Phase 45.6 (2026-10-08): ถ่ายภาพหน้า /dungeons (ชั้นที่มีบอส 2 ตัว) + /map ให้คู่มือผู้เล่น
// ใช้กับ "บัญชีทดสอบชั่วคราว" (ล็อกอินผ่าน API ของ Playwright — วิธีเดียวกับสคริปต์ verify:*)
//
// วิธีใช้:
//   node scripts/shoot-manual-dungeon-map.mjs <username> [password]
//   ⇒ ต้องตั้ง progress ของบัญชีนั้นก่อนถ้าต้องการให้เห็นชั้นลึก (ตัวอย่าง SQL อยู่ใน DEVELOPMENT_PLAN §45.6)
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';
const OUT = 'docs/manual/images';
const user = process.argv[2];
const password = process.argv[3] ?? 'Test1234!';
if (!user) {
  console.error('ต้องระบุ username: node scripts/shoot-manual-dungeon-map.mjs <username> [password]');
  process.exit(1);
}

const jobs = [
  { name: 'fig-dungeons', path: '/dungeons?floor=15', width: 390, height: 900, dsf: 2, waitFor: '[data-dungeon-floor-difficulty]' },
  { name: 'fig-map', path: '/map', width: 390, height: 900, dsf: 2, waitFor: '[data-map-tabs]' },
  { name: 'fig-map-wide', path: '/map', width: 1360, height: 940, dsf: 1.5, waitFor: '[data-map-tabs]' },
];

const browser = await chromium.launch();
try {
  for (const job of jobs) {
    const context = await browser.newContext({
      viewport: { width: job.width, height: job.height },
      deviceScaleFactor: job.dsf,
      isMobile: job.width < 700,
      hasTouch: job.width < 700,
    });
    const page = await context.newPage();
    // ล็อกอินผ่าน API ของ Playwright (cookie ถูกเก็บใน context) — วิธีเดียวกับสคริปต์ verify:* ที่ผ่าน
    const login = await context.request.post(`${BASE}/api/auth/login`, { data: { identifier: user, password } });
    if (!login.ok()) throw new Error(`login ไม่ผ่าน HTTP ${login.status()}`);
    await page.goto(`${BASE}${job.path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector(job.waitFor, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const box = await page.locator('[data-dungeon-floor-difficulty]').first().textContent().catch(() => null);
    const currentTab = await page.getAttribute('[data-map-tab-current="1"]', 'data-map-tab').catch(() => null);
    await page.screenshot({ path: `${OUT}/${job.name}.png` });
    console.log(`✓ ${job.name}.png  ${job.width}x${job.height}@${job.dsf}`);
    if (box) console.log(`   กล่องความยาก: ${box.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    if (currentTab) console.log(`   แท็บแผนที่ที่ยืนอยู่ = ${currentTab}`);
    await context.close();
  }
} finally {
  await browser.close();
}
