# SP-FX-14 Batch 2 Widget 增强设计

## 总览

SP-FX-14 为 batch2 的 3 个已 ship widget 追加 deferred 功能增强。范围严格限于：
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/pipe.tsx`
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/html-switch.tsx`
- `packages/web-ui/src/scada-engine/gauges/controls/batch2/gauge-semaphore.tsx`
- 各自对应 test 文件

**不动**: RuntimeCanvas, animation-engine, gauge-registry, models/property.ts（全局 schema）。

---

## 增强 1: PipeGauge — Flow Animation (clockwise / anticlockwise)

### 目标
在 `runtime` 模式下，pipe 显示流动动画效果。通过 `stroke-dashoffset` setInterval 模拟水流流向。

### Property 扩展
在内部 `PipeProperty` 接口增加：
```ts
interface PipeProperty {
  // 既有字段...
  flowDirection?: 'cw' | 'ccw' | 'none';
  flowSpeed?: number; // px/frame, 默认 2
}
```

### 行为
- `onMount` 时若 `ctx.mode === 'runtime'` 且 `flowDirection` 不为 `'none'`，设置 stroke-dasharray + dashoffset 并启动 `setInterval`（16ms 约 60fps）。
- `cw`：每帧 `dashoffset -= flowSpeed`（沿管道正方向）。
- `ccw`：每帧 `dashoffset += flowSpeed`（逆方向）。
- `onUnmount` 清除 interval，释放计时器。
- `onPropertyChange` 重启 animation（停旧启新）。
- editor 模式（mode==='editor'）：不启动 interval，保持静态。

### 实现细节
- stroke-dasharray 固定为 `"${dashLen} ${dashLen}"`（dashLen = 管道宽度 w * 0.5，使段落可见）。
- 用 JS setInterval 直接 setAttribute，不使用 SVG `<animate>` 元素。
- interval 引用存入 `private flowInterval: ReturnType<typeof setInterval> | null`。

### 安全约束
- setInterval 回调只改 SVG 属性，不写 PLC，不 fetch，不 sendWsMessage。

---

## 增强 2: HtmlSwitchGauge — Bitmask 模式

### 目标
通过 `bitmask` 属性（位号 0–31）从 tag 整数值中提取特定 bit，决定 checkbox on/off。写入时反向：读取当前 tag 值，set/clear 对应 bit，写回。

### Property 扩展
在内部 `SwitchProperty` 接口增加：
```ts
interface SwitchProperty {
  // 既有字段...
  bitmask?: number; // bit 位号 0-31，存在时启用 bitmask 模式
}
```

### 行为 — onProcess
```ts
// bitmask 模式
if (prop.bitmask !== undefined) {
  const bit = prop.bitmask; // 0-31
  const numVal = typeof value.value === 'number' ? value.value : parseInt(String(value.value), 10);
  checkbox.checked = ((numVal >> bit) & 1) === 1;
} else {
  // 原逻辑: String(value.value) === onVal
}
```

### 行为 — onWriteIntent（change 事件）
bitmask 模式写入需要 read-modify-write：
1. 读 `ctx.readValue(tag)` 取当前整数值 `currentNum`。
2. 若 `input.checked` → `newVal = currentNum | (1 << bit)`。
3. 若 `!input.checked` → `newVal = currentNum & ~(1 << bit)`。
4. 调用 `ctx.onWriteIntent({ tag, value: newVal, widgetId })`.

### 注意
- bitmask 写入仍走 `ctx.onWriteIntent`（HMI WriteIntentDialog 路径），不直接写 PLC。
- 当前值来自 `ctx.readValue`（gauge-base 提供），不需要额外 fetch。

---

## 增强 3: GaugeSemaphore — Blink / Hide / Show Actions

### 目标
semaphore 支持 3 种动作：`blink`（闪烁）、`hide`（隐藏）、`show`（显示），由内部 action 条件触发。

### Property 扩展
在内部 `SemaphoreProperty` 接口增加：
```ts
interface SemaphoreAction {
  type: 'blink' | 'hide' | 'show';
  variableId?: string;    // range 触发时的 tag
  range?: { min: number; max: number };
}

interface SemaphoreProperty {
  // 既有字段...
  semaphoreActions?: SemaphoreAction[];
}
```

### 行为 — onProcess
遍历 `semaphoreActions`，对每个 action 以 range 匹配评估条件（SP-FX-14 仅支持 range）：
- `hide`: `circleEl.style.display = 'none'`
- `show`: `circleEl.style.display = ''`
- `blink`: 启动 `setInterval` 500ms toggle `circleEl.style.visibility`（`visible` ↔ `hidden`）

### Blink 管理
- `private blinkInterval: ReturnType<typeof setInterval> | null`
- onProcess 每次先清除旧 blink，若匹配 blink action 再重新启动。
- `onUnmount` 清除 interval。

### 条件解析
SP-FX-14 仅支持 range 触发（简单可验证）。conditionExpr 完整解析 deferred。

### 设计决策
- `SemaphoreAction.type` 是内部 interface，**不**扩展全局 `FuxaActionType` schema。
- 不改 `models/property.ts` — semaphore actions 存在 widget `property.options.semaphoreActions`（JSON 兼容，存为 `options` 字典下的字段）。
- `onProcess` 先做颜色（既有逻辑），再做 action 评估。

---

## 测试计划

### PipeGauge 新增测试（+5）
1. `flowDirection='cw'` runtime 模式 → onMount 后 pipeEl 有 stroke-dasharray 属性
2. `flowDirection='cw'` runtime 模式 → 启动 interval（vi.useFakeTimers 验证）
3. `flowDirection='none'` runtime 模式 → 无 interval 启动
4. editor 模式 + flowDirection='cw' → 无 interval 启动
5. onUnmount 清除 interval（不抛出，idempotent）

### HtmlSwitchGauge 新增测试（+5）
1. bitmask=0，tag 值 1 → checked=true
2. bitmask=0，tag 值 0 → checked=false
3. bitmask=1，tag 值 2（0b10）→ checked=true
4. bitmask=1，tag 值 1（0b01）→ checked=false
5. bitmask=1 runtime 模式，check=true → onWriteIntent value 含 bit 1 set

### GaugeSemaphore 新增测试（+5）
1. semaphoreActions hide，range 匹配 → circleEl style.display = 'none'
2. semaphoreActions show，range 匹配 → circleEl style.display = ''
3. semaphoreActions blink，range 匹配 → 启动 blinkInterval
4. semaphoreActions blink，range 不匹配 → 无 blinkInterval
5. onUnmount 清除 blinkInterval（不抛出）

---

## 约束确认
- 零新第三方 dep
- animation-engine T8 安全不变量保持（未改该文件）
- 所有写意图走 ctx.onWriteIntent
- setInterval 回调不写 PLC / 不 fetch
