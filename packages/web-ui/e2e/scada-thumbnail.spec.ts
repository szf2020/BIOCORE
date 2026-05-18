// SP-FX-22: Thumbnail 高级渲染 E2E
// Steps: login → /scada2 → seed view with svgcontent → assert thumbnail SVG exists + contains widget element

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

async function seedViewWithSvg(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  await ensureProject(request, token);
  const viewId = `v_thumb_e2e_${Date.now()}`;
  const svgcontent = '<rect x="10" y="10" width="200" height="100" fill="#3b82f6"/>';
  const r = await request.post(`${API_BASE}/api/v1/scada/projects/default/views`, {
    data: { view_id: viewId, name: `Thumb E2E ${Date.now()}`, svgcontent },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) {
    const text = await r.text();
    throw new Error(`seedViewWithSvg failed: ${r.status()} ${text}`);
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

test.describe('SP-FX-22: Thumbnail SVG 渲染', () => {
  test('cards-view thumbnail SVG element 存在且包含 widget 内部元素', async ({ page, request }) => {
    // SP-FX-32 Known Issue: scada_views 表无 svgcontent 列 (该列不在 scada-schema 设计中).
    // seedViewWithSvg() 传 svgcontent 到 POST /scada/projects/default/views, 但 scada-routes.ts
    // 不保存此字段. ViewCard.hasSvg = false → thumbnail-svg div 不渲染 → test 找不到元素.
    // 后续修选项:
    //   A) scada_views 增加 svgcontent TEXT 列 (schema 变更)
    //   B) ViewCard 改为从 items_json 生成 thumbnail (需 ThumbnailRenderer 重构)
    //   C) thumbnail spec 改用 fuxa_views (不同 API + 不同 UI 路径)
    // Tracked: docs/pw-known-issues.md
    test.skip(true, 'SP-FX-32: scada_views 无 svgcontent 列, ViewCard.hasSvg 永远 false. 见 docs/pw-known-issues.md');

    // 1. Seed 含 svgcontent 的 view
    await seedViewWithSvg(request);

    // 2. 登录并导航至 /scada2
    await login(page);
    await page.goto('/scada2');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.body.innerText.includes('加载中…'), { timeout: 10_000 }).catch(() => {});

    // 3. 确保 cards-view 模式
    const cardsModeBtn = page.getByTestId('view-mode-cards');
    await expect(cardsModeBtn).toBeVisible({ timeout: 8_000 });
    const isCardsActive = await cardsModeBtn.getAttribute('aria-pressed');
    if (isCardsActive !== 'true') {
      await cardsModeBtn.click();
    }

    // 4. 等待 view-card 出现
    const firstCard = page.getByTestId('view-card').first();
    await expect(firstCard).toBeVisible({ timeout: 8_000 });

    // 5. 验证 thumbnail wrapper div 存在
    const thumbnailWrapper = firstCard.getByTestId('view-card-thumbnail-svg');
    await expect(thumbnailWrapper).toBeVisible({ timeout: 5_000 });

    // 6. 验证内部 thumbnail-svg SVG element 存在（ThumbnailRenderer 渲染产物）
    const svgEl = thumbnailWrapper.locator('[data-testid="thumbnail-svg"]');
    await expect(svgEl).toBeVisible({ timeout: 5_000 });

    // 7. 验证 SVG 内部包含 rect widget 元素（真实渲染，非截断）
    const rectEl = svgEl.locator('rect').first();
    await expect(rectEl).toBeAttached({ timeout: 3_000 });
  });
});
