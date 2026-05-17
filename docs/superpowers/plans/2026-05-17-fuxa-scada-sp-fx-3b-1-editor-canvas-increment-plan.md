# SP-FX-3b.1 Editor Canvas Low-Risk Increment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 6 low-risk editor-canvas features in 1 week — snap-grid (10px + toggle + visible bg), ESC cancel, Arrow nudge, Ctrl+Z/Y, full 8-handle e2e coverage, keyboard listener on document.body.

**Architecture:** Pure additive changes to 5 existing files under `packages/web-ui/src/scada-engine/`. New `snap()` / `snapPoint()` pure helpers in `geometry.ts`. New `snapEnabled` state + `setSnapEnabled` action + `GRID_SIZE` const in `editor-store.ts`. New `setGridVisible()` on `CanvasController`. New `cancel()` + `getSnapEnabled` callback on `PointerTools`. New `useEffect`s in `EditorCanvas.tsx` for keyboard + snap-wire. One new Playwright spec for the 7 missing handles.

**Tech Stack:** TypeScript 5, React 18, vitest + jsdom + @testing-library/react (existing), Playwright (existing), zustand 4.4 + immer 10 (existing), `@svgdotjs/svg.js ^3.2.4` (existing). No new dependencies.

---

## File Structure

**Modify:**
- `packages/web-ui/src/scada-engine/services/editor-store.ts` — add `snapEnabled` field, `setSnapEnabled` action, `GRID_SIZE = 10` const export
- `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts` — +3 tests
- `packages/web-ui/src/scada-engine/editor/geometry.ts` — add `snap()`, `snapPoint()` pure functions
- `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts` — +4 tests
- `packages/web-ui/src/scada-engine/editor/canvas-svg.ts` — add `setGridVisible(visible, gridSize?)` method
- `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts` — +3 tests
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` — add `cancel()` method, `getSnapEnabled` callback, snap injection in handleMouseMove/Up
- `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts` — +5 tests
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` — two new useEffect (keydown handler + snap-wire); pass getSnapEnabled to PointerTools ctor
- `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx` — +6 tests
- `packages/web-ui/src/scada-engine/editor/index.ts` — re-export `snap`, `snapPoint`

**Create:**
- `packages/web-ui/e2e/scada-editor-canvas-3b1.spec.ts` — 7 Playwright smoke (NW/N/NE/W/E/SW/S handle drag)

**Test count target:**
- web-ui vitest: 530 → **551** (+21: 4 geo + 3 store + 3 canvas + 5 pointer + 6 React)
- Playwright: 3 → **10** (+7 missing-handle smoke)

---

## Task 0: geometry.ts +snap +snapPoint (4 tests, pure)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/geometry.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`. Replace the top import line:

```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  type Box,
} from '../geometry';
```

with:

```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  type Box, type Point,
} from '../geometry';
```

Append at the END of the file:

```ts
describe('geometry.snap (SP-FX-3b.1)', () => {
  it('rounds box.x/y down to grid', () => {
    expect(snap({ x: 3, y: 7, w: 100, h: 100 }, 10)).toEqual({ x: 0, y: 10, w: 100, h: 100 });
  });

  it('rounds box.x/y up to grid', () => {
    expect(snap({ x: 6, y: 7, w: 100, h: 100 }, 10)).toEqual({ x: 10, y: 10, w: 100, h: 100 });
  });

  it('rounds w/h to grid', () => {
    expect(snap({ x: 0, y: 0, w: 103, h: 97 }, 10)).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('clamps w/h to gridSize when snap would zero; snapPoint also rounds', () => {
    expect(snap({ x: 0, y: 0, w: 3, h: 3 }, 10)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(snapPoint({ x: 23, y: 47 }, 10)).toEqual({ x: 20, y: 50 });
  });
});
```

(4 it() blocks; the 4th combines clamp + snapPoint to match spec count exactly.)

- [ ] **Step 2: Run test to verify it fails (RED)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -15
```

Expected: 4 failures (import resolution: `snap` / `snapPoint` not exported).

- [ ] **Step 3: Add snap() + snapPoint() to geometry.ts**

Open `packages/web-ui/src/scada-engine/editor/geometry.ts`. Append AFTER the final `applyHandleDrag` function:

```ts
// SP-FX-3b.1: snap helpers — round geometry to gridSize integers.
// MIN-gridSize clamp on w/h ensures snap never produces a 0-width/height widget.

export function snap(box: Box, gridSize: number): Box {
  if (gridSize <= 0) throw new Error('invalid grid size');
  return {
    x: Math.round(box.x / gridSize) * gridSize,
    y: Math.round(box.y / gridSize) * gridSize,
    w: Math.max(gridSize, Math.round(box.w / gridSize) * gridSize),
    h: Math.max(gridSize, Math.round(box.h / gridSize) * gridSize),
  };
}

