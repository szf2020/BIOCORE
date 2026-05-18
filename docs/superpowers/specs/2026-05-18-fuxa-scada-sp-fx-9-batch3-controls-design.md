# SP-FX-9 Batch 3 Controls Design Spec

**Sprint**: SP-FX-9 (batch 3 of heterogeneous controls)
**Date**: 2026-05-18
**Baseline**: web-ui 889 vitest, server 147, data-service 84, scripts 7, TSC 0
**Target**: +25~+30 tests (5 widgets × ~5 tests + 5 schemas × 2 tests)

---

## 1. Widget 选择清单

| # | Widget | 类型 | FUXA type string | 描述 |
|---|--------|------|-----------------|------|
| 1 | html-bag | LED indicator | `svg-ext-html_bag` | foreignObject + colored div，双态/多态 LED |
| 2 | html-graph | Native canvas 折线 | `svg-ext-html_graph` | foreignObject + HTMLCanvasElement，无第三方 dep |
| 3 | tank | SVG 液位罐 | `svg-ext-tank` | 纯 SVG rect + clip-path fill，level 百分比 |
| 4 | motor | SVG 电机状态 | `svg-ext-motor` | 纯 SVG 圆+扇形，多态色彩切换 |
| 5 | html-image | foreignObject img | `svg-ext-html_img` | foreignObject + img，支持静态 src 或 tag 绑定 |

验证策略：5 个 widget 横跨 foreignObject / 纯 SVG / native canvas 三类，充分验证 gauge-base 抽象在异构场景下的稳定性。

---

## 2. 通用约束

- ZERO 新第三方 dep
- AI/animation 永不直写 PLC；HMI 走 WriteIntentDialog + usePostWriteIntent
- writeTag opts.confirmed===true 严格 gate
- TDD RED-first 严守
- 不破 animation-engine.ts T8 安全不变量

---

## 3. Widget Type Contracts

### 3.1 HtmlBagGauge (`svg-ext-html_bag`)

```typescript
interface BagProperty {
  variableId?: string;
  onColor?: string;      // default '#22c55e'
  offColor?: string;     // default '#6b7280'
  onValue?: string;      // default '1'
  shape?: 'circle' | 'rect';  // default 'circle'
}
```

**行为**:
- `onMount`: 创建 `<foreignObject>` 内含 `<div data-widget-id>`, 背景色 = offColor
- `onProcess(value)`: 若 `String(value.value) === onValue` → backgroundColor=onColor; 否则 offColor; isStale → '#9ca3af'
- `onUnmount`: 移除 foreignObject
- `getSignals`: `[property.variableId]` (空则 `[]`)
- **无写意图** (只读指示灯)

### 3.2 HtmlGraphGauge (`svg-ext-html_graph`)

```typescript
interface GraphProperty {
  variableId?: string;
  maxPoints?: number;    // default 60
  lineColor?: string;    // default '#3b82f6'
  bgColor?: string;      // default '#1e293b'
  minVal?: number;       // default 0
  maxVal?: number;       // default 100
}
```

**行为**:
- `onMount`: 创建 `<foreignObject>` 内含 `<canvas>`, 绘制空背景
- `onProcess(value)`: push 数值到环形缓冲区 (maxPoints), native canvas drawLine 折线
- `onUnmount`: 移除 foreignObject, 清空缓冲区
- `getSignals`: `[property.variableId]` (空则 `[]`)
- ZERO 第三方 chart 库

### 3.3 TankGauge (`svg-ext-tank`)

```typescript
interface TankProperty {
  variableId?: string;
  min?: number;          // default 0
  max?: number;          // default 100
  fillColor?: string;    // default '#3b82f6'
  bgColor?: string;      // default '#e2e8f0'
  showLabel?: boolean;   // default true
}
```

**行为**:
- `onMount`: 创建 SVG `<rect>` (背景) + `<rect data-fill>` (液位) + `<text data-label>`
- `onProcess(value)`: `pct = clamp((val-min)/(max-min), 0, 1)`, 从底部向上填充 fill rect
- `onUnmount`: 移除所有元素
- `getSignals`: `[property.variableId]`

### 3.4 MotorGauge (`svg-ext-motor`)

```typescript
interface MotorProperty {
  variableId?: string;
  states?: Array<{ value: string; color: string; label?: string }>;
  defaultColor?: string;  // default '#9ca3af'
}
```

**行为**:
- `onMount`: 创建 `<circle data-widget-id>` 主体圆
- `onProcess(value)`: `String(value.value)` 与 states 匹配, 设 circle fill; isStale → defaultColor
- `onUnmount`: 移除所有元素
- `getSignals`: `[property.variableId]`
- **无写意图** (只读状态)

### 3.5 HtmlImageGauge (`svg-ext-html_img`)

```typescript
interface ImageProperty {
  src?: string;          // static URL or base64
  variableId?: string;   // optional: tag binding overrides src at runtime
  fit?: 'contain' | 'cover' | 'fill';  // default 'contain'
}
```

**行为**:
- `onMount`: 创建 `<foreignObject>` 内含 `<img data-widget-id>`, src = property.src ?? ''
- `onProcess(value)`: 若 variableId 存在且非 stale, 用 value.value 作为 img src
- `onPropertyChange`: 更新 img.src 和 objectFit style
- `onUnmount`: 移除 foreignObject
- `getSignals`: `property.variableId ? [property.variableId] : []`

---

## 4. Property Schemas

每个 widget 对应一个 `WidgetPropertySchema` 加入 `WIDGET_SCHEMAS` 映射：

| Widget | Schema 名 | 特殊字段 |
|--------|-----------|---------|
| html-bag | `htmlBagSchema` | onColor, offColor, onValue, shape |
| html-graph | `htmlGraphSchema` | maxPoints, lineColor, bgColor, minVal, maxVal |
| tank | `tankSchema` | min, max, fillColor, bgColor, showLabel |
| motor | `motorSchema` | defaultColor + renderCustomSection for states |
| html-image | `htmlImageSchema` | src (text), fit (select) |

---

## 5. Barrel 结构

```
controls/batch3/
  html-bag.ts
  html-graph.ts
  tank.ts
  motor.ts
  html-image.ts
  index.ts             <- registers all 5 into gaugeRegistry
```

---

## 6. Stop Conditions

| 条件 | 验收标准 |
|------|---------|
| web-ui vitest | >= 914 passed (baseline 889 + >=25) |
| server vitest | 147 (不变) |
| data-service vitest | 84 (不变) |
| scripts vitest | 7 (不变) |
| TSC | 0 errors |
| animation-engine T8 | 安全不变量仍 pass |
| widget-schemas tests | 5 新 schema 各 2 tests GREEN |
| 各 widget | >= 5 unit tests GREEN |
| git push | origin/main updated |
