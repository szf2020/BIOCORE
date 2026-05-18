# SP-FX-10 Batch 4 Controls Design Spec

**Sprint**: SP-FX-10 (batch 4, 最终批, 完成 20 widget 库)
**Date**: 2026-05-18
**Baseline**: web-ui 924 vitest, server 147, data-service 84, scripts 7, TSC 0
**Target**: +25~+35 tests (5 widgets × ~5 tests + 5 schemas × 2 tests)

---

## 1. Widget 选择清单

| # | Widget | 类型 | FUXA type string | 描述 |
|---|--------|------|-----------------|------|
| 1 | html-iframe | foreignObject + iframe | `svg-ext-html_iframe` | 嵌入外部 URL，安全 sandbox 属性，src zod URL validate |
| 2 | compressor | SVG 状态动画 | `svg-ext-compressor` | 纯 SVG 椭圆 + 多态色彩切换，压缩机运行/停止/故障状态 |
| 3 | valve | SVG 阀门状态 + 写意图 | `svg-ext-valve` | 纯 SVG 多边形阀门，支持点击触发 WriteIntent |
| 4 | pump | SVG 旋转泵 | `svg-ext-pump` | 纯 SVG 圆 + 扇形叶片，多态色彩，只读状态指示 |
| 5 | html-select | foreignObject select + WriteIntent | `svg-ext-html_select` | HTML select 下拉, onChange 触发 ctx.onWriteIntent |

**选择理由**: 5 个 widget 横跨 foreignObject iframe / 纯 SVG 状态 / SVG + WriteIntent / foreignObject 控件 + WriteIntent 四类，
是 batch 1-3 所有模式的综合验收；html-select 完整验证 onWriteIntent 链路（set-value 类 widget），
valve 验证 onClick -> WriteIntent 路径，iframe 验证安全约束实施。

---

## 2. 通用约束

- ZERO 新第三方 dep
- AI/animation 永不直写 PLC；HMI 走 WriteIntentDialog + usePostWriteIntent
- writeTag opts.confirmed===true 严格 gate
- TDD RED-first 严守
- macOS BSD sed 禁用；用 Edit 工具修改文件
- 不破 animation-engine.ts T8 安全不变量
- iframe 安全: sandbox 属性必须设置，禁 allow-same-origin / allow-scripts（默认最小权限）
- iframe src: 必须通过 zod z.string().url() 校验，无效 src 不渲染 iframe

---

## 3. Widget Type Contracts

### 3.1 HtmlIframeGauge (`svg-ext-html_iframe`)

```typescript
interface IframeProperty {
  src?: string;          // 必须通过 z.string().url() 校验
  title?: string;        // iframe 辅助 title 属性
}
```

**行为**:
- `onMount`: 校验 src 为合法 URL; 合法 -> 创建 foreignObject 内含 iframe sandbox="" title={title};
  非法 -> 创建 foreignObject 内含 div[data-invalid-src] 显示错误占位符
- sandbox="" 空字符串 = 最严格沙箱（无 allow-same-origin, 无 allow-scripts）
- `onProcess`: 无操作（iframe 无 tag 绑定）
- `onPropertyChange`: 若 src 变化且合法，更新 iframe.src; 非法则移除 iframe 显示占位符
- `onUnmount`: 移除 foreignObject
- `onResize`: 更新 foreignObject width/height
- `getSignals`: 始终返回 []（无 tag 绑定）

**安全不变量**:
- sandbox 属性不得含 allow-same-origin 或 allow-scripts
- src 校验失败时 iframe 不得渲染

### 3.2 CompressorGauge (`svg-ext-compressor`)

```typescript
interface CompressorProperty {
  variableId?: string;
  states?: Array<{ value: string; color: string; label?: string }>;
  defaultColor?: string;  // default '#9ca3af'
  bodyColor?: string;     // default '#475569' (机壳色)
}
```

