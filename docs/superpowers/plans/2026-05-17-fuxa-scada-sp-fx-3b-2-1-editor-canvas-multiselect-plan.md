# SP-FX-3b.2.1 Editor Canvas Multi-Select + Box-Select + 4 UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multi-select + box-select + nudge coalesce + dynamic gridSize + snap visual feedback + ESC 3-tier in ~1 week.

**Architecture:** Additive changes to 5 existing files in `packages/web-ui/src/scada-engine/`. New geometry helpers (`computeBbox` / `intersectsBox` / `applyMultiDrag`), new `SnapGuides` class in transform-handles, `PointerState` union extended (drag-body widgetIds[], new box-select state), 6 new pointer-tools callbacks, 2 new useEffect in EditorCanvas. One new Playwright spec.

**Tech Stack:** TypeScript 5, React 18, vitest + jsdom + @testing-library/react (existing), Playwright (existing), zustand 4.4 + immer 10 (existing), `@svgdotjs/svg.js ^3.2.4` (existing). No new dependencies.

---

## File Structure

**Modify:**
- `packages/web-ui/src/scada-engine/services/editor-store.ts` — add `gridSize` state, `setGridSize` action, `updateWidget` opts arg; preserve `GRID_SIZE` as `@deprecated` re-export
- `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts` — +5 tests
- `packages/web-ui/src/scada-engine/editor/geometry.ts` — add `computeBbox`, `intersectsBox`, `applyMultiDrag`
- `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts` — +6 tests
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` — add `showBbox()` method and new `SnapGuides` class
- `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts` — +4 tests
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` — extend `PointerState` (widgetIds + box-select), extend `PointerToolsCallbacks` (6 new), update `handleMouseDown/Move/Up/cancel`
- `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts` — update existing test assertions; +8 new tests
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` — wire all new cb + 2 new useEffect + extend keydown handler + instantiate SnapGuides + rubberBand
- `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx` — +9 tests
- `packages/web-ui/src/scada-engine/editor/index.ts` — re-export `SnapGuides`, `computeBbox`, `intersectsBox`, `applyMultiDrag`

**Create:**
- `packages/web-ui/e2e/scada-editor-canvas-3b2-1.spec.ts` — 5 Playwright smoke

**Test count target:**
- web-ui vitest: 551 → **583** (+32: 6 geo + 5 store + 4 handles + 8 pointer + 9 React)
- Playwright: 10 → **15** (+5)

---

## Task 0: geometry.ts +computeBbox +intersectsBox +applyMultiDrag (6 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/geometry.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`. Update the top import line to include the new exports:

Find:

```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  type Box, type Point,
} from '../geometry';
```

Replace with:

```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  type Box, type Point,
} from '../geometry';
```

Append at the END of the file:

```ts
describe('geometry.computeBbox (SP-FX-3b.2.1)', () => {
  it('empty array returns zero box', () => {
    expect(computeBbox([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('single box returns same box', () => {
    const b: Box = { x: 10, y: 20, w: 50, h: 30 };
    expect(computeBbox([b])).toEqual(b);
  });

  it('two disjoint boxes returns union AABB', () => {
    const a: Box = { x: 10, y: 10, w: 50, h: 30 };
    const b: Box = { x: 100, y: 100, w: 60, h: 40 };
    expect(computeBbox([a, b])).toEqual({ x: 10, y: 10, w: 150, h: 130 });
  });
});

describe('geometry.intersectsBox (SP-FX-3b.2.1)', () => {
  it('disjoint boxes return false', () => {
    expect(intersectsBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 100, w: 10, h: 10 })).toBe(false);
  });

  it('overlapping and edge-touch boxes return true', () => {
    expect(intersectsBox({ x: 0, y: 0, w: 50, h: 50 }, { x: 30, y: 30, w: 50, h: 50 })).toBe(true);
    expect(intersectsBox({ x: 0, y: 0, w: 50, h: 50 }, { x: 50, y: 0, w: 50, h: 50 })).toBe(true);
  });
});

describe('geometry.applyMultiDrag (SP-FX-3b.2.1)', () => {
  it('translates all boxes by delta, preserves w/h, returns [] for empty input', () => {
    expect(applyMultiDrag([], 10, 20)).toEqual([]);
    const boxes: Box[] = [{ x: 0, y: 0, w: 50, h: 30 }, { x: 100, y: 100, w: 60, h: 40 }];
    expect(applyMultiDrag(boxes, 10, 20)).toEqual([
      { x: 10, y: 20, w: 50, h: 30 },
      { x: 110, y: 120, w: 60, h: 40 },
    ]);
  });
});
```

(6 it() total: 3 computeBbox + 2 intersectsBox + 1 applyMultiDrag — last combines two assertions to match spec count.)

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -15
```

Expected: 6 failures (`computeBbox` / `intersectsBox` / `applyMultiDrag` not exported).

- [ ] **Step 3: Add 3 functions to geometry.ts**

Open `packages/web-ui/src/scada-engine/editor/geometry.ts`. Append AFTER `snapPoint` (at EOF):

```ts
// SP-FX-3b.2.1: multi-widget helpers — AABB computations + multi-drag translation.

export function computeBbox(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function intersectsBox(a: Box, b: Box): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function applyMultiDrag(boxes: Box[], dx: number, dy: number): Box[] {
  return boxes.map((b) => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }));
}
```

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: 23 existing + 6 new = **29 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/geometry.ts packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts
git commit -m "feat(scada-engine): multi-widget geometry helpers (SP-FX-3b.2.1)

Pure functions: computeBbox(boxes) returns union AABB (zero box for
empty), intersectsBox(a, b) AABB overlap (edge-touch inclusive),
applyMultiDrag(boxes, dx, dy) translates all boxes preserving w/h.
6 tests cover empty/single/disjoint bbox, disjoint/overlap/edge-touch
intersect, empty/non-empty multi-drag."
```

---

## Task 1: editor-store +gridSize +setGridSize +updateWidget silent opt (5 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/services/editor-store.ts`
- Modify: `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append at the END of `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`:

```ts
describe('editorStore gridSize + setGridSize (SP-FX-3b.2.1)', () => {
  beforeEach(() => {
    useEditorStore.setState({
      currentView: null,
      isDirty: false,
      history: { past: [], future: [] },
      selection: [],
      snapEnabled: true,
      gridSize: 10,
    } as any, true);
  });

  it('default gridSize === 10', () => {
    expect(useEditorStore.getState().gridSize).toBe(10);
  });

  it('setGridSize(20) sets state without pushing history', () => {
    const before = useEditorStore.getState().history.past.length;
    useEditorStore.getState().setGridSize(20);
    expect(useEditorStore.getState().gridSize).toBe(20);
    expect(useEditorStore.getState().history.past.length).toBe(before);
  });

  it('setGridSize(12) silently rejected (non-whitelist value)', () => {
    useEditorStore.getState().setGridSize(20);
    useEditorStore.getState().setGridSize(12);
    expect(useEditorStore.getState().gridSize).toBe(20);
  });
});

