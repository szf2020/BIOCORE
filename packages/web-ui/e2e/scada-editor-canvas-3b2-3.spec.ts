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

test.describe('SP-FX-3b.2.3 — multi-select rotate + group-resize', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    await page.waitForTimeout(200);
  });

  test('Ctrl+A + rotate handle drag ~90°: both widgets rotate field updated and positions orbit bbox center', async ({ page }) => {
    await page.keyboard.press('Control+a');
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
    // Fixture: w1 (50, 50, 120, 80); w2 (300, 200, 100, 60). bbox = (50, 50, 350, 210) → center (225, 155)
    const pivotX = canvasSvgBbox.x + 225;
    const pivotY = canvasSvgBbox.y + 155;
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
    expect(view.items.w2.rotate).toBeGreaterThan(60);
    expect(view.items.w2.rotate).toBeLessThan(120);
  });

  test('Ctrl+A + SE corner drag +50 +50: both widgets grow proportionally; NW anchor unchanged', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    const seHandle = await page.locator('[data-handle="se"]').boundingBox();
    if (!seHandle) throw new Error('SE handle bbox unavailable');

    const w1Before = await page.evaluate(() => (window as any).__getCurrentView().items.w1);

    await page.mouse.move(seHandle.x + seHandle.width / 2, seHandle.y + seHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(seHandle.x + seHandle.width / 2 + 50, seHandle.y + seHandle.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.x).toBe(w1Before.x);
    expect(view.items.w1.y).toBe(w1Before.y);
    expect(view.items.w1.w).toBeGreaterThan(w1Before.w);
    expect(view.items.w1.h).toBeGreaterThan(w1Before.h);
  });

  test('Ctrl+A + Shift+NE corner drag uneven: aspect ratio preserved', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    const neHandle = await page.locator('[data-handle="ne"]').boundingBox();
    if (!neHandle) throw new Error('NE handle bbox unavailable');

    const w1Before = await page.evaluate(() => (window as any).__getCurrentView().items.w1);
    const aspectBefore = w1Before.w / w1Before.h;

    await page.keyboard.down('Shift');
    await page.mouse.move(neHandle.x + neHandle.width / 2, neHandle.y + neHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(neHandle.x + neHandle.width / 2 + 100, neHandle.y + neHandle.height / 2 - 30, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    const aspectAfter = view.items.w1.w / view.items.w1.h;
    expect(Math.abs(aspectAfter - aspectBefore)).toBeLessThan(0.01);
  });
});