**行为**:
- `onMount`: 创建纯 SVG 压缩机图形 — 外椭圆(机壳) + 内椭圆(状态指示); data-widget-id 挂到外椭圆
- `onProcess(value)`: 根据 states 数组匹配 String(value.value) -> 设置内椭圆 fill 颜色;
  isStale -> fill = '#9ca3af'; 无匹配 -> defaultColor
- `onUnmount`: 移除所有元素
- `onResize`: 更新椭圆 cx/cy/rx/ry
- `getSignals`: [property.variableId]（空则 []）
- 无写意图（只读状态指示）

### 3.3 ValveGauge (`svg-ext-valve`)

```typescript
interface ValveProperty {
  variableId?: string;
  openValue?: string;    // default '1' — 此值对应开阀状态
  openColor?: string;    // default '#22c55e'
  closedColor?: string;  // default '#ef4444'
}
```

**行为**:
- `onMount`: 创建 SVG 阀门图形 — 矩形管道体 + 蝶形阀片; 阀片设 data-valve-body 属性
- `onProcess(value)`: 根据 String(value.value) === openValue 设置阀片颜色;
  isStale -> '#9ca3af'
- `onClick(event, ctx)`: 若 ctx.mode !== 'runtime' 则返回; 触发
  ctx.onWriteIntent?.({ tag: prop.variableId, value: isOpen ? '0' : '1', widgetId: widget.id })
- `onUnmount`: 移除所有元素
- `onResize`: 更新 SVG 坐标
- `getSignals`: [property.variableId]

### 3.4 PumpGauge (`svg-ext-pump`)

```typescript
interface PumpProperty {
  variableId?: string;
  states?: Array<{ value: string; color: string }>;
  defaultColor?: string;  // default '#9ca3af'
  bladeCount?: number;    // default 3
}
```

**行为**:
- `onMount`: 创建 SVG 泵图形 — 外圆(泵壳) + N 个扇形叶片; 外圆设 data-widget-id
- `onProcess(value)`: 根据 states 匹配 String(value.value) -> 设置叶片 fill 颜色;
  isStale / 无匹配 -> defaultColor
- `onUnmount`: 移除所有元素
- `onResize`: 更新圆/叶片坐标
- `getSignals`: [property.variableId]
- 无写意图（只读状态指示，类似 motor）

### 3.5 HtmlSelectGauge (`svg-ext-html_select`)

```typescript
interface SelectProperty {
  variableId?: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;  // default '请选择...'
}
```

**行为**:
- `onMount`: 创建 foreignObject 内含 select HTML 元素; 每个 option 注入 option 元素;
  select.disabled = ctx.mode !== 'runtime'
- `onChange` 事件: 若 mode !== 'runtime' 则返回; 调用
  ctx.onWriteIntent?.({ tag: prop.variableId, value: select.value, widgetId: widget.id })
- `onProcess(value)`: 同步 select.value = String(value.value);
  isStale / null -> select.value = '' (清空选中)
- `onPropertyChange`: 更新 widget 引用
- `onUnmount`: 移除 changeHandler, 移除 foreignObject
- `onResize`: 更新 foreignObject width/height
- `getSignals`: [property.variableId]

---

## 4. Property Schemas

每个 widget 新增对应 WidgetPropertySchema，追加至 widget-schemas.tsx 并注册进 WIDGET_SCHEMAS:

| Widget | Schema export name | WIDGET_SCHEMAS key |
|--------|-------------------|-------------------|
| html-iframe | `htmlIframeSchema` | `'svg-ext-html_iframe'` |
| compressor | `compressorSchema` | `'svg-ext-compressor'` |
| valve | `valveSchema` | `'svg-ext-valve'` |
| pump | `pumpSchema` | `'svg-ext-pump'` |
| html-select | `htmlSelectSchema` | `'svg-ext-html_select'` |

---

## 5. 文件结构

