# SCADA Widget 组件库设计

**日期**: 2026-05-15
**子项目**: BIOCore 原生 SCADA 子系统 — 阶段 3/7
**前置**: 子项目 1 (数据模型 + REST/WS) + 子项目 2 (useTag/useTagHistory hook) 完成
**目标**: 定义 8 个 SCADA widget 类型契约 + 实现纯展示 React 组件 + BoundWidget wrapper 处理 bindings + transform eval, 供后续渲染层 (子项目 4) 和编辑器 (子项目 5) 消费

## 背景

子项目 1 spec §1 已确定 widget 数据形状 (items_json), 但仅描述外形:
```ts
interface Widget {
  type: string;
  x, y, w, h: number;
  rotation?: number;
  props: Record<string, any>;
  bindings?: Binding[];
}
```

子项目 2 已实现 `useTag` / `useTagHistory` 让 widget 订阅 tag 流。 本子项目把 widget 类型契约具体化 (TS 判别联合) + 实现 8 个基础 React 组件 + BoundWidget wrapper (合并 defaultProps + 应用 bindings + 渲染 dumb widget)。

## 范围

**包含**:
- 8 个 dumb widget React 组件 (Tank/Valve/Pump/Indicator/Trend/Label/Button/Lamp)
- TS 判别联合 `WidgetDef` (各 widget 类型 + props + bindings)
- `WIDGET_REGISTRY` (type → { component, defaultProps, displayName })
- `BoundWidget` wrapper (defaultProps 合并 + bindings 应用 + transform eval + 定位)
- transform 表达式 cached compile (`new Function('v', ...)`)
- vitest 单测 (~31 用例) + Snapshot
- 浏览器 demo 页面验证视觉

**不包含**:
- 编辑器 UI / drag / snap (子项目 5)
- WidgetView 多 widget canvas mount (子项目 4)
- Button 实际 PLC 写路径 — Button 只触发自定义事件, action 含义由 sub-project 4 runtime 解释 (e.g. 打开建议 dialog → POST /api/v1/suggestions)
- 自定义 widget 类型扩展机制 (留 sub-project 6+)
- Playwright 视觉回归测试 (留 sub-project 4)

## 1. 架构

```
                        items_json (sub-project 1 storage)
                                │
                                ▼
            ┌─────────────────────────────────────────────────┐
            │  WidgetView (sub-project 4)                      │
            │  parseItems(items_json) → WidgetDef[]            │
            └────────────┬────────────────────────────────────┘
                         │ for each WidgetDef
                         ▼
            ┌─────────────────────────────────────────────────┐
            │  BoundWidget (本子项目)                          │
            │    1. defaultProps + widget.props 合并           │
            │    2. for each binding:                          │
            │       useTag(binding.tag) → snapshot.value       │
            │       compiled(transform)(value) → resolved      │
            │       merged[binding.prop] = resolved            │
            │    3. WIDGET_REGISTRY[widget.type].component     │
            │       → render with merged props + x/y/w/h       │
            └────────────┬────────────────────────────────────┘
                         │
                         ▼
            ┌─────────────────────────────────────────────────┐
            │  Dumb widgets (Tank/Valve/...)                   │
            │  纯 props in → JSX out, 无 hook 依赖              │
            └─────────────────────────────────────────────────┘
```

**关键不变量**:
- 8 dumb widgets 完全无 hook 依赖, 可单测 + storybook 静态预览
- BoundWidget 唯一接 useTag/useTagHistory + transform eval
- registry pattern: 加新 widget 仅 1 处 entry
- coordinate: x/y/w/h 单位 = 像素 (canvas 绝对定位)

## 2. 类型契约

`packages/web-ui/src/widgets/types.ts`:

