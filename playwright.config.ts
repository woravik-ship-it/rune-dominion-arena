import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — Rune Dominion Arena (E2E)
 *
 * หมายเหตุสำคัญ:
 * - ใช้ "เซิร์ฟเวอร์ที่รันอยู่แล้ว" ที่ http://127.0.0.1:3000 เท่านั้น
 *   ⛔ ไม่ใช้ webServer (ห้ามสั่ง build / restart ในชุดเทสต์นี้)
 * - ใช้เฉพาะ Chromium
 * - workers = 1 + fullyParallel = false เพื่อกัน rate limit (AUTH_REGISTER 5/นาที)
 *   และกันข้อมูลทดสอบชนกัน
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // เก็บกวาดผู้ใช้ทดสอบที่รอบนี้สร้าง (เดิมค้างใน DB จริง 46 บัญชีจากการรันก่อน ๆ)
  globalTeardown: './tests/e2e/global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    // จอสูงพอให้ modal/ปุ่มล่างไม่ถูกแถบเมนู fixed ทับ (Desktop Chrome default 720 สูงไปชน nav)
    viewport: { width: 1280, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // ต้องตั้งที่ project ด้วย — spread devices มี viewport ของตัวเองที่ override ค่าด้านบน
        viewport: { width: 1280, height: 1000 },
      },
    },
  ],
});