export function snapPoint(pt: Point, gridSize: number): Point {
  if (gridSize <= 0) throw new Error('invalid grid size');
  return {
    x: Math.round(pt.x / gridSize) * gridSize,
    y: Math.round(pt.y / gridSize) * gridSize,
  };
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: 19 existing + 4 new = 23 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/geometry.ts packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts
git commit -m "feat(scada-engine): snap + snapPoint geometry helpers (SP-FX-3b.1)

Pure functions: snap(box, gridSize) rounds x/y/w/h with MIN-gridSize
clamp on w/h. snapPoint(pt, gridSize) rounds a point. Both throw on
gridSize <= 0 (defensive). 4 tests cover down-round, up-round, w/h
round, clamp + snapPoint."
```

---

## Task 1: editor-store +snapEnabled +setSnapEnabled +GRID_SIZE (3 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/services/editor-store.ts`
- Modify: `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append at the END of `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`:

```ts
describe('editorStore snap-grid (SP-FX-3b.1)', () => {
  beforeEach(() => {
    useEditorStore.setState({
      currentView: null,
      isDirty: false,
      history: { past: [], future: [] },
      selection: [],
      snapEnabled: true,
    } as any, true);
  });

  it('default snapEnabled === true', () => {
    expect(useEditorStore.getState().snapEnabled).toBe(true);
  });

  it('setSnapEnabled(false) updates state without pushing history', () => {
    const before = useEditorStore.getState().history.past.length;
    useEditorStore.getState().setSnapEnabled(false);
    expect(useEditorStore.getState().snapEnabled).toBe(false);
    expect(useEditorStore.getState().history.past.length).toBe(before);
  });

  it('setSnapEnabled does not affect currentView or items', () => {
    const view = {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } },
      schemaVersion: 1,
    };
    useEditorStore.getState().openView(view as any);
    useEditorStore.getState().setSnapEnabled(false);
    expect(useEditorStore.getState().currentView).toEqual(view);
  });
});
```

If the test file does not yet import `useEditorStore`, ensure the top of the file has:

```ts
import { useEditorStore } from '../editor-store';
```

(Already present per SP-FX-2.)

- [ ] **Step 2: Run test to verify it fails (RED)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -15
```

Expected: 3 failures (`snapEnabled` not on state / `setSnapEnabled` not a function).

- [ ] **Step 3: Patch editor-store.ts — EditorData interface**

Open `packages/web-ui/src/scada-engine/services/editor-store.ts`. Find the `EditorData` interface:

```ts
export interface EditorData {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
}
```

Replace with:

```ts
export interface EditorData {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
  snapEnabled: boolean;
}
```

- [ ] **Step 4: Patch editor-store.ts — EditorActions interface**

Find the `EditorActions` interface. Replace:

```ts
export interface EditorActions {
  openView: (view: FuxaView) => void;
  closeView: () => void;
  addWidget: (widget: FuxaWidget) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>) => void;
  deleteWidgets: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
}
```

with:

```ts
export interface EditorActions {
  openView: (view: FuxaView) => void;
  closeView: () => void;
  addWidget: (widget: FuxaWidget) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>) => void;
  deleteWidgets: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
  setSnapEnabled: (enabled: boolean) => void;
}
```

- [ ] **Step 5: Patch editor-store.ts — module-level GRID_SIZE + initial state**

Above the `const HISTORY_LIMIT = 50;` line, add:

```ts
// SP-FX-3b.1: editor grid size in svg user-space units. Fixed at 10 for now;
// dynamic gridSize deferred to SP-FX-3b.2.
export const GRID_SIZE = 10;
```

Find the `_store = create<EditorData>(() => ({...}))` block:

```ts
const _store = create<EditorData>(() => ({
  currentView: null,
  isDirty: false,
  history: { past: [], future: [] },
  selection: [],
}));
```

Replace with:

```ts
const _store = create<EditorData>(() => ({
  currentView: null,
  isDirty: false,
  history: { past: [], future: [] },
  selection: [],
  snapEnabled: true,
}));
```

- [ ] **Step 6: Patch editor-store.ts — openView/closeView preserve snapEnabled**

Find:

```ts
  openView: (view) => _store.setState({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  }),
```

Replace with:

```ts
  openView: (view) => _store.setState((s) => ({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
  })),
```

Find:

```ts
  closeView: () => _store.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  }),
```

Replace with:

```ts
  closeView: () => _store.setState((s) => ({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
  })),
```

At the END of the `actions: EditorActions = { ... }` const (after the existing `markClean` action), add `setSnapEnabled`:

```ts
  setSnapEnabled: (enabled) => _store.setState({ snapEnabled: enabled }),
```

(Add as another comma-separated property of the actions const.)

