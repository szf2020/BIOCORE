# SCADA Widget Library

子项目 3/7. 为 SCADA 编辑器 (子项目 5) + 渲染层 (子项目 4) 提供 8 个基础 widget React 组件 + 类型契约 + BoundWidget wrapper。

## 8 widget 类型

| Type | 用途 | 关键 props |
|---|---|---|
| `tank` | 罐体液位 | `fillPct` (0-100), `color`, `label`, `max`, `unit` |
| `valve` | 阀门开关/调节 | `open` (boolean 或 0-100), `colorOpen`, `colorClosed` |
| `pump` | 泵运行状态 | `running` (boolean), `rate`, `unit`, `label` |
| `indicator` | 数字表 | `value` (number/string/null), `unit`, `precision`, `color` |
| `trend` | 多 tag 历史曲线 | `series: Array<{tag, label?, color?}>`, `windowSec`, `yMin`, `yMax` |
| `label` | 静态文本 | `text`, `fontSize`, `bold`, `align`, `color` |
| `button` | 触发动作 | `text`, `action`, `payload`, `color` (派发 `widget-action` CustomEvent) |
| `lamp` | 指示灯 | `on` (boolean), `blink`, `colorOn`, `colorOff` |

## 数据流

```
items_json (sub-project 1)
   → WidgetView (sub-project 4) — 遍历 items
   → BoundWidget (本子项目) — 应用 bindings + transform
   → Dumb widget (Tank/Valve/...) — 纯 props
```

## BoundWidget 用法

```tsx
import { BoundWidget } from '@/widgets';
import type { WidgetDef } from '@/widgets';

const widget: WidgetDef = {
  id: 'tank1',
  type: 'tank',
  x: 100, y: 50, w: 80, h: 200,
  props: { color: '#3b82f6', max: 100, unit: 'kg', label: '罐温' },
  bindings: [
    { tag: 'F01.AI-6', prop: 'fillPct' },
  ],
};

<BoundWidget widget={widget} />
```

### Transform 表达式

```tsx
bindings: [
  { tag: 'F01.AI-0', prop: 'color', transform: 'v > 100 ? "red" : "green"' },
  { tag: 'F01.AI-6', prop: 'fillPct', transform: 'Math.min(100, v / 50 * 100)' },
]
```

通过 `new Function('v', ...)` cached compile。 失败 → console.warn 一次 + 回退 identity。

## Button 动作

Button 不直写 PLC。 点击触发 `widget-action` CustomEvent on document, detail = `{ widgetId, action, payload }`. Runtime (sub-project 4) 接 listener 打开 audit dialog + POST 建议缓冲区。

```tsx
useEffect(() => {
  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    if (ce.detail.action === 'open_suggest_dialog') {
      // 打开 dialog with payload
    }
  };
  document.addEventListener('widget-action', handler);
  return () => document.removeEventListener('widget-action', handler);
}, []);
```

## 坐标系

- `x`, `y`, `w`, `h` 单位 = px (canvas 绝对定位)
- `rotation?` deg (默认 0)
- BoundWidget 用 `position: absolute` + inline style 应用

## Hook rules 注意

BoundWidget 内部 for-loop 调 `useTag`. 若 `bindings.length` 在 render 间变化, 会破坏 React Hook 顺序。

**缓解**: sub-project 4 渲染层在 bindings 长度变化时通过 `key={widget.id + ':' + (widget.bindings?.length ?? 0)}` 强制 remount。

## 不做

- 编辑器 UI (sub-project 5)
- WidgetView canvas mount + items_json 解析 (sub-project 4)
- Button 实际 PLC 写路径 (sub-project 4)
- 自定义 widget 扩展机制 (sub-project 6+)
