# SP-FX-4 Editor Shell + Palette + Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the SP-FX-4 editor shell (top toolbar + 3-pane palette/canvas/properties) at `/scada2/edit-v2/[viewId]` in ~1 week.

**Architecture:** Additive composition. `<EditorShell>` wraps SP-FX-3 `<EditorCanvas>` (untouched internals) with 3 new sibling components: `<Palette>` (left, 3 basic shapes via HTML5 D&D), `<Toolbar>` (top, save/undo/redo/grid + Cmd+S/Z/Shift+Z keyboard), `<PropertiesPlaceholder>` (right, readonly widget fields). `editor-store` gains 3 actions (`addWidget` selection extension, `saveView`, `toggleGrid`). `canvas-svg.upsertWidget` switches on `widget.type` (rect/ellipse/text) while preserving the existing `'svg-ext-value'` rect-render fallback.

**Tech Stack:** TypeScript 5, React 18, Next.js 14, vitest + jsdom + @testing-library/react (existing), Playwright (existing), zustand 4.4 + immer 10 (existing), `@svgdotjs/svg.js ^3.2.4` (existing), Zod 3 (existing). No new dependencies.

---

## File Structure

**New files (10):**
- `packages/web-ui/src/scada-engine/editor/palette/palette-items.ts` — `PALETTE_ITEMS` + `makeWidget` pure factory (~50 lines)
- `packages/web-ui/src/scada-engine/editor/palette/Palette.tsx` — left panel UL of 3 draggable items (~80 lines)
- `packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts` — +6 tests
- `packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx` — +5 tests
- `packages/web-ui/src/scada-engine/editor/toolbar/commands.ts` — `executeSave` wrap (~30 lines)
- `packages/web-ui/src/scada-engine/editor/toolbar/Toolbar.tsx` — top bar 4 buttons + global keydown listener (~120 lines)
- `packages/web-ui/src/scada-engine/editor/toolbar/__tests__/commands.test.ts` — +4 tests
- `packages/web-ui/src/scada-engine/editor/toolbar/__tests__/Toolbar.test.tsx` — +10 tests
- `packages/web-ui/src/scada-engine/editor/properties/PropertiesPlaceholder.tsx` — readonly widget fields (~70 lines)
- `packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertiesPlaceholder.test.tsx` — +7 tests
- `packages/web-ui/src/scada-engine/editor/editor-shell.tsx` — composition wrapper (~80 lines)
- `packages/web-ui/src/scada-engine/editor/__tests__/editor-shell.test.tsx` — +6 tests
- `packages/web-ui/src/app/scada2/edit-v2/[viewId]/page.tsx` — Next.js client page (~70 lines)
- `packages/web-ui/src/app/scada2/edit-v2/[viewId]/__tests__/page.test.tsx` — +3 tests
- `packages/web-ui/e2e/scada-editor-shell.spec.ts` — 3 Playwright smoke

