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

async function dragHandleAndAssert(
  page: Page,
  handle: string,
  dxPx: number,
  dyPx: number,
  assertion: (view: any) => void,
) {
  const handleEl = await page.locator(`[data-handle="${handle}"]`).boundingBox();
  if (!handleEl) throw new Error(`${handle} handle bbox unavailable`);
  const cx = handleEl.x + handleEl.width / 2;
  const cy = handleEl.y + handleEl.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dxPx, cy + dyPx, { steps: 10 });
  await page.mouse.up();
  const view = await page.evaluate(() => (window as any).__getCurrentView());
  assertion(view);
}

test.describe('SP-FX-3b.1 — 7 missing handle smoke', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    // Click widget w1 to select; this shows handles
    await page.locator('[data-widget-id="w1"]').click();
    await page.waitForSelector('[data-handle="nw"]', { state: 'visible' });
    await page.waitForTimeout(200);
  });

  test('NW handle drag: w/h shrink, x/y move inward', async ({ page }) => {
    await dragHandleAndAssert(page, 'nw', 30, 20, (view) => {
      expect(view.items.w1.x).toBeGreaterThan(50);
      expect(view.items.w1.y).toBeGreaterThan(50);
      expect(view.items.w1.w).toBeLessThan(120);
      expect(view.items.w1.h).toBeLessThan(80);
    });
  });

  test('N handle drag: h shrinks, y moves down', async ({ page }) => {
    await dragHandleAndAssert(page, 'n', 0, 20, (view) => {
      expect(view.items.w1.y).toBeGreaterThan(50);
      expect(view.items.w1.h).toBeLessThan(80);
    });
  });

  test('NE handle drag: w grows, h shrinks, y moves down', async ({ page }) => {
    await dragHandleAndAssert(page, 'ne', 30, 20, (view) => {
      expect(view.items.w1.w).toBeGreaterThan(120);
      expect(view.items.w1.y).toBeGreaterThan(50);
      expect(view.items.w1.h).toBeLessThan(80);
    });
  });

  test('W handle drag: w shrinks, x moves right', async ({ page }) => {
    await dragHandleAndAssert(page, 'w', 30, 0, (view) => {
      expect(view.items.w1.x).toBeGreaterThan(50);
      expect(view.items.w1.w).toBeLessThan(120);
    });
  });

  test('E handle drag: w grows', async ({ page }) => {
    await dragHandleAndAssert(page, 'e', 30, 0, (view) => {
      expect(view.items.w1.w).toBeGreaterThan(120);
    });
  });

  test('SW handle drag: w shrinks, h grows, x moves right', async ({ page }) => {
    await dragHandleAndAssert(page, 'sw', 30, 20, (view) => {
      expect(view.items.w1.x).toBeGreaterThan(50);
      expect(view.items.w1.w).toBeLessThan(120);
      expect(view.items.w1.h).toBeGreaterThan(80);
    });
  });

  test('S handle drag: h grows', async ({ page }) => {
    await dragHandleAndAssert(page, 's', 0, 20, (view) => {
      expect(view.items.w1.h).toBeGreaterThan(80);
    });
  });
});
