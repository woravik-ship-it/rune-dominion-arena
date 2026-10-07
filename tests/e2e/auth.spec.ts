/**
 * E2E — Auth flow (หน้าแรก / login / register)
 * - เปิดหน้าแรกและหน้า login ได้
 * - สมัครผู้เล่นใหม่ผ่านหน้า /register → ล็อกอินอัตโนมัติ → ออกจากระบบ → ล็อกอินใหม่ได้จริง
 * ผู้ใช้ทดสอบสร้างใหม่ทุกครั้ง (สุ่มชื่อ) — ไม่ใช้บัญชีจริง
 */
import { test, expect } from '@playwright/test';
import { collectErrors, registerViaUI, loginViaUI } from './helpers';

test.describe('Auth — หน้าแรก/login/สมัครสมาชิก', () => {
  test('หน้าแรก (/) เปิดได้', async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Rune Dominion Arena' })).toBeVisible();
    await expect(page.getByRole('link', { name: /เริ่มค้นหารูน/ })).toBeVisible();
    expect(errors.pageErrors()).toEqual([]);
    expect(errors.seriousConsoleErrors()).toEqual([]);
  });

  test('หน้า login (/login) เปิดได้', async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto('/login');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ' })).toBeVisible();
    await expect(page.locator('input[placeholder="warrior99"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    expect(errors.pageErrors()).toEqual([]);
    expect(errors.seriousConsoleErrors()).toEqual([]);
  });

  test('สมัครผ่าน /register แล้วล็อกอินได้จริง', async ({ page }) => {
    const errors = collectErrors(page);

    // 1) สมัครผ่าน UI จริง → ระบบล็อกอินให้ทันที (session cookie)
    const user = await registerViaUI(page, 'e2e_a');

    // ยืนยันว่าล็อกอินแล้ว: หัวเว็บแสดงชื่อผู้ใช้ที่สมัคร + มีปุ่มออกจากระบบ + ไม่มีลิงก์ "เข้าสู่ระบบ"
    const header = page.locator('header');
    await expect(header.getByText(user.username, { exact: false })).toBeVisible();
    await expect(header.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveCount(0);

    // 2) ออกจากระบบ แล้วล็อกอินใหม่ผ่านหน้า /login ด้วยรหัสเดิม
    await header.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
    await expect(header.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeVisible();

    await loginViaUI(page, user.username, user.password);
    await expect(header.getByText(user.username, { exact: false })).toBeVisible();
    await expect(header.getByRole('button', { name: 'ออกจากระบบ' })).toBeVisible();

    expect(errors.pageErrors()).toEqual([]);
    expect(errors.seriousConsoleErrors()).toEqual([]);
  });
});