- [ ] **Step 7: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -10
```

Expected: existing tests still pass + 3 new pass.

- [ ] **Step 8: Verify tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 9: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/editor-store.ts packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts
git commit -m "feat(scada-engine): snapEnabled state + setSnapEnabled action + GRID_SIZE (SP-FX-3b.1)

editorStore extends EditorData with snapEnabled (default true) and
EditorActions with setSnapEnabled. Module-level GRID_SIZE=10 constant
exported for consumers. setSnapEnabled does not push history (UI
state, not data state). openView/closeView preserve snapEnabled
across view switches. 3 tests."
```

---

## Task 2: canvas-svg setGridVisible (3 jsdom tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`

- [ ] **Step 1: Write the failing tests**

Append at the END of `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`:

```ts
describe('CanvasController.setGridVisible (SP-FX-3b.1)', () => {
  it('setGridVisible(true) inserts pattern + grid rect; rect renders below widget layer', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.setGridVisible(true, 10);
    const pattern = container.querySelector('pattern[data-grid="10"]');
    const gridRect = container.querySelector('[data-overlay="grid"]');
    expect(pattern).not.toBeNull();
    expect(gridRect).not.toBeNull();
    expect(gridRect?.getAttribute('pointer-events')).toBe('none');
    // grid rect appears before widget layer in document order (= renders below)
    const root = c.getSvgRoot();
    const all = Array.from(root.children);
    const widgetLayer = root.querySelector('[data-layer="widgets"]');
    expect(all.indexOf(gridRect as Element)).toBeLessThan(all.indexOf(widgetLayer as Element));
  });

  it('setGridVisible(false) removes pattern + rect; idempotent on second false', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.setGridVisible(true, 10);
    c.setGridVisible(false);
    expect(container.querySelector('pattern[data-grid]')).toBeNull();
    expect(container.querySelector('[data-overlay="grid"]')).toBeNull();
    expect(() => c.setGridVisible(false)).not.toThrow();
  });

  it('re-true after false re-inserts; widget layer untouched', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget({ id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 80 } as any);
    c.setGridVisible(true, 10);
    c.setGridVisible(false);
    c.setGridVisible(true, 10);
    expect(container.querySelector('pattern[data-grid="10"]')).not.toBeNull();
    expect(container.querySelector('[data-widget-id="w1"]')).not.toBeNull();
  });
});
```

The `container` and `beforeEach`/`afterEach` are file-scope (set up at top by SP-FX-3a tests) — new describe block inherits.

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -15
```

Expected: 3 failures (`setGridVisible is not a function`).

- [ ] **Step 3: Add setGridVisible to canvas-svg.ts**

Open `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`. Insert a new method BEFORE `destroy()`. Find:

```ts
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.widgetMap.clear();
    this.root.remove();
  }
}
```

Replace with:

```ts
  setGridVisible(visible: boolean, gridSize = 10): void {
    if (this.destroyed) return;
    const rootNode = this.root.node as SVGSVGElement;
    // Always remove existing grid (idempotent on re-true).
    const existingPattern = rootNode.querySelector('pattern[data-grid]');
    const existingRect = rootNode.querySelector('[data-overlay="grid"]');
    if (existingPattern) existingPattern.parentNode?.removeChild(existingPattern);
    if (existingRect) existingRect.parentNode?.removeChild(existingRect);
    if (!visible) return;

    // Build pattern inside <defs> (create defs if absent).
    let defs = rootNode.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      rootNode.insertBefore(defs, rootNode.firstChild);
    }
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', 'grid-pat');
    pattern.setAttribute('data-grid', String(gridSize));
    pattern.setAttribute('width', String(gridSize));
    pattern.setAttribute('height', String(gridSize));
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${gridSize} 0 L 0 0 0 ${gridSize}`);
    path.setAttribute('stroke', '#e5e7eb');
    path.setAttribute('fill', 'none');
    pattern.appendChild(path);
    defs.appendChild(pattern);

    // Insert grid rect as FIRST child of root (z=0, below widgetLayer/overlayLayer).
    const viewBoxAttr = rootNode.getAttribute('viewBox')?.split(' ').map(Number) ?? [0, 0, 800, 600];
    const vbW = viewBoxAttr[2] ?? 800;
    const vbH = viewBoxAttr[3] ?? 600;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', String(vbW));
    rect.setAttribute('height', String(vbH));
    rect.setAttribute('fill', 'url(#grid-pat)');
    rect.setAttribute('pointer-events', 'none');
    rect.setAttribute('data-overlay', 'grid');
    rootNode.insertBefore(rect, rootNode.firstChild);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.widgetMap.clear();
    this.root.remove();
  }
}
```

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -10
```

Expected: 10 existing + 3 new = 13 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/canvas-svg.ts packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts
git commit -m "feat(scada-engine): CanvasController.setGridVisible (SP-FX-3b.1)

Inserts <pattern> + <rect data-overlay=grid> at z=0 below widget
layer. Idempotent: setGridVisible(true) re-cycles existing pattern.
pointer-events=none on the grid rect so widget clicks pass through.
3 jsdom tests cover insert, remove, re-insert + widget preservation."
```

