// SP-FX-21: ViewList filter/search/sort E2E
// Flow: login → /scada2 → seed 2 views (demo_/prod_) → search → verify URL q= → change sort → verify URL sort=

import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';
const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ((await r.json()).data.token) as string;
}

async function ensureProject(request: APIRequestContext, token: string): Promise<void> {
  await request.post(`${API_BASE}/api/v1/scada/projects`, {
    data: { project_id: 'default', name: 'Default' },
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function seedFilterViews(request: APIRequestContext): Promise<void> {
  const token = await getAuthToken(request);
  await ensureProject(request, token);
  const ts = Date.now();
  for (const [suffix, prefix] of [['alpha', 'demo'], ['beta', 'prod']]) {
    const viewId = `v_filter_${prefix}_${ts}`;
    const r = await request.post(`${API_BASE}/api/v1/scada/projects/default/views`, {
      data: { view_id: viewId, name: `${prefix}_${suffix}_${ts}` },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok()) {
      const text = await r.text();
      throw new Error(`seedFilterViews failed: ${r.status()} ${text}`);
    }
  }
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SCADA ViewList filter/search/sort (SP-FX-21)', () => {
  test('search input updates URL q param; sort select updates URL sort param', async ({ page, request }) => {
    await seedFilterViews(request);
    await login(page);
    await page.goto('/scada2');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.body.innerText.includes('加载中…'), { timeout: 10_000 }).catch(() => {});

    // Verify SearchBar is visible
    const searchBar = page.getByTestId('view-search-bar');
    await expect(searchBar).toBeVisible({ timeout: 8_000 });

    // Type in search input
    const searchInput = page.getByTestId('view-search-input');
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill('demo');

    // Wait for URL to contain q=demo
    await page.waitForURL((url) => url.searchParams.get('q') === 'demo', { timeout: 5_000 });
    expect(page.url()).toContain('q=demo');

    // Change sort to name_desc
    const sortSelect = page.getByTestId('view-sort-select');
    await expect(sortSelect).toBeVisible({ timeout: 5_000 });
    await sortSelect.selectOption('name_desc');

    // Wait for URL to contain sort=name_desc
    await page.waitForURL((url) => url.searchParams.get('sort') === 'name_desc', { timeout: 5_000 });
    expect(page.url()).toContain('sort=name_desc');
  });
});
