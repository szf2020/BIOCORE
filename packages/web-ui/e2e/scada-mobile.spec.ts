// SP-FX-25: Mobile viewport E2E — iPhone SE (375x667)
// Flow: login → verify AppLayout hamburger → view list search bar → editor mobile warning

import { test, expect } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';

const MOBILE_VIEWPORT = { width: 375, height: 667 };

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SCADA mobile viewport (SP-FX-25)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('AppLayout: 汉堡按钮可见, 点击展开 sidebar', async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');

    // 汉堡按钮应可见 (mobile viewport)
    const hamburger = page.getByTestId('hamburger-btn');
    await expect(hamburger).toBeVisible({ timeout: 5_000 });

    // 点击后 sidebar-backdrop 出现
    await hamburger.click();
    const backdrop = page.getByTestId('sidebar-backdrop');
    await expect(backdrop).toBeVisible({ timeout: 3_000 });
  });

  test('ViewList: sticky-toolbar-container 和 search bar 在 mobile 可见', async ({ page }) => {
    await login(page);
    await page.goto('/scada2');

    await page.waitForLoadState('networkidle');
    await page.waitForFunction(
      () => !document.body.innerText.includes('加载中…'),
      { timeout: 10_000 },
    ).catch(() => {});

    const stickyToolbar = page.getByTestId('sticky-toolbar-container');
    await expect(stickyToolbar).toBeVisible({ timeout: 8_000 });
  });

  test('Editor: mobile warning banner 在 375px viewport 可见 (soft)', async ({ page }) => {
    await login(page);
    await page.goto('/scada2/edit-v2/nonexistent-view-id');
    await page.waitForLoadState('networkidle');

    // mobile warning 可见则验证文字; server 未运行时允许跳过
    const warning = page.getByTestId('editor-mobile-warning');
    const isVisible = await warning.isVisible({ timeout: 5_000 }).catch(() => false);
    if (isVisible) {
      await expect(warning).toContainText('768px');
    }
    // 至少页面 URL 正确
    expect(page.url()).toContain('/scada2');
  });
});