describe('editorStore updateWidget silent opt (SP-FX-3b.2.1)', () => {
  beforeEach(() => {
    useEditorStore.setState({
      currentView: null,
      isDirty: false,
      history: { past: [], future: [] },
      selection: [],
      snapEnabled: true,
      gridSize: 10,
    } as any, true);
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } },
      schemaVersion: 1,
    } as any);
  });

  it('updateWidget with {silent:true} applies patch without history push', () => {
    const before = useEditorStore.getState().history.past.length;
    useEditorStore.getState().updateWidget('w1', { x: 100 } as any, { silent: true });
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(100);
    expect(useEditorStore.getState().history.past.length).toBe(before);
  });

  it('updateWidget default still pushes history (regression)', () => {
    const before = useEditorStore.getState().history.past.length;
    useEditorStore.getState().updateWidget('w1', { x: 200 } as any);
    expect((useEditorStore.getState().currentView!.items.w1 as any).x).toBe(200);
    expect(useEditorStore.getState().history.past.length).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -15
```

Expected: 5 failures.

- [ ] **Step 3: Patch editor-store.ts — EditorData interface**

Open `packages/web-ui/src/scada-engine/services/editor-store.ts`. Find:

```ts
export interface EditorData {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
  snapEnabled: boolean;
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
  gridSize: number;
}
```

- [ ] **Step 4: Patch editor-store.ts — EditorActions interface**

Find:

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

Replace with:

```ts
export interface EditorActions {
  openView: (view: FuxaView) => void;
  closeView: () => void;
  addWidget: (widget: FuxaWidget) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>, opts?: { silent?: boolean }) => void;
  deleteWidgets: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  markClean: () => void;
  setSnapEnabled: (enabled: boolean) => void;
  setGridSize: (n: number) => void;
}
```

- [ ] **Step 5: Patch GRID_SIZE const + initial state**

Find:

```ts
// SP-FX-3b.1: editor grid size in svg user-space units. Fixed at 10 for now;
// dynamic gridSize deferred to SP-FX-3b.2.
export const GRID_SIZE = 10;
```

Replace with:

```ts
// SP-FX-3b.2.1: GRID_SIZE migrated to editorStore.gridSize state. Kept as
// deprecated re-export for SP-FX-3b.1 backward compatibility. New code should
// read useEditorStore.getState().gridSize instead.
/** @deprecated Read useEditorStore.getState().gridSize instead */
export const GRID_SIZE = 10;
```

Find the `_store = create<EditorData>(() => ({...}))` block:

```ts
const _store = create<EditorData>(() => ({
  currentView: null,
  isDirty: false,
  history: { past: [], future: [] },
  selection: [],
  snapEnabled: true,
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
  gridSize: 10,
}));
```

- [ ] **Step 6: Patch openView/closeView to preserve gridSize**

Find:

```ts
  openView: (view) => _store.setState((s) => ({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
  })),
```

Replace with:

```ts
  openView: (view) => _store.setState((s) => ({
    currentView: view,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
    gridSize: s.gridSize,
  })),
```

Find:

```ts
  closeView: () => _store.setState((s) => ({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
  })),
```

Replace with:

```ts
  closeView: () => _store.setState((s) => ({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: s.snapEnabled,
    gridSize: s.gridSize,
  })),
```

- [ ] **Step 7: Patch updateWidget impl to honor opts.silent**

Find the existing `updateWidget` implementation in the `actions` object:

```ts
  updateWidget: (id, patch) => {
    const { currentView } = _store.getState();
    if (!currentView || !currentView.items[id]) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { Object.assign(draft.items[id], patch); }),
      isDirty: true,
    }));
  },
```

Replace with:

```ts
  updateWidget: (id, patch, opts) => {
    const { currentView } = _store.getState();
    if (!currentView || !currentView.items[id]) return;
    _store.setState((s) => ({
      history: opts?.silent
        ? s.history
        : { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { Object.assign(draft.items[id], patch); }),
      isDirty: true,
    }));
  },
```

- [ ] **Step 8: Add setGridSize action**

In the `actions` const, add `setGridSize` after the existing `setSnapEnabled`:

```ts
  setGridSize: (n) => {
    if (![8, 10, 16, 20].includes(n)) return;
    _store.setState({ gridSize: n });
  },
```

- [ ] **Step 9: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -10
```

Expected: existing tests + 5 new = all pass.

- [ ] **Step 10: tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 11: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/editor-store.ts packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts
git commit -m "feat(scada-engine): gridSize state + setGridSize + updateWidget silent (SP-FX-3b.2.1)

editorStore.gridSize replaces module GRID_SIZE const (kept as
@deprecated re-export for SP-FX-3b.1 compat). setGridSize(n)
validates whitelist [8, 10, 16, 20]. updateWidget gains optional
{ silent: true } opts that skips history push (used for nudge
coalesce + multi-drag batching). openView/closeView preserve
gridSize across view switches. 5 tests."
```

---

## Task 2: transform-handles +showBbox + SnapGuides class (4 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/transform-handles.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`. Update import:

Find:

```ts
import { TransformHandles } from '../transform-handles';
```

Replace with:

```ts
import { TransformHandles, SnapGuides } from '../transform-handles';
```

Append at the END:

```ts
describe('TransformHandles.showBbox (SP-FX-3b.2.1)', () => {
  it('showBbox renders dashed bbox + 4 corner indicators; resize handles hidden', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
    const corners = container.querySelectorAll('[data-bbox-corner]');
    expect(corners.length).toBe(4);
    const resizeHandles = container.querySelectorAll('[data-handle]');
    resizeHandles.forEach((rh) => {
      expect(rh.getAttribute('visibility')).toBe('hidden');
    });
  });

  it('show(single) after showBbox restores resize handles', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 0, y: 0, w: 200, h: 80 });
    h.show({ x: 50, y: 50, w: 100, h: 60 });
    const resizeHandles = container.querySelectorAll('[data-handle]');
    expect(resizeHandles.length).toBe(9);
    const corners = container.querySelectorAll('[data-bbox-corner]');
    corners.forEach((c) => {
      expect(c.getAttribute('visibility')).toBe('hidden');
    });
  });
});

describe('SnapGuides (SP-FX-3b.2.1)', () => {
  it('show renders H and V lines at box.y / box.x with viewBox extent', () => {
    const guides = new SnapGuides(canvas.overlayLayer);
    guides.show({ x: 60, y: 70, w: 50, h: 30 }, { w: 800, h: 600 });
    const h = container.querySelector('[data-guide="h"]') as SVGLineElement;
    const v = container.querySelector('[data-guide="v"]') as SVGLineElement;
    expect(h).not.toBeNull();
    expect(v).not.toBeNull();
    expect(h.getAttribute('y1')).toBe('70');
    expect(h.getAttribute('y2')).toBe('70');
    expect(h.getAttribute('x1')).toBe('0');
    expect(h.getAttribute('x2')).toBe('800');
    expect(v.getAttribute('x1')).toBe('60');
    expect(v.getAttribute('x2')).toBe('60');
    expect(v.getAttribute('y1')).toBe('0');
    expect(v.getAttribute('y2')).toBe('600');
    const group = container.querySelector('[data-overlay="snap-guides"]');
    expect(group?.getAttribute('visibility')).toBe('visible');
  });

  it('hide() sets visibility hidden; idempotent', () => {
    const guides = new SnapGuides(canvas.overlayLayer);
    guides.show({ x: 0, y: 0, w: 50, h: 50 }, { w: 800, h: 600 });
    guides.hide();
    const group = container.querySelector('[data-overlay="snap-guides"]');
    expect(group?.getAttribute('visibility')).toBe('hidden');
    expect(() => guides.hide()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -15
```

Expected: 4 failures.

- [ ] **Step 3: Patch transform-handles.ts — imports**

Open `packages/web-ui/src/scada-engine/editor/transform-handles.ts`. Find:

