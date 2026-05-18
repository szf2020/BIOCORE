# SP-FX-18 性能 Soak Test — 设计规格

**Sprint**: SP-FX-18  
**日期**: 2026-05-18  
**作者**: SP-FX-18 自治 agent  
**状态**: 草稿

---

## 1. 目标

验证 BIOCore SCADA2 runtime 在 1000 个 widget 高密度视图下：
- 初始渲染时间 < 5s
- 平均 FPS ≥ 30（持续 1 分钟）
- 内存增长 < 50MB（1 分钟内）
- 无 unhandled console error
- 所有注册的 widget 类型均可正确 mount

---

## 2. 范围

**仅新增**:
- `packages/web-ui/e2e/scada-soak.spec.ts` — PW soak test spec
- `packages/web-ui/playwright.config.ts` — 新增 `soak` project（timeout 90s）

**不触碰**: 任何 production 代码 / widgets / server / RuntimeCanvas

---

## 3. Soak 视图设计

### 3.1 seedView 策略

使用 `svg-ext-value`（Batch 1 value widget）重复 1000 次：
- 简化依赖：不需要外部资源（iframe/image/graph）
- 最真实地测试 gauge mount/unmount 循环
- Grid 布局：50 列 × 20 行，每格 80×50px，总 canvas 4000×1000px

### 3.2 20 个 widget 类型（全库参考）

| 批次 | 类型 |
|------|------|
| Batch1 | `svg-ext-value`, `svg-ext-html_button`, `svg-ext-html_input`, `svg-ext-html_chart`, `svg-ext-own_ctrl-table` |
| Batch2 | `svg-ext-gauge_semaphore`, `svg-ext-gauge_progress`, `svg-ext-html_switch`, `svg-ext-html_slider`, `svg-ext-pipe` |
| Batch3 | `svg-ext-html_bag`, `svg-ext-html_graph`, `svg-ext-tank`, `svg-ext-motor`, `svg-ext-html_img` |
| Batch4 | `svg-ext-html_iframe`, `svg-ext-compressor`, `svg-ext-valve`, `svg-ext-pump`, `svg-ext-html_select` |

### 3.3 简化策略

soak spec 使用纯 `svg-ext-value` 重复 1000 个（不随机分配所有 20 类型）原因：
- `html_iframe` / `html_chart` / `html_graph` 依赖外部数据，随机组合会引入大量 404 噪音
- soak 目标是内存/FPS 稳定性，不是全类型覆盖（SP-FX-11 已覆盖 4 batches）
- 1000 × value widget = 最纯净的 GaugeBase lifecycle 压力测试

---

## 4. 性能测量方案

### 4.1 初始渲染时间

```ts
const t0 = Date.now();
// navigate → waitForSelector('[data-runtime-canvas-host]')
const renderTime = Date.now() - t0;
assert(renderTime < 5000);
```

### 4.2 FPS 测量（rAF delta）

在 page.evaluate 中注入 FPS 采集器，持续 60 秒，返回平均帧率：

```ts
const fps = await page.evaluate(() => {
  return new Promise<number>((resolve) => {
    let frames = 0;
    const start = performance.now();
    const DURATION = 60_000;

    function tick(now: DOMHighResTimeStamp) {
      frames++;
      if (now - start >= DURATION) {
        const elapsed = (now - start) / 1000;
        resolve(frames / elapsed);
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
});
assert(fps >= 30);
```

### 4.3 内存增长测量

使用 `performance.memory.usedJSHeapSize`（Chrome 专属 API）：

```ts
const memBefore = await page.evaluate(() =>
  (performance as any).memory?.usedJSHeapSize ?? 0
);
// ... run soak 60s ...
const memAfter = await page.evaluate(() =>
  (performance as any).memory?.usedJSHeapSize ?? 0
);
const growthMB = (memAfter - memBefore) / 1024 / 1024;
assert(growthMB < 50);
```

### 4.4 Console error 检测

```ts
const consoleErrors: string[] = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
// 过滤已知 mock 噪音（404/Warning）
const unhandled = consoleErrors.filter(
  e => !e.includes('Warning:') && !e.includes('404 (Not Found)')
);
assert(unhandled.length === 0);
```

### 4.5 Widget mount 验证

通过 page.evaluate 检查 canvas children：

```ts
const canvasChildCount = await page.evaluate(() => {
  const host = document.querySelector('[data-runtime-canvas-host]');
  return host ? host.querySelectorAll('*').length : 0;
});
assert(canvasChildCount > 0);
```

---

## 5. Playwright config soak project

```ts
{
  name: 'soak',
  testMatch: ['**/scada-soak.spec.ts'],
  timeout: 90_000,
  use: { ...devices['Desktop Chrome'] },
}
```

---

## 6. 阈值定义

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| 初始渲染 | < 5000ms | 1000 widget 首帧 5s 是用户可接受上限 |
| 平均 FPS | ≥ 30 fps | 低于 30fps 动画明显卡顿 |
| 内存增长 | < 50 MB | 超过 50MB 表明存在明显 leak |
| Console error | 0 | 任何 unhandled error 均为 regression |

---

## 7. 已知限制

- `performance.memory` 仅 Chromium 支持（非标准 API），config 中 soak project 固定使用 Desktop Chrome
- 1 分钟 soak（非 1 小时）适用于 CI 验证 leak 趋势，不适用于长时间生产稳定性验证
- MOCK_PLC 模式下 404 噪音属已知行为，不计入 error 断言

---

## 8. 依赖

- SP-FX-12 PW webServer 配置（已存在于 playwright.config.ts）
- REST API `/api/v1/fuxa-views` POST（seeded view 创建）
- `/scada2/view-v2/<viewId>` 路由（已存在）
