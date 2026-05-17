# SP-FX-3a Editor Canvas Spike 设计 (FUXA SCADA 移植子项目 3/8, spike-first 拆 a+b)

**Status:** Draft, awaiting user review
**Date:** 2026-05-17
**Parent spec:** `docs/superpowers/specs/2026-05-17-fuxa-scada-port-design.md`
**Predecessors:**
- SP-FX-1 (commit 7a2103c, main) — scada-engine 骨架 + models + REST CRUD + 资产
- SP-FX-2 (commit 3220d9c, main) — services (tag-binding / editor-store / expression-eval / selection) + dialogs

**Scope split (per brainstorm 决策):**
- **SP-FX-3a (THIS SPEC)** — Spike 1 week. Validate svg.js + 8 handle scaffold + drag move + 1 handle resize work end-to-end.
- **SP-FX-3b (FUTURE SPEC)** — Full implementation 1 week. snap-grid + true rotate + 多选 / box-select + 全 8 handle 生效 + 键盘 nudge + Esc 取消.

**Budget:** 1 week. web-ui +53 vitest (471 → ~524) + 3 Playwright smoke.

---

## 1. Architecture

### 1.1 SP-FX-3a 范围 (yes)

- svg.js (`@svgdotjs/svg.js ^3.2.4`, ~50KB MIT, ESM) 加载 + 从 FuxaView.svgcontent + items 渲染 SVG widgets
- 单 widget select (click) → 显示选中框 + 9 handle (8 resize + 1 rotate, rotate 仅占位)
- Drag widget body 移动 (mousedown / mousemove / mouseup state machine)
- Resize 至少 1 handle 生效 (右下角 'se' 等比例) — 验证几何流水线, 其它 7 handle 留 SP-FX-3b
- mouseup → editorStore.updateWidget(id, {x, y, w, h}) → SP-FX-2 自动 history + isDirty=true
- 三层测试: pure / jsdom / Playwright (3 smoke)

### 1.2 SP-FX-3a 不在范围 (defer)

- snap-grid 网格吸附 → SP-FX-3b
- 真 rotate 拖拽 (角度计算 + transform rotate) → SP-FX-3b
- 多选 (Shift+click 加选 / box-select 框选) → SP-FX-3b
- 8 handle 全部生效 (3a 仅 'se', 显示其他 7 占位) → SP-FX-3b
- 键盘 Arrow nudge / Esc 取消 → SP-FX-3b
- bezier path edit → SP-FX-3b 评估, 可能 fallback 放弃 → SP-FX-5+
- group transform 多 widget 一起变换 → SP-FX-3b
- 复制粘贴 / z-index 调整 / 对齐工具 / Cmd+Z keyboard shortcut → SP-FX-4 toolbar

### 1.3 文件结构

```
packages/web-ui/src/scada-engine/editor/          ← SP-FX-3 (a+b 都在)
├── EditorCanvas.tsx                              ~150 行 (SP-FX-3a, React shell)
├── canvas-svg.ts                                 ~200 行 (SP-FX-3a, svg.js 包装 + render)
├── pointer-tools.ts                              ~250 行 (SP-FX-3a, state machine)
├── transform-handles.ts                          ~180 行 (SP-FX-3a, 9 handle 渲染)
├── geometry.ts                                   ~80 行 (SP-FX-3a, pure 几何)
├── __tests__/
│   ├── geometry.test.ts                          15 tests
│   ├── canvas-svg.test.ts                        10 tests
│   ├── pointer-tools.test.ts                     12 tests
│   ├── transform-handles.test.ts                 8 tests
│   └── EditorCanvas.test.tsx                     8 tests
└── README.md                                     roadmap (SP-FX-3a → 3b)

packages/web-ui/src/app/dev/scada-editor-canvas/  ← SP-FX-3a 临时 dev page
└── page.tsx                                      Playwright fixture, SP-FX-4 接入 toolbar 后可删

packages/web-ui/src/test/
├── canvasMock.ts                                 mockCanvasController() helper
└── svgDomHelpers.ts                              mockGetCTM / mockBBox

packages/web-ui/e2e/                              ← Playwright (新建 dir if absent)
├── scada-editor-canvas.spec.ts                   3 smoke
└── playwright.config.ts                          (新建 if absent)
```