---

## Task 3: pointer-tools cancel + getSnapEnabled + snap injection (5 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`

- [ ] **Step 1: Update test setup — add getSnapEnabled to callbacks**

Open `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`. Find the top-of-file `let` declarations:

```ts
let getWidgetAt: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

Replace with:

```ts
let getWidgetAt: ReturnType<typeof vi.fn>;
let getSnapEnabled: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

In the existing `beforeEach`, find:

```ts
  getWidgetAt = vi.fn();
  tools = new PointerTools(canvas as any, handles as any, {
    getWidgetAt: (pt) => getWidgetAt(pt) as { id: string; box: Box } | null,
    onWidgetTransformed: (id, box) => onWidgetTransformed(id, box),
    onSelect: (id) => onSelect(id),
  });
```

Replace with:

```ts
  getWidgetAt = vi.fn();
  getSnapEnabled = vi.fn(() => false);
  tools = new PointerTools(canvas as any, handles as any, {
    getWidgetAt: (pt) => getWidgetAt(pt) as { id: string; box: Box } | null,
    onWidgetTransformed: (id, box) => onWidgetTransformed(id, box),
    onSelect: (id) => onSelect(id),
    getSnapEnabled: () => getSnapEnabled() as boolean,
  });
```

- [ ] **Step 2: Write the failing tests**

Append at the END of `pointer-tools.test.ts`:

```ts
describe('PointerTools snap + cancel (SP-FX-3b.1)', () => {
  it('drag-body with snap ON: mousemove snaps newBox to 10px grid', () => {
    getSnapEnabled.mockReturnValue(true);
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(60, 60));
    tools.handleMouseMove(mm(73, 78));  // dx=13, dy=18 → newBox=(63,68,120,80) → snap → (60,70,120,80)
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.x).toBe(60);
    expect(lastCall.y).toBe(70);
    expect(lastCall.w).toBe(120);
    expect(lastCall.h).toBe(80);
  });

  it('drag-body with snap OFF: raw delta passes through', () => {
    getSnapEnabled.mockReturnValue(false);
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(60, 60));
    tools.handleMouseMove(mm(73, 78));
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.x).toBe(63);
    expect(lastCall.y).toBe(68);
  });

  it('drag-handle SE with snap: w/h snapped to 10', () => {
    getSnapEnabled.mockReturnValue(true);
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(170, 130));
    tools.handleMouseMove(mm(188, 147));  // dx=18, dy=17 → newBox w=138 h=97 → snap → 140,100
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.w).toBe(140);
    expect(lastCall.h).toBe(100);
  });

  it('cancel() in drag-body restores startBox and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(60, 60));
    tools.handleMouseMove(mm(73, 78));  // canvas DOM now shows moved box
    canvas.upsertWidget.mockClear();
    handles.updateBox.mockClear();
    tools.cancel();
    expect(canvas.upsertWidget).toHaveBeenCalledTimes(1);
    const restored = canvas.upsertWidget.mock.calls[0][0];
    expect(restored.x).toBe(50);
    expect(restored.y).toBe(50);
    expect(handles.updateBox).toHaveBeenCalledWith({ x: 50, y: 50, w: 120, h: 80 });
    expect(tools.state.kind).toBe('idle');
    expect(onWidgetTransformed).not.toHaveBeenCalled();
  });

  it('cancel() in idle is no-op', () => {
    canvas.upsertWidget.mockClear();
    handles.updateBox.mockClear();
    tools.cancel();
    expect(canvas.upsertWidget).not.toHaveBeenCalled();
    expect(handles.updateBox).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -20
```

Expected: existing 12 still pass (they pass `getSnapEnabled: () => false` via Step 1 update — pointer-tools.ts will error at `cb.getSnapEnabled is not a function` only if NOT updated. Existing pointer-tools.ts has no `getSnapEnabled` consumer yet, so callbacks object accepts extra field silently — 12 still pass). 5 NEW fail (3 because snap not applied → assertions on snapped values; 2 because `tools.cancel is not a function`).

- [ ] **Step 4: Patch pointer-tools.ts — imports + interface + snap injection + cancel**

Open `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`. Update imports. Find:

```ts
import { clientToSvg, applyHandleDrag, type HandleId, type Box, type Point } from './geometry';
```

Replace with:

```ts
import { clientToSvg, applyHandleDrag, snap, type HandleId, type Box, type Point } from './geometry';
import { GRID_SIZE } from '../services/editor-store';
```

