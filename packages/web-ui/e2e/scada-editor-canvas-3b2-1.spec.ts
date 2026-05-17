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

test.describe('SP-FX-3b.2.1 — multi-select + box-select + Ctrl+A + multi-drag + ESC', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    await page.waitForTimeout(200);
  });

  test('Shift+click adds widget to selection', async ({ page }) => {
    await page.locator('[data-widget-id="w1"]').click();
    await page.locator('[data-widget-id="w2"]').click({ modifiers: ['Shift'] });
    await page.waitForTimeout(200);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
  });

  test('Ctrl+A selects all widgets', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
  });

  test('Box-select rubber-band selects intersecting widgets', async ({ page }) => {
    // The canvas SVG is the parent of [data-layer="widgets"]; it starts at ~(224,105)
    // with size 800x600 in screen pixels. w1 is at SVG coords (50,50) and w2 at (300,200).
    // We start the drag at SVG (2,2) — clear of any widget — and end past both widgets.
    const canvasSvgBbox = await page.evaluate((): { x: number; y: number; w: number; h: number } | null => {
      const el = document.querySelector<SVGSVGElement>('[data-layer="widgets"]')?.closest('svg');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (!canvasSvgBbox) throw new Error('canvas SVG bbox unavailable');
    // Start 2px inside SVG top-left (empty canvas area); sweep to cover w1 and w2.
    await page.mouse.move(canvasSvgBbox.x + 2, canvasSvgBbox.y + 2);
    await page.mouse.down();
    await page.mouse.move(canvasSvgBbox.x + 500, canvasSvgBbox.y + 400, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
  });

  test('Multi-select drag moves all selected widgets together', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    const w1 = await page.locator('[data-widget-id="w1"]').boundingBox();
    if (!w1) throw new Error('w1 bbox unavailable');
    await page.mouse.move(w1.x + w1.width / 2, w1.y + w1.height / 2);
    await page.mouse.down();
    await page.mouse.move(w1.x + w1.width / 2 + 100, w1.y + w1.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.x).toBeGreaterThan(50);
    expect(view.items.w2.x).toBeGreaterThan(300);
  });

  test('ESC clears selection', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const overlay = await page.locator('[data-overlay="transform"]').getAttribute('visibility');
    expect(overlay).toBe('hidden');
  });
});