### 1.4 安全约束 (沿 SP-FX-2)

- Editor 不直接写 PLC. 所有 widget transformation 改的是 editorStore.currentView (本地 view JSON). Save 走 SP-FX-1 PUT /api/v1/fuxa-views.
- operator manual set-value 走 SP-FX-2 writeTag (本 spike 不涉及).
- expression-eval 不引 writeTag (SP-FX-2 已强制).

### 1.5 测试基线

| 包 | 前 | 后 | 增量 |
|----|----|----|----|
| web-ui | 471 | **~524** | +53 (15 geo + 10 canvas + 12 pointer + 8 handles + 8 React) |
| server | 147 | 147 | 0 |
| data-service | 84 | 84 | 0 |
| Playwright | (existing baseline) | +3 | 3 smoke (drag / select / resize) |

覆盖率: geometry ≥ 95%, pointer-tools ≥ 85%, canvas-svg + transform-handles ≥ 80%, React shell ≥ 70%.

### 1.6 依赖

新增:
- `@svgdotjs/svg.js ^3.2.4` (~50KB, MIT)
- (新加) `@playwright/test ^1.50.0` if e2e dir absent

复用:
- zustand (via SP-FX-2 editorStore)
- vitest + jsdom + @testing-library/react (SP3 配)

---

## 2. Components

### 2.1 `geometry.ts` — 纯几何 (~80 行)

无 DOM 依赖. 函数签名:

```ts
export interface Box { x: number; y: number; w: number; h: number; }
export interface Point { x: number; y: number; }
export type HandleId =
  | 'nw' | 'n' | 'ne'
  | 'w'  | 'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

export function clientToSvg(pt: Point, ctm: DOMMatrix): Point;
export function handlePositions(box: Box): Record<HandleId, Point>;
export function handleFromPoint(box: Box, pt: Point, threshold?: number): HandleId | null;
export function applyHandleDrag(box: Box, handle: HandleId, dx: number, dy: number): Box;
```

`clientToSvg` 接受可注入 ctm matrix — 测试时传 identity, runtime 时 caller 走 `svgRoot.getScreenCTM().inverse()`.

`applyHandleDrag` clamp 最小 5x5, 不允许翻转 (拖 nw 超过 se 时 box 留在最小 5x5).

15 tests: handle 位置 (3 widget 尺寸) / handleFromPoint 9 命中 + 3 miss / applyHandleDrag 8 方向 + 4 clamp.

### 2.2 `canvas-svg.ts` — svg.js 包装 (~200 行)

```ts
import { SVG, Svg, G, Element as SvgElement } from '@svgdotjs/svg.js';
import type { FuxaView, FuxaWidget } from '../models';

export interface CanvasOpts {
  width: number;
  height: number;
}

export class CanvasController {
  readonly root: Svg;
  readonly widgetLayer: G;
  readonly overlayLayer: G;
  private widgetMap = new Map<string, SvgElement>();
  private destroyed = false;

  constructor(container: HTMLElement, opts: CanvasOpts);
  loadView(view: FuxaView): void;
  upsertWidget(widget: FuxaWidget): void;
  removeWidget(id: string): void;
  getElement(id: string): SvgElement | undefined;
  getSvgRoot(): SVGSVGElement;
  destroy(): void;
}
```

`destroy` 幂等 (设 `destroyed` flag, 重复调用 no-op). `upsertWidget` 在 destroy 后静默忽略 (use-after-free 守护).