Find `PointerToolsCallbacks`:

```ts
export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null) => void;
}
```

Replace with:

```ts
export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null) => void;
  getSnapEnabled: () => boolean;
}
```

Find `handleMouseMove`:

```ts
  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    this.canvas.upsertWidget({ id: this.state.widgetId, type: 'svg-ext-value' as any, property: {} as any, x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h });
    this.handles.updateBox(newBox);
  }
```

Replace with:

```ts
  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    let newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    if (this.cb.getSnapEnabled()) newBox = snap(newBox, GRID_SIZE);
    this.canvas.upsertWidget({ id: this.state.widgetId, type: 'svg-ext-value' as any, property: {} as any, x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h });
    this.handles.updateBox(newBox);
  }
```

Find `handleMouseUp`:

```ts
  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    this.cb.onWidgetTransformed(this.state.widgetId, newBox);
    this.state = { kind: 'idle' };
  }
```

Replace with:

```ts
  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    let newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    if (this.cb.getSnapEnabled()) newBox = snap(newBox, GRID_SIZE);
    this.cb.onWidgetTransformed(this.state.widgetId, newBox);
    this.state = { kind: 'idle' };
  }
```

Add `cancel()` BEFORE `destroy()`. Find:

```ts
  destroy(): void {
    if (this.destroyed) return;
```

Insert above it:

```ts
  cancel(): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const startBox = this.state.startBox;
    const widgetId = this.state.widgetId;
    this.canvas.upsertWidget({ id: widgetId, type: 'svg-ext-value' as any, property: {} as any, x: startBox.x, y: startBox.y, w: startBox.w, h: startBox.h });
    this.handles.updateBox(startBox);
    this.state = { kind: 'idle' };
  }

  destroy(): void {
    if (this.destroyed) return;
```

- [ ] **Step 5: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -10
```

Expected: 12 existing + 5 new = 17 passed.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/pointer-tools.ts packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts
git commit -m "feat(scada-engine): PointerTools cancel + snap + getSnapEnabled (SP-FX-3b.1)

PointerToolsCallbacks gains getSnapEnabled() polled per frame.
handleMouseMove/Up apply snap(newBox, GRID_SIZE) when ON. New
cancel() restores startBox to canvas + handles, sets state to
idle, does NOT fire onWidgetTransformed (no history entry). 5
new tests cover snap on/off in drag-body + drag-handle SE, cancel
mid-drag, cancel in idle no-op."
```

---

