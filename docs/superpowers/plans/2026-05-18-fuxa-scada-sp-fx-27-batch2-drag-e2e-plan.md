# SP-FX-27: Batch 2 Widget 实地拖拽 PW E2E — 执行计划

日期: 2026-05-18  
Sprint: SP-FX-27

---

## 任务列表

### T1: 扩展 palette-items.ts

文件: `packages/web-ui/src/scada-engine/editor/palette/palette-items.ts`

- 末尾 append `GaugePaletteItem` interface
- 末尾 append `GAUGE_PALETTE_ITEMS` 数组 (5 items)
- 末尾 append `makeGaugeWidget` 工厂函数
- 不改现有 3 行 (不破 SP-FX-26 merge)

验证: TypeScript 编译无错

### T2: 扩展 Palette.tsx

文件: `packages/web-ui/src/scada-engine/editor/palette/Palette.tsx`

- import `GAUGE_PALETTE_ITEMS` from palette-items
- 在 `<ul data-section="basic">` 后, `<ShapePicker>` 前插入 `<ul data-section="gauges">`
- 每个 item 有 `data-palette-gauge={item.widgetType}` + dragStart setData('palette-gauge', widgetType)

验证: Palette 渲染 gauge section

### T3: 扩展 EditorCanvas.tsx

文件: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`

- import `makeGaugeWidget` from palette-items
- 在 onDrop handler 的 shapeJson 处理之后加 palette-gauge 分支
- `gaugeType = e.dataTransfer.getData('palette-gauge'); if (gaugeType) { store.addWidget(makeGaugeWidget(...)); return; }`

验证: 拖拽 gauge item 到 canvas 能添加 widget

### T4: 写 PW E2E spec

文件: `packages/web-ui/e2e/scada-batch2-drag.spec.ts` (新建)

- 5 个测试: semaphore/progress/switch/slider/pipe
- 每个: login → seed empty view → goto editor → drag palette-gauge → assert widget-id → runtime view
- 复用 login/seedView helper pattern

验证: spec TypeScript 编译无错

### T5: 跑 PW 验证

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter web-ui exec playwright test e2e/scada-batch2-drag.spec.ts --project=chromium
```

验证: 5 tests pass (或记录 BLOCKED/失败原因)

---

## 依赖关系

```
T1 → T2, T3, T4  (T2/T3/T4 依赖 T1 的新导出)
T1+T2+T3 → T5    (T5 依赖 palette 功能实现)
T4 → T5          (T5 依赖 spec 文件)
```

## 风险缓解

- SP-FX-26 race: palette-items.ts 末尾 append, 不动现有行
- vitest baseline: 不改 vitest 测试, baseline 1113 不减
- ZERO 新依赖
