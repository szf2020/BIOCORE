import { test, expect, type Page } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SP-FX-3b.2.2 — single-widget rotate handle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    await page.waitForTimeout(200);
  });

  test('Rotate handle drag 90°: store rotate ≈ 90, widget node has transform', async ({ page }) => {
    // Select w1 first (fixture: x=50, y=50, w=120, h=80 → pivot=(110, 90))
    await page.locator('[data-widget-id="w1"]').click();
    await page.waitForTimeout(300);

    const rotateHandle = await page.locator('[data-handle="rotate"]').boundingBox();
    if (!rotateHandle) throw new Error('rotate handle bbox unavailable');

    const canvasSvgBbox = await page.evaluate((): { x: number; y: number } | null => {
      const el = document.querySelector<SVGSVGElement>('[data-layer="widgets"]')?.closest('svg');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    if (!canvasSvgBbox) throw new Error('canvas svg bbox unavailable');
    const startX = rotateHandle.x + rotateHandle.width / 2;
    const startY = rotateHandle.y + rotateHandle.height / 2;
    const pivotX = canvasSvgBbox.x + 110;
    const pivotY = canvasSvgBbox.y + 90;
    // Rotate 90° clockwise: from (pivot.x, pivot.y - r) → (pivot.x + r, pivot.y)
    const r = Math.hypot(startX - pivotX, startY - pivotY);
    const endX = pivotX + r;
    const endY = pivotY;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.rotate).toBeGreaterThan(60);
    expect(view.items.w1.rotate).toBeLessThan(120);
    const transform = await page.locator('[data-widget-id="w1"]').getAttribute('transform');
    expect(transform).toContain('rotate(');
  });

  test('ESC mid-rotate restores: rotate undefined, no transform attr', async ({ page }) => {
    await page.locator('[data-widget-id="w1"]').click();
    await page.waitForTimeout(300);
    const rotateHandle = await page.locator('[data-handle="rotate"]').boundingBox();
    if (!rotateHandle) throw new Error('rotate handle bbox unavailable');
    const startX = rotateHandle.x + rotateHandle.width / 2;
    const startY = rotateHandle.y + rotateHandle.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY + 50, { steps: 5 });  // partial drag
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.rotate).toBeUndefined();
    const transform = await page.locator('[data-widget-id="w1"]').getAttribute('transform');
    expect(transform).toBeNull();
  });
});