```ts
import type { G, Rect } from '@svgdotjs/svg.js';
```

Replace with:

```ts
import type { G, Rect, Line } from '@svgdotjs/svg.js';
```

- [ ] **Step 4: Patch transform-handles.ts — add corner indicators + mode field**

Find:

```ts
export class TransformHandles {
  private group: G;
  private selectionRect: Rect;
  private handles: Record<HandleId, Rect>;
  private currentBox: Box | null = null;
  private visible = false;
```

Replace with:

```ts
const BBOX_CORNER_SIZE = 4;
const BBOX_DASH = '6 3';

export class TransformHandles {
  private group: G;
  private selectionRect: Rect;
  private handles: Record<HandleId, Rect>;
  private bboxCorners: Rect[];
  private currentBox: Box | null = null;
  private visible = false;
  private mode: 'single' | 'bbox' = 'single';
```

- [ ] **Step 5: Patch ctor to create bbox corners**

Find the end of the constructor body (after the resize handles loop):

```ts
    this.handles = {} as Record<HandleId, Rect>;
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      const r = this.group.rect(HANDLE_SIZE, HANDLE_SIZE)
        .attr('data-handle', id)
        .attr('fill', id === 'rotate' ? '#10b981' : '#ffffff')
        .attr('stroke', '#3b82f6');
      this.handles[id] = r;
    }
  }
```

Replace with:

```ts
    this.handles = {} as Record<HandleId, Rect>;
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      const r = this.group.rect(HANDLE_SIZE, HANDLE_SIZE)
        .attr('data-handle', id)
        .attr('fill', id === 'rotate' ? '#10b981' : '#ffffff')
        .attr('stroke', '#3b82f6');
      this.handles[id] = r;
    }
    this.bboxCorners = [];
    for (let i = 0; i < 4; i++) {
      const r = this.group.rect(BBOX_CORNER_SIZE, BBOX_CORNER_SIZE)
        .attr('data-bbox-corner', String(i))
        .attr('fill', '#3b82f6')
        .attr('visibility', 'hidden');
      this.bboxCorners.push(r);
    }
  }
```

- [ ] **Step 6: Update show() to reset mode + corners hidden**

Find:

```ts
  show(box: Box): void {
    this.currentBox = box;
    this.visible = true;
    this.group.attr('visibility', 'visible');
    this.layout(box);
  }
```

Replace with:

```ts
  show(box: Box): void {
    this.currentBox = box;
    this.visible = true;
    this.mode = 'single';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', '4 2');
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'visible');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'hidden');
    this.layout(box);
  }
```

- [ ] **Step 7: Add showBbox() method**

Add right after `show()`:

```ts
  showBbox(bbox: Box): void {
    this.currentBox = bbox;
    this.visible = true;
    this.mode = 'bbox';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', BBOX_DASH);
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'hidden');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'visible');
    this.layoutBbox(bbox);
  }

  private layoutBbox(bbox: Box): void {
    this.selectionRect.attr('x', bbox.x).attr('y', bbox.y).attr('width', bbox.w).attr('height', bbox.h);
    const half = BBOX_CORNER_SIZE / 2;
    this.bboxCorners[0].attr('x', bbox.x - half).attr('y', bbox.y - half);
    this.bboxCorners[1].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y - half);
    this.bboxCorners[2].attr('x', bbox.x - half).attr('y', bbox.y + bbox.h - half);
    this.bboxCorners[3].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y + bbox.h - half);
  }
```

- [ ] **Step 8: Update hide() + updateBox()**

Find:

```ts
  hide(): void {
    this.visible = false;
    this.currentBox = null;
    this.group.attr('visibility', 'hidden');
  }
```

Replace with:

```ts
  hide(): void {
    this.visible = false;
    this.currentBox = null;
    this.mode = 'single';
    this.group.attr('visibility', 'hidden');
    for (const c of this.bboxCorners) c.attr('visibility', 'hidden');
  }
```

Find:

```ts
  updateBox(box: Box): void {
    this.currentBox = box;
    this.layout(box);
  }
```

Replace with:

```ts
  updateBox(box: Box): void {
    this.currentBox = box;
    if (this.mode === 'bbox') this.layoutBbox(box);
    else this.layout(box);
  }
```

- [ ] **Step 9: Add SnapGuides class at EOF**

Append at the END of `transform-handles.ts` (outside the `TransformHandles` class):

```ts
// SP-FX-3b.2.1: drag-time visual hint — H/V dashed lines through snapped corner.

export class SnapGuides {
  private group: G;
  private hLine: Line;
  private vLine: Line;
  private destroyed = false;

  constructor(overlay: G) {
    this.group = overlay.group().attr('data-overlay', 'snap-guides').attr('visibility', 'hidden');
    this.hLine = this.group.line(0, 0, 0, 0)
      .attr('data-guide', 'h')
      .attr('stroke', '#ec4899')
      .attr('stroke-dasharray', '3 2')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');
    this.vLine = this.group.line(0, 0, 0, 0)
      .attr('data-guide', 'v')
      .attr('stroke', '#ec4899')
      .attr('stroke-dasharray', '3 2')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');
  }

  show(snappedBox: Box, viewBox: { w: number; h: number }): void {
    if (this.destroyed) return;
    this.hLine.attr('x1', 0).attr('y1', snappedBox.y).attr('x2', viewBox.w).attr('y2', snappedBox.y);
    this.vLine.attr('x1', snappedBox.x).attr('y1', 0).attr('x2', snappedBox.x).attr('y2', viewBox.h);
    this.group.attr('visibility', 'visible');
  }

  hide(): void {
    if (this.destroyed) return;
    this.group.attr('visibility', 'hidden');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.group.remove();
  }
}
```

- [ ] **Step 10: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -10
```

Expected: 8 SP-FX-3a + 4 new = 12 passed.

- [ ] **Step 11: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/transform-handles.ts packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts
git commit -m "feat(scada-engine): TransformHandles.showBbox + SnapGuides class (SP-FX-3b.2.1)

TransformHandles gains showBbox(bbox): dashed selection rect with
heavier dash + 4 small corner indicators; resize/rotate handles
hidden in bbox mode. show() restores single mode. New SnapGuides
class draws H/V dashed pink lines through snapped corner across
viewBox. 4 tests cover bbox/single transitions + SnapGuides
show/hide."
```

---

## Task 3: pointer-tools state union + callbacks + cancel (8 new tests; updates existing)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`

- [ ] **Step 1: Update existing test assertions (drag-body widgetId → widgetIds)**

Open `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`.

Find:

```ts
  it('mousedown on widget body: onSelect + transitions to drag-body', () => {
    const box: Box = { x: 10, y: 10, w: 50, h: 30 };
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    tools.handleMouseDown(md(30, 25));
    expect(onSelect).toHaveBeenCalledWith('w1');
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetId).toBe('w1');
      expect(tools.state.startBox).toEqual(box);
    }
  });
```

Replace with:

```ts
  it('mousedown on widget body: onSelect + transitions to drag-body', () => {
    const box: Box = { x: 10, y: 10, w: 50, h: 30 };
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    tools.handleMouseDown(md(30, 25));
    expect(onSelect).toHaveBeenCalledWith('w1', false);
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetIds[0]).toBe('w1');
      expect(tools.state.startBoxes.get('w1')).toEqual(box);
    }
  });
```

Find:

