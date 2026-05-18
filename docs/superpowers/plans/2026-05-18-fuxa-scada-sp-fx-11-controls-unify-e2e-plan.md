# SP-FX-11 执行计划: Barrel 统一 + RuntimeCanvas 全激活 + E2E PW

**日期**: 2026-05-18  
**Sprint**: SP-FX-11  
**基准**: origin/main @ 89a376d, web-ui 960 vitest

---

## Task 列表 (7 tasks)

### T1: 检查 GaugeRegistry size API

**目标**: 确认 `GaugeRegistry` 是否暴露 `size` getter，若无则追加。  
**文件**: `src/scada-engine/gauges/gauge-registry.ts`  
**验证**: `registry.size` 可读，返回注册数量  
**commit**: `feat(sp-fx-11): add size getter to GaugeRegistry`

---

### T2: Barrel 统一 — controls/index.ts 追加 batch 2/3/4

**目标**: 在 `gauges/controls/index.ts` 末尾追加 3 行 side-effect import。  
**文件**: `src/scada-engine/gauges/controls/index.ts`  
**追加内容**:
```
// SP-FX-11: unify all 4 batches — side-effect imports trigger registration
import './batch2/index';
import './batch3/index';
import './batch4/index';
```
**验证**: git diff 显示 3 行追加  
**commit**: `feat(sp-fx-11): unify batch 2/3/4 into controls/index barrel`

---

### T3: RED + GREEN — 20 widgets 全注册 vitest

**目标**: TDD. 新建 `gauges/__tests__/controls-all-registered.test.ts`。  
**策略**: 用独立 GaugeRegistry 实例，直接 import 各 meta，register，验证 size === 20。  
**20 widgetType 完整列表**:
- batch1: `svg-ext-value`, `svg-ext-html_button`, `svg-ext-html_input`, `svg-ext-html_chart`, `svg-ext-html_table`
- batch2: `svg-ext-gauge_semaphore`, `svg-ext-gauge_progress`, `svg-ext-html_switch`, `svg-ext-slider`, `svg-ext-pipe`
- batch3: `svg-ext-html_bag`, `svg-ext-html_graph`, `svg-ext-tank`, `svg-ext-motor`, `svg-ext-html_image`
- batch4: `svg-ext-html_iframe`, `svg-ext-compressor`, `svg-ext-valve`, `svg-ext-pump`, `svg-ext-html_select`

**验证**: vitest 此文件 pass, 总数 >= 961  
**commit**: `test(sp-fx-11): controls-all-registered — verify all 20 widgets in registry`

---

### T4: RuntimeCanvas batch 2/3/4 mount vitest

**目标**: 追加 1 个 test 到 `runtime/__tests__/RuntimeCanvas.test.tsx`。  
**内容**: 构建含 3 个 batch 2/3/4 widget 的 view，验证 `mockGauge.onMount` 调用 3 次。  
**约束**: 现有 5 test 不破，mock 结构不变  
**验证**: RuntimeCanvas test file 共 6 tests pass  
**commit**: `test(sp-fx-11): RuntimeCanvas mount test for batch 2/3/4 widget types`

---

### T5: E2E PW spec — scada-widgets-e2e.spec.ts

**目标**: 新建 `e2e/scada-widgets-e2e.spec.ts`，4 个 test 覆盖每 batch 各 1 widget。  
**流程**:
- T1 (batch1 svg-ext-value): seed → editor → property panel 可见
- T2 (batch2 svg-ext-pipe): seed → runtime → canvas-host 可见
- T3 (batch3 svg-ext-tank): seed → runtime → canvas-host 可见
- T4 (batch4 svg-ext-valve): seed → runtime → canvas-host 可见

**注**: dev server 不起，文件创建即提交  
**验证**: 文件存在，tsc --noEmit 0 errors  
**commit**: `test(sp-fx-11): add E2E PW spec scada-widgets-e2e covering 4 batches`

---

### T6: tsc 0 errors 验证

**目标**: `pnpm tsc --noEmit` 全项目 0 errors  
**验证**: tsc exit code 0  
**commit**: (不需要，验证步骤)

---

### T7: vitest 全量 + push

**目标**: 全量 vitest 通过后 push 到 origin/main。  
**步骤**:
1. `pnpm vitest run` → >= 965 tests, 0 failures
2. 确认 animation-engine test pass (T8 安全不变量)
3. `git push origin main`  
**commit**: (push，无额外 commit)

---

## 时序

T1 → T2 → T3 (T3 依赖 T2 barrel 统一) → T4 → T5 → T6 → T7

T4/T5 相互独立，可并行。