```ts
export type WidgetTypeKey = 'tank' | 'valve' | 'pump' | 'indicator' | 'trend' | 'label' | 'button' | 'lamp';

export interface Binding {
  tag: string;             // 'F01.AI-0' (子项目 1+2 tag namespace)
  prop: string;            // widget prop key (target)
  transform?: string;      // JS expression on 'v', e.g. 'v > 100 ? "red" : "green"'
}

export interface BaseWidgetDef {
  id: string;
  x: number; y: number;
  w: number; h: number;
  rotation?: number;       // deg, default 0
  bindings?: Binding[];
}

// Discriminated union per widget type
export interface TankDef extends BaseWidgetDef {
  type: 'tank';
  props: {
    fillPct?: number;        // 0-100, default 50
    max?: number;            // 显示给用户的最大值 (label)
    unit?: string;           // 'kg'
    label?: string;
    color?: string;          // CSS color, default '#3b82f6'
  };
}

export interface ValveDef extends BaseWidgetDef {
  type: 'valve';
  props: {
    open?: boolean | number; // boolean 开关阀; number 0-100 调节阀
    label?: string;
    colorOpen?: string;      // default '#22c55e'
    colorClosed?: string;    // default '#9ca3af'
  };
}

export interface PumpDef extends BaseWidgetDef {
  type: 'pump';
  props: {
    running?: boolean;       // 决定动画
    rate?: number;
    unit?: string;           // 'rpm' / '%' / 'L/min'
    label?: string;
  };
}

export interface IndicatorDef extends BaseWidgetDef {
  type: 'indicator';
  props: {
    value?: number | string | null;
    unit?: string;
    label?: string;
    precision?: number;      // 小数位, default 1
    color?: string;
  };
}

export interface TrendDef extends BaseWidgetDef {
  type: 'trend';
  props: {
    series: Array<{ tag: string; label?: string; color?: string }>;
    windowSec?: number;      // default 60
    staleMs?: number;        // default 5000 (传给 useTagHistory)
    yMin?: number;
    yMax?: number;
  };
}

export interface LabelDef extends BaseWidgetDef {
  type: 'label';
  props: {
    text?: string;
    fontSize?: number;       // px, default 14
    color?: string;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
  };
}

export interface ButtonDef extends BaseWidgetDef {
  type: 'button';
  props: {
    text?: string;
    action?: string;         // sub-project 4 runtime 解释 (e.g. 'open_suggest_dialog')
    payload?: Record<string, any>;
    color?: string;
  };
}

export interface LampDef extends BaseWidgetDef {
  type: 'lamp';
  props: {
    on?: boolean;
    blink?: boolean;
    colorOn?: string;        // default '#ef4444'
    colorOff?: string;       // default '#e5e7eb'
    label?: string;
  };
}

export type WidgetDef =
  | TankDef | ValveDef | PumpDef | IndicatorDef
  | TrendDef | LabelDef | ButtonDef | LampDef;

export type ItemsJson = Record<string, WidgetDef>;   // key = widget.id (与 sub-project 1 §1 一致)
```

## 3. Widget Registry

`packages/web-ui/src/widgets/registry.ts`:

```ts
import type { WidgetTypeKey, WidgetDef } from './types';
import { Tank } from './Tank';
// ... 其它 import

export interface WidgetEntry<P> {
  component: React.ComponentType<P & { width: number; height: number }>;
  defaultProps: () => P;
  displayName: string;        // 编辑器 (sub-project 5) 用
}

export const WIDGET_REGISTRY = {
  tank: {
    component: Tank,
    defaultProps: () => ({ fillPct: 50, max: 100, color: '#3b82f6' }),
    displayName: '罐体',
  },
  valve: {
    component: Valve,
    defaultProps: () => ({ open: false, colorOpen: '#22c55e', colorClosed: '#9ca3af' }),
    displayName: '阀门',
  },
  pump: {
    component: Pump,
    defaultProps: () => ({ running: false, rate: 0, unit: 'rpm' }),
    displayName: '泵',
  },
  indicator: {
    component: Indicator,
    defaultProps: () => ({ value: null, unit: '', precision: 1 }),
    displayName: '数字表',
  },
  trend: {
    component: Trend,
    defaultProps: () => ({ series: [], windowSec: 60 }),
    displayName: '趋势图',
  },
  label: {
    component: Label,
    defaultProps: () => ({ text: '', fontSize: 14, align: 'left' as const }),
    displayName: '文本',
  },
  button: {
    component: Button,
    defaultProps: () => ({ text: 'Action', color: '#3b82f6' }),
    displayName: '按钮',
  },
  lamp: {
    component: Lamp,
    defaultProps: () => ({ on: false, colorOn: '#ef4444', colorOff: '#e5e7eb' }),
    displayName: '指示灯',
  },
} as const;

export type WidgetRegistry = typeof WIDGET_REGISTRY;
```

## 4. BoundWidget Wrapper

`packages/web-ui/src/widgets/BoundWidget.tsx`:

```ts
import { useTag } from '@/hooks';
import { WIDGET_REGISTRY } from './registry';
import { compileTransform } from './transform';
import type { WidgetDef, Binding } from './types';

export function BoundWidget({ widget }: { widget: WidgetDef }) {
  const entry = WIDGET_REGISTRY[widget.type];
  if (!entry) {
    return <div style={{ position: 'absolute', left: widget.x, top: widget.y, color: 'red' }}>
      Unknown widget: {widget.type}
    </div>;
  }
  const baseProps = { ...entry.defaultProps(), ...widget.props };
  const boundProps = useBoundProps(baseProps, widget.bindings ?? []);

  const Component = entry.component as React.ComponentType<any>;
  return (
    <div
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        transform: widget.rotation ? `rotate(${widget.rotation}deg)` : undefined,
      }}
    >
      <Component {...boundProps} width={widget.w} height={widget.h} />
    </div>
  );
}

function useBoundProps(base: Record<string, any>, bindings: Binding[]): Record<string, any> {
  // 收集所有 binding 的 tag → 调 useTag (顺序固定, Hook rules 满足)
  // 注意: bindings 数组在 React render 间需稳定; sub-project 4 不应每次新建数组
  const merged = { ...base };
  for (const b of bindings) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const snap = useTag(b.tag);   // bindings 长度变化会违反 Hook rules; 见下文
    const fn = b.transform ? compileTransform(b.transform) : (v: any) => v;
    let resolved: any;
    try {
      resolved = fn(snap.value);
    } catch {
      resolved = snap.value;       // transform 运行时错误 fallback
    }
    merged[b.prop] = resolved;
  }
  return merged;
}
```

**Hook rules 注意**: `bindings.length` 在 widget 编辑后可能变化, 会破坏 React Hooks 顺序。 缓解:
- BoundWidget 通过 `key={widget.id + ':' + (widget.bindings?.length ?? 0)}` 强制 remount (sub-project 4 渲染容器责任, 留文档)
- 或: bindings 改为 fixed-slot 模式 (固定 8 个 slot, 每 slot 可空) — 复杂, 推后

MVP 接受 "bindings 长度变化 → 视图层重 mount" 约定。

## 5. Transform Eval

`packages/web-ui/src/widgets/transform.ts`:

```ts
const compileCache = new Map<string, (v: any) => any>();
const IDENTITY = (v: any) => v;

export function compileTransform(expr: string): (v: any) => any {
  if (!expr) return IDENTITY;
  const cached = compileCache.get(expr);
  if (cached) return cached;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('v', `return (${expr});`) as (v: any) => any;
    compileCache.set(expr, fn);
    return fn;
  } catch (e) {
    console.warn('[widget] transform compile failed:', expr, e);
    compileCache.set(expr, IDENTITY);   // 缓存 fallback 避免重复尝试
    return IDENTITY;
  }
}

// 测试专用 — 重置缓存
export function _resetCompileCache() {
  compileCache.clear();
}
```

**安全模型**: items_json 写入路径仅 admin/engineer (sub-project 1 已 requireRole 守护). transform 字符串信任来源。 不接受外部用户提交的 transform。

**Eval 失败行为**:
- compile 失败 → 警告 + 缓存 IDENTITY → 后续直接返 v
- runtime 失败 → BoundWidget try/catch → 返 raw v

## 6. Widget 视觉规约

**Tank** (`Tank.tsx`):
- 外形: SVG rect 圆角 (rx=4), stroke = #6b7280, fill = transparent
- 内部液位: rect 高度 = `(fillPct/100) * (height - padding)`, anchored to bottom, fill = `color`
- label 顶部 (props.label), max/unit 底部小字 (e.g. "100 kg")
- 容器: 完整使用 width / height

**Valve** (`Valve.tsx`):
- bow-tie: 两个 SVG triangle 共享中心 (path 'M0,0 L W,H L W,0 L 0,H Z'), color 由 `open` 状态
- 调节阀 (`typeof open === 'number'`): 中心显百分比文字 (e.g. "75%")
- label 右侧 (相对定位)

**Pump** (`Pump.tsx`):
- SVG circle 外圈 + 内部 3-blade 风扇 (3 path 围中心成 120° 间隔)
- `running=true` → 风扇 SVG `<g>` 加 `className="animate-spin"` (Tailwind)
- rate 数字下方 (e.g. "120 rpm")
- label 顶部

**Indicator** (`Indicator.tsx`):
- 大数字 (value, formatted to precision) + unit (小字, 数字右侧) + label (顶部)
- color 由 prop, value=null → "—"
- value 字符串 → 直接显示 (不 toFixed)

**Trend** (`Trend.tsx`):
- 复用 EChartsWrapper
- props.series 每项 → useTagHistory(series[i].tag, { windowSec, staleMs }) 取 points 数组
- echarts option: line chart, X 时间轴 (`type: 'time'`), Y `[yMin, yMax]` 或 auto
- legend 显示 series[i].label || series[i].tag
- Hook rules: series 长度变化 → key 强制 remount (BoundWidget 责任, 同 bindings)