```ts
  it('re-mousedown after mouseup starts a fresh drag', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseUp(mu(20, 20));
    expect(tools.state.kind).toBe('idle');
    getWidgetAt.mockReturnValue({ id: 'w2', box: { x: 100, y: 100, w: 60, h: 40 } });
    tools.handleMouseDown(md(110, 110));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetId).toBe('w2');
  });
```

Replace with:

```ts
  it('re-mousedown after mouseup starts a fresh drag', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseUp(mu(20, 20));
    expect(tools.state.kind).toBe('idle');
    getWidgetAt.mockReturnValue({ id: 'w2', box: { x: 100, y: 100, w: 60, h: 40 } });
    tools.handleMouseDown(md(110, 110));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetIds[0]).toBe('w2');
  });
```

Find:

```ts
  it('mousedown on empty area: onSelect(null), stays idle', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(tools.state.kind).toBe('idle');
  });
```

Replace with:

```ts
  it('mousedown on empty area transitions to box-select (onSelect deferred to mouseup)', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(onSelect).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('box-select');
  });
```

Find:

```ts
  it('drag-body mouseup fires onWidgetTransformed and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    tools.handleMouseUp(mu(30, 25));
    expect(onWidgetTransformed).toHaveBeenCalledWith('w1', { x: 20, y: 15, w: 50, h: 30 });
    expect(tools.state.kind).toBe('idle');
  });
```

Replace with:

```ts
  it('drag-body mouseup fires onWidgetTransformedBatch and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    tools.handleMouseUp(mu(30, 25));
    expect(onWidgetTransformedBatch).toHaveBeenCalledWith([
      { id: 'w1', newBox: { x: 20, y: 15, w: 50, h: 30 } },
    ]);
    expect(tools.state.kind).toBe('idle');
  });
```

- [ ] **Step 2: Update top-of-file declarations + beforeEach**

Find:

```ts
let getWidgetAt: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getSnapEnabled: ReturnType<typeof vi.fn<any[], any>>;
let tools: PointerTools;
```

Replace with:

```ts
let getWidgetAt: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getSnapEnabled: ReturnType<typeof vi.fn<any[], any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getSelectedIds: ReturnType<typeof vi.fn<any[], any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getWidgetBoxes: ReturnType<typeof vi.fn<any[], any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getAllWidgetBoxes: ReturnType<typeof vi.fn<any[], any>>;
let onBoxSelect: ReturnType<typeof vi.fn>;
let onWidgetTransformedBatch: ReturnType<typeof vi.fn>;
let onDragVisualUpdate: ReturnType<typeof vi.fn>;
let onBoxSelectMove: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

In `beforeEach`, find the tools instantiation block:

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

Replace with:

```ts
  getWidgetAt = vi.fn();
  getSnapEnabled = vi.fn(() => false);
  getSelectedIds = vi.fn(() => [] as string[]);
  getWidgetBoxes = vi.fn(() => new Map<string, Box>());
  getAllWidgetBoxes = vi.fn(() => new Map<string, Box>());
  onBoxSelect = vi.fn();
  onWidgetTransformedBatch = vi.fn();
  onDragVisualUpdate = vi.fn();
  onBoxSelectMove = vi.fn();
  tools = new PointerTools(canvas as any, handles as any, {
    getWidgetAt: (pt) => getWidgetAt(pt) as { id: string; box: Box } | null,
    onWidgetTransformed: (id, box) => onWidgetTransformed(id, box),
    onSelect: (id, additive) => onSelect(id, additive),
    getSnapEnabled: () => getSnapEnabled() as boolean,
    getSelectedIds: () => getSelectedIds() as string[],
    getWidgetBoxes: (ids) => getWidgetBoxes(ids) as Map<string, Box>,
    getAllWidgetBoxes: () => getAllWidgetBoxes() as Map<string, Box>,
    onBoxSelect: (ids, additive) => onBoxSelect(ids, additive),
    onWidgetTransformedBatch: (entries) => onWidgetTransformedBatch(entries),
    onDragVisualUpdate: (box) => onDragVisualUpdate(box),
    onBoxSelectMove: (rect) => onBoxSelectMove(rect),
  });
```

- [ ] **Step 3: Append the 8 new tests**

```ts
describe('PointerTools multi-drag + box-select + threshold (SP-FX-3b.2.1)', () => {
  it('drag-body single widget: widgetIds=[id], startBoxes 1 entry (regression)', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetIds).toEqual(['w1']);
      expect(tools.state.startBoxes.size).toBe(1);
    }
  });

  it('drag-body multi widget: mousemove updates N canvas calls; mouseup fires onWidgetTransformedBatch with N entries', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 50, h: 30 }],
      ['w2', { x: 100, y: 100, w: 60, h: 40 }],
    ]));
    tools.handleMouseDown(md(20, 20));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetIds).toEqual(['w1', 'w2']);
    tools.handleMouseMove(mm(30, 30));
    expect(canvas.upsertWidget.mock.calls.length).toBeGreaterThanOrEqual(2);
    tools.handleMouseUp(mu(30, 30));
    expect(onWidgetTransformedBatch).toHaveBeenCalledTimes(1);
    const entries = onWidgetTransformedBatch.mock.calls[0][0];
    expect(entries.length).toBe(2);
  });

  it('drag-body multi cancel() restores all widgets, no batch fire', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 50, h: 30 }],
      ['w2', { x: 100, y: 100, w: 60, h: 40 }],
    ]));
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 30));
    canvas.upsertWidget.mockClear();
    tools.cancel();
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(canvas.upsertWidget.mock.calls.length).toBe(2);
    expect(tools.state.kind).toBe('idle');
  });

  it('Shift+click on widget body: onSelect(id, true), state stays idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    const shiftDown = new MouseEvent('mousedown', { clientX: 20, clientY: 20, shiftKey: true, bubbles: true });
    tools.handleMouseDown(shiftDown);
    expect(onSelect).toHaveBeenCalledWith('w1', true);
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown empty area enters box-select; mousemove >= 3px fires onBoxSelectMove', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(tools.state.kind).toBe('box-select');
    tools.handleMouseMove(mm(60, 80));
    expect(onBoxSelectMove).toHaveBeenCalled();
    const rect = onBoxSelectMove.mock.calls[onBoxSelectMove.mock.calls.length - 1][0];
    expect(rect).toEqual({ x: 50, y: 50, w: 10, h: 30 });
  });

  it('mousedown empty + mouseup within 3px: onSelect(null, false)', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    tools.handleMouseUp(mu(51, 50));
    expect(onSelect).toHaveBeenCalledWith(null, false);
    expect(onBoxSelect).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });

  it('box-select Shift+drag: onBoxSelect(idsInBox, additive=true)', () => {
    getWidgetAt.mockReturnValue(null);
    getAllWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 60, y: 60, w: 30, h: 30 }],
      ['w2', { x: 200, y: 200, w: 30, h: 30 }],
    ]));
    const shiftDown = new MouseEvent('mousedown', { clientX: 50, clientY: 50, shiftKey: true, bubbles: true });
    tools.handleMouseDown(shiftDown);
    tools.handleMouseMove(mm(100, 100));
    tools.handleMouseUp(mu(100, 100));
    expect(onBoxSelect).toHaveBeenCalledWith(['w1'], true);
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-body dx=dy=0 mouseup: short-circuit (no onWidgetTransformedBatch)', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseUp(mu(20, 20));
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });
});
```

- [ ] **Step 4: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -20
```

Expected: many failures (existing tests' new assertions like `state.widgetIds` not satisfied + new tests).

- [ ] **Step 5: Patch pointer-tools.ts — PointerState union**

Open `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`. Find:

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetId: string; startPt: Point; startBox: Box }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box };
```

Replace with:

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean };
```