**Modified files (5):**
- `packages/web-ui/src/scada-engine/services/editor-store.ts` — extend `addWidget` (set selection), add `saveView`, add `toggleGrid`
- `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts` — +8 tests
- `packages/web-ui/src/scada-engine/editor/canvas-svg.ts` — `upsertWidget` type switch (rect/ellipse/text); existing `'svg-ext-value'` falls through to rect path
- `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts` — +3 tests (rect/ellipse/text render)
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` — `onDragOver`/`onDrop` wire on canvas root
- `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx` — +5 tests
- `packages/web-ui/src/scada-engine/editor/index.ts` — re-export `EditorShell`, `Palette`, `Toolbar`, `PropertiesPlaceholder`, `executeSave`, `PALETTE_ITEMS`, `makeWidget`

**Not modified:**
- `packages/web-ui/src/scada-engine/models/widget.ts` — `type: z.string()` already accepts `'rect' | 'ellipse' | 'text'` (no schema change required)
- `packages/web-ui/src/scada-engine/editor/geometry.ts` (SP-FX-3 pure)
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` (SP-FX-3 FSM, unchanged)
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` (SP-FX-3 overlay, unchanged)
- `/scada2/edit/[viewId]` SP4-7 page (parallel; SP-FX-8 hot-swap later)
- server `/api/v1/fuxa-views/*` endpoints (SP-FX-1 already implemented)

**Test count target:**
- web-ui vitest: 648 → **705** (+57 = 8 editor-store + 6 palette-items + 5 Palette + 3 canvas-svg + 4 commands + 10 Toolbar + 7 PropertiesPlaceholder + 5 EditorCanvas + 6 editor-shell + 3 page)
- Playwright: 20 → **23** (+3)

Note: spec §1.4 stated +54 but the plan adds 3 explicit `canvas-svg.test.ts` tests for `rect`/`ellipse`/`text` rendering to keep the test pyramid honest. Self-review at end documents the +3 overage.

---

## Task 0: editor-store — addWidget selection + saveView + toggleGrid + 8 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/services/editor-store.ts`
- Modify: `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`. Append at END of file:

```ts
describe('editorStore SP-FX-4 actions', () => {
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
      items: {},
      schemaVersion: 1,
    } as any);
  });

  it('addWidget sets selection to [widget.id]', () => {
    useEditorStore.getState().addWidget({ id: 'w_new', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30 } as any);
    expect(useEditorStore.getState().selection).toEqual(['w_new']);
  });

  it('addWidget sets isDirty true', () => {
    useEditorStore.getState().addWidget({ id: 'w_new', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30 } as any);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('addWidget pushes history.past entry', () => {
    const past0 = useEditorStore.getState().history.past.length;
    useEditorStore.getState().addWidget({ id: 'w_new', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30 } as any);
    expect(useEditorStore.getState().history.past.length).toBe(past0 + 1);
  });

  it('toggleGrid flips snapEnabled true→false', () => {
    expect(useEditorStore.getState().snapEnabled).toBe(true);
    useEditorStore.getState().toggleGrid();
    expect(useEditorStore.getState().snapEnabled).toBe(false);
  });

  it('toggleGrid flips snapEnabled false→true', () => {
    useEditorStore.setState({ snapEnabled: false });
    useEditorStore.getState().toggleGrid();
    expect(useEditorStore.getState().snapEnabled).toBe(true);
  });

  it('saveView calls fetch PUT /api/v1/fuxa-views/:id with currentView body', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await useEditorStore.getState().saveView('v1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/fuxa-views/v1');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string).id).toBe('v1');
    fetchSpy.mockRestore();
  });

  it('saveView clears isDirty on 2xx', async () => {
    useEditorStore.setState({ isDirty: true });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await useEditorStore.getState().saveView('v1');
    expect(useEditorStore.getState().isDirty).toBe(false);
    fetchSpy.mockRestore();
  });

  it('saveView throws on non-2xx, retains isDirty', async () => {
    useEditorStore.setState({ isDirty: true });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    await expect(useEditorStore.getState().saveView('v1')).rejects.toThrow(/500/);
    expect(useEditorStore.getState().isDirty).toBe(true);
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -15
```

Expected: 5 RED (toggleGrid is not a function × 2, saveView is not a function × 3) + 3 failures on addWidget (selection assertion fails because current impl doesn't set selection).

- [ ] **Step 3: Extend `addWidget` to set selection (in editor-store.ts)**

Open `packages/web-ui/src/scada-engine/services/editor-store.ts`. Find:

```ts
  addWidget: (widget) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { draft.items[widget.id] = widget; }),
      isDirty: true,
    }));
  },
```

Replace with:

```ts
  addWidget: (widget) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    _store.setState((s) => ({
      history: { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { draft.items[widget.id] = widget; }),
      isDirty: true,
      selection: [widget.id],
    }));
  },
```

- [ ] **Step 4: Add `saveView` and `toggleGrid` to `EditorActions` interface**

Find:

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
  saveView: (viewId: string) => Promise<void>;
  toggleGrid: () => void;
}
```

- [ ] **Step 5: Implement `saveView` and `toggleGrid` in the `actions` object**

Find the closing of `setGridSize` action and the closing brace of the `actions` object:

```ts
  setGridSize: (n) => {
    if (![8, 10, 16, 20].includes(n)) return;
    _store.setState({ gridSize: n });
  },
};
```

Replace with:

```ts
  setGridSize: (n) => {
    if (![8, 10, 16, 20].includes(n)) return;
    _store.setState({ gridSize: n });
  },

  saveView: async (viewId) => {
    const { currentView } = _store.getState();
    if (!currentView) throw new Error('saveView: no currentView');
    const r = await fetch(`/api/v1/fuxa-views/${viewId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentView),
    });
    if (!r.ok) throw new Error(`save failed: ${r.status}`);
    _store.setState({ isDirty: false });
  },

  toggleGrid: () => {
    _store.setState((s) => ({ snapEnabled: !s.snapEnabled }));
  },
};
```

- [ ] **Step 6: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -10
```

Expected: previous 29 + 8 = **37 passed**.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/editor-store.ts packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts
git commit -m "feat(scada-engine): editorStore +saveView +toggleGrid; addWidget sets selection (SP-FX-4)

addWidget now sets selection=[widget.id] for immediate post-drop UI feedback.
saveView(viewId): PUT /api/v1/fuxa-views/:id; 2xx clears isDirty; non-2xx throws.
toggleGrid(): flips snapEnabled boolean. 8 new tests."
```

---

## Task 1: palette-items.ts — PALETTE_ITEMS + makeWidget + 6 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/palette/palette-items.ts`
- Create: `packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PALETTE_ITEMS, makeWidget } from '../palette-items';

describe('palette-items PALETTE_ITEMS', () => {
  it('has 3 items (rect, ellipse, text) with required fields', () => {
    expect(PALETTE_ITEMS.length).toBe(3);
    const ids = PALETTE_ITEMS.map((i) => i.id);
    expect(ids).toEqual(['rect', 'ellipse', 'text']);
    for (const item of PALETTE_ITEMS) {
      expect(typeof item.label).toBe('string');
      expect(typeof item.defaultW).toBe('number');
      expect(typeof item.defaultH).toBe('number');
    }
  });
});

describe('palette-items makeWidget', () => {
  it('rect: defaults w=100 h=60, snaps x/y to gridSize=10', () => {
    const w = makeWidget('rect', { x: 23, y: 47 }, 10);
    expect(w.type).toBe('rect');
    expect(w.x).toBe(20);
    expect(w.y).toBe(50);
    expect(w.w).toBe(100);
    expect(w.h).toBe(60);
  });

  it('ellipse: defaults w=80 h=80', () => {
    const w = makeWidget('ellipse', { x: 0, y: 0 }, 10);
    expect(w.w).toBe(80);
    expect(w.h).toBe(80);
  });

  it('text: defaults w=120 h=30', () => {
    const w = makeWidget('text', { x: 0, y: 0 }, 10);
    expect(w.w).toBe(120);
    expect(w.h).toBe(30);
  });

  it('gridSize=0 falls back to step=1 (no snap)', () => {
    const w = makeWidget('rect', { x: 23.7, y: 47.2 }, 0);
    expect(w.x).toBe(24);
    expect(w.y).toBe(47);
  });

  it('id is unique-ish: format w_<digits>_<6-char alnum>', () => {
    const w1 = makeWidget('rect', { x: 0, y: 0 }, 10);
    const w2 = makeWidget('rect', { x: 0, y: 0 }, 10);
    expect(w1.id).toMatch(/^w_\d+_[a-z0-9]{6}$/);
    expect(w2.id).toMatch(/^w_\d+_[a-z0-9]{6}$/);
    expect(w1.id).not.toBe(w2.id);
  });

  it('property is empty object placeholder', () => {
    const w = makeWidget('rect', { x: 0, y: 0 }, 10);
    expect(w.property).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/palette/__tests__/palette-items.test.ts 2>&1 | tail -10
```

Expected: 6 failures (Cannot find module '../palette-items').

- [ ] **Step 3: Create palette-items.ts**

Create `packages/web-ui/src/scada-engine/editor/palette/palette-items.ts`:

```ts
// SP-FX-4: palette item registry + widget factory for drag-onto-canvas.

import type { FuxaWidget } from '../../models/widget';

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
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
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

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/palette/__tests__/palette-items.test.ts 2>&1 | tail -10
```

Expected: **6 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/palette/palette-items.ts packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts
git commit -m "feat(scada-engine): palette-items registry + makeWidget factory (SP-FX-4)

3 basic shapes (rect/ellipse/text) with default w/h.
makeWidget snaps drop coords to gridSize (fallback step=1 when gridSize<=0).
Widget id format: w_<ts>_<6-char alnum>. 6 tests."
```

---

## Task 2: canvas-svg.upsertWidget type switch + 3 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`

- [ ] **Step 1: Write the failing tests**

Append at END of `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`:

```ts
describe('CanvasController.upsertWidget type rendering (SP-FX-4)', () => {
  it('type="rect" renders <rect> element with x/y/w/h attrs', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 'r1', type: 'rect', property: {}, x: 10, y: 20, w: 100, h: 60 } as any);
    const el = container.querySelector('[data-widget-id="r1"]') as SVGElement;
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe('rect');
    expect(el.getAttribute('x')).toBe('10');
    expect(el.getAttribute('y')).toBe('20');
    expect(el.getAttribute('width')).toBe('100');
    expect(el.getAttribute('height')).toBe('60');
    c.destroy();
  });

  it('type="ellipse" renders <ellipse> element with cx/cy/rx/ry attrs', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 'e1', type: 'ellipse', property: {}, x: 10, y: 20, w: 80, h: 40 } as any);
    const el = container.querySelector('[data-widget-id="e1"]') as SVGElement;
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe('ellipse');
    expect(el.getAttribute('cx')).toBe('50');
    expect(el.getAttribute('cy')).toBe('40');
    expect(el.getAttribute('rx')).toBe('40');
    expect(el.getAttribute('ry')).toBe('20');
    c.destroy();
  });

  it('type="text" renders <text> element with content from property.text or fallback', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 't1', type: 'text', property: { text: 'Hello' }, x: 10, y: 20, w: 120, h: 30 } as any);
    const el = container.querySelector('[data-widget-id="t1"]') as SVGElement;
    expect(el).not.toBeNull();
    expect(el.tagName.toLowerCase()).toBe('text');
    expect(el.textContent).toBe('Hello');

    // fallback when property.text missing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.upsertWidget({ id: 't2', type: 'text', property: {}, x: 10, y: 20, w: 120, h: 30 } as any);
    const el2 = container.querySelector('[data-widget-id="t2"]') as SVGElement;
    expect(el2.textContent).toBe('文本');
    c.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -10
```

Expected: ellipse + text assertions FAIL (current upsertWidget always renders rect). rect test may pass (current path already creates rect with x/y/w/h).

- [ ] **Step 3: Modify `upsertWidget` to switch on `widget.type`**

Open `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`. Find:

```ts
  upsertWidget(widget: FuxaWidget): void {
    if (this.destroyed) return;
    if (!hasGeometry(widget)) {
      console.warn(`canvas-svg: skipping widget '${widget.id}' without geometry`);
      return;
    }
    let el = this.widgetMap.get(widget.id);
    if (!el) {
      el = this.widgetLayer
        .rect(widget.w, widget.h)
        .attr({ x: widget.x, y: widget.y })
        .attr('data-widget-id', widget.id)
        .attr('fill', '#3b82f6')
        .attr('stroke', '#1e40af');
      this.widgetMap.set(widget.id, el);
    } else {
      el.attr({ x: widget.x, y: widget.y, width: widget.w, height: widget.h });
    }
    // SP-FX-3b.2.2: apply rotate transform on render. Omits transform when 0/undefined.
    const r = (widget as { rotate?: number }).rotate;
    if (typeof r === 'number' && r !== 0) {
      const cx = widget.x + widget.w / 2;
      const cy = widget.y + widget.h / 2;
      (el.node as SVGElement).setAttribute('transform', `rotate(${r} ${cx} ${cy})`);
    } else {
      (el.node as SVGElement).removeAttribute('transform');
    }
  }
```

Replace with:

```ts
  upsertWidget(widget: FuxaWidget): void {
    if (this.destroyed) return;
    if (!hasGeometry(widget)) {
      console.warn(`canvas-svg: skipping widget '${widget.id}' without geometry`);
      return;
    }
    let el = this.widgetMap.get(widget.id);
    if (!el) {
      el = this.createElementForType(widget);
      this.widgetMap.set(widget.id, el);
    } else {
      this.updateElementForType(el, widget);
    }
    // SP-FX-3b.2.2: apply rotate transform on render. Omits transform when 0/undefined.
    const r = (widget as { rotate?: number }).rotate;
    if (typeof r === 'number' && r !== 0) {
      const cx = widget.x + widget.w / 2;
      const cy = widget.y + widget.h / 2;
      (el.node as SVGElement).setAttribute('transform', `rotate(${r} ${cx} ${cy})`);
    } else {
      (el.node as SVGElement).removeAttribute('transform');
    }
  }

  private createElementForType(widget: FuxaWidget & { x: number; y: number; w: number; h: number }): SvgElement {
    switch (widget.type) {
      case 'ellipse': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        const rx = widget.w / 2;
        const ry = widget.h / 2;
        return this.widgetLayer
          .ellipse(widget.w, widget.h)
          .attr({ cx, cy, rx, ry })
          .attr('data-widget-id', widget.id)
          .attr('fill', '#3b82f6')
          .attr('stroke', '#1e40af');
      }
      case 'text': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        const content = ((widget.property as { text?: string }).text) ?? '文本';
        const t = this.widgetLayer
          .text(content)
          .attr('x', cx)
          .attr('y', cy)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('data-widget-id', widget.id)
          .attr('fill', '#111827')
          .attr('font-size', '14');
        return t;
      }
      default: {
        // 'rect' and any legacy type (e.g. 'svg-ext-value') → rect render
        return this.widgetLayer
          .rect(widget.w, widget.h)
          .attr({ x: widget.x, y: widget.y })
          .attr('data-widget-id', widget.id)
          .attr('fill', '#3b82f6')
          .attr('stroke', '#1e40af');
      }
    }
  }

  private updateElementForType(el: SvgElement, widget: FuxaWidget & { x: number; y: number; w: number; h: number }): void {
    switch (widget.type) {
      case 'ellipse': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        el.attr({ cx, cy, rx: widget.w / 2, ry: widget.h / 2 });
        break;
      }
      case 'text': {
        const cx = widget.x + widget.w / 2;
        const cy = widget.y + widget.h / 2;
        const content = ((widget.property as { text?: string }).text) ?? '文本';
        el.attr({ x: cx, y: cy });
        (el.node as SVGTextElement).textContent = content;
        break;
      }
      default: {
        el.attr({ x: widget.x, y: widget.y, width: widget.w, height: widget.h });
      }
    }
  }
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -10
```

Expected: previous canvas-svg tests + 3 new = all pass. Existing `'svg-ext-value'` widgets render rect (default branch).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/canvas-svg.ts packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts
git commit -m "feat(scada-engine): canvas-svg upsertWidget renders rect/ellipse/text by type (SP-FX-4)

Type switch via createElementForType / updateElementForType private helpers.
'rect' / 'svg-ext-value' (legacy) / any unknown type → <rect> (existing path).
'ellipse' → <ellipse cx/cy/rx/ry>.
'text' → <text> with property.text content (fallback '文本').
Rotate transform applied uniformly across all types. 3 new tests."
```

---

## Task 3: Palette.tsx + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/palette/Palette.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Palette } from '../Palette';

describe('Palette component (SP-FX-4)', () => {
  it('renders 3 palette items', () => {
    const { container } = render(<Palette />);
    const items = container.querySelectorAll('[data-palette-item]');
    expect(items.length).toBe(3);
  });

  it('each item is draggable', () => {
    const { container } = render(<Palette />);
    const items = container.querySelectorAll('[data-palette-item]');
    items.forEach((item) => {
      expect(item.getAttribute('draggable')).toBe('true');
    });
  });

  it('renders Chinese labels 矩形 椭圆 文本', () => {
    const { getByText } = render(<Palette />);
    expect(getByText('矩形')).not.toBeNull();
    expect(getByText('椭圆')).not.toBeNull();
    expect(getByText('文本')).not.toBeNull();
  });

  it('dragstart on rect item sets dataTransfer palette-item=rect + effectAllowed=copy', () => {
    const { container } = render(<Palette />);
    const rectItem = container.querySelector('[data-palette-item="rect"]') as HTMLElement;
    let recordedType = '';
    let recordedEffect = '';
    const dataTransfer = {
      setData: (k: string, v: string) => { if (k === 'palette-item') recordedType = v; },
      effectAllowed: '',
    } as unknown as DataTransfer;
    Object.defineProperty(dataTransfer, 'effectAllowed', {
      set(v: string) { recordedEffect = v; },
      get() { return recordedEffect; },
    });
    fireEvent.dragStart(rectItem, { dataTransfer });
    expect(recordedType).toBe('rect');
    expect(recordedEffect).toBe('copy');
  });

  it('items rendered as <li> inside <ul data-panel="palette">', () => {
    const { container } = render(<Palette />);
    const ul = container.querySelector('ul[data-panel="palette"]');
    expect(ul).not.toBeNull();
    const lis = ul!.querySelectorAll(':scope > li');
    expect(lis.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/palette/__tests__/Palette.test.tsx 2>&1 | tail -10
```

Expected: 5 RED (Cannot find module '../Palette').

- [ ] **Step 3: Create Palette.tsx**

Create `packages/web-ui/src/scada-engine/editor/palette/Palette.tsx`:

```tsx
// SP-FX-4: left palette panel — 3 basic shapes draggable onto canvas.

import { PALETTE_ITEMS } from './palette-items';

export function Palette(): JSX.Element {
  return (
    <ul
      data-panel="palette"
      className="w-[200px] flex-shrink-0 border-r border-zinc-700 bg-zinc-900 p-2 space-y-1 overflow-y-auto"
    >
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

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/palette/__tests__/Palette.test.tsx 2>&1 | tail -10
```

Expected: **5 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/palette/Palette.tsx packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx
git commit -m "feat(scada-engine): Palette panel renders 3 draggable shapes (SP-FX-4)

UL[data-panel='palette'] with 3 LI items (矩形/椭圆/文本) each draggable=true.
dragstart sets dataTransfer.setData('palette-item', type) + effectAllowed='copy'.
5 tests."
```

---

## Task 4: commands.ts (executeSave) + 4 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/toolbar/commands.ts`
- Create: `packages/web-ui/src/scada-engine/editor/toolbar/__tests__/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/toolbar/__tests__/commands.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { executeSave, type CommandContext } from '../commands';

function makeCtx(saveImpl: (id: string) => Promise<void>): CommandContext {
  return {
    saveView: saveImpl,
    undo: vi.fn(),
    redo: vi.fn(),
    toggleGrid: vi.fn(),
  };
}

describe('commands.executeSave (SP-FX-4)', () => {
  it('returns ok=true when saveView resolves', async () => {
    const ctx = makeCtx(() => Promise.resolve());
    const result = await executeSave(ctx, 'v1');
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns ok=false with Error message when saveView rejects with Error', async () => {
    const ctx = makeCtx(() => Promise.reject(new Error('save failed: 500')));
    const result = await executeSave(ctx, 'v1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('save failed: 500');
  });

  it('returns ok=false with default "save failed" on non-Error throw', async () => {
    const ctx = makeCtx(() => Promise.reject('string-error'));
    const result = await executeSave(ctx, 'v1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('save failed');
  });

  it('passes viewId through to saveView', async () => {
    const saveFn = vi.fn(() => Promise.resolve());
    const ctx = makeCtx(saveFn);
    await executeSave(ctx, 'v_abc');
    expect(saveFn).toHaveBeenCalledWith('v_abc');
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/toolbar/__tests__/commands.test.ts 2>&1 | tail -10
```

Expected: 4 RED (Cannot find module '../commands').

- [ ] **Step 3: Create commands.ts**

Create `packages/web-ui/src/scada-engine/editor/toolbar/commands.ts`:

```ts
// SP-FX-4: toolbar command wrappers — pure async functions for testability.

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

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/toolbar/__tests__/commands.test.ts 2>&1 | tail -10
```

Expected: **4 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/toolbar/commands.ts packages/web-ui/src/scada-engine/editor/toolbar/__tests__/commands.test.ts
git commit -m "feat(scada-engine): executeSave command wrapper (SP-FX-4)

executeSave wraps store.saveView with try/catch → {ok, error?}.
CommandContext interface: saveView/undo/redo/toggleGrid. 4 tests."
```

---

## Task 5: Toolbar.tsx + 10 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/toolbar/Toolbar.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/toolbar/__tests__/Toolbar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/toolbar/__tests__/Toolbar.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { Toolbar } from '../Toolbar';
import { useEditorStore } from '../../../services/editor-store';

function resetStore(snapEnabled = true) {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled,
    gridSize: 10,
  } as any, true);
}

function openMinimalView() {
  useEditorStore.getState().openView({
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600,
    items: {},
    schemaVersion: 1,
  } as any);
}

describe('Toolbar (SP-FX-4)', () => {
  beforeEach(() => {
    resetStore();
    openMinimalView();
  });

  it('renders 4 buttons (save/undo/redo/grid)', () => {
    const { container } = render(<Toolbar viewId="v1" />);
    expect(container.querySelector('[data-cmd="save"]')).not.toBeNull();
    expect(container.querySelector('[data-cmd="undo"]')).not.toBeNull();
    expect(container.querySelector('[data-cmd="redo"]')).not.toBeNull();
    expect(container.querySelector('[data-cmd="grid"]')).not.toBeNull();
  });

  it('click 保存 calls store.saveView with viewId', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { container } = render(<Toolbar viewId="v1" />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-cmd="save"]')!);
      await Promise.resolve();
    });
    expect(spy).toHaveBeenCalled();
    expect((spy.mock.calls[0][0] as string)).toBe('/api/v1/fuxa-views/v1');
    spy.mockRestore();
  });

  it('click 撤销 calls store.undo', () => {
    const spy = vi.spyOn(useEditorStore.getState(), 'undo' as any);
    // Force a history entry so undo button is enabled
    useEditorStore.setState((s) => ({ history: { past: [s.currentView as any], future: [] } }));
    const { container } = render(<Toolbar viewId="v1" />);
    fireEvent.click(container.querySelector('[data-cmd="undo"]')!);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('click 重做 calls store.redo', () => {
    const spy = vi.spyOn(useEditorStore.getState(), 'redo' as any);
    useEditorStore.setState((s) => ({ history: { past: [], future: [s.currentView as any] } }));
    const { container } = render(<Toolbar viewId="v1" />);
    fireEvent.click(container.querySelector('[data-cmd="redo"]')!);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('click 网格 calls store.toggleGrid', () => {
    const before = useEditorStore.getState().snapEnabled;
    const { container } = render(<Toolbar viewId="v1" />);
    fireEvent.click(container.querySelector('[data-cmd="grid"]')!);
    expect(useEditorStore.getState().snapEnabled).toBe(!before);
  });

  it('grid button data-active reflects snapEnabled', () => {
    resetStore(true);
    openMinimalView();
    const { container, rerender } = render(<Toolbar viewId="v1" />);
    expect(container.querySelector('[data-cmd="grid"]')!.getAttribute('data-active')).toBe('true');
    act(() => { useEditorStore.getState().toggleGrid(); });
    rerender(<Toolbar viewId="v1" />);
    expect(container.querySelector('[data-cmd="grid"]')!.getAttribute('data-active')).toBe('false');
  });

  it('Cmd+S preventsDefault + calls saveView', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    render(<Toolbar viewId="v1" />);
    const e = new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true });
    await act(async () => { document.dispatchEvent(e); await Promise.resolve(); });
    expect(e.defaultPrevented).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('Cmd+Z calls store.undo; Cmd+Shift+Z calls store.redo', () => {
    const undoSpy = vi.spyOn(useEditorStore.getState(), 'undo' as any);
    const redoSpy = vi.spyOn(useEditorStore.getState(), 'redo' as any);
    render(<Toolbar viewId="v1" />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    expect(undoSpy).toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true }));
    expect(redoSpy).toHaveBeenCalled();
    undoSpy.mockRestore();
    redoSpy.mockRestore();
  });

  it('Cmd+Y also calls store.redo', () => {
    const redoSpy = vi.spyOn(useEditorStore.getState(), 'redo' as any);
    render(<Toolbar viewId="v1" />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', metaKey: true }));
    expect(redoSpy).toHaveBeenCalled();
    redoSpy.mockRestore();
  });

  it('Cmd+Z in INPUT focused element is skipped', () => {
    const undoSpy = vi.spyOn(useEditorStore.getState(), 'undo' as any);
    render(<Toolbar viewId="v1" />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    expect(undoSpy).not.toHaveBeenCalled();
    input.remove();
    undoSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/toolbar/__tests__/Toolbar.test.tsx 2>&1 | tail -15
```

Expected: 10 RED (Cannot find module '../Toolbar').

- [ ] **Step 3: Create Toolbar.tsx**

Create `packages/web-ui/src/scada-engine/editor/toolbar/Toolbar.tsx`:

```tsx
// SP-FX-4: top toolbar — 4 commands + global keyboard shortcuts (Cmd+S/Z/Shift+Z/Y).

import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../../services/editor-store';
import { executeSave } from './commands';

export interface ToolbarProps { viewId: string; }

export function Toolbar({ viewId }: ToolbarProps): JSX.Element {
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);

  const runSave = useCallback(async () => {
    const a = useEditorStore.getState();
    const result = await executeSave({
      saveView: a.saveView, undo: a.undo, redo: a.redo, toggleGrid: a.toggleGrid,
    }, viewId);
    if (result.ok) console.log('[toolbar] save ok');
    else console.warn('[toolbar] save error:', result.error);
  }, [viewId]);

  const onUndo = useCallback(() => { useEditorStore.getState().undo(); }, []);
  const onRedo = useCallback(() => { useEditorStore.getState().redo(); }, []);
  const onToggleGrid = useCallback(() => { useEditorStore.getState().toggleGrid(); }, []);

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
        onUndo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        onRedo();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [runSave, onUndo, onRedo]);

  return (
    <header
      data-panel="toolbar"
      className="h-12 flex items-center gap-2 px-3 border-b border-zinc-700 bg-zinc-900"
    >
      <button
        data-cmd="save"
        onClick={runSave}
        className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white"
      >
        保存
      </button>
      <button
        data-cmd="undo"
        onClick={onUndo}
        disabled={!canUndo}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        撤销
      </button>
      <button
        data-cmd="redo"
        onClick={onRedo}
        disabled={!canRedo}
        className="px-3 py-1 text-sm rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 disabled:opacity-40"
      >
        重做
      </button>
      <button
        data-cmd="grid"
        data-active={String(snapEnabled)}
        onClick={onToggleGrid}
        className={`px-3 py-1 text-sm rounded text-zinc-100 ${snapEnabled ? 'bg-emerald-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
      >
        网格
      </button>
    </header>
  );
}
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/toolbar/__tests__/Toolbar.test.tsx 2>&1 | tail -15
```

Expected: **10 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/toolbar/Toolbar.tsx packages/web-ui/src/scada-engine/editor/toolbar/__tests__/Toolbar.test.tsx
git commit -m "feat(scada-engine): Toolbar with 4 commands + Cmd+S/Z/Shift+Z/Y keyboard (SP-FX-4)

4 buttons (save/undo/redo/grid). Grid active state visual via data-active.
Global document keydown listener: Cmd+S → save (preventDefault),
Cmd+Z → undo, Cmd+Shift+Z or Cmd+Y → redo. INPUT/TEXTAREA focus skips
all shortcuts (browser default). 10 tests."
```

---

## Task 6: PropertiesPlaceholder.tsx + 7 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/properties/PropertiesPlaceholder.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertiesPlaceholder.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertiesPlaceholder.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PropertiesPlaceholder } from '../PropertiesPlaceholder';
import { useEditorStore } from '../../../services/editor-store';

function reset() {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: true,
    gridSize: 10,
  } as any, true);
}

describe('PropertiesPlaceholder (SP-FX-4)', () => {
  beforeEach(() => { reset(); });

  it('renders "未选中" when selection is empty', () => {
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.textContent).toContain('未选中');
  });

  it('renders 7 readonly fields when 1 widget selected', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'rect', property: {}, x: 10, y: 20, w: 100, h: 60, rotate: 30 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<PropertiesPlaceholder />);
    const txt = container.textContent ?? '';
    expect(txt).toContain('w1');     // id
    expect(txt).toContain('rect');   // type
    expect(txt).toContain('10');     // x
    expect(txt).toContain('20');     // y
    expect(txt).toContain('100');    // w
    expect(txt).toContain('60');     // h
    expect(txt).toContain('30');     // rotate
  });

  it('rotate undefined renders "0"', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 50 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<PropertiesPlaceholder />);
    const rotateRow = container.querySelector('[data-field="rotate"]');
    expect(rotateRow?.textContent).toContain('0');
  });

  it('renders "组件已删" when selection has id not in items', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: {}, schemaVersion: 1,
    } as any);
    // Bypass setSelection's items-validation by direct setState
    useEditorStore.setState({ selection: ['w_missing'] });
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.textContent).toContain('组件已删');
  });

  it('renders "已选 N (批量)" when 2+ widgets selected', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: {
        w1: { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30 },
        w2: { id: 'w2', type: 'rect', property: {}, x: 60, y: 0, w: 50, h: 30 },
      },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1', 'w2']);
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.textContent).toContain('已选 2');
  });

  it('type field shows ellipse for ellipse widget', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { e1: { id: 'e1', type: 'ellipse', property: {}, x: 0, y: 0, w: 80, h: 80 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['e1']);
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.querySelector('[data-field="type"]')?.textContent).toContain('ellipse');
  });

  it('rotate=45 renders as "45"', () => {
    useEditorStore.getState().openView({
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
      items: { w1: { id: 'w1', type: 'rect', property: {}, x: 0, y: 0, w: 50, h: 30, rotate: 45 } },
      schemaVersion: 1,
    } as any);
    useEditorStore.getState().setSelection(['w1']);
    const { container } = render(<PropertiesPlaceholder />);
    expect(container.querySelector('[data-field="rotate"]')?.textContent).toContain('45');
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/properties/__tests__/PropertiesPlaceholder.test.tsx 2>&1 | tail -15
```

Expected: 7 RED (Cannot find module '../PropertiesPlaceholder').

- [ ] **Step 3: Create PropertiesPlaceholder.tsx**

Create `packages/web-ui/src/scada-engine/editor/properties/PropertiesPlaceholder.tsx`:

```tsx
// SP-FX-4: right panel — readonly widget fields placeholder.
// SP-FX-5/6 will replace this with editable per-widget property panels.

import { useEditorStore } from '../../services/editor-store';

export function PropertiesPlaceholder(): JSX.Element {
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  const baseClass = 'w-[250px] flex-shrink-0 border-l border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 overflow-y-auto';

  if (!items || selection.length === 0) {
    return <aside data-panel="properties" className={baseClass}><p>未选中</p></aside>;
  }
  if (selection.length >= 2) {
    return <aside data-panel="properties" className={baseClass}><p>已选 {selection.length} 个 (批量)</p></aside>;
  }
  const w = items[selection[0]];
  if (!w) {
    return <aside data-panel="properties" className={baseClass}><p>组件已删</p></aside>;
  }

  const r = (w as { rotate?: number }).rotate ?? 0;
  return (
    <aside data-panel="properties" className={baseClass}>
      <dl className="space-y-1">
        <Row k="id" v={w.id} />
        <Row k="type" v={w.type} />
        <Row k="x" v={String((w as { x?: number }).x ?? 0)} />
        <Row k="y" v={String((w as { y?: number }).y ?? 0)} />
        <Row k="w" v={String((w as { w?: number }).w ?? 0)} />
        <Row k="h" v={String((w as { h?: number }).h ?? 0)} />
        <Row k="rotate" v={String(r)} />
      </dl>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div data-field={k} className="flex gap-2">
      <dt className="w-12 text-zinc-400">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/properties/__tests__/PropertiesPlaceholder.test.tsx 2>&1 | tail -10
```

Expected: **7 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/properties/PropertiesPlaceholder.tsx packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertiesPlaceholder.test.tsx
git commit -m "feat(scada-engine): PropertiesPlaceholder readonly widget fields (SP-FX-4)

aside[data-panel='properties'] renders by selection.length:
  0 → '未选中'; 1 → 7 readonly fields (id/type/x/y/w/h/rotate);
  >=2 → '已选 N 个 (批量)'; id-not-in-items → '组件已删'.
rotate undefined → '0'. Per-field data-field attr for test targeting.
SP-FX-5/6 will replace with editable panels. 7 tests."
```

---

## Task 7: EditorCanvas drop wire + 5 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Inspect existing EditorCanvas to locate the SVG root render**

Run:

```bash
cd /Volumes/SSD/projects/BIOCore
grep -n "container\|svgRoot\|wrapperRef\|<div\|<svg" packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx | head -20
```

Identify the host `<div>` that wraps the svg.js root or the inline `<svg>` element. The drop handlers attach to that host element.

- [ ] **Step 2: Write the failing tests**

Append at END of `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
describe('EditorCanvas drop wire (SP-FX-4)', () => {
  it('onDragOver with palette-item type calls preventDefault', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    expect(host).not.toBeNull();
    const dt = new DataTransfer();
    dt.setData('palette-item', 'rect');
    const e = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    const prevented = !host.dispatchEvent(e);
    expect(prevented).toBe(true);
  });

  it('onDragOver without palette-item does NOT preventDefault', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    const e = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    const prevented = !host.dispatchEvent(e);
    expect(prevented).toBe(false);
  });

  it('onDrop with type=rect calls store.addWidget with snapped coords', () => {
    const addSpy = vi.spyOn(useEditorStore.getState(), 'addWidget' as any);
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('palette-item', 'rect');
    fireEvent(host, new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 23, clientY: 47 }));
    expect(addSpy).toHaveBeenCalledTimes(1);
    const widget = addSpy.mock.calls[0][0];
    expect(widget.type).toBe('rect');
    // jsdom getScreenCTM may return identity; snapped to gridSize 10
    expect(widget.x % 10).toBe(0);
    expect(widget.y % 10).toBe(0);
    addSpy.mockRestore();
  });

  it('onDrop with non-palette dataTransfer is no-op', () => {
    const addSpy = vi.spyOn(useEditorStore.getState(), 'addWidget' as any);
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    fireEvent(host, new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 23, clientY: 47 }));
    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('onDrop uses widget.type=ellipse for palette ellipse drop', () => {
    const addSpy = vi.spyOn(useEditorStore.getState(), 'addWidget' as any);
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView({
        id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600,
        items: {}, schemaVersion: 1,
      } as any);
    });
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const dt = new DataTransfer();
    dt.setData('palette-item', 'ellipse');
    fireEvent(host, new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 0, clientY: 0 }));
    expect(addSpy.mock.calls[0][0].type).toBe('ellipse');
    addSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx -t "drop wire" 2>&1 | tail -10
```

Expected: 5 RED (host element not found or addWidget not called).

- [ ] **Step 4: Locate the EditorCanvas host element + add `data-editor-canvas-host` attr + drop wire**

Open `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`. Find the top-level wrapper `<div>` returned by the component (the element whose ref is passed to `new CanvasController(container, ...)`). Add:
- `data-editor-canvas-host` attribute
- `onDragOver` handler
- `onDrop` handler

Example transformation (adapt names to actual file):

Find a block similar to:

```tsx
return (
  <div ref={containerRef} className="relative w-full h-full" />
);
```

Replace with:

```tsx
return (
  <div
    ref={containerRef}
    data-editor-canvas-host
    className="relative w-full h-full"
    onDragOver={(e) => {
      if (e.dataTransfer.types.includes('palette-item')) e.preventDefault();
    }}
    onDrop={(e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('palette-item') as 'rect' | 'ellipse' | 'text' | '';
      if (!type || !['rect', 'ellipse', 'text'].includes(type)) return;
      const host = e.currentTarget as HTMLElement;
      const svg = host.querySelector('svg') as SVGSVGElement | null;
      const ctm = svg?.getScreenCTM();
      const hostRect = host.getBoundingClientRect();
      const local = ctm
        ? clientToSvg({ x: e.clientX, y: e.clientY }, ctm.inverse())
        : { x: e.clientX - hostRect.left, y: e.clientY - hostRect.top };
      const store = useEditorStore.getState();
      store.addWidget(makeWidget(type, local, store.gridSize));
    }}
  />
);
```

Also add at the top of `EditorCanvas.tsx`:

```ts
import { clientToSvg } from './geometry';
import { makeWidget } from './palette/palette-items';
import { useEditorStore } from '../services/editor-store';
```

(Skip imports already present.)

- [ ] **Step 5: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -15
```

Expected: previous 37 + 5 = **42 passed**.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): EditorCanvas onDragOver/onDrop wire for palette D&D (SP-FX-4)

Host div gains data-editor-canvas-host + onDragOver/onDrop handlers.
onDragOver preventDefault only when dataTransfer.types includes 'palette-item'.
onDrop reads type, converts client→svg coords via clientToSvg(ctm.inverse())
(jsdom getBoundingClientRect fallback), calls store.addWidget(makeWidget(...)).
5 tests cover drop accept/reject + type variants."
```

---

## Task 8: editor-shell.tsx + 6 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/editor-shell.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/__tests__/editor-shell.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/__tests__/editor-shell.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { EditorShell } from '../editor-shell';
import { useEditorStore } from '../../services/editor-store';

function reset() {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: true,
    gridSize: 10,
  } as any, true);
}

function openView() {
  useEditorStore.getState().openView({
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items: {}, schemaVersion: 1,
  } as any);
}

describe('EditorShell (SP-FX-4)', () => {
  beforeEach(() => { reset(); openView(); });

  it('renders all 4 panels (toolbar/palette/properties + canvas host)', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    expect(container.querySelector('[data-panel="toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="palette"]')).not.toBeNull();
    expect(container.querySelector('[data-panel="properties"]')).not.toBeNull();
    expect(container.querySelector('[data-editor-canvas-host]')).not.toBeNull();
  });

  it('palette has width 200px class', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    const palette = container.querySelector('[data-panel="palette"]')!;
    expect(palette.className).toContain('w-[200px]');
  });

  it('properties has width 250px class', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    const props = container.querySelector('[data-panel="properties"]')!;
    expect(props.className).toContain('w-[250px]');
  });

  it('canvas host is in a flex-1 wrapper (fills middle)', () => {
    const { container } = render(<EditorShell viewId="v1" />);
    const host = container.querySelector('[data-editor-canvas-host]')!;
    const parent = host.parentElement!;
    expect(parent.className).toContain('flex-1');
  });

  it('forwards viewId to Toolbar (save button click triggers fetch with viewId)', async () => {
    const { container } = render(<EditorShell viewId="v_abc" />);
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await act(async () => {
      (container.querySelector('[data-cmd="save"]') as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect((spy.mock.calls[0][0] as string)).toBe('/api/v1/fuxa-views/v_abc');
    spy.mockRestore();
  });

  it('re-render does not re-mount EditorCanvas (host element identity preserved)', () => {
    const { container, rerender } = render(<EditorShell viewId="v1" />);
    const host1 = container.querySelector('[data-editor-canvas-host]');
    rerender(<EditorShell viewId="v1" />);
    const host2 = container.querySelector('[data-editor-canvas-host]');
    expect(host1).toBe(host2);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/editor-shell.test.tsx 2>&1 | tail -10
```

Expected: 6 RED (Cannot find module '../editor-shell').

- [ ] **Step 3: Create editor-shell.tsx**

Create `packages/web-ui/src/scada-engine/editor/editor-shell.tsx`:

```tsx
// SP-FX-4: editor shell — top toolbar + 3-pane composition.

import { EditorCanvas } from './EditorCanvas';
import { Palette } from './palette/Palette';
import { Toolbar } from './toolbar/Toolbar';
import { PropertiesPlaceholder } from './properties/PropertiesPlaceholder';

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

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/editor-shell.test.tsx 2>&1 | tail -10
```

Expected: **6 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/editor-shell.tsx packages/web-ui/src/scada-engine/editor/__tests__/editor-shell.test.tsx
git commit -m "feat(scada-engine): EditorShell composition wrapper (SP-FX-4)

Top toolbar + 3-pane (palette ~200px | canvas flex-1 | properties ~250px).
ViewId prop forwards to Toolbar. EditorCanvas host element identity stable
across re-renders. 6 tests."
```

---

## Task 9: app/scada2/edit-v2/[viewId]/page.tsx + 3 tests

**Files:**
- Create: `packages/web-ui/src/app/scada2/edit-v2/[viewId]/page.tsx`
- Create: `packages/web-ui/src/app/scada2/edit-v2/[viewId]/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/app/scada2/edit-v2/[viewId]/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, act, fireEvent } from '@testing-library/react';
import Page from '../page';
import { useEditorStore } from '@/scada-engine/services/editor-store';

function reset() {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
    snapEnabled: true,
    gridSize: 10,
  } as any, true);
}

describe('EditorShellPage (SP-FX-4)', () => {
  beforeEach(() => { reset(); });

  it('2xx loads view + renders EditorShell', async () => {
    const view = { id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>', width: 800, height: 600, items: {}, schemaVersion: 1 };
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(view), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const { container } = render(<Page params={{ viewId: 'v1' }} />);
    await waitFor(() => {
      expect(container.querySelector('[data-panel="toolbar"]')).not.toBeNull();
    });
    expect(spy).toHaveBeenCalledWith('/api/v1/fuxa-views/v1');
    spy.mockRestore();
  });

  it('404 renders "视图不存在" + 返回链接', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
    const { container } = render(<Page params={{ viewId: 'v_missing' }} />);
    await waitFor(() => {
      expect(container.textContent).toContain('视图不存在');
    });
    expect(container.querySelector('a[href="/scada2/"]')).not.toBeNull();
    spy.mockRestore();
  });

  it('5xx renders 重试 button; click re-fetches', async () => {
    let calls = 0;
    const spy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      calls += 1;
      return Promise.resolve(new Response('boom', { status: 500 }));
    });
    const { container } = render(<Page params={{ viewId: 'v1' }} />);
    await waitFor(() => {
      expect(container.textContent).toContain('加载失败');
    });
    expect(calls).toBe(1);
    await act(async () => {
      fireEvent.click(container.querySelector('button[data-action="retry"]')!);
      await Promise.resolve();
    });
    await waitFor(() => { expect(calls).toBe(2); });
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/app/scada2/edit-v2/\[viewId\]/__tests__/page.test.tsx 2>&1 | tail -10
```

Expected: 3 RED (Cannot find module '../page').

- [ ] **Step 3: Create page.tsx**

Create `packages/web-ui/src/app/scada2/edit-v2/[viewId]/page.tsx`:

```tsx
'use client';

// SP-FX-4: editor shell entry page. Loads view via GET, injects into store,
// renders EditorShell. 404 fallback + 5xx retry.

import { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '@/scada-engine/services/editor-store';
import { EditorShell } from '@/scada-engine/editor/editor-shell';

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

export default function Page({ params }: { params: { viewId: string } }): JSX.Element {
  const [state, setState] = useState<LoadState>('loading');
  const openView = useEditorStore.getState().openView;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch(`/api/v1/fuxa-views/${params.viewId}`);
      if (r.status === 404) { setState('not_found'); return; }
      if (!r.ok) { setState('error'); return; }
      const view = await r.json();
      openView(view);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [params.viewId, openView]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <div className="p-8 text-zinc-400">加载中...</div>;
  if (state === 'not_found') return (
    <div className="p-8">
      <p className="mb-2">视图不存在</p>
      <a href="/scada2/" className="text-blue-400 underline">返回列表</a>
    </div>
  );
  if (state === 'error') return (
    <div className="p-8">
      <p className="mb-2">加载失败</p>
      <button data-action="retry" onClick={load} className="px-3 py-1 bg-blue-600 text-white rounded">
        重试
      </button>
    </div>
  );
  return <EditorShell viewId={params.viewId} />;
}
```

- [ ] **Step 4: Run tests to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/app/scada2/edit-v2/\[viewId\]/__tests__/page.test.tsx 2>&1 | tail -10
```

Expected: **3 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/app/scada2/edit-v2/\[viewId\]/page.tsx packages/web-ui/src/app/scada2/edit-v2/\[viewId\]/__tests__/page.test.tsx
git commit -m "feat(scada-engine): /scada2/edit-v2/[viewId] page (SP-FX-4)

Client page with 4-state machine (loading/ready/not_found/error).
GET /api/v1/fuxa-views/:viewId → 404 fallback / 5xx retry / 2xx mount EditorShell.
3 tests."
```

---

## Task 10: editor/index.ts barrel exports

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`

- [ ] **Step 1: Read current barrel**

```bash
cat /Volumes/SSD/projects/BIOCore/packages/web-ui/src/scada-engine/editor/index.ts
```

- [ ] **Step 2: Append SP-FX-4 exports**

Open `packages/web-ui/src/scada-engine/editor/index.ts`. Append at END (after existing exports):

```ts
// SP-FX-4 shell exports
export { EditorShell, type EditorShellProps } from './editor-shell';
export { Palette } from './palette/Palette';
export { PALETTE_ITEMS, makeWidget, type PaletteItem, type PaletteItemType } from './palette/palette-items';
export { Toolbar, type ToolbarProps } from './toolbar/Toolbar';
export { executeSave, type CommandContext } from './toolbar/commands';
export { PropertiesPlaceholder } from './properties/PropertiesPlaceholder';
```

- [ ] **Step 3: tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/index.ts
git commit -m "feat(scada-engine): export SP-FX-4 shell modules from editor barrel"
```

---

## Task 11: Playwright 3 smoke

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-shell.spec.ts`

- [ ] **Step 1: Determine fixture view id**

The page route requires a `viewId` that resolves via `/api/v1/fuxa-views/:id`. Use Option B (seed) below for determinism: the test seeds a fresh view via POST `/api/v1/fuxa-views/` in `beforeEach` and uses the returned id. The server endpoint exists from SP-FX-1.

- [ ] **Step 2: Write the smoke spec**

Create `packages/web-ui/e2e/scada-editor-shell.spec.ts`:

```ts
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

async function seedView(request: APIRequestContext): Promise<string> {
  const id = `v_smoke_${Date.now()}`;
  const view = {
    id, name: 'smoke', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600,
    items: {},
    schemaVersion: 1,
  };
  const r = await request.post('/api/v1/fuxa-views', { data: view });
  if (!r.ok()) throw new Error(`seedView failed: ${r.status()}`);
  return id;
}

test.describe('SP-FX-4 — editor shell smoke', () => {
  let viewId: string;

  test.beforeEach(async ({ page, request }) => {
    await login(page);
    viewId = await seedView(request);
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });
  });

  test('palette rect dragTo canvas → widget appears → save', async ({ page }) => {
    const rectItem = page.locator('[data-palette-item="rect"]');
    const canvasHost = page.locator('[data-editor-canvas-host]');
    await rectItem.dragTo(canvasHost, { targetPosition: { x: 200, y: 150 } });
    await page.waitForTimeout(300);
    const widgetCount = await page.locator('[data-widget-id]').count();
    expect(widgetCount).toBeGreaterThanOrEqual(1);
    await page.locator('[data-cmd="save"]').click();
    await page.waitForTimeout(500);
  });

  test('undo/redo via toolbar buttons', async ({ page }) => {
    const rectItem = page.locator('[data-palette-item="rect"]');
    const canvasHost = page.locator('[data-editor-canvas-host]');
    await rectItem.dragTo(canvasHost, { targetPosition: { x: 200, y: 150 } });
    await page.waitForTimeout(150);
    await rectItem.dragTo(canvasHost, { targetPosition: { x: 350, y: 250 } });
    await page.waitForTimeout(150);
    expect(await page.locator('[data-widget-id]').count()).toBe(2);
    await page.locator('[data-cmd="undo"]').click();
    await page.waitForTimeout(200);
    expect(await page.locator('[data-widget-id]').count()).toBe(1);
    await page.locator('[data-cmd="redo"]').click();
    await page.waitForTimeout(200);
    expect(await page.locator('[data-widget-id]').count()).toBe(2);
  });

  test('Cmd+S triggers PUT save', async ({ page }) => {
    const rectItem = page.locator('[data-palette-item="rect"]');
    const canvasHost = page.locator('[data-editor-canvas-host]');
    await rectItem.dragTo(canvasHost, { targetPosition: { x: 200, y: 150 } });
    await page.waitForTimeout(150);
    const putPromise = page.waitForRequest((req) =>
      req.method() === 'PUT' && req.url().includes(`/api/v1/fuxa-views/${viewId}`),
      { timeout: 5000 },
    );
    await page.keyboard.press('Meta+s');
    const req = await putPromise;
    expect(req.method()).toBe('PUT');
  });
});
```

- [ ] **Step 3: Boot dev servers + run Playwright**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/server dev > /tmp/biocore-server.log 2>&1 < /dev/null &
disown
sleep 10
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 15
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/scada2/
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-shell.spec.ts 2>&1 | tail -30
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: **3 passed**.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-editor-shell.spec.ts
git commit -m "test(scada-engine): Playwright SP-FX-4 editor shell smoke (3 cases)

beforeEach seeds a fresh view via POST /api/v1/fuxa-views/, then navigates
to /scada2/edit-v2/:id. Tests:
- palette rect dragTo canvas → widget appears + save click
- undo/redo via toolbar buttons (2 widgets → 1 → 2)
- Cmd+S triggers PUT /api/v1/fuxa-views/:id"
```

---

## Task 12: Regression + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | grep -E "Test Files|Tests" | tail -3
```

Expected: 648 + 8 + 6 + 5 + 3 + 4 + 10 + 7 + 5 + 6 + 3 = **705 passed** (or ≥702 if minor count drift).

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

- [ ] **Step 4: Playwright regression (23 total)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/server dev > /tmp/biocore-server.log 2>&1 < /dev/null &
disown
sleep 10
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 15
pnpm --filter @biocore/web-ui exec playwright test \
  e2e/scada-editor-canvas.spec.ts \
  e2e/scada-editor-canvas-3b1.spec.ts \
  e2e/scada-editor-canvas-3b2-1.spec.ts \
  e2e/scada-editor-canvas-3b2-2.spec.ts \
  e2e/scada-editor-canvas-3b2-3.spec.ts \
  e2e/scada-editor-shell.spec.ts 2>&1 | tail -10
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 20 + 3 = **23 passed**.

- [ ] **Step 5: §7 stop-condition self-check**

Verify each from spec §7:
1. /scada2/edit-v2/[viewId] renders top toolbar + 3-pane → T8 + T9
2. Palette renders 3 items + draggable + dragstart sets dataTransfer → T3
3. Drop calls addWidget(makeWidget(...)) + snap → T1 + T7
4. canvas-svg upsertWidget type switch (rect/ellipse/text + legacy fallback) → T2
5. Toolbar 4 commands wired (save/undo/redo/grid) → T0 + T5
6. Keyboard Cmd+S/Z/Shift+Z/Y + INPUT skip → T5
7. PropertiesPlaceholder 0/1/N/missing states → T6
8. EditorShellPage 404 fallback + 5xx retry + 2xx mount → T9
9. SP4-7 /scada2/edit/[viewId] unchanged + SP-FX-3 pure modules unchanged → Steps 1-4 regression
10. web-ui ≥ 702 + tsc clean + PW 23/23 → steps 1-4 above

If any fails → STOP, surface, no push.

- [ ] **Step 6: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds.

---

## Self-Review

**1. Spec coverage**

- §1.1 In-scope item 1 (shell layout) → T8 + T9
- §1.1 item 2 (palette 3 shapes + D&D) → T1 + T3 + T7
- §1.1 item 3 (toolbar 4 commands) → T0 + T5
- §1.1 item 4 (keyboard Cmd+S/Z/Shift+Z) → T5
- §1.1 item 5 (save backend PUT) → T0 + T5
- §1.1 item 6 (properties placeholder) → T6
- §1.1 item 7 (canvas-svg type extension) → T2
- §1.1 item 8 (editor-store addWidget/saveView/toggleGrid) → T0
- §1.1 item 9 (EditorShellPage 404/5xx) → T9
- §1.1 item 10 (SP-FX-3 reuse) → T7 (drop wire only) + T2 (canvas-svg fallback preserves legacy `'svg-ext-value'`)
- §3.1 schema enum → resolved: spec implied an enum but `widget.ts` keeps `z.string()`; widgets validate by type string at the canvas-svg switch site. Documented in File Structure "Not modified" section.
- §6.1 +54 vitest target → plan delivers +57 (3 explicit canvas-svg tests). Overage documented.

**2. Placeholder scan**

- No "TBD", "TODO", "implement later".
- No "add error handling" — concrete handlers in T9 (404/5xx state machine), T5 (INPUT focus skip, preventDefault).
- No "similar to Task N" — every task has full code.
- Every code step shows full source.

**3. Type consistency**

- `PaletteItemType` = `'rect' | 'ellipse' | 'text'` defined in T1, used in T3 / T7 / T2 — consistent.
- `EditorActions` interface in T0 (Step 4) lists `saveView` + `toggleGrid` matching T5 toolbar usage.
- `CommandContext` in T4 has 4 fields (saveView/undo/redo/toggleGrid); T5 Toolbar passes exactly these.
- `addWidget` signature in T0 unchanged from existing impl (single `FuxaWidget` arg); T7 EditorCanvas passes `makeWidget(...)` return value matching.
- `data-editor-canvas-host` attr added in T7; consumed in T7 tests + T8 editor-shell tests + T11 Playwright.
- `data-cmd` attrs (save/undo/redo/grid) consistent across T5 impl + T5 tests + T8 + T11.
- `data-panel` values (toolbar/palette/properties) consistent across T3 + T5 + T6 + T8 tests.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-4-editor-shell-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review (spec compliance + code quality) between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
