/**
 * E2E — รายละเอียดการ์ดเป็น "ป๊อปอัป" ในหน้าคอลเลคชั่น
 *
 * ที่มา 2026-10-07 (ผู้ใช้แจ้ง): *"เวลาอยู่หน้า 2 กดกลับคอลเลคชั่น จะกลับไปหน้า 1
 * แก้ให้เป็นดูแบบ Popup พอ จะได้ไม่ต้องกดกลับ"*
 *
 * เกณฑ์ผ่าน (วัดได้):
 *   1) อยู่หน้า 2 → แตะการ์ด → modal ขึ้น **และ URL ยังเป็น /cards** (ไม่นำทางไป /cards/:id)
 *   2) ปิด modal → ยังอยู่หน้า 2 · ตัวกรอง/จำนวนคงเดิม (state ไม่หาย)
 *   3) ปิดได้ด้วย Esc และด้วยปุ่มปิด
 *   4) Ctrl+คลิก ยังเปิดหน้าเต็ม /cards/:id ได้ตามเดิม (deep link ไม่พัง)
 */
import { test, expect } from '@playwright/test';
import { STORAGE_STATE, collectErrors, seedOnboardingDismissed, dismissOnboardingIfPresent } from './helpers';

test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ context }) => {
  // กัน onboarding modal เด้งทับ UI (seed ต่อ context ก่อน goto ใด ๆ)
  await seedOnboardingDismissed(context);
});

