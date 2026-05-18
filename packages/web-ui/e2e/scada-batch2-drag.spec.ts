// SP-FX-27: Batch 2 widget palette drag E2E — 5 widgets.
// 每个 batch 2 widget 一个测试:
//   1. login → seed empty view → /scada2/edit-v2/<viewId>
//   2. 通过 React fiber 注入模拟 palette-gauge drag 到 canvas
//   3. 验 widget 加入 canvas (data-widget-id exists)
//   4. 验 widget 渲染正确子元素 (circle/rect/foreignObject)
//   5. 切 /scada2/view-v2/<viewId> 验 runtime canvas-host visible
//
// NOTE: dev server 未在 CI 中启动，spec commit 遵循 SP-FX-11 T12 pattern.
// Tests 在 E2E env (playwright + dev server) 可用时执行.

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';
const API_BASE = process.env.E2E_API_URL || 'http://localhost:3001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

async function login(page: Page): Promise<void> {
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

async function seedEmptyView(request: APIRequestContext, label: string): Promise<string> {
  const token = await getAuthToken(request);
  const viewId = `v_sp27_${label}_${Date.now()}`;
  const payload = {
    id: viewId,
    name: `sp27-${label}`,
    type: 'svg' as const,
    svgcontent: '<svg/>',
    width: 800,
    height: 600,
    schemaVersion: 1 as const,
    items: {},
  };
  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: {
      id: viewId,
      name: `sp27-${label}`,
      type: 'svg',
      payload,
      width: 800,
      height: 600,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedEmptyView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

// 通过 React fiber 注入 palette-gauge drag 事件（绕过 dataTransfer 限制）.
async function dropGaugeItem(page: Page, widgetType: string): Promise<void> {
  const canvasBox = await page.locator('[data-editor-canvas-host]').boundingBox();
  if (!canvasBox) throw new Error('canvas host bbox unavailable');
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;

  await page.evaluate(
    ({ type, cx: x, cy: y }) => {
      const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement | null;
      if (!host) throw new Error('canvas host not found');
      const fiberKey = Object.keys(host).find((k) => k.startsWith('__reactFiber'));
      if (!fiberKey) throw new Error('React fiber not found on canvas host');
      let fiber = (host as any)[fiberKey];
      let onDrop: ((e: any) => void) | null = null;
      for (let i = 0; i < 10 && fiber; i++) {
        if (fiber.pendingProps?.onDrop) { onDrop = fiber.pendingProps.onDrop; break; }
        if (fiber.memoizedProps?.onDrop) { onDrop = fiber.memoizedProps.onDrop; break; }
        fiber = fiber.return || fiber.child;
      }
      if (!onDrop) throw new Error('onDrop not found in React fiber');
      const dt = new DataTransfer();
      dt.setData('palette-gauge', type);
      onDrop({
        preventDefault: () => {},
        dataTransfer: dt,
        currentTarget: host,
        clientX: x,
        clientY: y,
      });
    },
    { type: widgetType, cx, cy },
  );
  await page.waitForTimeout(200);
}

test.describe('SP-FX-27 — batch 2 widget palette drag E2E', () => {
  // --- gauge_semaphore ---
  test('semaphore: drag to canvas → circle[data-widget-id] → runtime visible', async ({
    page,
    request,
  }) => {
    await login(page);
    const viewId = await seedEmptyView(request, 'semaphore');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    // 验 palette gauge 项存在
    await expect(
      page.locator('[data-palette-gauge="svg-ext-gauge_semaphore"]'),
    ).toBeVisible({ timeout: 5_000 });

    // 拖拽到 canvas
    await dropGaugeItem(page, 'svg-ext-gauge_semaphore');

    // 验 widget-id 出现
    await expect(page.locator('[data-widget-id]').first()).toBeVisible({ timeout: 5_000 });

    // 验 semaphore 渲染 circle 子元素
    const circleCount = await page.locator('circle[data-widget-id]').count();
    expect(circleCount).toBeGreaterThanOrEqual(1);

    // 切 runtime view
    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });
  });

  // --- gauge_progress ---
  test('progress: drag to canvas → rect[data-widget-id] → runtime visible', async ({
    page,
    request,
  }) => {
    await login(page);
    const viewId = await seedEmptyView(request, 'progress');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await expect(
      page.locator('[data-palette-gauge="svg-ext-gauge_progress"]'),
    ).toBeVisible({ timeout: 5_000 });

    await dropGaugeItem(page, 'svg-ext-gauge_progress');

    await expect(page.locator('[data-widget-id]').first()).toBeVisible({ timeout: 5_000 });

    // 验 progress 渲染 rect 背景
    const rectCount = await page.locator('rect[data-widget-id]').count();
    expect(rectCount).toBeGreaterThanOrEqual(1);

    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });
  });

  // --- html_switch ---
  test('switch: drag to canvas → foreignObject[data-widget-id] → runtime visible', async ({
    page,
    request,
  }) => {
    await login(page);
    const viewId = await seedEmptyView(request, 'switch');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await expect(
      page.locator('[data-palette-gauge="svg-ext-html_switch"]'),
    ).toBeVisible({ timeout: 5_000 });

    await dropGaugeItem(page, 'svg-ext-html_switch');

    await expect(page.locator('[data-widget-id]').first()).toBeVisible({ timeout: 5_000 });

    // 验 switch 渲染 foreignObject
    const foCount = await page.locator('foreignObject[data-widget-id]').count();
    expect(foCount).toBeGreaterThanOrEqual(1);

    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });
  });

  // --- html_slider ---
  test('slider: drag to canvas → foreignObject[data-widget-id] → runtime visible', async ({
    page,
    request,
  }) => {
    await login(page);
    const viewId = await seedEmptyView(request, 'slider');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await expect(
      page.locator('[data-palette-gauge="svg-ext-html_slider"]'),
    ).toBeVisible({ timeout: 5_000 });

    await dropGaugeItem(page, 'svg-ext-html_slider');

    await expect(page.locator('[data-widget-id]').first()).toBeVisible({ timeout: 5_000 });

    // 验 slider 渲染 foreignObject
    const foCount = await page.locator('foreignObject[data-widget-id]').count();
    expect(foCount).toBeGreaterThanOrEqual(1);

    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });
  });

  // --- pipe ---
  test('pipe: drag to canvas → rect[data-widget-id] → runtime visible', async ({
    page,
    request,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await login(page);
    const viewId = await seedEmptyView(request, 'pipe');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await expect(
      page.locator('[data-palette-gauge="svg-ext-pipe"]'),
    ).toBeVisible({ timeout: 5_000 });

    await dropGaugeItem(page, 'svg-ext-pipe');

    await expect(page.locator('[data-widget-id]').first()).toBeVisible({ timeout: 5_000 });

    // 验 pipe 渲染 rect 背景
    const rectCount = await page.locator('rect[data-widget-id]').count();
    expect(rectCount).toBeGreaterThanOrEqual(1);

    // runtime view 验证
    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });

    // 过滤 mock 环境已知噪音
    const unhandled = consoleErrors.filter(
      (e) => !e.includes('Warning:') && !e.includes('404 (Not Found)'),
    );
    expect(unhandled).toHaveLength(0);
  });
});