```
packages/web-ui/src/scada-engine/gauges/
  controls/batch4/
    html-iframe.ts        (新建)
    compressor.ts         (新建)
    valve.ts              (新建)
    pump.ts               (新建)
    html-select.ts        (新建)
    index.ts              (新建 barrel)
  __tests__/controls/batch4/
    html-iframe.test.ts   (新建)
    compressor.test.ts    (新建)
    valve.test.ts         (新建)
    pump.test.ts          (新建)
    html-select.test.ts   (新建)
packages/web-ui/src/scada-engine/editor/properties/
  widget-schemas.tsx      (追加 5 schemas + 5 WIDGET_SCHEMAS entries)
  __tests__/widget-schemas.test.ts (追加 10 schema tests)
```

---

## 6. 安全 & WriteIntent 验证矩阵

| Widget | 读/写 | 写意图触发方式 | WriteIntent guard |
|--------|-------|-------------|-----------------|
| html-iframe | 读 | 无 | N/A |
| compressor | 读 | 无 | N/A |
| valve | 读+写 | onClick，mode==='runtime' 检查 | ctx.onWriteIntent?.() |
| pump | 读 | 无 | N/A |
| html-select | 读+写 | onChange，mode==='runtime' 检查 | ctx.onWriteIntent?.() |

**iframe 安全不变量**:
- sandbox 属性值为 "" 空字符串
- allow-same-origin 字符串永不出现在 sandbox 中
- allow-scripts 字符串永不出现在 sandbox 中
- src 非法 URL -> 不创建 iframe 元素，仅创建 div[data-invalid-src]

---

## 7. 测试策略

每个 widget 5 项 unit tests (TDD RED-first):

**html-iframe** (5 tests):
1. onMount 合法 src -> 创建 foreignObject + iframe，sandbox="" 且无 allow-same-origin
2. onMount 非法 src -> 创建 foreignObject + div[data-invalid-src]，无 iframe 元素
3. onProcess -> 无操作（不抛错）
4. onResize -> 更新 foreignObject width/height
5. onUnmount -> 移除 foreignObject，idempotent

**compressor** (5 tests):
1. onMount -> 创建外椭圆[data-widget-id] + 内椭圆
2. onProcess matched state -> 内椭圆 fill = 匹配颜色
3. onProcess 无匹配 -> fill = defaultColor
4. onProcess isStale -> fill = '#9ca3af'
5. onUnmount -> 清空元素，idempotent

**valve** (5 tests):
1. onMount -> 创建 SVG 元素含 [data-valve-body]
2. onProcess openValue 匹配 -> fill = openColor
3. onProcess 不匹配 -> fill = closedColor
4. onClick mode='runtime' -> 调用 onWriteIntent（参数验证）
5. onUnmount -> 清空元素，idempotent

**pump** (5 tests):
1. onMount -> 创建外圆[data-widget-id] + bladeCount 叶片
2. onProcess matched state -> 叶片 fill = 匹配颜色
3. onProcess isStale -> fill = defaultColor
4. onResize -> 不抛错（有圆存在）
5. onUnmount -> 清空，idempotent

**html-select** (5 tests):
1. onMount -> 创建 foreignObject + select，options 注入
2. onProcess -> select.value 同步
3. onChange mode='runtime' -> 调用 ctx.onWriteIntent
4. onChange mode='editor' -> 不调用 ctx.onWriteIntent
5. onUnmount -> 清空，idempotent

**schema tests** (+10): 每个 schema 验证 tag-ref variableId + geometric x/y/w/h 存在

---

## 8. 风险 & 缓解

| 风险 | 缓解 |
|------|------|
| iframe sandbox 被意外宽松 | 测试显式断言 sandbox attr 不含 allow-same-origin/allow-scripts |
| src URL 校验缺失 | 测试非法 src -> 断言无 iframe 元素 |
| valve onClick 在 editor 模式调用 onWriteIntent | 测试 mode='editor' onClick 断言 onWriteIntent 未调用 |
| html-select 在 editor 模式触发写入 | disabled=true + mode 检查双重保护 |
| batch4 barrel 导入破坏已注册 gauge | 各 widgetType 字符串唯一性保证 |