## Task 4: EditorCanvas keydown handler + snap-wire (6 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append at the END of `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
describe('EditorCanvas keyboard handler (SP-FX-3b.1)', () => {
  function makeViewWithW1(): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 120, h: 80 } },
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, ...mods });
    document.dispatchEvent(event);
  }

  it('Ctrl+Z restores previous widget state', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().updateWidget('w1', { x: 100 });
    });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(100);
    act(() => { fireKey('z', { ctrlKey: true }); });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(50);
  });

  it('Ctrl+Y re-applies after undo', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().updateWidget('w1', { x: 100 });
      useEditorStore.getState().undo();
    });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(50);
    act(() => { fireKey('y', { ctrlKey: true }); });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(100);
  });

  it('ArrowRight with selection moves widget x+1 and pushes history', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const pastBefore = useEditorStore.getState().history.past.length;
    act(() => { fireKey('ArrowRight'); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(51);
    expect(useEditorStore.getState().history.past.length).toBe(pastBefore + 1);
  });

  it('Shift+ArrowRight moves widget x+10', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    act(() => { fireKey('ArrowRight', { shiftKey: true }); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(60);
  });

  it('keyboard handler skipped when activeElement is INPUT', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithW1());
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { fireKey('ArrowRight'); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(50);  // unchanged — handler skipped
    document.body.removeChild(input);
  });

  it('snap-wire: setSnapEnabled toggles grid background', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeViewWithW1()); });
    expect(container.querySelector('[data-overlay="grid"]')).not.toBeNull();
    act(() => { useEditorStore.getState().setSnapEnabled(false); });
    expect(container.querySelector('[data-overlay="grid"]')).toBeNull();
    act(() => { useEditorStore.getState().setSnapEnabled(true); });
    expect(container.querySelector('[data-overlay="grid"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -15
```

Expected: 6 NEW failures. Existing 8 pass.

- [ ] **Step 3: Patch EditorCanvas.tsx — imports + selectors**

Open `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`. Find:

```tsx
import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import type { Box } from './geometry';
import type { FuxaWidget } from '../models';
```

Replace with:

```tsx
import React, { useEffect, useRef } from 'react';
import { useEditorStore, GRID_SIZE } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import { snapPoint, type Box } from './geometry';
import type { FuxaWidget } from '../models';
```

Find selectors:

```tsx
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);
```

Replace with:

```tsx
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
```

- [ ] **Step 4: Patch EditorCanvas.tsx — lifecycle useEffect (pointer cb + initial grid)**

Find the PointerTools ctor inside the lifecycle useEffect:

```tsx
    const pointer = new PointerTools(canvas, handles, {
      getWidgetAt: (pt) => {
        const view = useEditorStore.getState().currentView;
        if (!view) return null;
        const ids = Object.keys(view.items).reverse();
        for (const id of ids) {
          const geom = getWidgetGeom(view.items[id]);
          if (!geom) continue;
          if (pt.x >= geom.x && pt.x <= geom.x + geom.w && pt.y >= geom.y && pt.y <= geom.y + geom.h) {
            return { id, box: geom };
          }
        }
        return null;
      },
      onWidgetTransformed: (id, box) => updateWidget(id, box as Partial<FuxaWidget>),
      onSelect: (id) => setSelection(id ? [id] : []),
    });
```

Replace with:

```tsx
    const pointer = new PointerTools(canvas, handles, {
      getWidgetAt: (pt) => {
        const view = useEditorStore.getState().currentView;
        if (!view) return null;
        const ids = Object.keys(view.items).reverse();
        for (const id of ids) {
          const geom = getWidgetGeom(view.items[id]);
          if (!geom) continue;
          if (pt.x >= geom.x && pt.x <= geom.x + geom.w && pt.y >= geom.y && pt.y <= geom.y + geom.h) {
            return { id, box: geom };
          }
        }
        return null;
      },
      onWidgetTransformed: (id, box) => updateWidget(id, box as Partial<FuxaWidget>),
      onSelect: (id) => setSelection(id ? [id] : []),
      getSnapEnabled: () => useEditorStore.getState().snapEnabled,
    });
```

Find the lines after `canvas.loadView(currentView);`:

```tsx
    refs.current = { canvas, handles, pointer };
    canvas.loadView(currentView);
    return () => {
```

Replace with:

```tsx
    refs.current = { canvas, handles, pointer };
    canvas.loadView(currentView);
    canvas.setGridVisible(useEditorStore.getState().snapEnabled, GRID_SIZE);
    return () => {
```

- [ ] **Step 5: Patch EditorCanvas.tsx — add snap-wire + keyboard useEffects**

Find the existing handle-sync useEffect (deps `[selection, items]`):

```tsx
  useEffect(() => {
    if (!refs.current || !currentView) return;
    const id = selection[0];
    if (!id) { refs.current.handles.hide(); return; }
    const widget = currentView.items[id];
    if (!widget) { refs.current.handles.hide(); return; }
    const geom = getWidgetGeom(widget);
    if (!geom) { refs.current.handles.hide(); return; }
    refs.current.handles.show(geom);
  }, [selection, items]); // eslint-disable-line react-hooks/exhaustive-deps
```

Add immediately AFTER it (and before the final `return ( <div ref=...> ... )` of the component):

```tsx
  // SP-FX-3b.1: snap-toggle wire — repaint grid background when snapEnabled changes.
  useEffect(() => {
    if (!refs.current) return;
    refs.current.canvas.setGridVisible(snapEnabled, GRID_SIZE);
  }, [snapEnabled]);

  // SP-FX-3b.1: global keyboard handler — Escape / Ctrl+Z / Ctrl+Y / Arrow nudge.
  // Skipped when activeElement is INPUT / TEXTAREA / contentEditable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const tag = (ae?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae as any)?.isContentEditable) return;

      if (e.key === 'Escape') {
        refs.current?.pointer.cancel();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (refs.current?.pointer.state.kind !== 'idle') return;
        useEditorStore.getState().undo();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (refs.current?.pointer.state.kind !== 'idle') return;
        useEditorStore.getState().redo();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const state = useEditorStore.getState();
        const id = state.selection[0];
        if (!id || !state.currentView) return;
        const w = state.currentView.items[id] as any;
        if (typeof w.x !== 'number') return;
        const step = e.shiftKey ? GRID_SIZE : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const next = { x: w.x + dx, y: w.y + dy };
        const final = state.snapEnabled ? snapPoint(next, GRID_SIZE) : next;
        state.updateWidget(id, final as Partial<FuxaWidget>);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
```

- [ ] **Step 6: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -10
```

Expected: 8 existing + 6 new = 14 passed.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): EditorCanvas keyboard + snap-toggle wire (SP-FX-3b.1)

Two new useEffect: snapEnabled change triggers canvas.setGridVisible;
document.body keydown handles Escape (pointer.cancel), Ctrl+Z/Y
(undo/redo with drag-state guard), Arrow nudge (1px / Shift+10px with
optional snap). activeElement INPUT/TEXTAREA/contentEditable guard.
PointerTools ctor receives getSnapEnabled callback. 6 tests."
```

---

## Task 5: editor barrel +snap +snapPoint export

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`

- [ ] **Step 1: Update barrel re-exports**

Open `packages/web-ui/src/scada-engine/editor/index.ts`. Find:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  type Box, type Point, type HandleId,
} from './geometry';
```

Replace with:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  type Box, type Point, type HandleId,
} from './geometry';
```

- [ ] **Step 2: tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/index.ts
git commit -m "feat(scada-engine): export snap + snapPoint from editor barrel (SP-FX-3b.1)"
```

---

## Task 6: Playwright e2e 7 missing-handle smoke

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-canvas-3b1.spec.ts`

- [ ] **Step 1: Inspect existing SP-FX-3a Playwright spec for the login pattern**

```bash
cd /Volumes/SSD/projects/BIOCore
cat packages/web-ui/e2e/scada-editor-canvas.spec.ts | head -50
```

Note the login helper, the `__resetEditorStore` call, the canvas SVG selector pattern (must locate canvas SVG, not lucide icon SVGs in the sidebar).

- [ ] **Step 2: Write the smoke spec**

Create `packages/web-ui/e2e/scada-editor-canvas-3b1.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"]').fill('admin');
  await page.locator('input[type="password"]').fill('admin');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
}

async function dragHandleAndAssert(
  page: Page,
  handle: string,
  dxPx: number,
  dyPx: number,
  assertion: (view: any) => void,
) {
  const handleEl = await page.locator(`[data-handle="${handle}"]`).boundingBox();
  if (!handleEl) throw new Error(`${handle} handle bbox unavailable`);
  const cx = handleEl.x + handleEl.width / 2;
  const cy = handleEl.y + handleEl.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dxPx, cy + dyPx, { steps: 10 });
  await page.mouse.up();
  const view = await page.evaluate(() => (window as any).__getCurrentView());
  assertion(view);
}

test.describe('SP-FX-3b.1 — 7 missing handle smoke', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    // Click widget w1 to select; this shows handles
    await page.locator('[data-widget-id="w1"]').click();
    await page.waitForSelector('[data-handle="nw"]', { state: 'visible' });
    await page.waitForTimeout(200);
  });

  test('NW handle drag: w/h shrink, x/y move inward', async ({ page }) => {
    await dragHandleAndAssert(page, 'nw', 30, 20, (view) => {
      expect(view.items.w1.x).toBeGreaterThan(50);
      expect(view.items.w1.y).toBeGreaterThan(50);
      expect(view.items.w1.w).toBeLessThan(120);
      expect(view.items.w1.h).toBeLessThan(80);
    });
  });

  test('N handle drag: h shrinks, y moves down', async ({ page }) => {
    await dragHandleAndAssert(page, 'n', 0, 20, (view) => {
      expect(view.items.w1.y).toBeGreaterThan(50);
      expect(view.items.w1.h).toBeLessThan(80);
    });
  });

  test('NE handle drag: w grows, h shrinks, y moves down', async ({ page }) => {
    await dragHandleAndAssert(page, 'ne', 30, 20, (view) => {
      expect(view.items.w1.w).toBeGreaterThan(120);
      expect(view.items.w1.y).toBeGreaterThan(50);
      expect(view.items.w1.h).toBeLessThan(80);
    });
  });

  test('W handle drag: w shrinks, x moves right', async ({ page }) => {
    await dragHandleAndAssert(page, 'w', 30, 0, (view) => {
      expect(view.items.w1.x).toBeGreaterThan(50);
      expect(view.items.w1.w).toBeLessThan(120);
    });
  });

  test('E handle drag: w grows', async ({ page }) => {
    await dragHandleAndAssert(page, 'e', 30, 0, (view) => {
      expect(view.items.w1.w).toBeGreaterThan(120);
    });
  });

  test('SW handle drag: w shrinks, h grows, x moves right', async ({ page }) => {
    await dragHandleAndAssert(page, 'sw', 30, 20, (view) => {
      expect(view.items.w1.x).toBeGreaterThan(50);
      expect(view.items.w1.w).toBeLessThan(120);
      expect(view.items.w1.h).toBeGreaterThan(80);
    });
  });

  test('S handle drag: h grows', async ({ page }) => {
    await dragHandleAndAssert(page, 's', 0, 20, (view) => {
      expect(view.items.w1.h).toBeGreaterThan(80);
    });
  });
});
```

Note about snap: tests use >50 / <120 inequalities. Movement deltas (20-30 px) exceed snap rounding (10 px) so inequalities hold even with snap ON. No need to disable snap.

- [ ] **Step 3: Run Playwright**

Check `playwright.config.ts` for `webServer` block. If not auto-starting:

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 15
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/dev/scada-editor-canvas
```

Expected HTTP 200. Then:

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas-3b1.spec.ts 2>&1 | tail -30
```

Expected: 7 passed.

If chromium not installed: `pnpm --filter @biocore/web-ui exec playwright install chromium`.

Cleanup:

```bash
pkill -f "next dev" 2>/dev/null; true
```

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-editor-canvas-3b1.spec.ts
git commit -m "test(scada-engine): Playwright 7 missing-handle smoke (SP-FX-3b.1)

NW/N/NE/W/E/SW/S handle drags each verified via boundingBox-based
mouse drag + __getCurrentView() assertion. Login helper + post-click
handle-visible wait. Closes SP-FX-3a gap (only SE handle was e2e
covered)."
```

---

## Task 7: Regression + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | grep -E "Test Files|Tests" | tail -3
```

Expected: 530 + 4 (T0) + 3 (T1) + 3 (T2) + 5 (T3) + 6 (T4) = **551 passed**.

If short by 1-2, recount per-task counts and fix.

- [ ] **Step 2: server + data-service regression**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run 2>&1 | grep "Tests" | tail -2
pnpm --filter @biocore/data-service exec vitest run 2>&1 | grep "Tests" | tail -2
```

Expected: server 147/147, data-service 84/84.

- [ ] **Step 3: tsc full pass**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 4: Playwright regression (10 total)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 15
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas.spec.ts e2e/scada-editor-canvas-3b1.spec.ts 2>&1 | tail -10
pkill -f "next dev" 2>/dev/null; true
```

Expected: 3 (SP-FX-3a) + 7 (new) = **10 passed**.

- [ ] **Step 5: §8 stop-condition self-check (spec §8)**

Verify each:

1. 7 missing-handle Playwright green → T6 step 3.
2. snap-toggle changes grid bg DOM → T2 + T4 test #6.
3. snap ON drag → x/y/w/h % 10 === 0 → T3 tests.
4. ESC restores widget → T3 test.
5. Arrow 1 px / Shift+Arrow 10 px → T4 tests.
6. Ctrl+Z calls undo → T4 test (observable via undo restore).
7. INPUT activeElement skip → T4 test.
8. web-ui ≥ 551 + tsc clean → T7 step 1 + 3.
9. Playwright 10/10 → T7 step 4.

If any trips → STOP, surface to user, do not push. No threshold lowering.

- [ ] **Step 6: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds. SP-FX-3b.1 ships as ~7 atomic commits.

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §1.1 in-scope #1 (8-handle e2e) | T6 |
| §1.1 in-scope #2 (snap-grid) | T0 + T1 + T2 + T3 + T4 |
| §1.1 in-scope #3 (ESC cancel) | T3 + T4 |
| §1.1 in-scope #4 (Arrow nudge) | T4 |
| §1.1 in-scope #5 (Ctrl+Z/Y) | T4 |
| §1.1 in-scope #6 (keyboard listener) | T4 |
| §2 file structure | T0-T6 all match |
| §3 type contract (GRID_SIZE, snapEnabled, setSnapEnabled, snap/snapPoint, setGridVisible, cancel, getSnapEnabled) | T0/T1/T2/T3/T4 |
| §4 data flow (6 sub-flows) | T0-T4 + T6 cover |
| §5 error handling (16 scenarios) | T1/T3/T4 + tests |
| §6.1-6.5 testing (+21 tests) | 4+3+3+5+6=21 ✓ |
| §6.6 Playwright (+7) | T6 ✓ |
| §7 risks (R1-R12) | mitigated by impl |
| §8 stop conditions (9) | T7 step 5 ✓ |
| §10 acceptance | T7 step 1-4 |

**Gaps found:** none.

**Placeholder scan:** every code block complete; every command has expected output; no TBD/TODO.

**Type consistency:**
- `GRID_SIZE = 10` declared T1, imported in T3 (pointer-tools) + T4 (EditorCanvas)
- `snap(box, gridSize)` consistent T0 → T3 consumer → T6 e2e
- `snapPoint(pt, gridSize)` consistent T0 → T4 nudge
- `snapEnabled: boolean` declared T1 (EditorData), consumed T3 (callback) + T4 (selector + wire useEffect + nudge snap branch)
- `setSnapEnabled` signature consistent T1 → T4 tests
- `PointerToolsCallbacks.getSnapEnabled: () => boolean` declared T3, supplied T4 ctor + T3 test mocks
- `CanvasController.setGridVisible(visible, gridSize?)` declared T2, called T4 lifecycle useEffect + snap-wire useEffect
- `PointerTools.cancel()` declared T3, called T4 Escape handler

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-3b-1-editor-canvas-increment-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + spec/code review between tasks (proven pattern from SP-FX-1 + SP-FX-2 + SP-FX-3a)
2. **Inline Execution** — execute tasks in this session via executing-plans, batch checkpoints

Which approach?
