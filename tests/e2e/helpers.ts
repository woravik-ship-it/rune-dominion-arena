/**
 * Helper ร่วมของเทสต์ E2E
 * - สุ่มชื่อผู้ใช้ใหม่ทุกครั้ง (ห้ามใช้บัญชีจริง)
 * - เก็บ console error / uncaught exception เพื่อตรวจว่า "ไม่มี exception ที่ร้ายแรง"
 */
import path from 'node:path';
import fs from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';

/** ไฟล์ session ของผู้ใช้ทดสอบที่ global-setup สร้างไว้ (สุ่มใหม่ทุกรอบ) */
export const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json');

/**
 * ไฟล์ marker เวลาเริ่มรอบ (global-setup เขียน · global-teardown ใช้เป็นเส้นแบ่ง)
 * ⇒ teardown ลบเฉพาะบัญชีทดสอบ `e2e_%` ที่ "รอบนี้" สร้าง ไม่แตะบัญชีเดิม
 */
export const RUN_START_FILE = path.join(__dirname, '.auth', 'run-start.json');

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

/** รหัสผ่านคงที่ของบัญชีทดสอบ (ไม่ใช่บัญชีจริง) */
export const TEST_PASSWORD = 'E2ePassw0rd!';

/** สร้างข้อมูลผู้ใช้สุ่มใหม่ (username ต้องตรง pattern [a-zA-Z0-9_]{3,20}) */
export function randomUser(label = 'e2e') {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const username = `${label}_${stamp}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  return {
    username,
    email: `${username}@example.com`,
    password: TEST_PASSWORD,
  };
}

/**
 * console error ที่ถือว่า "ไม่ร้ายแรง" (noise ของเบราว์เซอร์/สภาพแวดล้อม headless)
 * เช่น favicon 404, เสียงเล่นไม่ได้เพราะไม่มี user gesture, resource ยกเลิกตอนเปลี่ยนหน้า
 */
const BENIGN_CONSOLE_PATTERNS: RegExp[] = [
  /favicon\.ico/i,
  /Download the React DevTools/i,
  // 401 เป็นพฤติกรรมปกติของหัวเว็บที่ยิง /api/auth/me, /api/wallet, /api/energy ตอนยังไม่ล็อกอิน
  /Failed to load resource: the server responded with a status of 401/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /Failed to load resource: net::ERR_ABORTED/i,
  /The play\(\) request was interrupted/i,
  /NotAllowedError/i,
  /play\(\) failed because the user didn't interact/i,
  /AudioContext/i,
  /net::ERR_ABORTED/i,
  /**
   * 2026-10-07: โซน e2sv.link มี Cloudflare Web Analytics ฉีดสคริปต์ beacon เข้ามาในหน้า
   * แต่แอปตั้ง CSP เข้ม (`script-src 'self' 'unsafe-inline'` — ดู SECURITY.md) เบราว์เซอร์
   * จึงบล็อกและขึ้น console error ทุกครั้งที่เปิดผ่าน https://rune.e2sv.link
   * ⇒ เป็น noise ของ "ชั้น Cloudflare" ไม่ใช่บั๊กของแอป (เจอตอนรัน E2E ผ่านลิงก์สาธารณะ)
   */
  /static\.cloudflareinsights\.com/i,
];

export function isBenignConsoleError(text: string): boolean {
  return BENIGN_CONSOLE_PATTERNS.some((re) => re.test(text));
}

/** ตัวเก็บ error: console error + pageerror (uncaught exception) */
export function collectErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  return {
    /** console error ที่ไม่ใช่ noise */
    seriousConsoleErrors: () => consoleErrors.filter((t) => !isBenignConsoleError(t)),
    /** uncaught exception ทั้งหมด — ถือว่าร้ายแรงเสมอ */
    pageErrors: () => pageErrors.slice(),
  };
}

/**
 * สมัครผู้เล่นใหม่ผ่านหน้า /register (UI จริง) แล้วรอจนเข้าสู่สถานะล็อกอิน
 * คืนค่า credentials ที่ใช้ เพื่อนำไปทดสอบ login ต่อได้
 */
export async function registerViaUI(page: Page, label = 'e2e') {
  const user = randomUser(label);
  await page.goto('/register');
  await page.locator('input[placeholder="warrior99"]').fill(user.username);
  await page.locator('input[type="email"]').fill(user.email);
  // ช่องรหัสผ่านมี 2 ช่อง (รหัสผ่าน / ยืนยันรหัสผ่าน) เรียงตาม DOM
  const pw = page.locator('input[autocomplete="new-password"]');
  await pw.first().fill(user.password);
  await pw.nth(1).fill(user.password);
  await page.locator('button[type="submit"]').click();
  // สำเร็จ → router.push('/')
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
  return user;
}

/** ล็อกอินผ่านหน้า /login ด้วยชื่อผู้ใช้ + รหัสผ่าน */
export async function loginViaUI(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.locator('input[placeholder="warrior99"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
}

/**
 * อ่าน userId ของผู้ใช้ทดสอบจาก session cookie (JWT) ใน storageState
 * ใช้เพื่อ seed localStorage ให้ onboarding modal ไม่เด้งทับ UI ที่ต้องกด
 */
export function getStorageUserId(): string {
  const raw = fs.readFileSync(STORAGE_STATE, 'utf8');
  const state = JSON.parse(raw) as { cookies: Array<{ name: string; value: string }> };
  const cookie = state.cookies.find((c) => c.name === 'rda_session');
  if (!cookie) throw new Error('getStorageUserId: ไม่พบ cookie rda_session ใน storageState');
  const payload = cookie.value.split('.')[1];
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
  if (!decoded.sub) throw new Error('getStorageUserId: ถอด JWT ไม่ได้ (ไม่มี sub)');
  return decoded.sub;
}

/**
 * ปิด onboarding modal ถ้าปรากฏ
 *
 * 2026-10-07: เดิม /api/auth/me ไม่ส่ง cardCount ทำให้ provider เข้าใจว่า cardCount = 0
 * แล้วโชว์ modal ให้ "ผู้ใช้ที่ล็อกอินทุกคน" (แก้ที่ src/app/api/auth/me/route.ts แล้ว)
 * ตัวนี้ยังเก็บไว้เป็น safety net + seedOnboardingDismissed() สำหรับผู้เล่นที่มีการ์ด 0 ใบจริง
 */
export async function dismissOnboardingIfPresent(page: Page) {
  const modal = page.locator('[data-onboarding-modal="true"]');
  const appeared = await modal
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await modal.getByRole('button', { name: 'ปิด' }).click();
    await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
  }
}

/** seed localStorage ให้ onboarding modal ไม่เด้ง (เรียกก่อน goto ใด ๆ) */
export async function seedOnboardingDismissed(context: BrowserContext) {
  const userId = getStorageUserId();
  await context.addInitScript((uid: string) => {
    try {
      window.localStorage.setItem(`rda_onboarded_${uid}`, new Date().toISOString());
    } catch {
      /* localStorage ปิด — ไม่เป็นไร */
    }
  }, userId);
}