10 jsdom tests: ctor 创建 root + 2 layers / loadView 渲染 N widgets / upsertWidget 创建 + 更新 attr / removeWidget 清除 / getElement / getSvgRoot / destroy 幂等 / use-after-free 守护 / 多次 loadView 替换.

**jsdom 限制**: svg.js 基础渲染可用, `getBBox()` 不可用. canvas-svg 不依赖 getBBox, 走 widget.x/y/w/h 直读. 测试验证用 `e.node.getAttribute('x')` 直读 attribute.

### 2.3 `transform-handles.ts` — overlay 渲染 (~180 行)

```ts
import type { G } from '@svgdotjs/svg.js';
import type { Box, HandleId } from './geometry';

export class TransformHandles {
  constructor(overlay: G);
  show(box: Box): void;        // 画 8 resize + 1 rotate handle + 选中虚线框
  hide(): void;
  updateBox(box: Box): void;   // drag 中实时跟手
  hitTest(pt: { x: number; y: number }): HandleId | null;
}
```

8 tests: show 渲染 9 handles + 选中框 / hide / updateBox 跟随 / hitTest 各 handle 命中 + miss.

### 2.4 `pointer-tools.ts` — 交互状态机 (~250 行)

framework-agnostic. 状态机 + 3 callback.

```ts
import type { CanvasController } from './canvas-svg';
import type { TransformHandles } from './transform-handles';
import type { HandleId, Box, Point } from './geometry';

export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetId: string; startPt: Point; startBox: Box }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box };

export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null) => void;
}

export class PointerTools {
  state: PointerState;

  constructor(canvas: CanvasController, handles: TransformHandles, cb: PointerToolsCallbacks);
  handleMouseDown(e: MouseEvent): void;
  handleMouseMove(e: MouseEvent): void;
  handleMouseUp(e: MouseEvent): void;
  destroy(): void;
}
```

**状态转移 (SP-FX-3a):**

```
idle
 ├── mousedown on handle  → drag-handle
 ├── mousedown on widget  → onSelect(id) + drag-body
 └── mousedown on empty   → onSelect(null)

drag-body
 ├── mousemove → newBox = startBox + delta, canvas.upsertWidget + handles.updateBox
 └── mouseup  → onWidgetTransformed(id, newBox), → idle

drag-handle
 ├── mousemove → newBox = applyHandleDrag(startBox, handle, dx, dy), canvas.upsertWidget + handles.updateBox
 └── mouseup  → onWidgetTransformed(id, newBox), → idle
```

12 tests: 3 transition / 2 mousemove 几何 / 2 mouseup callback / destroy 解绑 / re-mousedown 不互相干扰 / mousemove + mouseup 在 idle 不抛 / getWidgetAt 返 null 空白点击.

**SP-FX-3a 范围**: 仅 'se' handle 生效 resize (验证). 其它 7 handle 在 hitTest 仍命中但 applyHandleDrag 不变 box (留占位).

### 2.5 `EditorCanvas.tsx` — React shell (~150 行)

```tsx
'use client';
import React, { useRef, useEffect } from 'react';
import { useEditorStore } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import type { Box } from './geometry';

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctrlRef = useRef<{
    canvas: CanvasController;
    handles: TransformHandles;
    pointer: PointerTools;
  } | null>(null);

  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!containerRef.current || !currentView) return;
    const { updateWidget, setSelection } = useEditorStore.getState();
    const canvas = new CanvasController(containerRef.current, {
      width: currentView.width, height: currentView.height,
    });
    const handles = new TransformHandles(canvas.overlayLayer);
    const pointer = new PointerTools(canvas, handles, {
      getWidgetAt: (pt) => { /* hit test widgets in reverse z-index */ return null; },
      onWidgetTransformed: (id, box) => updateWidget(id, box as Partial<any>),
      onSelect: (id) => setSelection(id ? [id] : []),
    });
    ctrlRef.current = { canvas, handles, pointer };
    canvas.loadView(currentView);
    return () => { pointer.destroy(); canvas.destroy(); ctrlRef.current = null; };
  }, [currentView?.id]);

  useEffect(() => {
    if (!ctrlRef.current || !currentView) return;
    const id = selection[0];
    if (!id) { ctrlRef.current.handles.hide(); return; }
    const widget = currentView.items[id] as any;
    if (widget && typeof widget.x === 'number') {
      ctrlRef.current.handles.show({ x: widget.x, y: widget.y, w: widget.w, h: widget.h });
    }
  }, [selection, currentView]);

  if (!currentView) return <div className="p-8 text-center text-muted-foreground">无视图</div>;

  return <div ref={containerRef} className="w-full h-full overflow-auto bg-white" />;
}
```

