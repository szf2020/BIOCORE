// ============================================================
// scada-audit-log.spec.ts — SP-FX-19 审计日志页 E2E
// ============================================================

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

test.describe('审计日志页 (SP-FX-19)', () => {
  test('admin 登录后可访问审计日志页并看到表格', async ({ page }) => {
    await login(page);
    await page.goto('/scada2/audit-log');
    // 标题可见
    await expect(page.getByRole('heading', { name: /审计日志/i })).toBeVisible({ timeout: 10_000 });
    // 表格存在 (table 元素)
    await expect(page.locator('table')).toBeVisible({ timeout: 5_000 });
    // 过滤器 input 存在
    await expect(page.locator('input[placeholder*="用户"]')).toBeVisible();
  });
});
