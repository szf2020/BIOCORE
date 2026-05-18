// SP-FX-18: Performance soak test — 1000 widget view, 1 minute runtime.
//
// 测试目标:
//   1. 初始渲染时间 < 5s
//   2. 平均 FPS ≥ 30 (rAF 1 分钟)
//   3. 内存增长 < 50MB (performance.memory, Chrome only)
//   4. 无 unhandled console error
//   5. canvas mount 验证 (children > 0)
//
// seedView: 1000 × svg-ext-value widget, grid 50col×20row, canvas 4000×1000px
//
// 运行: pnpm playwright test --project=soak (需要 dev server)
// NOTE: dev server 不在 CI 中启动时此 spec 为 committed-only pattern (SP-FX-12).

import { test, expect, type APIRequestContext } from '@playwright/test';

// ─── 配置 ────────────────────────────────────────────────────────────────────

const ADMIN_USER = process.env.E2E_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_PASS ?? 'admin123';
const API_BASE   = process.env.E2E_API_URL ?? 'http://localhost:3001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

/** soak 持续时间 (ms)。生产应 ≥ 3_600_000，CI 用 60s 验证 leak 趋势。 */
const SOAK_DURATION_MS = 60_000;

/** seedView widget 数量 */
const WIDGET_COUNT = 1000;

// Grid: 50 列 × 20 行
const COLS = 50;
const WIDGET_W = 80;
const WIDGET_H = 50;
const CANVAS_W = COLS * WIDGET_W;                              // 4000px
const CANVAS_H = Math.ceil(WIDGET_COUNT / COLS) * WIDGET_H;   // 1000px

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`auth/login failed: ${r.status()}`);
  return (await r.json()).data.token as string;
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

/**
 * 创建含 WIDGET_COUNT 个 svg-ext-value widget 的 soak view.
 * Grid 布局: 50 列 × 20 行, 每格 80×50px.
 */
async function seedSoakView(request: APIRequestContext): Promise<string> {
  const token = await getAuthToken(request);
  const viewId = `v_soak_${Date.now()}`;

  const items: Record<string, {
    id: string;
    type: string;
    property: { variableId: string; label: string };
    x: number;
    y: number;
    w: number;
    h: number;
  }> = {};

  for (let i = 0; i < WIDGET_COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const wId = `w_soak_${i}`;
    items[wId] = {
      id: wId,
      type: 'svg-ext-value',
      property: { variableId: '', label: `W${i}` },
      x: col * WIDGET_W,
      y: row * WIDGET_H,
      w: WIDGET_W,
      h: WIDGET_H,
    };
  }

  const payload = {
    id: viewId,
    name: 'sp-fx-18-soak',
    type: 'svg' as const,
    svgcontent: '<svg/>',
    width: CANVAS_W,
    height: CANVAS_H,
    schemaVersion: 1 as const,
    items,
  };

  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: {
      id: viewId,
      name: 'sp-fx-18-soak',
      type: 'svg',
      payload,
      width: CANVAS_W,
      height: CANVAS_H,
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!r.ok()) {
    throw new Error(`seedSoakView failed: ${r.status()} ${await r.text()}`);
  }
  return viewId;
}

// ─── Soak Test ────────────────────────────────────────────────────────────────