8 React tests: empty / mount / view 切换 re-mount / unmount destroy / selection [] hide / selection [X] show / store updateWidget 触发 / 双 mount 警告.

**关键**: useEffect 只依赖 `currentView?.id` (不依赖 items), 否则 drag 中 store 通知 → rerender → re-mount canvas, 灾难性. 见 §6.1 R6.

### 2.6 Playwright smoke (`e2e/scada-editor-canvas.spec.ts`, 3 cases)

1. **Drag move**: navigate `/dev/scada-editor-canvas` → click widget → drag 100px → widget x 已变 (从 `window.__getCurrentView()` 读).
2. **Select toggle**: click empty → no handles. click widget → handles 可见 (`[data-overlay="transform"]`).
3. **Resize SE handle**: click widget → mousedown SE handle → drag 50px → widget w/h 已变.

### 2.7 临时 dev page (`app/dev/scada-editor-canvas/page.tsx`)

Playwright fixture. mount EditorCanvas + 注入硬编码 view (2 widget) + 暴露 `window.__getCurrentView = () => useEditorStore.getState().currentView`. 顶部 `if (process.env.NODE_ENV === 'production') return null;` 防生产暴露. SP-FX-4 接入 toolbar 后此 page 可删 (README 注明).

---

## 3. Data Flow

### 3.1 View 加载 → 渲染

```
[SP-FX-4 toolbar — 3a 用 dev page 模拟入口]
   ↓
api/fuxa-views.ts: getFuxaView(id) → { row, view: FuxaView }
   ↓
editorStore.openView(view)
   ↓
EditorCanvas useEffect [currentView.id]:
   ├── new CanvasController(container, {w, h})  → svg.js root + widgetLayer + overlayLayer
   ├── new TransformHandles(overlayLayer)        → handle 容器 (hidden)
   ├── new PointerTools(canvas, handles, cb)     → attach mouse listeners to svgRoot
   └── canvas.loadView(view)                     → 遍历 view.items, upsertWidget render each
```

### 3.2 Single-select 流

```
mousedown 在 SVG root
   ↓
PointerTools.handleMouseDown:
   svgPt = clientToSvg(client, ctm)
   1. handles.hitTest(svgPt) — 若 selection 在, 先查 handle
      └── 命中 → state = drag-handle (widgetId, handle, startPt, startBox)
   2. cb.getWidgetAt(svgPt) — widget 命中 (按 z-index 反向)
      ├── 命中 X → cb.onSelect('X') + state = drag-body
      └── 未命中 → cb.onSelect(null)
   ↓
editorStore.selection 变 → EditorCanvas useEffect[selection]:
   selection=[] → handles.hide()
   selection=[X] → handles.show(X.box)
```

### 3.3 Drag body 流

```
state = drag-body (widgetId X, startPt, startBox)
   ↓
mousemove:
   svgPt = clientToSvg(client, ctm)
   newBox = { ...startBox, x: startBox.x + dx, y: startBox.y + dy }
   canvas.upsertWidget({ ...widget, x: newBox.x, y: newBox.y })  // DOM 直改, 不动 store
   handles.updateBox(newBox)                                     // overlay 跟手
   ↓
mouseup:
   cb.onWidgetTransformed('X', newBox) → editorStore.updateWidget('X', { x, y })
      → 自动 push history (含 startBox snapshot)
      → isDirty = true
   state = idle
   ↓
SP-FX-4 Save → api PUT 持久化 (3a 不实现 Save UI)
```