- [ ] **Step 6: Patch PointerToolsCallbacks interface**

Find:

```ts
export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null) => void;
  getSnapEnabled: () => boolean;
}
```

Replace with:

```ts
export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null, additive: boolean) => void;
  getSnapEnabled: () => boolean;
  getSelectedIds: () => string[];
  getWidgetBoxes: (ids: string[]) => Map<string, Box>;
  getAllWidgetBoxes: () => Map<string, Box>;
  onBoxSelect: (idsInBox: string[], additive: boolean) => void;
  onWidgetTransformedBatch: (entries: { id: string; newBox: Box }[]) => void;
  onDragVisualUpdate: (box: Box | null) => void;
  onBoxSelectMove: (rect: Box | null) => void;
}
```

- [ ] **Step 7: Update imports + CLICK_DRAG_THRESHOLD const**

Find:

```ts
import { clientToSvg, applyHandleDrag, snap, type HandleId, type Box, type Point } from './geometry';
import { GRID_SIZE } from '../services/editor-store';
```

Replace with:

```ts
import { clientToSvg, applyHandleDrag, snap, computeBbox, intersectsBox, type HandleId, type Box, type Point } from './geometry';
import { useEditorStore } from '../services/editor-store';
```

Find:

```ts
export class PointerTools {
  state: PointerState = { kind: 'idle' };
  private destroyed = false;
```

Replace with:

```ts
const CLICK_DRAG_THRESHOLD = 3;

export class PointerTools {
  state: PointerState = { kind: 'idle' };
  private destroyed = false;
```

- [ ] **Step 8: Rewrite handleMouseDown**

Find the entire `handleMouseDown` method (SP-FX-3b.1 version). Replace with:

```ts
  handleMouseDown(e: MouseEvent): void {
    if (this.destroyed) return;
    const pt = this.clientPt(e);

    const handle = this.handles.hitTest(pt);
    if (handle) {
      const widgetHit = this.cb.getWidgetAt(pt);
      if (widgetHit) {
        this.state = { kind: 'drag-handle', widgetId: widgetHit.id, handle, startPt: pt, startBox: widgetHit.box };
      }
      return;
    }

    const widgetHit = this.cb.getWidgetAt(pt);
    if (widgetHit) {
      if (e.shiftKey) {
        this.cb.onSelect(widgetHit.id, true);
        return;
      }
      const selected = this.cb.getSelectedIds();
      if (selected.includes(widgetHit.id) && selected.length >= 2) {
        const startBoxes = this.cb.getWidgetBoxes(selected);
        this.state = { kind: 'drag-body', widgetIds: selected, startPt: pt, startBoxes };
      } else {
        this.cb.onSelect(widgetHit.id, false);
        const startBoxes = new Map<string, Box>([[widgetHit.id, widgetHit.box]]);
        this.state = { kind: 'drag-body', widgetIds: [widgetHit.id], startPt: pt, startBoxes };
      }
      return;
    }

    this.state = { kind: 'box-select', startPt: pt, currentPt: pt, shiftKey: e.shiftKey };
  }
```

- [ ] **Step 9: Rewrite handleMouseMove**

Find the entire `handleMouseMove` method. Replace with:

```ts
  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'box-select') {
      this.state.currentPt = pt;
      const rect: Box = {
        x: Math.min(this.state.startPt.x, pt.x),
        y: Math.min(this.state.startPt.y, pt.y),
        w: Math.abs(pt.x - this.state.startPt.x),
        h: Math.abs(pt.y - this.state.startPt.y),
      };
      this.cb.onBoxSelectMove(rect);
      return;
    }

    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const gridSize = useEditorStore.getState().gridSize;
    const snapOn = this.cb.getSnapEnabled();

    if (this.state.kind === 'drag-handle') {
      let newBox = applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
      if (snapOn) newBox = snap(newBox, gridSize);
      this.canvas.upsertWidget({ id: this.state.widgetId, type: 'svg-ext-value' as any, property: {} as any, x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h });
      this.handles.updateBox(newBox);
      this.cb.onDragVisualUpdate(newBox);
      return;
    }

    // drag-body (single or multi)
    const newBoxes: { id: string; newBox: Box }[] = [];
    for (const id of this.state.widgetIds) {
      const sb = this.state.startBoxes.get(id);
      if (!sb) continue;
      let nb: Box = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
      if (snapOn) nb = snap(nb, gridSize);
      newBoxes.push({ id, newBox: nb });
      this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: nb.x, y: nb.y, w: nb.w, h: nb.h });
    }
    if (newBoxes.length === 0) return;
    if (newBoxes.length === 1) {
      this.handles.updateBox(newBoxes[0].newBox);
      this.cb.onDragVisualUpdate(newBoxes[0].newBox);
    } else {
      const bbox = computeBbox(newBoxes.map((e) => e.newBox));
      this.handles.updateBox(bbox);
      this.cb.onDragVisualUpdate(bbox);
    }
  }
```

- [ ] **Step 10: Rewrite handleMouseUp**

Find the entire `handleMouseUp` method. Replace with:

```ts
  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'box-select') {
      const distance = Math.max(Math.abs(pt.x - this.state.startPt.x), Math.abs(pt.y - this.state.startPt.y));
      if (distance < CLICK_DRAG_THRESHOLD) {
        this.cb.onSelect(null, this.state.shiftKey);
      } else {
        const finalBox: Box = {
          x: Math.min(this.state.startPt.x, pt.x),
          y: Math.min(this.state.startPt.y, pt.y),
          w: Math.abs(pt.x - this.state.startPt.x),
          h: Math.abs(pt.y - this.state.startPt.y),
        };
        const allBoxes = this.cb.getAllWidgetBoxes();
        const idsInBox: string[] = [];
        allBoxes.forEach((box, id) => {
          if (intersectsBox(finalBox, box)) idsInBox.push(id);
        });
        this.cb.onBoxSelect(idsInBox, this.state.shiftKey);
      }
      this.state = { kind: 'idle' };
      this.cb.onBoxSelectMove(null);
      return;
    }

    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const gridSize = useEditorStore.getState().gridSize;
    const snapOn = this.cb.getSnapEnabled();

    if (this.state.kind === 'drag-handle') {
      let newBox = applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
      if (snapOn) newBox = snap(newBox, gridSize);
      this.cb.onWidgetTransformed(this.state.widgetId, newBox);
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    if (dx === 0 && dy === 0) {
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    const newBoxes: { id: string; newBox: Box }[] = [];
    for (const id of this.state.widgetIds) {
      const sb = this.state.startBoxes.get(id);
      if (!sb) continue;
      let nb: Box = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
      if (snapOn) nb = snap(nb, gridSize);
      newBoxes.push({ id, newBox: nb });
    }
    if (newBoxes.length > 0) this.cb.onWidgetTransformedBatch(newBoxes);
    this.state = { kind: 'idle' };
    this.cb.onDragVisualUpdate(null);
  }
```

- [ ] **Step 11: Rewrite cancel()**

Find the existing `cancel()`. Replace with:

```ts
  cancel(): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;

    if (this.state.kind === 'drag-handle') {
      const startBox = this.state.startBox;
      const widgetId = this.state.widgetId;
      this.canvas.upsertWidget({ id: widgetId, type: 'svg-ext-value' as any, property: {} as any, x: startBox.x, y: startBox.y, w: startBox.w, h: startBox.h });
      this.handles.updateBox(startBox);
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    if (this.state.kind === 'drag-body') {
      const dragState = this.state;
      dragState.widgetIds.forEach((id) => {
        const sb = dragState.startBoxes.get(id);
        if (!sb) return;
        this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: sb.x, y: sb.y, w: sb.w, h: sb.h });
      });
      const boxes = Array.from(dragState.startBoxes.values());
      if (boxes.length === 1) this.handles.updateBox(boxes[0]);
      else this.handles.updateBox(computeBbox(boxes));
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

    // box-select
    this.state = { kind: 'idle' };
    this.cb.onBoxSelectMove(null);
  }
```

- [ ] **Step 12: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -10
```

Expected: 17 existing (updated) + 8 new = **25 passed**.

- [ ] **Step 13: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/pointer-tools.ts packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts
git commit -m "feat(scada-engine): PointerTools multi-select + box-select FSM (SP-FX-3b.2.1)

PointerState union extended: drag-body { widgetIds[], startBoxes:Map },
new box-select state. Six new callbacks (getSelectedIds /
getWidgetBoxes / getAllWidgetBoxes / onBoxSelect /
onWidgetTransformedBatch / onDragVisualUpdate / onBoxSelectMove).
onSelect extended to (id, additive). handleMouseDown routes
Shift+click (no drag), in-selection drag (multi), out-of-selection
(replace + single drag), empty (box-select). handleMouseMove handles
all 4 states. handleMouseUp: Chebyshev 3px threshold for click vs
drag-commit in box-select; drag-body batches; dx=dy=0 short-circuit.
cancel() restores all widgets in multi-drag. GRID_SIZE migrated to
useEditorStore.getState().gridSize. 8 new + 12 existing tests updated."
```

---

## Task 4: EditorCanvas — keyboard + snap-wire + multi-select cb (9 tests)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append at the END of `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
describe('EditorCanvas SP-FX-3b.2.1', () => {
  function makeViewWithItems(items: Record<string, FuxaWidget>): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items,
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; repeat?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, ...mods });
    document.dispatchEvent(event);
  }

  function fireKeyUp(key: string) {
    document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  }

  it('Ctrl+A selects all items in currentView', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 60, h: 40 } as any,
      }));
    });
    act(() => { fireKey('a', { ctrlKey: true }); });
    const sel = [...useEditorStore.getState().selection].sort();
    expect(sel).toEqual(['w1', 'w2']);
  });

  it('Ctrl+A while activeElement=INPUT does NOT trigger select-all', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => { fireKey('a', { ctrlKey: true }); });
    expect(useEditorStore.getState().selection).toEqual([]);
    document.body.removeChild(input);
  });

  it('Arrow with selection N>=2: all widgets move, 1 history entry', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 60, h: 40 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const pastBefore = useEditorStore.getState().history.past.length;
    act(() => { fireKey('ArrowRight'); });
    const w1 = useEditorStore.getState().currentView!.items.w1 as any;
    const w2 = useEditorStore.getState().currentView!.items.w2 as any;
    expect(w1.x).toBe(51);
    expect(w2.x).toBe(201);
    expect(useEditorStore.getState().history.past.length).toBe(pastBefore + 1);
  });

  it('Arrow nudge: first press +1 history; e.repeat=true: no push; new fresh press +1', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
      useEditorStore.getState().setSnapEnabled(false);
    });
    const past0 = useEditorStore.getState().history.past.length;
    act(() => { fireKey('ArrowRight'); });
    const past1 = useEditorStore.getState().history.past.length;
    expect(past1).toBe(past0 + 1);
    act(() => { fireKey('ArrowRight', { repeat: true }); });
    expect(useEditorStore.getState().history.past.length).toBe(past1);
    act(() => { fireKeyUp('ArrowRight'); });
    act(() => { fireKey('ArrowRight'); });
    expect(useEditorStore.getState().history.past.length).toBe(past1 + 1);
  });

  it('ESC tier 2: idle + selection non-empty → setSelection([])', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 60, h: 40 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => { fireKey('Escape'); });
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('ESC tier 3: idle + selection empty → no-op', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({}));
    });
    expect(useEditorStore.getState().selection).toEqual([]);
    expect(() => act(() => { fireKey('Escape'); })).not.toThrow();
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('selection.length >= 2: handles render as bbox (corners visible)', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 50, h: 30 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const corners = container.querySelectorAll('[data-bbox-corner]');
    const visibleCorners = Array.from(corners).filter((c) => c.getAttribute('visibility') !== 'hidden');
    expect(visibleCorners.length).toBe(4);
  });

  it('setGridSize triggers canvas.setGridVisible repaint with new size', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
    });
    expect(container.querySelector('pattern[data-grid="10"]')).not.toBeNull();
    act(() => { useEditorStore.getState().setGridSize(20); });
    expect(container.querySelector('pattern[data-grid="20"]')).not.toBeNull();
    expect(container.querySelector('pattern[data-grid="10"]')).toBeNull();
  });

  it('rubber-band rect mounted in overlay layer with visibility hidden initially', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30 } as any,
      }));
    });
    const rb = container.querySelector('[data-overlay="rubber-band"]') as SVGRectElement;
    expect(rb).not.toBeNull();
    expect(rb.getAttribute('visibility')).toBe('hidden');
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -15
```

Expected: 9 new failures.

- [ ] **Step 3: Patch EditorCanvas.tsx — imports**

Open `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`. Find:

```tsx
import { useEditorStore, GRID_SIZE } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import { snapPoint, type Box } from './geometry';
import type { FuxaWidget } from '../models';
```

Replace with:

```tsx
import { useEditorStore } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles, SnapGuides } from './transform-handles';
import { PointerTools } from './pointer-tools';
import { snapPoint, computeBbox, type Box } from './geometry';
import type { FuxaWidget } from '../models';
```

- [ ] **Step 4: Patch Refs interface + selectors + nudgeStateRef**

Find:

```tsx
interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
}
```

Replace with:

```tsx
interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
  snapGuides: SnapGuides;
  rubberBand: SVGRectElement;
}
```

Find the selectors block:

```tsx
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
```

Replace with:

```tsx
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const gridSize = useEditorStore((s) => s.gridSize);
```

Find:

```tsx
  const refs = useRef<Refs | null>(null);
```

Replace with:

```tsx
  const refs = useRef<Refs | null>(null);
  const nudgeStateRef = useRef<{ lastKey: string | null }>({ lastKey: null });
