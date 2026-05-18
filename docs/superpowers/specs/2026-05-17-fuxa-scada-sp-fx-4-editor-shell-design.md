# SP-FX-4 — Editor Shell + Palette + Toolbar + Integration Design

**Date:** 2026-05-17
**Status:** Spec — pending implementation plan
**Parent:** `2026-05-17-fuxa-scada-port-design.md` §5.2 SP-FX-4
**Predecessor:** SP-FX-3b.2.3 (multi-rotate + group-resize) shipped at `b7acaf8` main

---

## 1. Scope

### 1.1 In-scope

1. **Shell layout** — top toolbar + 3-pane (palette ~200px | canvas | properties ~250px). Route `/scada2/edit-v2/[viewId]`.
2. **Palette** — 3 basic shapes (rect / ellipse / text); HTML5 drag-and-drop onto canvas.
3. **Toolbar 4 commands** — save / undo / redo / toggle grid.
4. **Keyboard shortcuts** — Cmd+S (save), Cmd+Z (undo), Cmd+Shift+Z / Cmd+Y (redo).
5. **Save backend** — PUT `/api/v1/fuxa-views/:id`; clear dirty on success.
6. **Properties placeholder** — read-only widget id / type / x / y / w / h / rotate when 1 selected; messages for 0 / N selected.
7. **canvas-svg widget type extension** — `'rect' | 'ellipse' | 'text'` rendering paths added to `upsertWidget`.
8. **editor-store actions** — `addWidget`, `saveView`, `toggleGrid`.
9. **EditorShell page** — Next.js page loads view via GET, injects into store, renders shell. 404 fallback + 5xx retry.
10. **SP-FX-3 reuse** — EditorCanvas + pointer-tools + transform-handles + geometry unchanged except canvas-svg upsertWidget switch + EditorCanvas drop wire.

### 1.2 Out-of-scope (deferred)

| Item | Defer to |
|------|----------|
| Zoom / pan | SP-FX-7 (runtime needs zoom too) |
| Play / preview mode | SP-FX-7 (runtime viewer is SP-FX-7) |
| Copy / paste / cut (Cmd+C/V/X) | SP-FX-4.5 follow-up or SP-FX-5 |
| Z-index controls (front/back/forward/backward) | SP-FX-4.5 follow-up |
| Align / distribute (8 ops) | SP-FX-4.5 follow-up |
| Real properties panel (editable, per-widget) | SP-FX-5 (view-property, layout-property) + SP-FX-6 (per-widget) |
| 20 real widget controls | SP-FX-5 / SP-FX-6 |
| SP4-7 hot-swap (`/scada2/edit/:id`) | SP-FX-8 |
| Auto-save on idle | Not planned |
| Conflict resolution UI | Not planned (409 toast only) |

### 1.3 Constraints (verbatim)

- TDD RED-first.
- All user-facing replies in 简体中文.
- AI / animation / expression-eval never write PLC directly (this SP is editor-only, no runtime).
- HMI manual `set-value` actions go through `writeTag → WS → server` (SP-FX-2 path; not in this SP).
- No new third-party dependencies. React 18, TS 5, zustand 4.4 + immer 10, Tailwind, `@svgdotjs/svg.js ^3.2.4`, Zod 3 already present.
- macOS BSD sed (no `\b`); literal Edit-tool replacements preferred.
- pnpm via `export PATH=$HOME/.hermes/node/bin:$PATH`.

### 1.4 Test count target

| Package | Baseline | Target | Delta |
|---------|----------|--------|-------|
| web-ui vitest | 648 | **702** | +54 |
| server vitest | 147 | 147 | 0 |
| data-service vitest | 84 | 84 | 0 |
| Playwright | 20 | **23** | +3 |

---

## 2. File Structure

### 2.1 New files

```
packages/web-ui/src/scada-engine/editor/
├── editor-shell.tsx                                 ~120 lines
├── palette/
│   ├── Palette.tsx                                  ~100 lines
│   ├── palette-items.ts                             ~50 lines
│   └── __tests__/
│       ├── Palette.test.tsx                         5 tests
│       └── palette-items.test.ts                    6 tests
├── toolbar/
│   ├── Toolbar.tsx                                  ~150 lines
│   ├── commands.ts                                  ~70 lines
│   └── __tests__/
│       ├── Toolbar.test.tsx                         10 tests
│       └── commands.test.ts                         4 tests
└── properties/
    ├── PropertiesPlaceholder.tsx                    ~60 lines
    └── __tests__/
        └── PropertiesPlaceholder.test.tsx           7 tests

packages/web-ui/src/scada-engine/editor/__tests__/
└── editor-shell.test.tsx                            6 tests

packages/web-ui/src/app/scada2/edit-v2/
└── [viewId]/
    ├── page.tsx                                     ~60 lines
    └── __tests__/
        └── page.test.tsx                            3 tests

packages/web-ui/e2e/
└── scada-editor-shell.spec.ts                       3 smoke
```