/** เปิด /cards แล้วไปหน้า 2 — คืนตัวอ่านข้อความ "หน้า/ทั้งหมด" */
async function gotoPage2(page: import('@playwright/test').Page) {
  await page.goto('/cards');
  await dismissOnboardingIfPresent(page);

  const pageInfo = page.locator('[data-collection-pageinfo]');
  await expect(pageInfo).toBeVisible({ timeout: 20_000 });

  const totalPages = Number((await pageInfo.innerText()).split('/')[1] ?? '1');
  test.skip(totalPages < 2, `คอลเลคชั่นมีแค่ ${totalPages} หน้า — ทดสอบ "กลับไปหน้า 1" ไม่ได้`);

  await page.locator('[data-collection-page="next"]').click();
  await expect(pageInfo).toHaveText(/^2\//);
  return pageInfo;
}

test.describe('คอลเลคชั่น: เปิดรายละเอียดการ์ดเป็นป๊อปอัป', () => {
  test('อยู่หน้า 2 → แตะการ์ด → ปิด → ยังอยู่หน้า 2 (ไม่เปลี่ยน route)', async ({ page }) => {
    const errors = collectErrors(page);
    const pageInfo = await gotoPage2(page);

    const cardLink = page.locator('[data-collection-cardlink]').first();
    const cardId = await cardLink.getAttribute('data-collection-cardlink');
    expect(cardId, 'การ์ดใบแรกในหน้า 2 ต้องมี id').toBeTruthy();

    await cardLink.click();

    const modal = page.locator('[data-card-detail-modal="true"]');
    await expect(modal).toBeVisible();
    // modal ต้องเป็นการ์ดใบที่กดจริง
    await expect(page.locator('[data-card-detail-fullpage]')).toHaveAttribute('href', `/cards/${cardId}`);
    // และต้องไม่นำทางออกจากหน้าคอลเลคชั่น
    expect(new URL(page.url()).pathname, 'URL ต้องยังเป็น /cards').toBe('/cards');

    // ── การ์ดในป๊อปอัปต้อง "มีกรอบ" เหมือนการ์ดในกริด ──
    // (ผู้ใช้ติ 2026-10-07: "พอกดดูแล้วกรอบการ์ดมันหาย" — เดิมป๊อปอัปโชว์แค่ภาพ AI ดิบ)
    const gridFrame = page.locator(`[data-collection-card="${cardId}"] img[src*="mode=overlay"]`);
    await expect(gridFrame).toHaveAttribute('src', /mode=overlay/);
    const gridFrameSrc = await gridFrame.getAttribute('src');

    const modalCard = modal.locator('[data-card-face]');
    const modalFrame = modalCard.locator('img[src*="mode=overlay"]');
    await expect(modalFrame).toBeVisible();
    expect(await modalFrame.getAttribute('src'), 'กรอบการ์ดในป๊อปอัปต้องเป็นเลเยอร์เดียวกับในกริด').toBe(gridFrameSrc);

    // กล่องการ์ดต้องมีขนาดจริง — กับดักเดิม: เลเยอร์ absolute ในกล่องสูง 0 ⇒ รูป+กรอบหายทั้งใบ
    const box = await modalCard.boundingBox();
    expect(box, 'การ์ดในป๊อปอัปต้องมีกล่องให้วัด').not.toBeNull();
    expect(box!.width, 'ความกว้างการ์ด').toBeGreaterThan(100);
    expect(box!.height, 'ความสูงการ์ด').toBeGreaterThan(150);
    expect(box!.height / box!.width, 'สัดส่วนการ์ดควรใกล้ 7:10').toBeGreaterThan(1.2);

    await page.locator('[data-card-detail-close]').click();
    await expect(modal).toBeHidden();

    // กลับมาอยู่หน้า 2 เหมือนเดิม (นี่คือบั๊กที่ผู้ใช้เจอ)
    await expect(pageInfo).toHaveText(/^2\//);
    expect(new URL(page.url()).pathname).toBe('/cards');

    expect(errors.pageErrors(), 'uncaught exception').toEqual([]);
    expect(errors.seriousConsoleErrors(), 'console error ร้ายแรง').toEqual([]);
  });

  test('ปิดด้วย Esc ได้ และตัวกรองที่เลือกไว้ยังอยู่', async ({ page }) => {
    await page.goto('/cards');
    await dismissOnboardingIfPresent(page);
    await expect(page.locator('[data-collection-pageinfo]')).toBeVisible({ timeout: 20_000 });

    // เลือกตัวกรองเพื่อพิสูจน์ว่า state ของรายการไม่หายไปพร้อม modal
    await page.locator('[data-collection-element="EMBERBOUND"]').click();
    await expect(page.locator('[data-collection-element="EMBERBOUND"]')).toHaveClass(/border-sky-400/);

    await page.locator('[data-collection-cardlink]').first().click();
    const modal = page.locator('[data-card-detail-modal="true"]');
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // ตัวกรองที่เลือกไว้ต้องยังเลือกอยู่ (ไม่ถูก reset เพราะ modal ไม่ได้ unmount หน้า)
    await expect(page.locator('[data-collection-element="EMBERBOUND"]')).toHaveClass(/border-sky-400/);
    expect(new URL(page.url()).pathname).toBe('/cards');
  });

  test('Ctrl+คลิก ยังเปิดหน้าเต็ม /cards/:id ในแท็บใหม่ได้ตามเดิม', async ({ page, context }) => {
    await page.goto('/cards');
    await dismissOnboardingIfPresent(page);

    const cardLink = page.locator('[data-collection-cardlink]').first();
    const cardId = await cardLink.getAttribute('data-collection-cardlink');

    // ctrl/⌘+คลิก = เบราว์เซอร์เปิดแท็บใหม่ (ปล่อยให้ href ทำงาน) ไม่ใช่ modal
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      cardLink.click({ modifiers: ['Control'] }),
    ]);
    // รอให้แท็บใหม่นำทางจริงก่อนอ่าน URL (ห้ามอ่านทันที — จะยังเป็น about:blank)
    await popup.waitForURL((url) => url.pathname === `/cards/${cardId}`, { timeout: 20_000 });
    await expect(popup.locator('[data-card-detail-modal="true"]')).toHaveCount(0);
    await popup.close();
  });

  test('จอมือถือ 390×740: modal ไม่ล้นจอ (แนวนอน)', async ({ page }) => {
    // กฎของโปรเจกต์: UI ต้องไม่ล้นจอ 390px
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto('/cards');
    await dismissOnboardingIfPresent(page);

    await page.locator('[data-collection-cardlink]').first().click();
    const modal = page.locator('[data-card-detail-modal="true"]');
    await expect(modal).toBeVisible();

    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      overflow.scrollWidth,
      `modal ล้นจอแนวนอน (innerWidth=${overflow.innerWidth})`,
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);
  });
});