```

- [ ] **Step 5: Update lifecycle useEffect — instantiate SnapGuides + rubberBand + full cb**

Find the entire PointerTools ctor block inside the lifecycle useEffect. Replace with:

```tsx
    const snapGuides = new SnapGuides(canvas.overlayLayer);
    const rubberBand = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rubberBand.setAttribute('data-overlay', 'rubber-band');
    rubberBand.setAttribute('visibility', 'hidden');
    rubberBand.setAttribute('fill', 'rgba(59,130,246,0.1)');
    rubberBand.setAttribute('stroke', '#3b82f6');
    rubberBand.setAttribute('stroke-dasharray', '4 2');
    rubberBand.setAttribute('pointer-events', 'none');
    (canvas.overlayLayer.node as SVGGElement).appendChild(rubberBand);

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
      onWidgetTransformed: (id, box) => useEditorStore.getState().updateWidget(id, box as Partial<FuxaWidget>),
      onSelect: (id, additive) => {
        const store = useEditorStore.getState();
        if (!id) {
          if (!additive) store.setSelection([]);
          return;
        }
        if (additive) {
          if (store.selection.includes(id)) store.removeFromSelection(id);
          else store.addToSelection(id);
        } else {
          store.setSelection([id]);
        }
      },
      getSnapEnabled: () => useEditorStore.getState().snapEnabled,
      getSelectedIds: () => useEditorStore.getState().selection,
      getWidgetBoxes: (ids) => {
        const view = useEditorStore.getState().currentView;
        const m = new Map<string, Box>();
        if (!view) return m;
        for (const id of ids) {
          const g = getWidgetGeom(view.items[id]);
          if (g) m.set(id, g);
        }
        return m;
      },
      getAllWidgetBoxes: () => {
        const view = useEditorStore.getState().currentView;
        const m = new Map<string, Box>();
        if (!view) return m;
        for (const id in view.items) {
          const g = getWidgetGeom(view.items[id]);
          if (g) m.set(id, g);
        }
        return m;
      },
      onBoxSelect: (ids, additive) => {
        const store = useEditorStore.getState();
        if (additive) {
          const merged = Array.from(new Set([...store.selection, ...ids]));
          store.setSelection(merged);
        } else {
          store.setSelection(ids);
        }
      },
      onWidgetTransformedBatch: (entries) => {
        if (entries.length === 0) return;
        const store = useEditorStore.getState();
        for (let i = 0; i < entries.length - 1; i++) {
          store.updateWidget(entries[i].id, entries[i].newBox as Partial<FuxaWidget>, { silent: true });
        }
        const last = entries[entries.length - 1];
        store.updateWidget(last.id, last.newBox as Partial<FuxaWidget>);
      },
      onDragVisualUpdate: (box) => {
        if (!refs.current) return;
        const store = useEditorStore.getState();
        if (box && store.snapEnabled && store.currentView) {
          refs.current.snapGuides.show(box, { w: store.currentView.width, h: store.currentView.height });
        } else {
          refs.current.snapGuides.hide();
        }
      },
      onBoxSelectMove: (rect) => {
        if (!refs.current) return;
        const r = refs.current.rubberBand;
        if (!rect) {
          r.setAttribute('visibility', 'hidden');
        } else {
          r.setAttribute('x', String(rect.x));
          r.setAttribute('y', String(rect.y));
          r.setAttribute('width', String(rect.w));
          r.setAttribute('height', String(rect.h));
          r.setAttribute('visibility', 'visible');
        }
      },
    });
```

Find:

```tsx
    refs.current = { canvas, handles, pointer };
    canvas.loadView(currentView);
    canvas.setGridVisible(useEditorStore.getState().snapEnabled, GRID_SIZE);
    return () => {
      pointer.destroy();
      canvas.destroy();
      refs.current = null;
    };
```

Replace with:

```tsx
    refs.current = { canvas, handles, pointer, snapGuides, rubberBand };
    canvas.loadView(currentView);
    const store0 = useEditorStore.getState();
    canvas.setGridVisible(store0.snapEnabled, store0.gridSize);
    return () => {
      pointer.destroy();
      snapGuides.destroy();
      canvas.destroy();
      refs.current = null;
    };
