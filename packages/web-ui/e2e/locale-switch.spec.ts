// SP-FX-26 T10: locale 切换 e2e 测试
// 验证: LocaleSwitcher 切换 zh→en, URL ?lang=en, 刷新后持久化
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

test.describe('locale switch (SP-FX-26)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear locale preference
    await page.goto('/login');
    await page.evaluate(() => localStorage.removeItem('biocore.locale'));
    await login(page);
  });

  test('default locale is zh — UI shows Chinese', async ({ page }) => {
    await page.goto('/dashboard');
    // LocaleSwitcher: zh button should be aria-pressed=true
    const zhBtn = page.getByRole('button', { name: /中文/i });
    await expect(zhBtn).toBeVisible();
    await expect(zhBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking EN switches to English UI and updates URL', async ({ page }) => {
    await page.goto('/dashboard');
    const enBtn = page.getByRole('button', { name: /EN/i });
    await enBtn.click();
    // URL should contain ?lang=en
    await expect(page).toHaveURL(/lang=en/);
    // EN button should be active
    await expect(enBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('reload after EN switch persists English locale', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /EN/i }).click();
    await page.waitForURL(/lang=en/);
    // Reload page
    await page.reload();
    const enBtn = page.getByRole('button', { name: /EN/i });
    await expect(enBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