**关键**: drag 期间 DOM 实时改, store 只在 mouseup 写一次. 60fps 不阻塞, history 只一条记录.

### 3.4 Drag handle 流 (resize 'se')

```
state = drag-handle (widgetId X, handle 'se', startPt, startBox)
   ↓
mousemove:
   newBox = applyHandleDrag(startBox, 'se', dx, dy)  // pure geometry, clamp min 5x5
   canvas.upsertWidget({ ...widget, w: newBox.w, h: newBox.h })
   handles.updateBox(newBox)
   ↓
mouseup:
   cb.onWidgetTransformed('X', newBox) → editorStore.updateWidget('X', { x, y, w, h })
   state = idle
```

### 3.5 View 切换 (清理)

```
editorStore.openView(newView)
   ↓
EditorCanvas useEffect[currentView.id] 触发 cleanup:
   ├── pointer.destroy()  → 解绑 mouse listeners
   ├── handles 引用清空
   └── canvas.destroy()   → svg.js root.remove(), widgetMap.clear()
   ↓
useEffect 重跑 → 新 CanvasController + 新 view render
```

---

## 4. Error Handling

### 4.1 Canvas 加载

| 场景 | 处理 |
|------|------|
| container ref null | useEffect 早返, 下个 render 再试 |
| svg.js import 失败 | React error boundary 兜 (SP-FX-4 全局), 显 "编辑器加载失败" |
| FuxaView.width/height ≤ 0 | CanvasController ctor 抛 `Error('invalid canvas size')` |
| view.items 含非法 widget (缺 x/y) | upsertWidget 跳过 + console.warn 一次 |
| view.items > 500 | console.warn 一次 + 继续 (3a 不优化) |

### 4.2 Pointer state machine

| 场景 | 处理 |
|------|------|
| mousedown 时 selection 的 widget 已被外部删 | hitTest 返 null, state 留 idle, handles.hide() |
| mousemove 期间 currentView 切换 | mouseup 时 updateWidget(oldId), editorStore 守护 (SP-FX-2 已有 silent no-op) |
| newBox 出 view bounds | 不阻止, 允许临时出界 (designer 常需) |
| dx/dy 极大值 | applyHandleDrag clamp min 5x5, max 不 cap (3b 加 maxBound) |

### 4.3 svg.js DOM

| 场景 | 处理 |
|------|------|
| upsertWidget 在 destroy 后调 | `if (this.destroyed) return;` 静默忽略 |
| destroy 多次调 | `destroyed` flag, 重复 no-op |
| getElement 找不到 id | 返 undefined |
| React strict mode useEffect 跑两次 | cleanup 幂等, 第二次 root.remove() 已无效 → 不抛 |

### 4.4 React shell

| 场景 | 处理 |
|------|------|
| SSR (Next.js) 中执行 | `'use client'` + `if (typeof window === 'undefined') return null;` |
| currentView=null mid-mount | useEffect 早返, 容器显 "无视图" 占位 |
| 双 EditorCanvas mount | 各独立 canvas, 但 editorStore singleton 共享 selection — 不推荐. README 注明 "single mount only" |

### 4.5 Playwright

| 场景 | 处理 |
|------|------|
| svg.js 未加载完 | `await page.waitForSelector('[data-layer="widgets"]')` |
| mousemove 速度过快丢中间帧 | `page.mouse.move(x, y, { steps: 10 })` |
| editorStore 跨测试污染 | beforeEach 调 dev page 暴露的 `window.__resetEditorStore()` |

---

## 5. Testing

### 5.1 分层