### 2.2 Modified files

```
packages/web-ui/src/scada-engine/editor/
├── EditorCanvas.tsx                                 +onDragOver/onDrop wire (~15 lines)
├── canvas-svg.ts                                    upsertWidget type switch (rect/ellipse/text) (~25 lines)
├── index.ts                                         +exports (EditorShell, Palette, Toolbar, PropertiesPlaceholder)
└── __tests__/
    └── EditorCanvas.test.tsx                        +5 tests (drop wire)

packages/web-ui/src/scada-engine/services/
├── editor-store.ts                                  +addWidget +saveView +toggleGrid actions
└── __tests__/
    └── editor-store.test.ts                        +8 tests

packages/web-ui/src/scada-engine/models/
└── widget.ts                                        type enum +'rect' +'ellipse' +'text'
```

### 2.3 Not modified

- SP-FX-3 pure modules: `geometry.ts`, `pointer-tools.ts`, `transform-handles.ts` (zero change)
- `/scada2/edit/[viewId]` SP4-7 editor (parallel; SP-FX-8 hot-swap later)
- server `/api/v1/fuxa-views/*` endpoints (already exist from SP-FX-1)

---

## 3. Type Contract

### 3.1 `models/widget.ts` extension

```ts
// existing: type: 'svg-ext-value'
// extend the type union:
export const WidgetTypeEnum = z.enum([
  'svg-ext-value',  // existing (SP-FX-3 dev)
  'rect',           // SP-FX-4 NEW
  'ellipse',        // SP-FX-4 NEW
  'text',           // SP-FX-4 NEW
]);
```

### 3.2 `palette/palette-items.ts`

```ts
import type { FuxaWidget } from '../../models';

export type PaletteItemType = 'rect' | 'ellipse' | 'text';

export interface PaletteItem {
  id: PaletteItemType;
  label: string;
  defaultW: number;
  defaultH: number;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'rect',    label: '矩形', defaultW: 100, defaultH: 60 },
  { id: 'ellipse', label: '椭圆', defaultW: 80,  defaultH: 80 },
  { id: 'text',    label: '文本', defaultW: 120, defaultH: 30 },
];

export function makeWidget(
  type: PaletteItemType,
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget {
  const item = PALETTE_ITEMS.find((i) => i.id === type)!;
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const step = gridSize > 0 ? gridSize : 1;
  return {
    id,
    type,
    property: {},
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: item.defaultW,
    h: item.defaultH,
  } as FuxaWidget;
}
```

### 3.3 `toolbar/commands.ts`

```ts
export interface CommandContext {
  saveView: (viewId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  toggleGrid: () => void;
}

export async function executeSave(
  ctx: CommandContext,
  viewId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await ctx.saveView(viewId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'save failed' };
  }
}
```

### 3.4 `services/editor-store.ts` additions

```ts
// existing actions: openView, closeView, updateWidget, removeWidget,
//                   setSelection, undo, redo, setGridSize, setSnapEnabled

interface EditorStore {
  // ...existing
  addWidget(widget: FuxaWidget): void;
  saveView(viewId: string): Promise<void>;
  toggleGrid(): void;
}
```

**Semantics:**

- `addWidget(widget)`:
  - `currentView.items[widget.id] = widget` (immer)
  - history.past.push(prior snapshot); future cleared
  - selection = [widget.id]
  - isDirty = true
- `saveView(viewId)`:
  - `fetch('/api/v1/fuxa-views/' + viewId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentView) })`
  - 2xx → `isDirty = false`
  - non-2xx or network → throw `Error(\`save failed: ${status}\`)`
- `toggleGrid()`:
  - `snapEnabled = !snapEnabled`

### 3.5 `editor/EditorCanvas.tsx` extension

Add drop handlers to root SVG element:

