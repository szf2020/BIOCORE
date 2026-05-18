# SP-FX-18 性能 Soak Test — 实施计划

**Sprint**: SP-FX-18  
**日期**: 2026-05-18  
**作者**: SP-FX-18 自治 agent

---

## 任务分解

### T1 — playwright.config.ts 新增 soak project

**文件**: `packages/web-ui/playwright.config.ts`  
**操作**: 在 projects 数组追加 soak project，timeout 90s，仅匹配 scada-soak.spec.ts  
**验证**: `grep 'soak' packages/web-ui/playwright.config.ts` 有输出  
**风险**: 无（追加，不修改现有 chromium project）

---

### T2 — 实现 seedView (1000 widgets)

**文件**: `packages/web-ui/e2e/scada-soak.spec.ts`  
**内容**:
- `getAuthToken()` — 复用 scada-widgets-e2e.spec.ts 模式
- `seedSoakView()` — 创建含 1000 个 `svg-ext-value` widget 的 view
  - Grid: 50 列 × 20 行, 每 widget 80×50px
  - canvas 尺寸: 4000 × 1000 px
  - viewId: `v_soak_${Date.now()}`
- 通过 `POST /api/v1/fuxa-views` 写入

**验证**: API 返回 200

---

### T3 — 实现 4 项性能断言

**文件**: `packages/web-ui/e2e/scada-soak.spec.ts`（续）  
**内容**:

1. **渲染时间断言**
   - `t0 = Date.now()` → navigate to `/scada2/view-v2/<id>` → waitForSelector `[data-runtime-canvas-host]`
   - 断言 `renderTime < 5000`

2. **FPS 断言**（page.evaluate rAF loop 60s）
   - 注入 Promise-based rAF counter，duration 60_000ms
   - 断言 `avgFPS >= 30`

3. **内存增长断言**
   - `performance.memory.usedJSHeapSize` 首尾对比
   - 断言 `growthMB < 50`

4. **Console error 断言**
   - 收集所有 `console.error`
   - 过滤 `Warning:` / `404 (Not Found)`
   - 断言 `unhandled.length === 0`

5. **Canvas mount 验证**
   - 断言 `[data-runtime-canvas-host]` visible
   - 断言 canvas children > 0

**验证**: 类型检查通过，spec 文件语法正确

---

## 执行顺序

```
T1 → T2 → T3 → commit → (optional) run → push
```

T1/T2/T3 顺序执行（T2 需要 T1 的 config，T3 在 T2 同文件中继续）。

---

## 阈值总结

| Metric | Pass | Fail 处理 |
|--------|------|-----------|
| 渲染时间 | < 5s | 标 known regression，不改 prod 代码 |
| FPS | ≥ 30 | 同上 |
| 内存增长 | < 50MB | 同上 |
| Console error | 0 | 同上 |

---

## 不在范围内

- 修改任何 production 代码
- 修改 widget 实现
- 修改 RuntimeCanvas / animation-engine
- 新增第三方依赖