**Label** (`Label.tsx`):
- 简单 `<span>` Tailwind className 由 props.fontSize/color/bold/align 决定
- 容器: 100% width/height, inline-block, flex 居中 (align prop 决定 justify)

**Button** (`Button.tsx`):
- Tailwind 风格按钮 (`px-4 py-2 rounded`), backgroundColor inline (`color` prop)
- onClick → `document.dispatchEvent(new CustomEvent('widget-action', { detail: { widgetId, action, payload } }))`
- widgetId 由 BoundWidget 注入到 Button props (extra)

**Lamp** (`Lamp.tsx`):
- SVG circle, fill = `on ? colorOn : colorOff`, stroke = #6b7280
- `blink=true` + `on=true` → `<g className="animate-pulse">` (Tailwind built-in)
- label 下方

## 7. 测试

### 单元测试 (vitest + @testing-library/react)

每 widget 1 测试文件, 共 8 文件 + transform 单测 + BoundWidget 集成测试 + registry 单测。

**Tank.test.tsx** (3 用例):
- fillPct=0 → 内部 fill rect height=0
- fillPct=50 → fill height ≈ widget.h * 0.5
- fillPct=100 → fill height = widget.h

**Valve.test.tsx** (3 用例):
- open=false → fill 用 colorClosed
- open=true → fill 用 colorOpen
- open=75 (number) → 显示 "75%"

**Pump.test.tsx** (3 用例):
- running=false → 风扇无 animate-spin class
- running=true → 风扇有 animate-spin class
- rate=120 + unit='rpm' → 显示 "120 rpm"

**Indicator.test.tsx** (3 用例):
- value=37.5 + precision=2 → "37.50"
- value=null → "—"
- value='OK' (字符串) → 直显 (不 toFixed)

**Trend.test.tsx** (2 用例 — 简化, ECharts 实际渲染靠 wrapper):
- 测试 setup 用 `vi.mock('@/components/charts/EChartsWrapper')` 替成 `props => <div data-testid="echarts" data-option={JSON.stringify(props.option)}>` 占位
- series=[] → 渲染容器, ECharts option.series 数组长度=0
- series=[{tag:'F01.AI-0'}] → `vi.mock('@/hooks/useTagHistory')` 返 5 点 fixture; option.series[0].data 长度=5
- 不调真 echarts.init

**Label.test.tsx** (2 用例):
- text='Hello' → DOM 含 "Hello"
- bold=true + fontSize=20 + align='center' → 元素 style 含 fontWeight=bold, fontSize=20px, justifyContent=center

**Button.test.tsx** (3 用例):
- 点击 → 触发 `widget-action` CustomEvent, detail 含 `{ widgetId, action, payload }`
- text 显示
- color 影响 inline style backgroundColor

**Lamp.test.tsx** (3 用例):
- on=false → 圆 fill = colorOff
- on=true → 圆 fill = colorOn
- on=true + blink=true → 容器有 animate-pulse class

**transform.test.ts** (4 用例):
- `compileTransform('v + 1')(5)` === 6
- `compileTransform('v > 100 ? "red" : "green"')(50)` === 'green'
- `compileTransform('v + 1')` 第二次调返同一引用 (cache 命中)
- `compileTransform('invalid syntax {')` 返 IDENTITY (调用返 v 原值), console.warn 触发一次 (vi.spyOn)

**BoundWidget.test.tsx** (4 用例):
- 测试 setup: `vi.mock('@/hooks', () => ({ useTag: vi.fn(() => ({ value: 75, isStale: false, ageMs: 100 })) }))`. 每用例可在 it 内 `vi.mocked(useTag).mockReturnValueOnce(...)` 覆盖
- 未知 widget.type → 渲染 'Unknown widget: ...' 占位
- bindings=[] → defaultProps + widget.props 合并, 渲染纯 widget (verify Tank 实际收到 props 由 spy/snapshot)
- bindings=[{tag:'F01.AI-0', prop:'fillPct'}] → mock useTag 返 75 → Tank 收到 fillPct=75
- bindings=[{tag:..., transform:'v > 50 ? 100 : 0'}] → mock useTag 返 75 → prop=100

**registry.test.ts** (1 用例):
- 8 个 entry 都有 component + defaultProps + displayName, key 与 WidgetTypeKey union 完全对应

