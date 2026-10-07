/**
 * E2E — Decks (จัดเด็คจากคลังการ์ด)
 * ใช้ session ผู้ใช้ทดสอบจาก global-setup (storageState)
 * ผู้เล่นใหม่ได้การ์ดเริ่มต้น 5 ใบ → สร้างเด็คด่วนได้ทันที
 */
import { test, expect } from '@playwright/test';
import { STORAGE_STATE, collectErrors, seedOnboardingDismissed } from './helpers';

test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ context }) => {
  // กัน onboarding modal เด้งทับปุ่ม
  await seedOnboardingDismissed(context);
});

test.describe('Decks — หน้าจัดทีม', () => {
  test('/decks แสดงหน้าจัดทีม + สร้างเด็คด่วนจากการ์ด 5 ใบแรกได้', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/decks');
    // หน้านี้คือหน้าแสดงเด็ค/คลังการ์ดสำหรับจัดทีม — ต้องโหลดเสร็จไม่ค้างที่ "กำลังโหลด..."
    await expect(page.getByRole('heading', { name: 'จัดทีม' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /สร้างเด็คด่วน/ })).toBeVisible();
    await expect(page.getByText('กำลังโหลด...')).toHaveCount(0);

    // สร้างเด็คด่วนจาก 5 การ์ดแรก (ผู้เล่นใหม่มีการ์ดเริ่มต้น 5 ใบ)
    const deckName = `E2E Deck ${Date.now().toString(36)}`;
    await page.getByPlaceholder('ชื่อเด็ค เช่น ทีมหลัก').fill(deckName);
    await page.getByRole('button', { name: 'สร้าง', exact: true }).click();

    // เด็คใหม่ต้องโผล่ในรายการ + มีจำนวนใบ 5/5
    await expect(page.getByRole('heading', { name: deckName })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('5/5 ใบ').first()).toBeVisible();

    // มีลิงก์ไปหน้าจัดทีมของเด็คนั้น
    await expect(page.getByRole('link', { name: 'จัดทีม' }).first()).toBeVisible();

    expect(errors.pageErrors()).toEqual([]);
    expect(errors.seriousConsoleErrors()).toEqual([]);
  });
});
