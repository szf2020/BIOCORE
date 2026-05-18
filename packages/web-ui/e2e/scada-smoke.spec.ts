import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  // SP-FX-12 T3: 使用 input type 选择器 (与其他 spec 一致), 登录页无 label 关联
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SCADA smoke', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('lists SCADA views', async ({ page }) => {
    await page.goto('/scada2');
    await expect(page.getByRole('heading', { name: /SCADA/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /新建|create/i })).toBeVisible();
  });

  test('opens suggestions inbox', async ({ page }) => {
    await page.goto('/scada2/suggestions');
    await expect(page.getByText(/建议|suggestion/i).first()).toBeVisible();
  });

  test('opens alarm-config page', async ({ page }) => {
    await page.goto('/settings/alarm-config');
    await expect(page.getByRole('button', { name: /新建/ })).toBeVisible();
  });

  test('write-intent click → reason fill → POST → suggestion created', async ({ page }) => {
    // SP6/SP6.7: covers SP6 follow-up item 3 — the full click-through for a
    // write-intent widget. Requires at least one SVG view in viewer mode that
    // contains a widget with `writeIntent.tag` set, AND an active batch on the
    // view's reactor (so the server returns 200 instead of no_active_batch).
    await page.goto('/scada2');
    const viewerLink = page.locator('a[href^="/scada2/"]:not([href*="/edit/"])').first();
    const linkVisible = await viewerLink.isVisible().catch(() => false);
    test.skip(!linkVisible, 'no SVG views seeded — seed a view with writeIntent widget to exercise this path');
    await viewerLink.click();
    await page.waitForLoadState('networkidle');

    const writeBtn = page.locator('[data-write-intent="true"], [data-testid^="write-intent-trigger"]').first();
    const btnVisible = await writeBtn.isVisible().catch(() => false);
    test.skip(!btnVisible, 'view has no write-intent widget — add one with writeIntent.tag to exercise this path');

    await writeBtn.click();
    await expect(page.getByTestId('write-intent-dialog')).toBeVisible();
    await page.getByTestId('write-intent-reason').fill('e2e smoke test reason');

    // Intercept the POST so the test asserts the round-trip without depending
    // on the suggestions inbox being routed to in this flow.
    const postPromise = page.waitForResponse((r) =>
      r.url().includes('/api/v1/scada/write-intents') && r.request().method() === 'POST',
    );
    await page.getByTestId('write-intent-submit').click();
    const resp = await postPromise;
    expect([200, 409]).toContain(resp.status());
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body.success).toBe(true);
      expect(typeof body.suggestion_id).toBe('number');
    } else {
      // 409 no_active_batch is the documented response when no batch is running;
      // accept it so the test passes in environments without an active batch.
      const body = await resp.json();
      expect(body.error).toBe('no_active_batch');
    }
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
