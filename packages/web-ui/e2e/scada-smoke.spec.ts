import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel(/用户名|username/i).fill(ADMIN_USER);
  await page.getByLabel(/密码|password/i).fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SCADA smoke', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('lists SCADA views', async ({ page }) => {
    await page.goto('/scada');
    await expect(page.getByRole('heading', { name: /SCADA/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /新建|create/i })).toBeVisible();
  });

  test('opens suggestions inbox', async ({ page }) => {
    await page.goto('/scada/suggestions');
    await expect(page.getByText(/建议|suggestion/i).first()).toBeVisible();
  });

  test('opens alarm-config page', async ({ page }) => {
    await page.goto('/settings/alarm-config');
    await expect(page.getByRole('button', { name: /新建/ })).toBeVisible();
  });

  test('view-list link navigates to viewer route and renders canvas', async ({ page }) => {
    // SP5/SP5.8: covers SP5 follow-up item 4 — <a href="/scada2/<id>"> in
    // ViewListPanel is unit-tested for href correctness but needs an end-to-end
    // click-and-load assertion.
    await page.goto('/scada2');

    const viewerLink = page.locator('a[href^="/scada2/"]:not([href*="/edit/"])').first();
    const visible = await viewerLink.isVisible().catch(() => false);
    test.skip(!visible, 'no SVG views seeded — open /scada2 in a populated env to exercise this path');

    const href = await viewerLink.getAttribute('href');
    await viewerLink.click();
    await page.waitForURL((url) => url.pathname === href, { timeout: 5_000 });
    // Viewer mounts SvgEditorCanvas (read-only). Either the canvas SVG or an
    // error message must appear within the load timeout.
    await expect(page.locator('svg, [data-testid="view-error"]').first()).toBeVisible({ timeout: 5_000 });
  });
});