```tsx
<svg
  ref={svgRef}
  onDragOver={(e) => {
    if (e.dataTransfer.types.includes('palette-item')) e.preventDefault();
  }}
  onDrop={(e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('palette-item') as PaletteItemType;
    if (!type || !PALETTE_ITEMS.find((i) => i.id === type)) return;
    const svg = e.currentTarget as SVGSVGElement;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = clientToSvg({ x: e.clientX, y: e.clientY }, ctm.inverse());
    const store = useEditorStore.getState();
    store.addWidget(makeWidget(type, pt, store.gridSize));
  }}
>
```

### 3.6 `editor/canvas-svg.ts` upsertWidget extension

Inside `upsertWidget(widget)`:

```ts
// existing path: widget.type === 'svg-ext-value' → existing rect render

// NEW switch (after existing):
switch (widget.type) {
  case 'rect':
    // <rect x y w h> via svg.js rect()
    break;
  case 'ellipse':
    // <ellipse cx=(x+w/2) cy=(y+h/2) rx=w/2 ry=h/2>
    break;
  case 'text':
    // <text x=(x+w/2) y=(y+h/2) text-anchor=middle dominant-baseline=middle>
    //   widget.property.text ?? "文本"
    break;
}

// rotate handling identical for all types (SP-FX-3b.2.2 transform attr)
```

Each element gets `data-widget-id` attr identical to current. `transform="rotate(deg cx cy)"` applied uniformly when rotate field present.

### 3.7 `palette/Palette.tsx`

```tsx
export function Palette(): JSX.Element {
  return (
    <ul data-panel="palette" className="w-[200px] flex-shrink-0 border-r border-zinc-700 bg-zinc-900 p-2 space-y-1">
      {PALETTE_ITEMS.map((item) => (
        <li
          key={item.id}
          draggable
          data-palette-item={item.id}
          onDragStart={(e) => {
            e.dataTransfer.setData('palette-item', item.id);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="cursor-grab px-2 py-1 text-sm text-zinc-100 hover:bg-zinc-800 rounded"
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
```

### 3.8 `toolbar/Toolbar.tsx`

```tsx
export interface ToolbarProps { viewId: string; }

export function Toolbar({ viewId }: ToolbarProps): JSX.Element {
  const store = useEditorStore();
  const canUndo = store.history.past.length > 0;
  const canRedo = store.history.future.length > 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = document.activeElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === 's') {
        e.preventDefault();
        void runSave();
      } else if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        store.redo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [store]);

  async function runSave() {
    const result = await executeSave({ saveView: store.saveView, undo: store.undo, redo: store.redo, toggleGrid: store.toggleGrid }, viewId);
    if (result.ok) toast.success('已保存');
    else toast.error(`保存失败: ${result.error}`);
  }

  return (
    <header data-panel="toolbar" className="h-12 flex items-center gap-2 px-3 border-b border-zinc-700 bg-zinc-900">
      <button data-cmd="save" onClick={runSave}>保存</button>
      <button data-cmd="undo" onClick={store.undo} disabled={!canUndo}>撤销</button>
      <button data-cmd="redo" onClick={store.redo} disabled={!canRedo}>重做</button>
      <button data-cmd="grid" data-active={store.snapEnabled} onClick={store.toggleGrid}>网格</button>
    </header>
  );
}
```

(Tailwind classes elided for brevity; spec covers structure not styling.)

### 3.9 `properties/PropertiesPlaceholder.tsx`

```tsx
export function PropertiesPlaceholder(): JSX.Element {
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  if (!items || selection.length === 0) {
    return <aside data-panel="properties"><p>未选中</p></aside>;
  }
  if (selection.length >= 2) {
    return <aside data-panel="properties"><p>已选 {selection.length} 个 (批量)</p></aside>;
  }
  const w = items[selection[0]];
  if (!w) return <aside data-panel="properties"><p>组件已删</p></aside>;

  return (
    <aside data-panel="properties" className="w-[250px] flex-shrink-0 border-l border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100">
      <dl className="space-y-1">
        <Row k="id" v={w.id} />
        <Row k="type" v={w.type} />
        <Row k="x" v={w.x.toString()} />
        <Row k="y" v={w.y.toString()} />
        <Row k="w" v={w.w.toString()} />
        <Row k="h" v={w.h.toString()} />
        <Row k="rotate" v={(w.rotate ?? 0).toString()} />
      </dl>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2"><dt className="w-12 text-zinc-400">{k}</dt><dd>{v}</dd></div>;
}
```

### 3.10 `editor-shell.tsx`

```tsx
export interface EditorShellProps { viewId: string; }

export function EditorShell({ viewId }: EditorShellProps): JSX.Element {
  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <Toolbar viewId={viewId} />
      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div className="flex-1 relative">
          <EditorCanvas />
        </div>
        <PropertiesPlaceholder />
      </div>
    </div>
  );
}
```