总: 3+3+3+3+2+2+3+3+4+4+1 = **31 用例**

### 手工 DoD

1. `pnpm --filter @biocore/web-ui test widgets` 全绿 (31 widget 用例 + 18 hook/smoke = 49 total)
2. 临时建 `packages/web-ui/src/app/scada-demo/page.tsx` 渲染:
   - 8 widget 各 1 个静态版 (无 bindings, defaultProps + 小 override)
   - 1 个动态 Tank + 1 个动态 Indicator + 1 个动态 Trend, 绑 `F01.AI-0` / `F01.AI-2` / `F01.AI-3`
3. 启 dev + login, 打开 `/scada-demo` → 浏览器看 8 widget 视觉正确
4. 验动态 widget value 跟 pv_realtime 更新 (注: server tick 60s, 用 `staleMs: 70_000` 避免 stale)
5. 还原 demo 页 (git checkout)

## 8. 风险 + 缓解

| 风险 | 缓解 |
|---|---|
| `bindings` 数组长度变化破坏 React Hook 顺序 | BoundWidget 在 sub-project 4 mount 时用 `key={id + ':' + bindings.length}` 强制 remount; spec §4 明示 |
| Trend ECharts re-render 频繁 (1Hz tick) | EChartsWrapper 内部 setOption 仅 diff; 实测 5 个 series 30fps 无压力 |
| transform 表达式 eval 跨 widget 共享 cache 内存膨胀 | unique expr 数预计 < 100; cache 用 Map; 长期生产可加 LRU (子项目 6+) |
| widget 内 SVG 与 Tailwind 文字不同尺寸缩放 | spec §3/§6 说明已知限制; 编辑器 (sub-project 5) 提供网格对齐辅助 |
| Button onClick 误触发 PLC 写 | Button 仅 dispatch CustomEvent; runtime (sub-project 4) 接 audit dialog 强制 2 步确认; spec §2/§6 明示 |
| eval 安全 (XSS) | items_json 写入需 JWT + admin/engineer 角色 (sub-project 1 已守护); transform 来源可信 |

## 9. 文件结构

**新建** (在 `packages/web-ui/src/widgets/`):
- `types.ts` — WidgetTypeKey / Binding / BaseWidgetDef + 8 类型子 + WidgetDef union + ItemsJson
- `transform.ts` — `compileTransform` + `_resetCompileCache`
- `registry.ts` — `WIDGET_REGISTRY`
- `BoundWidget.tsx` — wrapper
- `Tank.tsx`, `Valve.tsx`, `Pump.tsx`, `Indicator.tsx`, `Trend.tsx`, `Label.tsx`, `Button.tsx`, `Lamp.tsx` — 8 dumb widget
- `index.ts` — barrel re-export
- `__tests__/` 共 11 测试文件 (8 widget + transform + BoundWidget + registry)
- `README.md` — widget 集 + props 参考 + 用法示例

**不修改**: 不动 `packages/web-ui/src/hooks/`, `realtime-store`, server, data-service。

依赖: 无新 npm 包 (echarts 5.5 / Tailwind / React 18 / vitest 1.6 / @testing-library/react 14 已就位 from sub-project 2)。

## 10. 实施清单 (writing-plans 输入)

1. types.ts (WidgetDef 判别联合 + ItemsJson)
2. transform.ts + 单测 (4 用例)
3. 8 dumb widgets 各自 `.tsx` + 单测 (各 2-3 用例)
4. registry.ts + 单测 (1 用例)
5. BoundWidget.tsx + 单测 (4 用例)
6. widgets/index.ts barrel + README
7. 手工 DoD demo 页验证

## 11. 不做

- 编辑器 UI / drag / snap / undo (子项目 5)
- WidgetView 多 widget canvas mount + items_json 解析 (子项目 4)
- Button 实际 PLC 写路径 (子项目 4)
- 视觉回归测试 (Playwright snapshot, 子项目 4)
- 国际化 (i18n)
- 自定义 widget 类型扩展机制 (子项目 6+)
- 改 ProcessValues 类型或 trendBuffer 扩字段 (sub-project 4 按需)

## 12. 参考

- 子项目 1 spec: `docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md` §1 Widget/Binding wire format
- 子项目 2 spec: `docs/superpowers/specs/2026-05-15-scada-tag-subscription-hook-design.md` useTag/useTagHistory
- ECharts wrapper: `packages/web-ui/src/components/charts/EChartsWrapper.tsx`
- Tailwind + React 18 + 现有 dashboard 组件风格 (`packages/web-ui/src/components/dashboard/*`)