| 层 | 文件 | 数 | 工具 |
|----|------|----|------|
| Pure | `geometry.test.ts` | 15 | vitest |
| jsdom (svg.js) | `canvas-svg.test.ts` | 10 | vitest + jsdom |
| jsdom (svg.js) | `transform-handles.test.ts` | 8 | vitest + jsdom |
| State machine | `pointer-tools.test.ts` | 12 | vitest + mock canvas |
| React (jsdom + RTL) | `EditorCanvas.test.tsx` | 8 | vitest + RTL |
| E2E (browser) | `e2e/scada-editor-canvas.spec.ts` | 3 | Playwright |

**vitest 总计 53**. Playwright 3.

### 5.2 测试基础设施

新增:
- `src/test/canvasMock.ts` — mockCanvasController() stub
- `src/test/svgDomHelpers.ts` — mockGetCTM / mockBBox / mockClientRect
- `playwright.config.ts` (若 e2e 目录不存在)

复用 SP3 已配 vitest + jsdom + @testing-library/react.

### 5.3 jsdom 限制 + workaround

| 限制 | Workaround |
|------|-----------|
| `SVGSVGElement.getCTM()` 不实现 | clientToSvg 接受可注入 ctm, 测试 inject identity |
| `getBBox()` 不实现 | 不依赖, 走 widget.x/y/w/h 直读 |
| `getBoundingClientRect()` 返 0 | 测试时 mock container.getBoundingClientRect |
| Mouse event coords 需手动 fire | `fireEvent.mouseDown(el, { clientX, clientY })` |
| SVG transform 不应用到 DOM | 测属性值 (e.attr('x')) 而非视觉位置 |

### 5.4 TDD 流程

每 task RED-first → run RED → write impl → GREEN → refactor → commit. Playwright e2e 在 T 末统一加, 不每 commit 跑.

### 5.5 集成 + tsc

每 task 完跑该文件 vitest. 全 task 完跑 web-ui 全包 vitest. tsc full pass.

### 5.6 覆盖率

geometry ≥ 95%, pointer-tools ≥ 85%, canvas-svg + transform-handles ≥ 80%, React shell ≥ 70%.

### 5.7 Playwright 启动 (T 末)

SP-FX-4 toolbar 未实现前, 走临时 `app/dev/scada-editor-canvas/page.tsx`. dev page 直接 mount EditorCanvas + 注入硬编码 view + 暴露 `window.__getCurrentView()`. SP-FX-4 接入后此 page 删 (README 注明).

---

## 6. Risks + Stop Conditions

### 6.1 Risks

| ID | Risk | Lik. | Impact | Mitigation |
|----|------|-----|--------|------|
| R1 | svg.js 在 Next.js 14 SSR mount 异常 | Med | 白屏 | `'use client'` + window 守护 + T2 dev page 真验证 |
| R2 | jsdom 不支持 getCTM, 几何转换测不到位 | High | bug 漏过 | clientToSvg 注入 ctm matrix, Playwright 兜底 |
| R3 | svg.js API 与 jsdom 兼容性 | Med | upsertWidget 不更新 DOM | 测试用 `e.node.getAttribute('x')` 直读 |
| R4 | pointer event 在 SVG element 不冒泡到 root | Low | hit test 失效 | listener 挂 root, e.target 而非冒泡, Playwright 兜底 |
| R5 | Playwright + Next dev server 启动慢, CI 超时 | Med | flaky | webServer 复用 dev:server + dev:client, timeout 60s, 失败重试 1 次 |
| R6 | drag 期间 store 通知 → rerender → re-mount canvas | High | 拖动闪烁, 灾难 | useEffect 只依赖 currentView?.id 不依赖 items, drag 期间走 canvas.upsertWidget DOM 直改, mouseup 才 setState |
| R7 | handle hit test 与 widget body 冲突 | Low | drag-body 误触 resize | hitTest 顺序: handles → widgets, threshold 6px |
| R8 | applyHandleDrag 翻转 (拖 nw 到 se 之外) | Med | 负 w/h | clamp min 5x5, 不允许翻转 |
| R9 | dev page 误进生产 | Low | 生产暴露调试 | `if (process.env.NODE_ENV === 'production') return null;` |
| R10 | svg.js bundle > 50KB | Low | 包体积 | T 末 analyzer 检 |
| R11 | Spike 1 周内 demo 不流畅 | High | 触发 stop | 见 6.2 |
| R12 | FuxaWidget 实际坐标不在 x/y/w/h | High | upsertWidget 无法读坐标 | T0 探查, 必要时 model patch (optional 字段, 向后兼容) |

