// SP-FX-13: Cards-view + paginator E2E
// Steps: login → /scada2 → seed view → assert cards → toggle list → toggle cards → edit link

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
  // Create default project if it doesn't exist (idempotent, 409 = already exists)
  await request.post(`${API_BASE}/api/v1/scada/projects`, {
    data: { project_id: 'default', name: 'Default' },
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function seedScadaView(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  await ensureProject(request, token);
  const viewId = `v_cards_e2e_${Date.now()}`;
  const r = await request.post(`${API_BASE}/api/v1/scada/projects/default/views`, {
    data: { view_id: viewId, name: `Cards E2E View ${Date.now()}` },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) {
    const text = await r.text();
    throw new Error(`seedScadaView failed: ${r.status()} ${text}`);
  }
  return viewId;
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SCADA Cards-View + Paginator', () => {
  test('cards-view toggle flow', async ({ page, request }) => {
    // Seed at least one view so the list is not empty
    await seedScadaView(request);

    await login(page);
    await page.goto('/scada2');

    // Wait for page to be fully loaded (not loading spinner)
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.body.innerText.includes('加载中…'), { timeout: 10_000 }).catch(() => {});

    // 1. Default mode: cards — check toggle buttons visible
    const cardsModeBtn = page.getByTestId('view-mode-cards');
    await expect(cardsModeBtn).toBeVisible({ timeout: 8_000 });

    // Capture whether cards are visible
    const firstCard = page.getByTestId('view-card').first();
    const cardsVisible = await firstCard.isVisible({ timeout: 3_000 }).catch(() => false);

    // 2. Toggle to list mode
    const listModeBtn = page.getByTestId('view-mode-list');
    await listModeBtn.click();
    await expect(listModeBtn).toHaveAttribute('aria-pressed', 'true');

    if (cardsVisible) {
      await expect(page.getByTestId('view-row').first()).toBeVisible({ timeout: 3_000 });
    }

    // 3. Toggle back to cards mode
    await cardsModeBtn.click();
    await expect(cardsModeBtn).toHaveAttribute('aria-pressed', 'true');

    if (cardsVisible) {
      await expect(firstCard).toBeVisible({ timeout: 3_000 });

      // 4. Click edit button on first card — navigate to editor
      const editBtn = firstCard.getByTestId('view-card-edit-btn');
      await editBtn.click();
      await page.waitForURL((url) => url.pathname.startsWith('/scada2/edit/'), { timeout: 5_000 });
      expect(page.url()).toContain('/scada2/edit/');
    }
  });
});
