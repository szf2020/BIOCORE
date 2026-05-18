import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';
const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ((await r.json()).data.token) as string;
}

async function seedRuntimeView(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  // SP-FX-12 T2: 动态 seed view 避免依赖不存在的 'test-view-001'
  const viewId = `v_runtime_${Date.now()}`;
  const widgetId = `w_${Date.now()}`;
  const payload = {
    id: viewId,
    name: 'runtime-smoke',
    type: 'svg' as const,
    svgcontent: '<svg/>',
    width: 800,
    height: 600,
    schemaVersion: 1 as const,
    items: {
      [widgetId]: {
        id: widgetId,
        type: 'svg-ext-value',
        property: { variableId: '', label: '温度' },
        x: 100,
        y: 100,
        w: 120,
        h: 40,
      },
    },
  };
  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: { id: viewId, name: 'runtime-smoke', type: 'svg', payload, width: 800, height: 600 },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedRuntimeView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

test.describe('SCADA Runtime view-v2', () => {
  // SP-FX-12 T2: 动态创建 view，不依赖不存在的 'test-view-001'
  let dynamicViewId: string;

  test.beforeAll(async ({ request }) => {
    dynamicViewId = await seedRuntimeView(request);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    const isLoggedIn = await page
      .locator('[data-testid="user-menu"]')
      .isVisible()
      .catch(() => false);
    if (!isLoggedIn) {
      await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
      await page.locator('input[type="password"]').fill(ADMIN_PASS);
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

    await page.goto(`/scada2/view-v2/${dynamicViewId}?reactor=${REACTOR_ID}`);
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

    await page.goto(`/scada2/view-v2/${dynamicViewId}?reactor=${REACTOR_ID}`);
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
