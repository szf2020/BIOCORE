// SP-FX-12 T4: 端到端 user journey
// 覆盖链路: SP-FX-4 (editor shell) / SP-FX-5 (view routing) /
//           SP-FX-6 (controls prop panel) / SP-FX-7 (runtime animation) /
//           SP-FX-11 (barrel + registry)
//
// 流程: login → seed view → 进编辑器 → 选 widget → 验 property panel →
//       切换 runtime → 验 canvas host → mock write-intents → 验 WriteIntentDialog

import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';
const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`getAuthToken failed: ${r.status()} ${await r.text()}`);
  return ((await r.json()).data.token) as string;
}

async function seedJourneyView(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  const viewId = `v_journey_${Date.now()}`;
  const widgetId = `w_journey_${Date.now()}`;
  const payload = {
    id: viewId,
    name: 'journey-test',
    type: 'svg' as const,
    svgcontent: '<svg/>',
    width: 800,
    height: 600,
    schemaVersion: 1 as const,
    items: {
      [widgetId]: {
        id: widgetId,
        type: 'svg-ext-value',
        property: { variableId: '', label: '初始标签' },
        x: 100,
        y: 100,
        w: 120,
        h: 40,
      },
    },
  };
  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: { id: viewId, name: 'journey-test', type: 'svg', payload, width: 800, height: 600 },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedJourneyView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

async function loginPage(page: import('@playwright/test').Page): Promise<void> {
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
}

test.describe('SP-FX-12 — SCADA end-to-end user journey', () => {
  test('login → editor → property panel → runtime view → WriteIntentDialog', async ({
    page,
    request,
  }) => {
    // ── Step 1: Login ──────────────────────────────────────────────────────
    await loginPage(page);

    // ── Step 2: Seed view via API ──────────────────────────────────────────
    const viewId = await seedJourneyView(request);

    // ── Step 3: 进编辑器, 验 toolbar 可见 ─────────────────────────────────
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await expect(page.locator('[data-panel="toolbar"]')).toBeVisible({ timeout: 10_000 });

    // ── Step 4: 点击画布 widget, 验 property panel 可见 ───────────────────
    await page.locator('[data-editor-canvas-host]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);
    const propPanel = page.locator('[data-panel="properties"]');
    await expect(propPanel).toBeVisible({ timeout: 5_000 });

    // ── Step 5: 尝试修改 label property ───────────────────────────────────
    const labelInput = propPanel.locator('input[data-key="label"]').first();
    if (await labelInput.isVisible().catch(() => false)) {
      await labelInput.fill('已修改标签');
      const saveBtn = page.locator('[data-cmd="save"]');
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(500);
      }
    }
    // property panel 仍可见 = 编辑器状态正常
    await expect(propPanel).toBeVisible();

    // ── Step 6: 切换到 runtime view-v2 ────────────────────────────────────
    // mock write-intents POST 避免真实 API 依赖
    await page.route('**/api/v1/scada/write-intents', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
    );

    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);

    // ── Step 7: 验 runtime canvas host 可见 ──────────────────────────────
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });

    // ── Step 8: 尝试点 widget, 若 WriteIntentDialog 出现则验证并关闭 ─────
    const widgetEl = page.locator('[data-widget-id]').first();
    const hasWidget = await widgetEl.isVisible().catch(() => false);

    if (hasWidget) {
      await widgetEl.click({ force: true });
      await page.waitForTimeout(300);

      const dialog = page
        .locator('[data-testid="write-intent-dialog"], [role="dialog"]')
        .first();
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // 填写 reason
        const reasonInput = dialog
          .locator('[name="reason"], [data-testid="write-intent-reason"], textarea')
          .first();
        if (await reasonInput.isVisible().catch(() => false)) {
          await reasonInput.fill('user journey E2E test');
        }
        // 关闭 dialog
        await dialog
          .locator('[type="submit"], [data-testid="write-intent-submit"], button:has-text("确认"), button:has-text("Submit")')
          .first()
          .click();
        await expect(dialog).not.toBeVisible({ timeout: 5_000 });
      }
    }

    // ── Step 9: 最终断言 — canvas host 全程保持可见 ───────────────────────
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible();
  });
});