test.describe('SP-FX-18 — Performance soak: 1000 widget / 1min', () => {
  test('soak: render<5s, FPS≥30, mem<50MB, 0 errors, canvas mounted', async ({
    page,
    request,
  }, testInfo) => {
    // SP-FX-32: soak test 仅在 --project=soak 下运行 (需要 90s timeout).
    // chromium project 默认 30s, 会在 page.evaluate FPS 测量时超时.
    // 运行命令: pnpm playwright test --project=soak
    test.skip(testInfo.project.name !== 'soak', 'soak test 仅在 --project=soak 运行 (需 90s timeout); 用 chromium project 时自动跳过');

    // 全程收集 console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // 登录
    await login(page);

    // 创建 1000-widget soak view
    const viewId = await seedSoakView(request);

    // 测量初始渲染时间
    const t0 = Date.now();
    await page.goto(`/scada2/view-v2/${viewId}?reactor=${REACTOR_ID}`);
    await page.waitForSelector('[data-runtime-canvas-host]', { timeout: 15_000 });
    const renderTimeMs = Date.now() - t0;

    console.log(`[SP-FX-18] 初始渲染时间: ${renderTimeMs}ms`);

    // 内存基线 (soak 开始前)
    const memBeforeBytes = await page.evaluate(
      () =>
        (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? 0,
    );

    // FPS 测量: rAF loop 持续 SOAK_DURATION_MS 毫秒
    const avgFPS = await page.evaluate((durationMs: number) => {
      return new Promise<number>((resolve) => {
        let frames = 0;
        const startTime = performance.now();

        function tick(now: DOMHighResTimeStamp): void {
          frames += 1;
          if (now - startTime >= durationMs) {
            const elapsedSec = (now - startTime) / 1000;
            resolve(frames / elapsedSec);
            return;
          }
          requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      });
    }, SOAK_DURATION_MS);

    console.log(`[SP-FX-18] 平均 FPS: ${avgFPS.toFixed(1)}`);

    // 内存读取 (soak 结束后)
    const memAfterBytes = await page.evaluate(
      () =>
        (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? 0,
    );
    const memGrowthMB = (memAfterBytes - memBeforeBytes) / 1024 / 1024;

    console.log(
      `[SP-FX-18] 内存: ` +
        `开始=${(memBeforeBytes / 1024 / 1024).toFixed(1)}MB ` +
        `结束=${(memAfterBytes / 1024 / 1024).toFixed(1)}MB ` +
        `增长=${memGrowthMB.toFixed(1)}MB`,
    );

    // Canvas mount 验证
    const canvasChildCount = await page.evaluate(() => {
      const host = document.querySelector('[data-runtime-canvas-host]');
      return host ? host.querySelectorAll('*').length : 0;
    });

    console.log(`[SP-FX-18] Canvas children: ${canvasChildCount}`);

    // Console error 过滤: 排除 MOCK_PLC 已知噪音
    const unhandledErrors = consoleErrors.filter(
      (e) => !e.includes('Warning:') && !e.includes('404 (Not Found)'),
    );

    if (unhandledErrors.length > 0) {
      console.warn('[SP-FX-18] Unhandled errors:', unhandledErrors);
    }

    // ─── Assertions ───────────────────────────────────────────────────────────

    // 1. 渲染时间
    if (renderTimeMs >= 5_000) {
      console.warn(`[SP-FX-18] KNOWN REGRESSION: 渲染时间 ${renderTimeMs}ms ≥ 5000ms`);
    }
    expect(renderTimeMs, `初始渲染时间应 < 5000ms，实际 ${renderTimeMs}ms`).toBeLessThan(5_000);

    // 2. FPS
    if (avgFPS < 30) {
      console.warn(`[SP-FX-18] KNOWN REGRESSION: FPS ${avgFPS.toFixed(1)} < 30`);
    }
    expect(avgFPS, `平均 FPS 应 ≥ 30，实际 ${avgFPS.toFixed(1)}`).toBeGreaterThanOrEqual(30);

    // 3. 内存增长 (memBeforeBytes=0 表示 API 不支持，跳过)
    if (memBeforeBytes > 0) {
      if (memGrowthMB >= 50) {
        console.warn(`[SP-FX-18] KNOWN REGRESSION: 内存增长 ${memGrowthMB.toFixed(1)}MB ≥ 50MB`);
      }
      expect(memGrowthMB, `内存增长应 < 50MB，实际 ${memGrowthMB.toFixed(1)}MB`).toBeLessThan(50);
    } else {
      console.log('[SP-FX-18] performance.memory 不可用 (非 Chrome)，跳过内存断言');
    }

    // 4. Canvas 有子元素
    expect(canvasChildCount, 'canvas-host 应有子元素 (widgets mounted)').toBeGreaterThan(0);

    // 5. Canvas host 可见
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible();

    // 6. 无 unhandled console error
    expect(
      unhandledErrors,
      `应无 unhandled console error，实际: ${JSON.stringify(unhandledErrors)}`,
    ).toHaveLength(0);
  });
});
