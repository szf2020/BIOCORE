# SP-FX-10 Batch 4 Controls Plan

**Sprint**: SP-FX-10
**Date**: 2026-05-18
**Spec**: docs/superpowers/specs/2026-05-18-fuxa-scada-sp-fx-10-batch4-controls-design.md
**Baseline**: web-ui 924 tests

---

## Task 列表

### T1 RED: html-iframe tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch4/html-iframe.test.ts`
- 测试 5 项:
  1. onMount 合法 src -> 创建 foreignObject + iframe，sandbox="" 且不含 allow-same-origin
  2. onMount 非法 src -> 创建 foreignObject + div[data-invalid-src]，无 iframe 元素
  3. onProcess -> 无操作（不抛错）
  4. onResize -> 更新 foreignObject width/height
  5. onUnmount -> 移除 foreignObject，idempotent
- 此时 impl 不存在 -> RED

### T2 GREEN: html-iframe impl
- 文件: `src/scada-engine/gauges/controls/batch4/html-iframe.ts`
- 实现 HtmlIframeGauge class + htmlIframeMeta
- sandbox="" 空属性（最严格），src 用 URL 构造器校验（无需第三方 zod）
- T1 转 GREEN

### T3 RED: compressor tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch4/compressor.test.ts`
- 测试 5 项:
  1. onMount -> 外椭圆[data-widget-id] + 内椭圆[data-state-indicator] 存在
  2. onProcess matched state -> 内椭圆 fill = 匹配颜色
  3. onProcess 无匹配 -> fill = defaultColor
  4. onProcess isStale -> fill = '#9ca3af'
  5. onUnmount -> 清空元素，idempotent
- 此时 impl 不存在 -> RED

### T4 GREEN: compressor impl
- 文件: `src/scada-engine/gauges/controls/batch4/compressor.ts`
- 实现 CompressorGauge class + compressorMeta（外椭圆机壳 + 内椭圆状态）
- T3 转 GREEN

### T5 RED: valve tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch4/valve.test.ts`
- 测试 5 项:
  1. onMount -> 创建 SVG 元素含 [data-valve-body]
  2. onProcess openValue 匹配 -> data-valve-body fill = openColor
  3. onProcess 不匹配 -> data-valve-body fill = closedColor
  4. onClick mode='runtime' -> 调用 ctx.onWriteIntent，tag=variableId
  5. onUnmount -> 清空元素，idempotent
- 此时 impl 不存在 -> RED

### T6 GREEN: valve impl
- 文件: `src/scada-engine/gauges/controls/batch4/valve.ts`
- 实现 ValveGauge class + valveMeta（SVG 矩形管道 + 蝶形阀片）
- onClick 实现 toggle 写意图，mode 检查
- T5 转 GREEN

### T7 RED: pump tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch4/pump.test.ts`
- 测试 5 项:
  1. onMount -> 外圆[data-widget-id] + bladeCount 叶片[data-blade] 存在
  2. onProcess matched state -> 叶片 fill = 匹配颜色
  3. onProcess isStale -> fill = defaultColor
  4. onResize -> 不抛错（有外圆存在）
  5. onUnmount -> 清空，idempotent
- 此时 impl 不存在 -> RED

### T8 GREEN: pump impl
- 文件: `src/scada-engine/gauges/controls/batch4/pump.ts`
- 实现 PumpGauge class + pumpMeta（SVG 圆 + N 扇形叶片，类似 motor）
- T7 转 GREEN

### T9 RED: html-select tests
- 文件: `src/scada-engine/gauges/__tests__/controls/batch4/html-select.test.ts`
- 测试 5 项:
  1. onMount -> 创建 foreignObject + select，options 注入为 option 元素
  2. onProcess value='b' -> select.value = 'b'
  3. onChange mode='runtime' -> 调用 ctx.onWriteIntent
  4. onChange mode='editor' -> 不调用 ctx.onWriteIntent
  5. onUnmount -> 清空，idempotent
- 此时 impl 不存在 -> RED

### T10 GREEN: html-select impl
- 文件: `src/scada-engine/gauges/controls/batch4/html-select.ts`
- 实现 HtmlSelectGauge class + htmlSelectMeta
- disabled=true 在 editor 模式；onChange 严格 mode 检查
- T9 转 GREEN

### T11 Barrel + Schemas + Schema Tests
- 文件: `src/scada-engine/gauges/controls/batch4/index.ts` (新建 barrel)
  - 注册 5 个 meta 到 gaugeRegistry
- 文件: `src/scada-engine/editor/properties/widget-schemas.tsx` (追加 SP-FX-10 batch 4 区块)
  - htmlIframeSchema, compressorSchema, valveSchema, pumpSchema, htmlSelectSchema
  - WIDGET_SCHEMAS 5 个 entries 追加
- 文件: `src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts` (追加 10 schema tests)
  - 每个 schema 2 tests: tag-ref variableId + geometric x/y/w/h

### T12 Regression + TSC
- 运行: pnpm --filter web-ui test --run -> 期望 >= 949 GREEN (924 + 25)
- 运行: pnpm tsc --noEmit -> 0 errors
- 验证 server/data-service/scripts 基线不变

### T13 Push
- git push origin main

---

## 文件映射

```
packages/web-ui/src/scada-engine/gauges/
  controls/batch4/
    html-iframe.ts         (T2)
    compressor.ts          (T4)
    valve.ts               (T6)
    pump.ts                (T8)
    html-select.ts         (T10)
    index.ts               (T11)
  __tests__/controls/batch4/
    html-iframe.test.ts    (T1)
    compressor.test.ts     (T3)
    valve.test.ts          (T5)
    pump.test.ts           (T7)
    html-select.test.ts    (T9)
packages/web-ui/src/scada-engine/editor/properties/
  widget-schemas.tsx       (T11 append)
  __tests__/widget-schemas.test.ts (T11 append)
```

---

## 完工验收标准

- web-ui vitest >= 949 全绿
- server/data-service/scripts 基线保持不变
- TSC 0 errors
- iframe sandbox 安全不变量测试通过
- valve / html-select WriteIntent 路径测试通过
- git push origin main 完成
