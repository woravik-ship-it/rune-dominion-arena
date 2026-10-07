/**
 * E2E — Discovery (กระดานรูน → ถอดรหัส)
 * ใช้ session ผู้ใช้ทดสอบจาก global-setup (storageState)
 *
 * หมายเหตุ: กระดานรูนเป็น <canvas> (วาดเองทั้งหมด) — เลือกรูนด้วยการลาก/คลิกพิกัด
 * จาก automation ทำได้ยากและเปราะ — จึงเลือกใช้ปุ่ม "🎲 สุ่ม 16 จุด" ที่มีจริงในหน้า
 * เพื่อเลือกรูน 8-16 ตำแหน่งตามกติกา แล้วกด "ถอดรหัสรูน" (ยิง API จริง POST /api/discover)
 */
import { test, expect } from '@playwright/test';
import { STORAGE_STATE, collectErrors, seedOnboardingDismissed } from './helpers';

test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ context }) => {
  // กัน onboarding modal เด้งทับปุ่ม (ผู้เล่นใหม่ยังไม่เคยกดข้าม)
  await seedOnboardingDismissed(context);
});

test.describe('Discovery — กระดานรูนและถอดรหัส', () => {
  test('/discover แสดงกระดานรูน + สุ่มเลือก + ถอดรหัสได้จริง', async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: 'ค้นหารูน' })).toBeVisible();

    // กระดานรูน = canvas
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // ปุ่มถอดรหัสตอนแรกต้องถูกปิด (ยังไม่ได้เลือกรูน)
    const decodeBtn = page.getByRole('button', { name: 'ถอดรหัสรูน' });
    await expect(decodeBtn).toBeDisabled();

    // เลือกรูนผ่านปุ่มสุ่ม (16 จุด) ที่มีจริงในหน้า
    await page.getByRole('button', { name: /สุ่ม 16/ }).click();
    await expect(page.getByText('เลือกแล้ว: 16 / 16')).toBeVisible();

    // ตอนนี้ปุ่มถอดรหัสต้องกดได้
    await expect(decodeBtn).toBeEnabled();
    await decodeBtn.click();

    // สำเร็จ = เปิดการ์ด (modal) — ถ้า API ล้มเหลวจะเห็นข้อความ error แทน ไม่มี modal
    await expect(page.getByRole('button', { name: 'เพิ่มลงทีม' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'ค้นหารูนต่อ' })).toBeVisible();

    // ปิด modal แล้วกลับไปที่กระดานได้
    await page.getByRole('button', { name: 'ปิด', exact: true }).click();
    await expect(page.getByRole('button', { name: 'เพิ่มลงทีม' })).toHaveCount(0);

    expect(errors.pageErrors()).toEqual([]);
    expect(errors.seriousConsoleErrors()).toEqual([]);
  });
});