### 6.2 Stop Conditions (SP-FX-3a 末日检, 1 周后)

**满足任一 → 进 fallback (SP-FX-3b 收窄), 不进全功能 3b:**

1. **R11 流畅度**: 50 widget 拖动 < 60fps, 或单 widget drag 卡顿 → SP-FX-3b 仅支持 4 角 + 4 边 handle, 放弃 rotate 真旋转
2. **R6 双渲染**: drag 期间 React rerender > 100 次/drag → SP-FX-3b 引 useDeferredValue 或 currentView 拆 slice, 加 1 周
3. **R12 schema 错配**: FuxaWidget 坐标在 property.options.x 等位置 → 扩 SP-FX-3a T 范围补 model patch, 延 2-3 天
4. **R2 + R5 测试**: geometry 覆盖 < 95%, 或 Playwright 3 smoke 任一跑不起 → 部分通过, 用户裁决

**满足 → 不进 SP-FX-3b, 升级 user:**
- svg.js 在 Next.js 14 根本无法 mount (R1 + R3) → 评估换 lib
- pointer-tools 状态机 jsdom + Playwright 双不通 (R2 + R5) → 重新设计

### 6.3 不在范围 (defer 3b 或更晚)

snap-grid / 真 rotate / 多选 / 8 handle 全生效 / 键盘 Arrow nudge / Esc 取消 → SP-FX-3b
bezier path edit → SP-FX-3b 评估, 可能 fallback → SP-FX-5+
group transform → SP-FX-3b
复制粘贴 / z-index 调整 / Cmd+Z keyboard shortcut / 对齐工具 → SP-FX-4 toolbar

---

## 7. 接受标准 (SP-FX-3a 完成定义)

- [ ] geometry + canvas-svg + transform-handles + pointer-tools + EditorCanvas 5 个文件 + tests GREEN
- [ ] vitest 全包 ≥ 524 (web-ui)
- [ ] tsc clean (web-ui)
- [ ] 3 Playwright smoke 全过
- [ ] dev page `/dev/scada-editor-canvas` 浏览器手动验证: 拖 widget 顺畅 / 选中显 handle / SE handle resize 顺畅
- [ ] 6.2 stop conditions 全部未触发 (或触发后已记录 fallback 计划)
- [ ] Push 到 origin/main, commits 原子 + 每 commit 测试绿
- [ ] 最终 reviewer 通过
- [ ] SP-FX-3b 决定: 继续 / 收窄 / 重新设计

---

## 8. 后续 SP-FX 链路

- **SP-FX-3b** (下周): snap-grid + 真 rotate + 多选 + 8 handle 全生效 + 键盘 nudge + Esc 取消
- **SP-FX-4** (编辑器 shell): toolbar / palette / property panel / 路由集成 / 删除 dev page
- **SP-FX-5** (shapes + 余下 dialogs + widgets-extras): 用 FileUploadDialog import SVG
- **SP-FX-6** (widgets 20 个): 用 useTagBinding + expression-eval + writeTag
- **SP-FX-7** (runtime): 实现 server WS 'set-value' handler + ack + expression-eval 性能优化
- **SP-FX-8** (E2E + cards-view + paginator + SP4-7 hot-swap)
