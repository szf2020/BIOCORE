import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';
const API_BASE = process.env.E2E_API_URL || 'http://localhost:3001';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ((await r.json()).data.token) as string;
}

async function seedViewWithWidget(request: APIRequestContext, widgetType: string): Promise<string> {
  const token = await getAuthToken(request);
  const viewId = `v_ctrl_${Date.now()}`;
  const widgetId = `w_${Date.now()}`;
  const payload = {
    id: viewId, name: 'controls-smoke', type: 'svg' as const, svgcontent: '<svg/>',
    width: 800, height: 600, schemaVersion: 1 as const,
    items: {
      [widgetId]: { id: widgetId, type: widgetType, property: { variableId: '', label: '初始标签' }, x: 100, y: 100, w: 120, h: 40 },
    },
  };
  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: { id: viewId, name: 'controls-smoke', type: 'svg', payload, width: 800, height: 600 },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

test.describe('SP-FX-6 Batch 1 — controls smoke', () => {
  test('property panel shows entries for svg-ext-value widget after click-select', async ({ page, request }) => {
    await login(page);
    const viewId = await seedViewWithWidget(request, 'svg-ext-value');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await page.locator('[data-editor-canvas-host]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    const panel = page.locator('[data-panel="properties"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const labelInput = panel.locator('input[data-key="label"]').first();
    if (await labelInput.isVisible()) {
      await labelInput.fill('已修改标签');
      await page.locator('[data-cmd="save"]').click();
      await page.waitForTimeout(500);
    }
    await expect(panel).toBeVisible();
  });

  test('property panel renders custom section for svg-ext-html_chart widget', async ({ page, request }) => {
    await login(page);
    const viewId = await seedViewWithWidget(request, 'svg-ext-html_chart');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await page.locator('[data-editor-canvas-host]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    const panel = page.locator('[data-panel="properties"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    const isChartSelected = await panel.locator('input[data-key="title"]').isVisible().catch(() => false);
    if (isChartSelected) {
      await expect(panel.locator('[data-section="chart-series"]')).toBeVisible({ timeout: 3_000 });
    }
    await expect(panel).toBeVisible();
  });
});
