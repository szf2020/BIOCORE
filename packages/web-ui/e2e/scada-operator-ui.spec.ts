// SP-FX-15: Operator UI 嵌 runtime — SuggestionsBar E2E
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

async function ensureProject(request: APIRequestContext, token: string): Promise<void> {
  await request.post(`${API_BASE}/api/v1/scada/projects`, {
    data: { project_id: 'default', name: 'Default' },
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function seedView(request: APIRequestContext, token: string): Promise<string> {
  const viewId = `v_opui_${Date.now()}`;
  const r = await request.post(`${API_BASE}/api/v1/scada/projects/default/views`, {
    data: { view_id: viewId, name: `OperatorUI E2E ${Date.now()}` },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

async function seedSuggestion(
  request: APIRequestContext,
  token: string,
  viewId: string,
): Promise<number> {
  const r = await request.post(`${API_BASE}/api/v1/scada/write-intents`, {
    data: {
      tag: 'e2e_tag',
      value: 42,
      reason: 'E2E operator-ui test',
      view_id: viewId,
      widget_id: 'w_e2e',
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) return -1;
  const body = await r.json();
  return body.suggestion_id ?? body.data?.suggestion_id ?? -1;
}

async function login(page: import('@playwright/test').Page) {
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

test.describe('SP-FX-15: Operator UI — SuggestionsBar in runtime', () => {
  let token: string;
  let viewId: string;
  let suggestionId: number;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureProject(request, token);
    viewId = await seedView(request, token);
    suggestionId = await seedSuggestion(request, token, viewId);
  });

  test('SuggestionsBar visible → accept → suggestion removed', async ({ page }) => {
    if (suggestionId === -1) {
      test.skip(true, 'suggestion seed skipped — server may not support write-intents');
      return;
    }

    // Stub accept endpoint
    await page.route(`**/api/v1/ai/suggestions/${suggestionId}/accept`, (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) }),
    );

    // Stub suggestions list: first call returns our suggestion, subsequent calls return []
    let callCount = 0;
    await page.route('**/api/v1/ai/suggestions*', (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 200,
          body: JSON.stringify([
            {
              id: suggestionId,
              batch_id: 'b_e2e',
              suggestion_type: 'setpoint',
              source_module: 'scada',
              target_param: 'e2e_tag',
              current_value: null,
              suggested_value: 42,
              confidence: 0.9,
              reasoning: JSON.stringify({ view_id: viewId, widget_id: 'w_e2e', reason: 'E2E operator-ui test', value: 42 }),
              status: 'pending',
              created_at: new Date().toISOString(),
              expires_at: null,
              decided_by: null,
              decided_at: null,
            },
          ]),
        });
      } else {
        route.fulfill({ status: 200, body: JSON.stringify([]) });
      }
    });

    await login(page);
    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);

    // SuggestionsBar container visible
    await expect(page.getByTestId('suggestions-bar')).toBeVisible({ timeout: 15_000 });

    // e2e_tag visible in bar
    await expect(page.locator('text=e2e_tag')).toBeVisible({ timeout: 8_000 });

    // Click accept
    const acceptBtn = page.getByTestId(`accept-${suggestionId}`);
    await expect(acceptBtn).toBeVisible({ timeout: 5_000 });
    await acceptBtn.click();

    // Suggestion removed from list (乐观 remove)
    await expect(page.locator('text=e2e_tag')).not.toBeVisible({ timeout: 5_000 });
  });
});
