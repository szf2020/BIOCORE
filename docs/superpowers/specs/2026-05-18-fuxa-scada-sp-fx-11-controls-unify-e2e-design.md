# SP-FX-11: 4 Batches Barrel 统一 + RuntimeCanvas 全激活 + 端到端 PW 全覆盖

**日期**: 2026-05-18  
**Sprint**: SP-FX-11  
**基准**: origin/main @ 89a376d, web-ui 960 vitest (160 files)  
**目标**: 3 个独立部分同步交付，全自治，不询问

---

## 背景与现状问题

已 ship SP-FX-6.1/6.2/7/8/9/10，20 个 widgets 全交付，分散在 4 个 batch barrel：

| Batch | 路径 | Widgets (5个) | RuntimeCanvas 注册 |
|-------|------|---------------|---------------------|
| 1 | `gauges/controls/index.ts` | value, html-button, html-input, html-chart, html-table | 已导入 |
| 2 | `gauges/controls/batch2/index.ts` | gauge-semaphore, gauge-progress, html-switch, slider, pipe | 未导入 |
| 3 | `gauges/controls/batch3/index.ts` | html-bag, html-graph, tank, motor, html-image | 未导入 |
| 4 | `gauges/controls/batch4/index.ts` | html-iframe, compressor, valve, pump, html-select | 未导入 |

**核心 Bug**: `RuntimeCanvas.tsx` 第 18 行只 import `../gauges/controls/index`，batch 2/3/4 的 widget 在运行时 `gaugeRegistry.create()` 返回 null。

---

## Part 1: Barrel 统一

### 策略选择

**选择 A（采用）**: 在现有 `gauges/controls/index.ts` 末尾追加 batch 2/3/4 的 side-effect import。  
理由：最小改动，RuntimeCanvas 无需修改，符合 KISS 原则。

追加内容：
```
// SP-FX-11: 统一注册 batch 2/3/4
import './batch2/index';
import './batch3/index';
import './batch4/index';
```

**不选择 B**（新建 `all.ts`）: 需修改 RuntimeCanvas import 路径，额外改动。

### 验证标准

- `gaugeRegistry` 在任何环境 import `controls/index` 后，size === 20
- 新增 vitest: `gauges/__tests__/controls-all-registered.test.ts`
  - import `controls/index` (带副作用)
  - 验证 20 个 widgetType 全部注册
  - 用 `gaugeRegistry.size` 或对 `gaugeRegistry.create(type)` 逐一断言

---

## Part 2: RuntimeCanvas 验证

### 目标

RuntimeCanvas 已经 import `controls/index`，Part 1 完成后自动获得 20 widgets。  
本 Part 只需补充 vitest 验证：mount 含 batch 2/3/4 widget 时 `gauge.onMount` 被调用。

### 新增 test

在 `runtime/__tests__/RuntimeCanvas.test.tsx` 追加：

```
it('batch2/3/4 widgets: gauge.onMount called when registry returns gauge', () => {
  // makeWidget with type 'svg-ext-pipe' (batch2)
  // makeWidget with type 'svg-ext-tank' (batch3)
  // makeWidget with type 'svg-ext-valve' (batch4)
  // verify onMount called 3 times
})
```

### 约束

- 不破坏现有 5 个 RuntimeCanvas test
- mock `controls/index` 保持不变
- animation-engine T8 安全不变量不变

---

## Part 3: E2E PW 全覆盖

### 现状

- 现有 PW spec 文件: `scada-editor-controls.spec.ts` (2 tests) + `scada-runtime-view.spec.ts` (2 tests) = 4 tests
- 覆盖: 仅 batch 1 (`svg-ext-value`, `svg-ext-html_chart`)

### 新文件: `e2e/scada-widgets-e2e.spec.ts`

4 个 test，每 batch 选 1 widget：

| Test | Batch | Widget Type | 流程 |
|------|-------|-------------|------|
| T1 | 1 | `svg-ext-value` | seed → editor → 验 property panel |
| T2 | 2 | `svg-ext-pipe` | seed → runtime → 验 canvas-host 可见 |
| T3 | 3 | `svg-ext-tank` | seed → runtime → 验 canvas-host 可见 |
| T4 | 4 | `svg-ext-valve` | seed → runtime → 验 WriteIntentDialog |

Login pattern 同现有 spec:  
`input[type="text"], input[autocomplete="username"]`

注意: PW dev server 不起，创建 spec 文件即提交（同 SP-FX-6.1 T12 pattern）。

---

## 变更文件清单

| 文件 | 操作 | 描述 |
|------|------|------|
| `gauges/controls/index.ts` | Edit | 末尾追加 3 行 side-effect import |
| `gauges/__tests__/controls-all-registered.test.ts` | Create | 20 widgets 全注册验证 |
| `runtime/__tests__/RuntimeCanvas.test.tsx` | Edit | 追加 batch 2/3/4 mount test |
| `e2e/scada-widgets-e2e.spec.ts` | Create | 4 个 PW E2E tests |

---

## 指标目标

| 指标 | 当前 | 目标 |
|------|------|------|
| vitest 总数 | 960 | 965+ |
| PW spec 文件 | 2 | 3 (+1) |
| PW tests | 4 | 8 (+4) |
| 注册 widgets | 5 (batch1 only) | 20 (all batches) |
| tsc errors | 0 | 0 |

---

## 安全约束

- AI/animation 永不直写 PLC; HMI 走 WriteIntentDialog + usePostWriteIntent
- writeTag opts.confirmed===true 严格 gate
- animation-engine.ts T8 安全不变量不变
- ZERO 新第三方 dep