```

- [ ] **Step 6: Update selection useEffect — show vs showBbox**

Find:

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

Replace with:

```tsx
  useEffect(() => {
    if (!refs.current || !currentView) return;
    if (selection.length === 0) { refs.current.handles.hide(); return; }
    if (selection.length === 1) {
      const w = currentView.items[selection[0]];
      const g = w ? getWidgetGeom(w) : null;
      if (g) refs.current.handles.show(g);
      else refs.current.handles.hide();
      return;
    }
    const boxes: Box[] = [];
    for (const id of selection) {
      const w = currentView.items[id];
      const g = w ? getWidgetGeom(w) : null;
      if (g) boxes.push(g);
    }
    if (boxes.length === 0) refs.current.handles.hide();
    else refs.current.handles.showBbox(computeBbox(boxes));
  }, [selection, items]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 7: Update snap-wire useEffect — include gridSize**

Find:

```tsx
  // SP-FX-3b.1: snap-toggle wire — repaint grid background when snapEnabled changes.
  useEffect(() => {
    if (!refs.current) return;
    refs.current.canvas.setGridVisible(snapEnabled, GRID_SIZE);
  }, [snapEnabled]);
```

Replace with:

```tsx
  // SP-FX-3b.1+3b.2.1: snap-toggle wire + dynamic gridSize.
  useEffect(() => {
    if (!refs.current) return;
    refs.current.canvas.setGridVisible(snapEnabled, gridSize);
  }, [snapEnabled, gridSize]);
```

- [ ] **Step 8: Replace keyboard useEffect**

Find the existing keyboard useEffect (deps `[]`). Replace the entire block with:

```tsx
  // SP-FX-3b.2.1: extended keyboard handler — Ctrl+A, ESC 3-tier, Arrow nudge coalesce.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      const tag = (ae?.tagName ?? '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae as any)?.isContentEditable) return;

      if (e.key === 'Escape') {
        if (refs.current?.pointer.state.kind !== 'idle') {
          refs.current?.pointer.cancel();
          return;
        }
        const sel = useEditorStore.getState().selection;
        if (sel.length > 0) {
          e.preventDefault();
          useEditorStore.getState().setSelection([]);
        }
        return;
      }

      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const view = useEditorStore.getState().currentView;
        if (!view) return;
        useEditorStore.getState().setSelection(Object.keys(view.items));
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
        const ids = state.selection;
        if (ids.length === 0 || !state.currentView) return;
        const step = e.shiftKey ? state.gridSize : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const isRepeat = (e.repeat === true) || (nudgeStateRef.current.lastKey === e.key);
        nudgeStateRef.current.lastKey = e.key;
        const survivingIds = ids.filter((id) => {
          const w = state.currentView!.items[id] as any;
          return typeof w?.x === 'number';
        });
        if (survivingIds.length === 0) return;
        for (let i = 0; i < survivingIds.length; i++) {
          const id = survivingIds[i];
          const w = state.currentView!.items[id] as any;
          const next = { x: w.x + dx, y: w.y + dy };
          const final = state.snapEnabled ? snapPoint(next, state.gridSize) : next;
          const isLast = i === survivingIds.length - 1;
          state.updateWidget(id, final as Partial<FuxaWidget>, { silent: isRepeat || !isLast });
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        if (nudgeStateRef.current.lastKey === e.key) nudgeStateRef.current.lastKey = null;
      }
    };
    const onBlur = () => { nudgeStateRef.current.lastKey = null; };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
```

- [ ] **Step 9: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -15
```

Expected: 14 SP-FX-3b.1 + 9 new = **23 passed**.

- [ ] **Step 10: tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 11: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): EditorCanvas multi-select + box-select + nudge coalesce (SP-FX-3b.2.1)

PointerTools cb fully wired (11 callbacks). SnapGuides instantiated
alongside TransformHandles; rubberBand <rect> in overlay layer.
Selection useEffect dispatches handles.show (single) vs
handles.showBbox (multi). Keyboard: Ctrl+A select all; ESC 3-tier
(cancel drag > clear selection > no-op); Arrow nudge coalesces via
nudgeStateRef + e.repeat + keyup reset + window.blur reset.
gridSize from useEditorStore replaces deprecated GRID_SIZE const.
snap-wire useEffect reacts to gridSize change. 9 tests."
```

---

## Task 5: editor barrel — re-export new helpers + SnapGuides

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`

- [ ] **Step 1: Update barrel**

Open `packages/web-ui/src/scada-engine/editor/index.ts`. Find:

```ts
export { TransformHandles } from './transform-handles';
```

Replace with:

```ts
export { TransformHandles, SnapGuides } from './transform-handles';
```

Find:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  type Box, type Point, type HandleId,
} from './geometry';
```

Replace with:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
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
git commit -m "feat(scada-engine): export SnapGuides + multi-widget geo helpers (SP-FX-3b.2.1)"
```

---

## Task 6: Playwright 5 smoke

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-canvas-3b2-1.spec.ts`

- [ ] **Step 1: Inspect existing SP-FX-3b.1 spec for login helper**

```bash
cd /Volumes/SSD/projects/BIOCore
cat packages/web-ui/e2e/scada-editor-canvas-3b1.spec.ts | head -20
```

Copy the login helper verbatim if format differs from below.

- [ ] **Step 2: Write the smoke spec**

Create `packages/web-ui/e2e/scada-editor-canvas-3b2-1.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"]').fill('admin');
  await page.locator('input[type="password"]').fill('admin');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
}

test.describe('SP-FX-3b.2.1 — multi-select + box-select + Ctrl+A + multi-drag + ESC', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    await page.waitForTimeout(200);
  });

  test('Shift+click adds widget to selection', async ({ page }) => {
    await page.locator('[data-widget-id="w1"]').click();
    await page.locator('[data-widget-id="w2"]').click({ modifiers: ['Shift'] });
    await page.waitForTimeout(100);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
  });

  test('Ctrl+A selects all widgets', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
  });

  test('Box-select rubber-band selects intersecting widgets', async ({ page }) => {
    const widgetLayer = await page.locator('[data-layer="widgets"]').boundingBox();
    if (!widgetLayer) throw new Error('widgetLayer bbox unavailable');
    await page.mouse.move(widgetLayer.x + 5, widgetLayer.y + 5);
    await page.mouse.down();
    await page.mouse.move(widgetLayer.x + 500, widgetLayer.y + 400, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
  });

  test('Multi-select drag moves all selected widgets together', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    const w1 = await page.locator('[data-widget-id="w1"]').boundingBox();
    if (!w1) throw new Error('w1 bbox unavailable');
    await page.mouse.move(w1.x + w1.width / 2, w1.y + w1.height / 2);
    await page.mouse.down();
    await page.mouse.move(w1.x + w1.width / 2 + 100, w1.y + w1.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.x).toBeGreaterThan(50);
    expect(view.items.w2.x).toBeGreaterThan(300);
  });

  test('ESC clears selection', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);
    let visibleCorners = await page.locator('[data-bbox-corner]:not([visibility="hidden"])').count();
    expect(visibleCorners).toBeGreaterThanOrEqual(4);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const overlay = await page.locator('[data-overlay="transform"]').getAttribute('visibility');
    expect(overlay).toBe('hidden');
  });
});
```

- [ ] **Step 3: Run Playwright**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/server start > /tmp/biocore-server.log 2>&1 < /dev/null &
disown
sleep 10
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 15
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/dev/scada-editor-canvas
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas-3b2-1.spec.ts 2>&1 | tail -30
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 5 passed.

If a test fails with handle bbox unavailable, increase `waitForTimeout` after click to 500. If login selectors mismatch, copy verbatim from SP-FX-3a/3b.1 spec.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-editor-canvas-3b2-1.spec.ts
git commit -m "test(scada-engine): Playwright multi-select + box-select smoke (SP-FX-3b.2.1)

5 smoke tests: Shift+click adds to selection, Ctrl+A select all,
box-select rubber-band, multi-select drag moves all, ESC clears
selection."
```

---

## Task 7: Regression + §8 stop-check + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | grep -E "Test Files|Tests" | tail -3
```

Expected: 551 + 6 + 5 + 4 + 8 + 9 = **583 passed**.

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

- [ ] **Step 4: Playwright regression (15 total)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/server start > /tmp/biocore-server.log 2>&1 < /dev/null &
disown
sleep 10
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 15
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas.spec.ts e2e/scada-editor-canvas-3b1.spec.ts e2e/scada-editor-canvas-3b2-1.spec.ts 2>&1 | tail -10
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 3 + 7 + 5 = **15 passed**.

- [ ] **Step 5: §8 stop-condition self-check**

Verify each:
1. Multi-select drag 3+ widgets → pointer-tools + Playwright multi-drag.
2. Box-select rubber-band → pointer-tools + Playwright.
3. Shift+click toggles → pointer-tools + Playwright.
4. Ctrl+A + INPUT guard → EditorCanvas tests.
5. Nudge single +1 / long-press +1 → EditorCanvas test.
6. ESC 3-tier → EditorCanvas tests.
7. setGridSize → editor-store + EditorCanvas tests.
8. SnapGuides → transform-handles + EditorCanvas tests.
9. web-ui 583 + server 147 + data-service 84 → step 1+2.
10. tsc clean + Playwright 15/15 → step 3+4.

If any fails → STOP, surface, no push.

- [ ] **Step 6: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds.

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §1.1 in-scope #1 (Multi-select Shift/Ctrl+A) | T3 + T4 |
| §1.1 in-scope #2 (Multi-drag, 1 history entry) | T1 + T3 + T4 |
| §1.1 in-scope #3 (Box-select rubber-band) | T0 + T3 + T4 |
| §1.1 in-scope #4 (Nudge coalesce) | T1 + T4 |
| §1.1 in-scope #5 (Dynamic gridSize) | T1 + T4 |
| §1.1 in-scope #6 (Snap visual feedback) | T2 + T4 |
| §1.1 ESC 3-tier | T4 |
| §2 file structure | T0-T6 |
| §3 type contract | T0/T1/T2/T3/T4 |
| §4 data flow (8 sub-flows) | T0-T4 + T6 |
| §5 error handling | T1/T3/T4 + tests |
| §6.1-6.5 testing (+32) | 6+5+4+8+9=32 ✓ |
| §6.6 Playwright (+5) | T6 ✓ |
| §7 risks (R1-R16) | impl mitigations |
| §8 stop conditions (10) | T7 step 5 ✓ |
| §10 acceptance | T7 step 1-4 |

**Gaps found:** none.

**Placeholder scan:** complete code blocks; expected output per command; no TBD/TODO.

**Type consistency:**
- `computeBbox` / `intersectsBox` / `applyMultiDrag` T0 → T3 (pointer-tools intersectsBox + computeBbox) + T4 (computeBbox selection useEffect)
- `gridSize: number` T1 → T3 (useEditorStore.gridSize) + T4 (selector + useEffect deps)
- `setGridSize(n)` whitelist [8,10,16,20] consistent T1 declare + T4 test
- `updateWidget(id, patch, opts?)` T1 → T4 batch + nudge
- `SnapGuides` T2 → T4 (instantiate + onDragVisualUpdate) + T5 (barrel)
- `TransformHandles.showBbox(bbox)` T2 → T4 selection useEffect
- `PointerState` 4-variant union T3 → T4 (`pointer.state.kind`)
- `PointerToolsCallbacks` 11 fields T3 → T4 all wired
- `widgetIds: string[]` + `startBoxes: Map<string, Box>` T3 → T3 impl

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-3b-2-1-editor-canvas-multiselect-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + spec/code review (SP-FX-1/2/3a/3b.1 proven)
2. **Inline Execution** — execute in this session via executing-plans, batch checkpoints

Which approach?
