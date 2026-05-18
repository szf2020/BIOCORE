# SP-FX-27: Batch 2 Widget 实地拖拽 PW E2E — 设计规范

日期: 2026-05-18  
Sprint: SP-FX-27

---

## 背景

SP-FX-6.2 已交付 5 个 batch 2 widgets:

| widgetType | 实现文件 | 渲染元素 |
|---|---|---|
| `svg-ext-gauge_semaphore` | gauge-semaphore.tsx | `<circle data-widget-id>` |
| `svg-ext-gauge_progress` | gauge-progress.tsx | `<rect data-widget-id>` (背景) |
| `svg-ext-html_switch` | html-switch.tsx | `<foreignObject data-widget-id>` |
| `svg-ext-html_slider` | slider.tsx | `<foreignObject data-widget-id>` |
| `svg-ext-pipe` | pipe.tsx | `<rect data-widget-id>` (背景) |

SP-FX-11 barrel unified + RuntimeCanvas auto-register. 但 batch 2 widgets **不在** palette-items.ts 中, 编辑器 palette 拖拽流程未实地测试.

---

## 问题分析

### Part 1: Palette 现状

`palette-items.ts` 只有 3 个基础形状 (rect/ellipse/text). `PALETTE_ITEMS` 类型 `PaletteItemType` 为 `'rect' | 'ellipse' | 'text'`.

EditorCanvas.tsx 的 onDrop 处理两种 drag type:
- `palette-item`: 基础形状 (rect/ellipse/text)
- `palette-shape`: SVG 形状图片 (JSON 含 id+src)

**缺失**: batch 2 gauge widgets 没有 drag type 支持.

### 需要添加

1. `GAUGE_PALETTE_ITEMS` 数组 (5 个 batch 2 widgets)
2. `makeGaugeWidget` 工厂函数
3. `Palette.tsx` 新增 gauge section (末尾 append, 在 ShapePicker 前)
4. `EditorCanvas.tsx` 处理 `palette-gauge` drag type

---

## 设计方案

### palette-items.ts 扩展

```typescript
export interface GaugePaletteItem {
  widgetType: string;   // svg-ext-gauge_semaphore 等
  label: string;        // 中文 UI 标签
  defaultW: number;
  defaultH: number;
}

export const GAUGE_PALETTE_ITEMS: GaugePaletteItem[] = [
  { widgetType: 'svg-ext-gauge_semaphore', label: '信号灯', defaultW: 60, defaultH: 60 },
  { widgetType: 'svg-ext-gauge_progress',  label: '进度条', defaultW: 40, defaultH: 120 },
  { widgetType: 'svg-ext-html_switch',     label: '开关',   defaultW: 60, defaultH: 30 },
  { widgetType: 'svg-ext-html_slider',     label: '滑块',   defaultW: 200, defaultH: 40 },
  { widgetType: 'svg-ext-pipe',            label: '管道',   defaultW: 120, defaultH: 20 },
];

export function makeGaugeWidget(
  widgetType: string,
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget { ... }
```

### Palette.tsx 扩展

在现有 `<ul data-section="basic">` 之后, 在 `<ShapePicker>` 之前插入:

```tsx
<ul data-section="gauges" className="p-2 space-y-1 border-t border-zinc-700">
  {GAUGE_PALETTE_ITEMS.map((item) => (
    <li
      key={item.widgetType}
      draggable
      data-palette-gauge={item.widgetType}
      onDragStart={(e) => {
        e.dataTransfer.setData('palette-gauge', item.widgetType);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      ...
    >
      {item.label}
    </li>
  ))}
</ul>
```

### EditorCanvas.tsx 扩展

在 `shapeJson` 处理之后:

```typescript
const gaugeType = e.dataTransfer.getData('palette-gauge');
if (gaugeType) {
  store.addWidget(makeGaugeWidget(gaugeType, local, store.gridSize));
  return;
}
```

---

## PW E2E Spec 设计

### 文件: `packages/web-ui/e2e/scada-batch2-drag.spec.ts`

### 测试策略

5 个独立测试, 每个 widget 一个. 测试流程:

1. login → `/scada2/edit-v2/<seeded-view>`
2. 等 editor 就绪 `[data-panel="toolbar"]`
3. 找 `[data-palette-gauge="<widgetType>"]` 元素
4. 获取 canvas host bbox
5. 执行 dragTo canvas 中心
6. 等 `[data-widget-id]` 出现
7. 验证 widget 渲染正确子元素
8. 导航 `/scada2/view-v2/<viewId>` 验 runtime 渲染

### 各 Widget 渲染断言

| Widget | Editor 断言 | Runtime 断言 |
|---|---|---|
| semaphore | `circle[data-widget-id]` exists | `[data-runtime-canvas-host]` visible |
| progress | `rect[data-widget-id]` exists | `[data-runtime-canvas-host]` visible |
| switch | `foreignObject[data-widget-id]` exists | `[data-runtime-canvas-host]` visible |
| slider | `foreignObject[data-widget-id]` exists | `[data-runtime-canvas-host]` visible |
| pipe | `rect[data-widget-id]` exists | `[data-runtime-canvas-host]` visible |

### 种子视图

复用 SP-FX-11 `seedViewWithWidget` pattern — 不预种 widget, 空视图供拖拽测试.

### 约束

- 用 SP-FX-12 login pattern
- 用 SP-FX-11 API token seed pattern
- 不引入新第三方 dep
- 不触碰 i18n / server / PLC

---

## 风险

| 风险 | 缓解 |
|---|---|
| Dev server 起不来 | 测试文件 commit, 记录 BLOCKED 状态 |
| SP-FX-26 race (palette-items.ts) | 末尾 append, 不改现有行 |
| drag 事件兼容性 | 用 page.dragAndDrop 或 mouse API fallback |
