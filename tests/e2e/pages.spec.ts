/**
 * E2E — หน้าเกมเปิดได้โดยไม่มี error ร้ายแรง
 * ตรวจ: /arena, /dungeons, /items, /inventory, /profile, /map
 * ใช้ session ผู้ใช้ทดสอบจาก global-setup (storageState)
 * เกณฑ์: HTTP 200 · หัวข้อ/เนื้อหาหลักขึ้นจริง · ไม่มี uncaught exception ·
 *        ไม่มี console error ที่ร้ายแรง (กรอง noise ของเบราว์เซอร์ออก)
 */
import { test, expect } from '@playwright/test';
import { STORAGE_STATE, collectErrors, seedOnboardingDismissed } from './helpers';

test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ context }) => {
  // กัน onboarding modal เด้งทับ UI
  await seedOnboardingDismissed(context);
});

/** หน้า + ตัวอ้างอิงที่ต้องขึ้นหลังโหลดเสร็จ */
const PAGES: Array<{ path: string; label: string; check: (page: import('@playwright/test').Page) => Promise<void> }> = [
  {
    path: '/arena',
    label: 'ประลอง (Arena)',
    check: async (page) => {
      await expect(page.getByRole('heading', { name: 'Arena 24 ชม.' })).toBeVisible();
    },
  },
  {
    path: '/dungeons',
    label: 'ดันเจี้ยน',
    check: async (page) => {
      await expect(page.getByRole('heading', { name: '🏰 ดันเจี้ยนหาวัตถุดิบ' })).toBeVisible();
    },
  },
  {
    path: '/items',
    label: 'ร้านช่าง (Items)',
    check: async (page) => {
      await expect(page.getByRole('heading', { name: /ร้านช่าง/ })).toBeVisible();
    },
  },
  {
    path: '/inventory',
    label: 'กระเป๋า (Inventory)',
    check: async (page) => {
      await expect(page.getByRole('heading', { name: /กระเป๋า/ })).toBeVisible();
    },
  },
  {
    path: '/profile',
    label: 'โปรไฟล์',
    check: async (page) => {
      // ผู้ใช้ที่ล็อกอินแล้วต้องเห็นการ์ดโปรไฟล์ (ไม่ใช่หน้า "ล็อก")
      await expect(page.locator('[data-profile-header]')).toBeVisible();
    },
  },
  {
    path: '/map',
    label: 'แผนที่ฟาร์ม',
    check: async (page) => {
      await expect(page.getByRole('heading', { name: '🗺️ แผนที่ฟาร์ม' })).toBeVisible();
    },
  },
  {
    // Phase 45.2 (2026-10-07): เมนูคอลเลคชั่นการ์ดกลับมา (เดิม /cards เป็น redirect ไป /decks)
    path: '/cards',
    label: 'คอลเลคชั่นการ์ด',
    check: async (page) => {
      await expect(page.getByRole('heading', { name: 'คอลเลคชั่นการ์ด' })).toBeVisible();
      await expect(page.locator('[data-collection-summary]')).toBeVisible();
      await expect(page.locator('[data-collection-card]').first()).toBeVisible();
    },
  },
];

test.describe('หน้าเกม — เปิดได้ไม่ error', () => {
  for (const { path, label, check } of PAGES) {
    test(`${label} (${path})`, async ({ page }) => {
      const errors = collectErrors(page);
      const res = await page.goto(path);
      expect(res?.status(), `HTTP status ของ ${path}`).toBe(200);

      await check(page);

      expect(errors.pageErrors(), `uncaught exception ใน ${path}`).toEqual([]);
      expect(errors.seriousConsoleErrors(), `console error ร้ายแรงใน ${path}`).toEqual([]);
    });
  }
});
