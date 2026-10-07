/**
 * E2E — รายละเอียดการ์ดเป็น "ป๊อปอัป" ในหน้าคอลเลคชั่น
 *
 * ที่มา 2026-10-07 (ผู้ใช้แจ้งรอบ 1): *"เวลาอยู่หน้า 2 กดกลับคอลเลคชั่น จะกลับไปหน้า 1
 * แก้ให้เป็นดูแบบ Popup พอ จะได้ไม่ต้องกดกลับ"*
 * รอบ 2 (วันเดียวกัน): *"กดเปิดเต็มจอ พอกดกลับคอลเลคชั่น จะกลับไปหน้า 1 อีก
 * แก้ด้วย ให้กลับไปหน้าที่การ์ดที่เปิดดูอยู่"*
 *
 * เกณฑ์ผ่าน (วัดได้):
 *   1) อยู่หน้า 2 → แตะการ์ด → modal ขึ้น **และ URL ยังเป็น /cards** (ไม่นำทางไป /cards/:id)
 *   2) การ์ดในป๊อปอัปมี "กรอบ" (overlay layer) เดียวกับในกริด + กล่องมีขนาดจริง (ไม่สูง 0)
 *   3) ปิด modal (ปุ่ม/Esc) → ยังอยู่หน้า 2 · ตัวกรอง/จำนวนคงเดิม (state ไม่หาย)
 *   4) เปิดหน้าเต็มจากป๊อปอัป → "กลับไปคอลเลคชั่น" ต้องได้ **หน้า 2 + การ์ดใบเดิม** (?from=)
 *   5) back ของเบราว์เซอร์จากหน้าเต็ม ก็กลับมาหน้าเดิม
 *   6) Ctrl+คลิก ยังเปิดหน้าเต็ม /cards/:id ในแท็บใหม่ได้ตามเดิม (deep link ไม่พัง)
 *   7) จอ 390×740: modal ไม่ล้นจอ
 *
 * NOTE (สำคัญ): ทุกสเปกวิ่งจาก IP เดียวกัน และ middleware มี API_BURST 600 คำขอ/นาที/IP
 * หน้าคอลเลคชั่นโหลดภาพการ์ดทีละโหล (art + overlay frame) ⇒ **ต้องประหยัดจำนวนครั้งที่เปิดหน้า**
 * จึงรวมหลายเส้นทางไว้ในเทสต์เดียว และเข้า `?page=…` ตรง ๆ แทนการกด "ถัดไป" เพิ่มรอบ
 */
import { test, expect } from '@playwright/test';
import { STORAGE_STATE, collectErrors, seedOnboardingDismissed, dismissOnboardingIfPresent } from './helpers';

test.use({ storageState: STORAGE_STATE });

test.beforeEach(async ({ context }) => {
  // กัน onboarding modal เด้งทับ UI (seed ต่อ context ก่อน goto ใด ๆ)
  await seedOnboardingDismissed(context);
});

