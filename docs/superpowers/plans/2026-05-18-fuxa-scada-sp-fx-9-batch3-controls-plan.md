# SP-FX-9 Batch 3 Controls Plan

**Sprint**: SP-FX-9
**Date**: 2026-05-18
**Spec**: docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-9-batch3-controls-design.md
**Baseline**: web-ui 889 tests

---

## Task 列表

### T1 RED: html-bag tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch3/html-bag.test.ts`
- 测试 5 项: onMount/onProcess(on)/onProcess(off)/onProcess(stale)/onUnmount
- 此时 impl 不存在 -> RED

### T2 GREEN: html-bag impl
- 文件: `src/scada-engine/gauges/controls/batch3/html-bag.ts`
- 实现 HtmlBagGauge class + htmlBagMeta
- T1 转 GREEN

### T3 RED: html-graph tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch3/html-graph.test.ts`
- 测试 5 项: onMount(canvas)/onProcess(push point)/onProcess(stale)/onUnmount/getSignals
- 此时 impl 不存在 -> RED

### T4 GREEN: html-graph impl
- 文件: `src/scada-engine/gauges/controls/batch3/html-graph.ts`
- 实现 HtmlGraphGauge class + htmlGraphMeta (native canvas, ZERO dep)
- T3 转 GREEN

### T5 RED: tank tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch3/tank.test.ts`
- 测试 5 项: onMount/onProcess(50%)/onProcess(0%)/onProcess(stale)/onUnmount
- 此时 impl 不存在 -> RED

### T6 GREEN: tank impl
- 文件: `src/scada-engine/gauges/controls/batch3/tank.ts`
- 实现 TankGauge class + tankMeta (SVG rect 液位 fill)
- T5 转 GREEN

### T7 RED: motor tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch3/motor.test.ts`
- 测试 5 项: onMount/onProcess(matched state)/onProcess(no match)/onProcess(stale)/onUnmount
- 此时 impl 不存在 -> RED

### T8 GREEN: motor impl
- 文件: `src/scada-engine/gauges/controls/batch3/motor.ts`
- 实现 MotorGauge class + motorMeta (SVG circle 状态色彩)
- T7 转 GREEN

### T9 RED: html-image tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch3/html-image.test.ts`
- 测试 5 项: onMount/onProcess(tag override)/onPropertyChange(src)/getSignals/onUnmount
- 此时 impl 不存在 -> RED

### T10 GREEN: html-image impl
- 文件: `src/scada-engine/gauges/controls/batch3/html-image.ts`
- 实现 HtmlImageGauge class + htmlImageMeta
- T9 转 GREEN

### T11 Barrel + Schemas + Schema Tests
- 文件: `src/scada-engine/gauges/controls/batch3/index.ts` (新建 barrel)
- 文件: `src/scada-engine/editor/properties/widget-schemas.tsx` (追加 5 schemas + WIDGET_SCHEMAS entries)
- 文件: `src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts` (追加 10 schema tests)

### T12 Regression + TSC
- 运行: `pnpm --filter web-ui test --run` -> 期望 >= 914 GREEN
- 运行: `pnpm tsc --noEmit` -> 0 errors
- 验证 server/data-service/scripts 不变

### T13 Push
- `git push origin main`

---

## 文件映射

```
packages/web-ui/src/scada-engine/gauges/
  controls/batch3/
    html-bag.ts         (T2)
    html-graph.ts       (T4)
    tank.ts             (T6)
    motor.ts            (T8)
    html-image.ts       (T10)
    index.ts            (T11)
  __tests__/controls/batch3/
    html-bag.test.ts    (T1)
    html-graph.test.ts  (T3)
    tank.test.ts        (T5)
    motor.test.ts       (T7)
    html-image.test.ts  (T9)
packages/web-ui/src/scada-engine/editor/properties/
  widget-schemas.tsx    (T11 append)
  __tests__/widget-schemas.test.ts (T11 append)
```
