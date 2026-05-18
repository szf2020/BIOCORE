import { test, expect } from '@playwright/test';

const VIEW_ID = process.env.E2E_RUNTIME_VIEW_ID ?? 'test-view-001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

test.describe('SCADA Runtime view-v2', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    const isLoggedIn = await page
      .locator('[data-testid="user-menu"]')
      .isVisible()
      .catch(() => false);
    if (!isLoggedIn) {
      await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(process.env.E2E_USER ?? 'admin');
      await page.locator('input[type="password"]').fill(process.env.E2E_PASS ?? 'admin');
      await page.getByRole('button', { name: /登录|sign in/i }).click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
    }
  });

  test('view-v2 page load: canvas host visible, no unhandled console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/scada2/view-v2/${VIEW_ID}?reactor=${REACTOR_ID}`);
    await expect(page.locator('text=加载失败')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });
    const unhandled = consoleErrors.filter((e) => !e.includes('Warning:'));
    expect(unhandled).toHaveLength(0);
  });

  test('button click -> WriteIntentDialog appears -> submit -> dialog closes', async ({
    page,
  }) => {
    await page.route('**/api/v1/scada/write-intents', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
    );

    await page.goto(`/scada2/view-v2/${VIEW_ID}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });

    const buttonEl = page.locator('[data-widget-id] button').first();
    const hasButton = await buttonEl.isVisible().catch(() => false);

    if (!hasButton) {
      test.skip(true, 'No button widget in test view; skipping dialog smoke');
      return;
    }

    await buttonEl.click();
    const dialog = page
      .locator('[data-testid="write-intent-dialog"], [role="dialog"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const reasonInput = dialog
      .locator('[name="reason"], input[placeholder*="reason"], textarea')
      .first();
    if (await reasonInput.isVisible().catch(() => false)) {
      await reasonInput.fill('PW smoke test');
    }
    await dialog
      .locator('[type="submit"], button:has-text("确认"), button:has-text("Submit")')
      .first()
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