### 3.11 `app/scada2/edit-v2/[viewId]/page.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useEditorStore } from '@/scada-engine/services/editor-store';
import { EditorShell } from '@/scada-engine/editor';

export default function Page({ params }: { params: { viewId: string } }) {
  const [state, setState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const openView = useEditorStore((s) => s.openView);

  async function load() {
    setState('loading');
    try {
      const r = await fetch(`/api/v1/fuxa-views/${params.viewId}`);
      if (r.status === 404) return setState('not_found');
      if (!r.ok) return setState('error');
      const view = await r.json();
      openView(view);
      setState('ready');
    } catch {
      setState('error');
    }
  }
  useEffect(() => { void load(); }, [params.viewId]);

  if (state === 'loading') return <div className="p-8 text-zinc-400">加载中...</div>;
  if (state === 'not_found') return <div className="p-8"><p>视图不存在</p><a href="/scada2/">返回列表</a></div>;
  if (state === 'error') return <div className="p-8"><p>加载失败</p><button onClick={load}>重试</button></div>;
  return <EditorShell viewId={params.viewId} />;
}
```

---

## 4. Data Flow

### 4.1 Page load
```
Browser → /scada2/edit-v2/:viewId
  Page client component mounts
  fetch GET /api/v1/fuxa-views/:viewId
    404 → state="not_found" render fallback
    5xx → state="error" render retry button
    2xx → openView(view); state="ready"; render <EditorShell>
```

### 4.2 Palette → drop → addWidget
```
Palette item dragstart
  e.dataTransfer.setData('palette-item', type)
  effectAllowed = 'copy'
Canvas SVG onDragOver
  if dataTransfer.types.includes('palette-item') → preventDefault (enable drop)
Canvas SVG onDrop
  type = dataTransfer.getData('palette-item')
  pt = clientToSvg({x,y}, ctm.inverse())
  widget = makeWidget(type, pt, gridSize)   // snap to gridSize
  store.addWidget(widget)
editor-store immer reducer:
  items[id] = widget
  history.past.push(prev snapshot); future = []
  selection = [id]
  isDirty = true
EditorCanvas subscriber:
  canvas.upsertWidget(widget) → SVG element appended (rect / ellipse / text)
  transformHandles.show(box)
PropertiesPlaceholder re-renders: readonly fields
```

### 4.3 Toolbar Save
```
User click 保存 / Cmd+S
  if (INPUT/TEXTAREA focused): browser default
  else preventDefault + runSave()
runSave():
  result = await executeSave({ saveView: store.saveView, ... }, viewId)
  store.saveView(viewId):
    fetch PUT /api/v1/fuxa-views/:viewId body=currentView
      2xx → set isDirty=false
      non-2xx → throw
result.ok → toast.success("已保存")
result.error → toast.error(message)
```

### 4.4 Toolbar Undo / Redo
```
User click 撤销 / Cmd+Z
  store.undo() (existing 3b.* impl)
    history.past empty → no-op
    else: snapshot=past.pop(); future.push(current); currentView=snapshot
    selection clamped to existing ids
EditorCanvas subscriber → canvas re-renders all widgets
```

Cmd+Shift+Z / Cmd+Y → store.redo() (symmetric).

### 4.5 Toolbar Grid Toggle
```
User click 网格
  store.toggleGrid() → snapEnabled = !snapEnabled
Toolbar button visual: data-active reflects snapEnabled
EditorCanvas drag math already reads gridSize/snapEnabled reactively (SP-FX-3b.1)
```

### 4.6 PropertiesPlaceholder reactivity
```
selection / currentView.items via useEditorStore
  selection.length === 0 → "未选中"
  selection.length === 1:
    items[selection[0]] === undefined → "组件已删"
    else → readonly id / type / x / y / w / h / rotate (rotate undefined → "0")
  selection.length >= 2 → "已选 N (批量)"
```

---

## 5. Error Handling

### 5.1 View load
| Failure | UI |
|---------|----|
| 404 | "视图不存在" + 返回链接 |
| 5xx | "加载失败" + 重试按钮 |
| Network reject | "加载失败" + 重试按钮 |
| JSON parse / schema fail | state=error (treat as 5xx for SP-FX-4) |

### 5.2 Save
| Failure | UI | isDirty |
|---------|----|---------|
| 2xx | toast 成功 | cleared |
| 401 | toast "登录已过期" | retained |
| 409 | toast "视图已被其他人修改, 请刷新" | retained |
| 4xx (other) | toast 错误 message | retained |
| 5xx | toast "保存失败, 请重试" | retained |
| Network reject | toast 错误 | retained |

### 5.3 D&D edge cases
| Case | Behavior |
|------|----------|
| Drop outside canvas SVG | Browser default; no-op |
| Drop with non-palette dataTransfer | onDragOver no preventDefault; onDrop early return |
| Drop pt outside view bounds (x<0) | Allowed (SP-FX-3 supports negative coords) |
| `getScreenCTM()` returns null | onDrop early return |
| gridSize undefined/0 | makeWidget uses `step=1` fallback |

### 5.4 Keyboard
| Conflict | Resolution |
|----------|------------|
| Cmd+S vs browser save | preventDefault |
| Cmd+Z in INPUT/TEXTAREA | Skip handler (browser text undo) |
| Cmd+Shift+Z vs Cmd+Y | Both → redo |
| Win/Linux Ctrl+S | metaKey OR ctrlKey both trigger |

### 5.5 Store
| Failure | Behavior |
|---------|----------|
| addWidget id collision | immer overwrites (low-prob; accept) |
| saveView throws | re-thrown to executeSave wrap; isDirty unchanged |
| undo with empty past | no-op (existing 3b.* impl) |
| redo with empty future | no-op |

### 5.6 Properties placeholder
| Edge case | Render |
|-----------|--------|
| Selection has id not in items | "组件已删" |
| Widget rotate field undefined | "0" |

---

## 6. Testing

### 6.1 Vitest 54 new tests

**palette-items.test.ts (6):**
1. `makeWidget('rect', pt, 10)` → snapped x/y, defaultW=100, defaultH=60
2. `makeWidget('ellipse', ...)` → defaultW=80, defaultH=80
3. `makeWidget('text', ...)` → defaultW=120, defaultH=30
4. `makeWidget(...)` gridSize=0 → step=1 fallback (no snap)
5. `makeWidget(...)` returns unique id format `w_<ts>_<rand>`
6. `PALETTE_ITEMS` length 3 + each has id/label/defaultW/defaultH

**Palette.test.tsx (5):**
1. Renders 3 `[data-palette-item]` items
2. Each item has `draggable=true`
3. Each item shows correct label (矩形 / 椭圆 / 文本)
4. dragstart sets `dataTransfer.setData('palette-item', type)` and `effectAllowed = 'copy'`
5. Component a11y: items rendered as `<li>` inside `<ul>`

**commands.test.ts (4):**
1. `executeSave` ok=true on resolved promise
2. `executeSave` ok=false + error message on rejected promise
3. `executeSave` ok=false + 'save failed' on non-Error throw
4. CommandContext shape requires 4 fields (saveView, undo, redo, toggleGrid)

**Toolbar.test.tsx (10):**
1. 4 buttons render (save, undo, redo, grid)
2. Click 保存 calls store.saveView with viewId
3. Click 撤销 calls store.undo
4. Click 重做 calls store.redo
5. Click 网格 calls store.toggleGrid
6. Grid button `data-active` reflects snapEnabled
7. Cmd+S preventsDefault + calls saveView
8. Cmd+Z calls store.undo (no shift); Cmd+Shift+Z calls store.redo
9. Cmd+Y also calls store.redo
10. Cmd+Z in INPUT focused element → handler skipped (focus stub)

**PropertiesPlaceholder.test.tsx (7):**
1. selection.length===0 → "未选中"
2. selection.length===1 + valid widget → 7 readonly fields shown
3. selection.length===1 + rotate=30 → "30"
4. selection.length===1 + rotate undefined → "0"
5. selection.length===1 + id not in items → "组件已删"
6. selection.length===2 → "已选 2 个 (批量)"
7. type=text → renders type="text"

**editor-shell.test.tsx (6):**
1. Renders Toolbar + Palette + EditorCanvas + PropertiesPlaceholder
2. Palette has width-200px class indicator
3. Properties has width-250px class indicator
4. Canvas region flex-1 (fills middle)
5. No double-mount of EditorCanvas (re-render does not re-init canvas)
6. ViewId prop forwards to Toolbar

**editor-store.test.ts +8:**
1. `addWidget(w)` adds to items
2. `addWidget` pushes history.past entry; future cleared
3. `addWidget` sets selection=[id]
4. `addWidget` sets isDirty=true
5. `saveView(id)` calls fetch PUT with correct URL + body
6. `saveView` clears isDirty on 2xx
7. `saveView` throws on non-2xx
8. `toggleGrid` flips snapEnabled

**EditorCanvas.test.tsx +5:**
1. onDragOver with palette-item type calls preventDefault
2. onDragOver without palette-item does not preventDefault
3. onDrop calls store.addWidget with type from dataTransfer
4. onDrop uses clientToSvg(ctm.inverse()) for coordinates
5. onDrop snaps to gridSize

**page.test.tsx (3):**
1. 200 OK → renders EditorShell (after openView)
2. 404 → renders "视图不存在" + 返回链接
3. 5xx → renders 重试 button; clicking re-fetches

### 6.2 Playwright (3 smoke)

`e2e/scada-editor-shell.spec.ts`:

1. **Open + drag rect + save**: Login → `/scada2/edit-v2/v_test` → palette rect dragTo canvas → widget appears → click 保存 → toast "已保存" + dirty cleared
2. **Undo/Redo via toolbar**: Drop 2 widgets → 点撤销 → 1 widget visible; 点重做 → 2 widgets visible
3. **Cmd+S triggers save**: Drop 1 widget → Cmd+S → network PUT visible + toast 成功

### 6.3 Mock strategy

- `vi.spyOn(global, 'fetch')` for saveView + view-load tests
- HTML5 D&D in jsdom: use `fireEvent.dragStart/dragOver/drop` with `new DataTransfer()`
- canvas-svg: reuse SP-FX-3 `mockCanvasController()` + svg.js (jsdom OK for basic attrs)
- Playwright real browser uses `page.locator(...).dragTo(target)`

### 6.4 Coverage gates

- New modules ≥ 80% line/branch
- Existing modules: no decrease
- `tsc --noEmit` 0 errors
- web-ui 702/702, server 147/147, data-service 84/84, PW 23/23

---

## 7. Stop Conditions

Sprint done when all 10 pass:

1. `/scada2/edit-v2/[viewId]` renders top toolbar + 3-pane (palette ~200px | canvas | properties ~250px).
2. Palette renders 3 items (rect/ellipse/text); each draggable; dragstart sets `dataTransfer.setData('palette-item', type)`.
3. Drag onto canvas SVG → `addWidget(makeWidget(type, pt, gridSize))` → widget appears + selection=[id] + isDirty=true. Coordinates via clientToSvg(ctm.inverse()) + snap to gridSize.
4. canvas-svg `upsertWidget` supports `'rect' | 'ellipse' | 'text'` rendering paths via type switch. `'svg-ext-value'` path preserved for backwards compat.
5. Toolbar 4 commands wired:
   - 保存 → executeSave → PUT `/api/v1/fuxa-views/:viewId` → 2xx clears dirty + toast 成功; non-2xx toast 错误 + retains dirty.
   - 撤销 → store.undo; disabled when `history.past.length === 0`.
   - 重做 → store.redo; disabled when `history.future.length === 0`.
   - 网格 → store.toggleGrid; `data-active` reflects `snapEnabled`.
6. Keyboard: Cmd+S (preventDefault + save), Cmd+Z (undo), Cmd+Shift+Z OR Cmd+Y (redo). INPUT/TEXTAREA focus skips all.
7. PropertiesPlaceholder: 0 selected → "未选中"; 1 selected → readonly id/type/x/y/w/h/rotate (rotate undefined → "0"); ≥2 → "已选 N 个 (批量)"; id-not-in-items → "组件已删".
8. EditorShellPage: 404 fallback ✓; 5xx retry ✓; 2xx mounts shell + injects view into store.
9. Backwards compat:
   - `/scada2/edit/[viewId]` SP4-7 editor unchanged.
   - SP-FX-3 pure modules unchanged (geometry / pointer-tools / transform-handles).
   - EditorCanvas only adds onDragOver/onDrop; existing 35 tests preserved.
   - canvas-svg adds type switch; existing tests preserved.
10. Test baselines:
    - web-ui vitest 648 → ≥702 (+54)
    - Playwright 20 → 23 (+3)
    - tsc --noEmit clean
    - server 147/147, data-service 84/84

---

## 8. Open Items (None blocking)

- Drag from palette outside browser window edge → behavior is browser-default (drag image ghost remains, no drop). Accept.
- `toast` library: reuse existing project pattern (search before implementing; if absent, use minimal local impl with auto-dismiss 3s).
- View id format: per SP-FX-1 `fuxa_views.id` is string PK; no validation in spec (relies on backend 404).

---

End of spec.