test.describe('คอลเลคชั่น: เปิดรายละเอียดการ์ดเป็นป๊อปอัป', () => {
  test('[A] popup ไม่เสีย state ของหน้า/ตัวกรอง · กรอบการ์ดครบ · จอ 390 ไม่ล้น', async ({ page }) => {
    const errors = collectErrors(page);

    // เข้า /cards?page=2 ตรง ๆ (ทดสอบการอ่านมุมมองจาก URL ไปในตัว) = 1 คำขอ
    await page.goto('/cards?page=2');
    await dismissOnboardingIfPresent(page);

    const pageInfo = page.locator('[data-collection-pageinfo]');
    await expect(pageInfo).toBeVisible({ timeout: 20_000 });
    const totalPages = Number((await pageInfo.innerText()).split('/')[1] ?? '1');
    test.skip(totalPages < 2, `คอลเลคชั่นมีแค่ ${totalPages} หน้า — ทดสอบ "กลับไปหน้า 1" ไม่ได้`);
    await expect(pageInfo, 'URL ?page=2 ต้องพากลับมาหน้า 2').toHaveText(/^2\//);

    const cardLink = page.locator('[data-collection-cardlink]').first();
    const cardId = await cardLink.getAttribute('data-collection-cardlink');
    expect(cardId, 'การ์ดใบแรกในหน้า 2 ต้องมี id').toBeTruthy();

    await cardLink.click();

    const modal = page.locator('[data-card-detail-modal="true"]');
    await expect(modal).toBeVisible();
    // modal ต้องเป็นการ์ดใบที่กดจริง (href มี ?from= ติดมาได้ — ดูเทสต์ B)
    const fullHref = await page.locator('[data-card-detail-fullpage]').getAttribute('href');
    expect(fullHref?.startsWith(`/cards/${cardId}`)).toBe(true);
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

    // ── จอมือถือ (390×740): modal ต้องไม่ล้นจอแนวนอน — วัดต่อในหน้าเดิม ไม่เปิดหน้าใหม่ ──
    await page.setViewportSize({ width: 390, height: 740 });
    await cardLink.click();
    await expect(modal).toBeVisible();
    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      overflow.scrollWidth,
      `modal ล้นจอแนวนอน (innerWidth=${overflow.innerWidth})`,
    ).toBeLessThanOrEqual(overflow.innerWidth + 1);
    await page.locator('[data-card-detail-close]').click();
    await expect(modal).toBeHidden();

    // ── ตัวกรอง: เลือกแล้วต้องคงอยู่ (modal ไม่ได้ unmount หน้า) และติดไปกับ URL ──
    await page.locator('[data-collection-element="EMBERBOUND"]').click();
    await expect(page.locator('[data-collection-element="EMBERBOUND"]')).toHaveClass(/border-sky-400/);
    await expect.poll(() => new URL(page.url()).searchParams.get('element')).toBe('EMBERBOUND');
    expect(new URL(page.url()).pathname).toBe('/cards');

    expect(errors.pageErrors(), 'uncaught exception').toEqual([]);
    expect(errors.seriousConsoleErrors(), 'console error ร้ายแรง').toEqual([]);
  });

  /**
   * 2026-10-07 รอบ 2 (ผู้ใช้แจ้ง): "กดเปิดเต็มจอ พอกดกลับคอลเลคชั่น จะกลับไปหน้า 1 อีก
   * แก้ด้วย ให้กลับไปหน้าที่การ์ดที่เปิดดูอยู่"
   *
   * เข้า `/cards?page=2` ตรง ๆ = 1 คำขอ/รอบ (และทดสอบการอ่านมุมมองจาก URL ไปในตัว)
   * รวม 3 เส้นทาง (ปุ่มกลับ / ctrl+คลิก / back ของเบราว์เซอร์) ไว้เทสต์เดียวเพื่อลดจำนวนคำขอสะสม
   */
  test('เปิดหน้าเต็มจากป๊อปอัป → กลับได้หน้าเดิม (ปุ่มกลับคอลเลคชั่น · ctrl+คลิก · back ของเบราว์เซอร์)', async ({ page, context }) => {
    await page.goto('/cards?page=2');
    await dismissOnboardingIfPresent(page);

    const pageInfo = page.locator('[data-collection-pageinfo]');
    await expect(pageInfo, 'ต้องเปิดมาแล้วอยู่หน้า 2 ตาม URL').toHaveText(/^2\//, { timeout: 20_000 });

    const cardId = await page.locator('[data-collection-cardlink]').first().getAttribute('data-collection-cardlink');
    test.skip(!cardId, 'ไม่มีการ์ดให้ทดสอบ');
    const cardLink = page.locator(`[data-collection-cardlink="${cardId}"]`);

    // ── 1) ปุ่ม "กลับไปคอลเลคชั่น" ในหน้ารายละเอียด ──
    await cardLink.click();
    await expect(page.locator('[data-card-detail-modal="true"]')).toBeVisible();
    await page.locator('[data-card-detail-fullpage]').click();
    await page.waitForURL((url) => url.pathname === `/cards/${cardId}`, { timeout: 20_000 });
    expect(
      new URL(page.url()).searchParams.get('from'),
      'ปุ่มเปิดหน้าเต็มต้องส่ง URL คอลเลคชั่นติดไปด้วย',
    ).toBe('/cards?page=2');

    await page.locator('[data-card-detail-back]').click();
    await page.waitForURL((url) => url.pathname === '/cards', { timeout: 20_000 });
    await expect(pageInfo, 'กลับมาต้องได้หน้า 2 ไม่ใช่หน้า 1').toHaveText(/^2\//);
    await expect(
      page.locator(`[data-collection-card="${cardId}"]`),
      'การ์ดใบเดิมต้องอยู่หน้าเดิม',
    ).toBeVisible();

    // ── 2) ctrl+คลิก ยังเปิดหน้าเต็มในแท็บใหม่ (ไม่ใช่ modal) — ไม่เปิดหน้าคอลเลคชั่นซ้ำ ──
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      cardLink.click({ modifiers: ['Control'] }),
    ]);
    await popup.waitForURL((url) => url.pathname === `/cards/${cardId}`, { timeout: 20_000 });
    await expect(popup.locator('[data-card-detail-modal="true"]')).toHaveCount(0);
    await popup.close();

    // ── 3) ปุ่ม back ของเบราว์เซอร์ ──
    await cardLink.click();
    await page.locator('[data-card-detail-fullpage]').click();
    await page.waitForURL((url) => url.pathname === `/cards/${cardId}`, { timeout: 20_000 });
    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/cards', { timeout: 20_000 });
    await expect(pageInfo, 'กด back ของเบราว์เซอร์ก็ต้องได้หน้า 2').toHaveText(/^2\//);
  });
});
