import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SP-FX-3a editor canvas smoke', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
  });

  test('drag widget body moves x/y', async ({ page }) => {
    const widget = await page.waitForSelector('[data-widget-id="w1"]');
    const before = await widget.boundingBox();
    if (!before) throw new Error('widget bbox unavailable');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 100, before.y + before.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.x).toBeGreaterThan(50);
    expect(view.items.w1.y).toBeGreaterThan(50);
  });

  test('select widget shows handles, click empty hides them', async ({ page }) => {
    await page.click('[data-widget-id="w1"]');
    let overlayVis = await page.getAttribute('[data-overlay="transform"]', 'visibility');
    expect(overlayVis).not.toBe('hidden');

    // Click an empty area in the canvas SVG (700,500 in SVG coords — outside both widgets).
    // Use the canvas SVG (parent of [data-layer="widgets"]), not document.querySelector('svg')
    // which selects the first icon SVG in the sidebar.
    await page.evaluate(() => {
      const widgetLayer = document.querySelector('[data-layer="widgets"]');
      const svg = widgetLayer?.closest('svg') as SVGSVGElement | null;
      if (!svg) throw new Error('canvas svg not found');
      const ctm = svg.getScreenCTM();
      if (!ctm) throw new Error('no ctm');
      // SVG coords (700,500) are outside w1(50,50,120×80) and w2(300,200,100×60)
      const pt = svg.createSVGPoint();
      pt.x = 700; pt.y = 500;
      const client = pt.matrixTransform(ctm);
      svg.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true,
        clientX: client.x, clientY: client.y,
      }));
      svg.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true,
        clientX: client.x, clientY: client.y,
      }));
    });
    // Wait for React to flush the selection → handles.hide() effect
    await page.waitForTimeout(200);
    overlayVis = await page.getAttribute('[data-overlay="transform"]', 'visibility');
    expect(overlayVis).toBe('hidden');
  });

  test('drag SE handle resizes widget', async ({ page }) => {
    await page.click('[data-widget-id="w1"]');
    const seHandle = await page.waitForSelector('[data-handle="se"]');
    const box = await seHandle.boundingBox();
    if (!box) throw new Error('SE handle bbox unavailable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 10 });
    await page.mouse.up();
    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.w).toBeGreaterThan(120);
    expect(view.items.w1.h).toBeGreaterThan(80);
  });
});
