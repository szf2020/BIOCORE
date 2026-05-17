# SP-FX-3b.2.2 Single-Widget Rotate Handle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship single-widget rotate handle (free + Shift→15° snap) in ~1 week.

**Architecture:** Additive change. `FuxaWidget.rotate?: number` (optional, 0–360). New pure `applyRotate` in geometry. New `drag-rotate` state in `PointerState` union + 3 new callbacks. New `CanvasController.applyRotate(id, deg, pivot)` + `upsertWidget` honors `widget.rotate`. New `RotateTooltip` class in transform-handles for live angle display. `editor-store.updateWidget` patched to key-aware (deletes keys with `undefined` value so `rotate=0` strips from JSON).

**Tech Stack:** TypeScript 5, React 18, vitest + jsdom + @testing-library/react (existing), Playwright (existing), zustand 4.4 + immer 10 (existing), `@svgdotjs/svg.js ^3.2.4` (existing), Zod 3 (existing). No new dependencies.

---

## File Structure

**Modify:**
- `packages/web-ui/src/scada-engine/models/widget.ts` — `+ rotate?: z.number().min(0).max(360).optional()`
- `packages/web-ui/src/scada-engine/services/editor-store.ts` — `updateWidget` key-aware loop (deletes keys whose patch value is `undefined`)
- `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts` — +1 test
- `packages/web-ui/src/scada-engine/editor/geometry.ts` — `+ applyRotate(pivot, startPt, currentPt, startRotate, snapStep)`
- `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts` — +5 tests
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` — `+ RotateTooltip` exported class (alongside existing TransformHandles + SnapGuides)
- `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts` — +3 tests
- `packages/web-ui/src/scada-engine/editor/canvas-svg.ts` — `+ applyRotate(id, deg, pivot)` method; `upsertWidget` honors `widget.rotate`
- `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts` — +3 tests
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` — `+ drag-rotate` PointerState variant, +3 callbacks, handleMouseDown rotate branch, handleMouseMove/Up drag-rotate, cancel ext
- `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts` — +8 tests
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` — wire 3 new cb + `rotateTooltip` ref + lifecycle ctor/destroy
- `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx` — +6 tests
- `packages/web-ui/src/scada-engine/editor/index.ts` — re-export `RotateTooltip`, `applyRotate`
- `packages/web-ui/src/test/canvasMock.ts` — add `applyRotate: vi.fn()` to mock object (T5 may need this)

**Create:**
- `packages/web-ui/src/scada-engine/models/__tests__/widget.test.ts` — 4 schema tests (new file)
- `packages/web-ui/e2e/scada-editor-canvas-3b2-2.spec.ts` — 2 Playwright smoke

**Test count target:**
- web-ui vitest: 583 → **613** (+30: 4 schema + 1 store + 5 geo + 3 transform-handles + 3 canvas-svg + 8 pointer-tools + 6 React)
- Playwright: 15 → **17** (+2)

---

## Task 0: schema +rotate optional + 4 schema tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/models/widget.ts`
- Create: `packages/web-ui/src/scada-engine/models/__tests__/widget.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/models/__tests__/widget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FuxaWidgetSchema } from '../widget';

describe('FuxaWidgetSchema rotate (SP-FX-3b.2.2)', () => {
  const base = { id: 'w1', type: 'svg-ext-value', property: {} };

  it('rotate=45 accepted', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: 45 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rotate).toBe(45);
  });

  it('rotate=360 accepted (inclusive upper bound)', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: 360 });
    expect(r.success).toBe(true);
  });

  it('rotate=-5 rejected', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: -5 });
    expect(r.success).toBe(false);
  });

  it('rotate=400 rejected', () => {
    const r = FuxaWidgetSchema.safeParse({ ...base, rotate: 400 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/models/__tests__/widget.test.ts 2>&1 | tail -15
```

Expected: at least 2 failures — rotate=45 / rotate=360 currently pass parse but `r.data.rotate` is undefined (Zod strips unknown keys by default). rotate=-5 / rotate=400 also fail since no validation exists yet.

- [ ] **Step 3: Patch widget.ts to add rotate**

Open `packages/web-ui/src/scada-engine/models/widget.ts`. Find:

```ts
export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),                          // 'svg-ext-value' / 'svg-ext-html_button' / ...
  name: z.string().optional(),
  property: FuxaPropertySchema,
  // SP-FX-3a: editor geometry (optional for backward compat with v1 FUXA imports
  // that store coords in svgcontent). Editor patches these on drag/resize.
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().nonnegative().optional(),
  h: z.number().nonnegative().optional(),
});
```

Replace with:

```ts
export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),                          // 'svg-ext-value' / 'svg-ext-html_button' / ...
  name: z.string().optional(),
  property: FuxaPropertySchema,
  // SP-FX-3a: editor geometry (optional for backward compat with v1 FUXA imports
  // that store coords in svgcontent). Editor patches these on drag/resize.
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().nonnegative().optional(),
  h: z.number().nonnegative().optional(),
  // SP-FX-3b.2.2: optional rotation in degrees [0, 360]. Omitted from JSON
  // when undefined or 0 (editor strips on commit).
  rotate: z.number().min(0).max(360).optional(),
});
```

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/models/__tests__/widget.test.ts 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 5: tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/models/widget.ts packages/web-ui/src/scada-engine/models/__tests__/widget.test.ts
git commit -m "feat(scada-engine): FuxaWidget +rotate optional (SP-FX-3b.2.2)

Adds rotate?: z.number().min(0).max(360).optional() to FuxaWidgetSchema.
Backward compat: omitted key treated as 0; SP-FX-3b.1/3b.2.1 views
unchanged. 4 schema tests cover boundary inclusive + out-of-range reject."
```

---

## Task 1: editor-store.updateWidget key-aware patch + 1 test

**Files:**
- Modify: `packages/web-ui/src/scada-engine/services/editor-store.ts`
- Modify: `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`

- [ ] **Step 1: Write the failing test**

Append at the END of `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`:

```ts
describe('editorStore updateWidget undefined-value deletes key (SP-FX-3b.2.2)', () => {
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
      items: { w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30, rotate: 45 } },
      schemaVersion: 1,
    } as any);
  });

  it('updateWidget patch with rotate=undefined deletes the rotate key', () => {
    useEditorStore.getState().updateWidget('w1', { rotate: undefined } as any);
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect('rotate' in w).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -15
```

Expected: 1 failure (`'rotate' in w` is true since `Object.assign` keeps the key with `undefined` value).

- [ ] **Step 3: Patch updateWidget impl to be key-aware**

Open `packages/web-ui/src/scada-engine/services/editor-store.ts`. Find:

```ts
  updateWidget: (id, patch, opts) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    if (!currentView.items[id]) return;
    _store.setState((s) => ({
      history: opts?.silent
        ? s.history
        : { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => { Object.assign(draft.items[id], patch); }),
      isDirty: true,
    }));
  },
```

Replace with:

```ts
  updateWidget: (id, patch, opts) => {
    const { currentView } = _store.getState();
    if (!currentView) return;
    if (!currentView.items[id]) return;
    _store.setState((s) => ({
      history: opts?.silent
        ? s.history
        : { past: pushHistory(s.history.past, s.currentView!), future: [] },
      currentView: produce(currentView, (draft) => {
        const target = draft.items[id] as Record<string, unknown>;
        for (const k of Object.keys(patch)) {
          const v = (patch as Record<string, unknown>)[k];
          if (v === undefined) delete target[k];
          else target[k] = v;
        }
      }),
      isDirty: true,
    }));
  },
```

- [ ] **Step 4: Run test to verify GREEN (incl regression of existing 26 store tests)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -10
```

Expected: 27 passed (26 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/editor-store.ts packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts
git commit -m "feat(scada-engine): editorStore.updateWidget key-aware patch (SP-FX-3b.2.2)

Replaces Object.assign(draft.items[id], patch) with explicit
key-by-key loop that deletes a key when its patch value is undefined.
Enables commitRotate(0) to strip the rotate field from store + JSON.
+1 test; SP-FX-3b.1/3b.2.1 callers never pass undefined values so
existing 26 store tests preserved unchanged."
```

---

## Task 2: geometry +applyRotate + 5 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/geometry.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`. Update the top import line:

Find:

```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  type Box, type Point,
} from '../geometry';
```

Replace with:

```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  applyRotate,
  type Box, type Point,
} from '../geometry';
```

(If the actual existing import line differs slightly, preserve all existing names — just add `applyRotate`.)

Append at the END of the file:

```ts
describe('geometry.applyRotate (SP-FX-3b.2.2)', () => {
  const pivot: Point = { x: 100, y: 100 };

  it('mouse stays at startPt: returns startRotate (no delta)', () => {
    const startPt: Point = { x: 150, y: 100 };
    expect(applyRotate(pivot, startPt, startPt, 30, 0)).toBe(30);
  });

  it('90 degree rotation: mouse from +x to +y axis returns +90', () => {
    const startPt: Point = { x: 150, y: 100 }; // angle 0
    const currentPt: Point = { x: 100, y: 150 }; // angle 90 (svg y down → +y axis)
    expect(applyRotate(pivot, startPt, currentPt, 0, 0)).toBe(90);
  });

  it('snap step 15: raw 23 → 30 (round to nearest)', () => {
    const startPt: Point = { x: 150, y: 100 };
    const currentPt: Point = {
      x: 100 + 50 * Math.cos(23 * Math.PI / 180),
      y: 100 + 50 * Math.sin(23 * Math.PI / 180),
    };
    expect(applyRotate(pivot, startPt, currentPt, 0, 15)).toBe(30);
  });

  it('snap step 15: raw 7 → 0 (round to nearest)', () => {
    const startPt: Point = { x: 150, y: 100 };
    const currentPt: Point = {
      x: 100 + 50 * Math.cos(7 * Math.PI / 180),
      y: 100 + 50 * Math.sin(7 * Math.PI / 180),
    };
    expect(applyRotate(pivot, startPt, currentPt, 0, 15)).toBe(0);
  });

  it('normalize: startRotate 350 + delta 30 → 20 (mod 360)', () => {
    const startPt: Point = { x: 150, y: 100 };
    const currentPt: Point = {
      x: 100 + 50 * Math.cos(30 * Math.PI / 180),
      y: 100 + 50 * Math.sin(30 * Math.PI / 180),
    };
    expect(applyRotate(pivot, startPt, currentPt, 350, 0)).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -15
```

Expected: 5 failures (`applyRotate is not a function`).

- [ ] **Step 3: Add applyRotate to geometry.ts**

Open `packages/web-ui/src/scada-engine/editor/geometry.ts`. Append at EOF (after `applyMultiDrag`):

```ts
// SP-FX-3b.2.2: rotation math — atan2-delta around pivot, optional snap to step.

export function applyRotate(
  pivot: Point,
  startPt: Point,
  currentPt: Point,
  startRotate: number,
  snapStep: number,
): number {
  const a0 = Math.atan2(startPt.y - pivot.y, startPt.x - pivot.x);
  const a1 = Math.atan2(currentPt.y - pivot.y, currentPt.x - pivot.x);
  let deg = startRotate + (a1 - a0) * 180 / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  if (snapStep > 0) deg = Math.round(deg / snapStep) * snapStep;
  if (deg === 360) deg = 0;
  return deg;
}
```

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: 29 + 5 = **34 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/geometry.ts packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts
git commit -m "feat(scada-engine): geometry.applyRotate pure fn (SP-FX-3b.2.2)

applyRotate(pivot, startPt, currentPt, startRotate, snapStep) -> deg [0,360).
atan2 vector delta around pivot; mod-360 normalize; optional snap step
(15 for Shift). 360-collapse wraps to 0. 5 tests cover identity, 90°,
snap up, snap down, mod wrap."
```

---

## Task 3: transform-handles +RotateTooltip class + 3 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/transform-handles.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`. Update import:

Find:

```ts
import { TransformHandles, SnapGuides } from '../transform-handles';
```

Replace with:

```ts
import { TransformHandles, SnapGuides, RotateTooltip } from '../transform-handles';
```

Append at the END:

```ts
describe('RotateTooltip (SP-FX-3b.2.2)', () => {
  it('show renders SVG text with degree label at pivot offset', () => {
    const t = new RotateTooltip(canvas.overlayLayer);
    t.show(45.3, { x: 100, y: 50 });
    const group = container.querySelector('[data-overlay="rotate-tooltip"]') as SVGGElement;
    expect(group).not.toBeNull();
    expect(group.getAttribute('visibility')).toBe('visible');
    const text = container.querySelector('[data-rotate-text]') as SVGTextElement;
    expect(text).not.toBeNull();
    expect(text.textContent).toBe('45.3°');
    expect(text.getAttribute('x')).toBe('112');
    expect(text.getAttribute('y')).toBe('46');
  });

  it('hide sets visibility hidden; idempotent', () => {
    const t = new RotateTooltip(canvas.overlayLayer);
    t.show(45, { x: 100, y: 50 });
    t.hide();
    const group = container.querySelector('[data-overlay="rotate-tooltip"]') as SVGGElement;
    expect(group.getAttribute('visibility')).toBe('hidden');
    expect(() => t.hide()).not.toThrow();
  });

  it('destroy removes node from DOM; idempotent', () => {
    const t = new RotateTooltip(canvas.overlayLayer);
    t.show(45, { x: 100, y: 50 });
    t.destroy();
    expect(container.querySelector('[data-overlay="rotate-tooltip"]')).toBeNull();
    expect(() => t.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -15
```

Expected: 3 failures (`RotateTooltip is not a constructor`).

- [ ] **Step 3: Add RotateTooltip class to transform-handles.ts**

Open `packages/web-ui/src/scada-engine/editor/transform-handles.ts`. Update the import line:

Find:

```ts
import type { G, Rect, Line } from '@svgdotjs/svg.js';
```

Replace with:

```ts
import type { G, Rect, Line, Text as SvgText } from '@svgdotjs/svg.js';
```

Append at EOF (after the `SnapGuides` class):

```ts
// SP-FX-3b.2.2: rotate-drag tooltip — SVG <text> overlay near pivot showing current angle.

export class RotateTooltip {
  private group: G;
  private text: SvgText;
  private destroyed = false;

  constructor(overlay: G) {
    this.group = overlay.group().attr('data-overlay', 'rotate-tooltip').attr('visibility', 'hidden');
    this.text = this.group.text('')
      .attr('data-rotate-text', '')
      .attr('fill', '#3b82f6')
      .attr('font-size', 11)
      .attr('font-family', 'monospace')
      .attr('pointer-events', 'none');
  }

  show(deg: number, pivot: { x: number; y: number }): void {
    if (this.destroyed) return;
    this.text.text(`${deg.toFixed(1)}°`);
    this.text.attr('x', pivot.x + 12).attr('y', pivot.y - 4);
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

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -10
```

Expected: 12 + 3 = **15 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/transform-handles.ts packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts
git commit -m "feat(scada-engine): RotateTooltip class (SP-FX-3b.2.2)

SVG <text> overlay drawn near rotate pivot during drag; renders
\${deg.toFixed(1)}° in #3b82f6 monospace. show/hide/destroy lifecycle
matches SnapGuides pattern (idempotent guards via destroyed flag).
3 tests cover render + hide + destroy."
```

---

## Task 4: canvas-svg +applyRotate + upsertWidget rotate + 3 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`. Append at the END:

```ts
describe('CanvasController.applyRotate (SP-FX-3b.2.2)', () => {
  it('applyRotate(id, 45, pivot) sets transform attr on widget node', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1', 50, 50, 120, 80) }));
    c.applyRotate('w1', 45, { x: 110, y: 90 });
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(45 110 90)');
    c.destroy();
  });

  it('applyRotate(id, 0, pivot) removes transform attr', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1', 50, 50, 120, 80) }));
    c.applyRotate('w1', 45, { x: 110, y: 90 });
    c.applyRotate('w1', 0, { x: 110, y: 90 });
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBeNull();
    c.destroy();
  });

  it('upsertWidget renders transform when widget.rotate is non-zero', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    const w = { ...makeWidget('w1', 50, 50, 100, 60), rotate: 30 } as any;
    c.loadView(makeView({ w1: w }));
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    // cx = 50 + 100/2 = 100; cy = 50 + 60/2 = 80
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
    c.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -15
```

Expected: 3 failures (`c.applyRotate is not a function` + upsert test asserting transform attr that isn't set).

- [ ] **Step 3: Patch canvas-svg.ts — add applyRotate method**

Open `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`. Find:

```ts
  getElement(id: string): SvgElement | undefined {
    return this.widgetMap.get(id);
  }
```

Insert AFTER this method (and before `getSvgRoot`):

```ts
  // SP-FX-3b.2.2: live rotate transform applied during drag-rotate FSM.
  applyRotate(id: string, deg: number, pivot: { x: number; y: number }): void {
    if (this.destroyed) return;
    const el = this.widgetMap.get(id);
    if (!el) return;
    if (deg === 0) (el.node as SVGElement).removeAttribute('transform');
    else (el.node as SVGElement).setAttribute('transform', `rotate(${deg} ${pivot.x} ${pivot.y})`);
  }
```

- [ ] **Step 4: Patch upsertWidget to honor widget.rotate**

Find:

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

- [ ] **Step 5: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -10
```

Expected: existing tests + 3 new = all pass.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/canvas-svg.ts packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts
git commit -m "feat(scada-engine): CanvasController.applyRotate + upsertWidget honors rotate (SP-FX-3b.2.2)

applyRotate(id, deg, pivot): live SVG transform during drag-rotate.
deg=0 removes transform attr. upsertWidget reads widget.rotate on
render; sets transform=\"rotate(deg cx cy)\" when non-zero; removes
otherwise (load-view + undo/redo path). 3 tests."
```

---

## Task 5: pointer-tools +drag-rotate state + 3 callbacks + handlers + 8 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`
- Possibly modify: `packages/web-ui/src/test/canvasMock.ts` (add `applyRotate: vi.fn()` if mock used)

- [ ] **Step 1: Inspect canvasMock structure**

```bash
cd /Volumes/SSD/projects/BIOCore
grep -n "applyRotate\|upsertWidget\|makeMockCanvas" packages/web-ui/src/test/canvasMock.ts | head -10
```

If `applyRotate` is NOT in the mock, add it. The mock object is created inside `makeMockCanvas()` — add `applyRotate: vi.fn()` next to existing `upsertWidget: vi.fn()`. Exact line depends on mock layout; preserve all existing entries.

- [ ] **Step 2: Update top-of-file declarations + beforeEach**

Open `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`.

Find:

```ts
let onBoxSelectMove: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

Replace with:

```ts
let onBoxSelectMove: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getCurrentRotate: ReturnType<typeof vi.fn<any[], any>>;
let onRotated: ReturnType<typeof vi.fn>;
let onRotateMove: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

In `beforeEach`, find the tools instantiation block. Find:

```ts
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

Replace with:

```ts
  onBoxSelectMove = vi.fn();
  getCurrentRotate = vi.fn(() => undefined);
  onRotated = vi.fn();
  onRotateMove = vi.fn();
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
    getCurrentRotate: (id) => getCurrentRotate(id) as number | undefined,
    onRotated: (id, rotate) => onRotated(id, rotate),
    onRotateMove: (deg, pivot) => onRotateMove(deg, pivot),
  });
```

- [ ] **Step 3: Append the 8 new tests**

At the END of the file, append:

```ts
describe('PointerTools drag-rotate (SP-FX-3b.2.2)', () => {
  it('mousedown on rotate handle: state=drag-rotate with pivot=center, startRotate=0', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 100, h: 60 } });
    getCurrentRotate.mockReturnValue(undefined);
    tools.handleMouseDown(md(100, 30));
    expect(tools.state.kind).toBe('drag-rotate');
    if (tools.state.kind === 'drag-rotate') {
      expect(tools.state.widgetId).toBe('w1');
      expect(tools.state.pivot).toEqual({ x: 100, y: 80 });
      expect(tools.state.startRotate).toBe(0);
    }
  });

  it('drag-rotate mousemove free: fires canvas.applyRotate + onRotateMove with computed deg', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 100, h: 60 } });
    getCurrentRotate.mockReturnValue(0);
    tools.handleMouseDown(md(150, 80));  // startPt at angle 0 from pivot (100,80)
    tools.handleMouseMove(mm(100, 130));  // currentPt at angle 90 from pivot
    expect(canvas.applyRotate).toHaveBeenCalled();
    const lastApply = canvas.applyRotate.mock.calls[canvas.applyRotate.mock.calls.length - 1];
    expect(lastApply[1]).toBeCloseTo(90, 0);  // deg
    expect(lastApply[2]).toEqual({ x: 100, y: 80 });
    expect(onRotateMove).toHaveBeenCalled();
  });

  it('drag-rotate mousemove with Shift: snaps to 15 step', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 100, h: 60 } });
    getCurrentRotate.mockReturnValue(0);
    tools.handleMouseDown(md(150, 80));
    const shiftMove = new MouseEvent('mousemove', {
      clientX: 100 + 50 * Math.cos(23 * Math.PI / 180),
      clientY: 80 + 50 * Math.sin(23 * Math.PI / 180),
      shiftKey: true,
      bubbles: true,
    });
    tools.handleMouseMove(shiftMove);
    const lastApply = canvas.applyRotate.mock.calls[canvas.applyRotate.mock.calls.length - 1];
    expect(lastApply[1]).toBe(30);
  });

  it('drag-rotate mouseup commits via onRotated; state idle; onRotateMove(null,null)', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 100, h: 60 } });
    getCurrentRotate.mockReturnValue(0);
    tools.handleMouseDown(md(150, 80));
    tools.handleMouseUp(mu(100, 130));
    expect(onRotated).toHaveBeenCalled();
    const [id, deg] = onRotated.mock.calls[0];
    expect(id).toBe('w1');
    expect(deg).toBeCloseTo(90, 0);
    expect(tools.state.kind).toBe('idle');
    expect(onRotateMove).toHaveBeenLastCalledWith(null, null);
  });

  it('drag-rotate mouseup with deg===startRotate: no onRotated fire (short-circuit)', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 100, h: 60 } });
    getCurrentRotate.mockReturnValue(45);
    tools.handleMouseDown(md(150, 80));
    tools.handleMouseUp(mu(150, 80));  // same pt → deg=45=startRotate
    expect(onRotated).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });

  it('cancel() in drag-rotate: canvas.applyRotate(startRotate); tooltip hide; idle; no onRotated', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 100, h: 60 } });
    getCurrentRotate.mockReturnValue(30);
    tools.handleMouseDown(md(150, 80));
    tools.handleMouseMove(mm(100, 130));
    canvas.applyRotate.mockClear();
    tools.cancel();
    expect(canvas.applyRotate).toHaveBeenCalledWith('w1', 30, { x: 100, y: 80 });
    expect(onRotated).not.toHaveBeenCalled();
    expect(onRotateMove).toHaveBeenLastCalledWith(null, null);
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown on rotate handle but no widget hit: stays idle (defensive)', () => {
    handles.hitTest.mockReturnValue('rotate');
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(100, 30));
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-rotate state preserves startBox unchanged', () => {
    handles.hitTest.mockReturnValue('rotate');
    const box = { x: 50, y: 50, w: 100, h: 60 };
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    getCurrentRotate.mockReturnValue(15);
    tools.handleMouseDown(md(100, 30));
    if (tools.state.kind === 'drag-rotate') {
      expect(tools.state.startBox).toEqual(box);
      expect(tools.state.startRotate).toBe(15);
    }
  });
});
```

- [ ] **Step 4: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -20
```

Expected: 8 failures (drag-rotate state doesn't exist; new cb not in interface).

If TypeScript reports missing callbacks in instantiation, that's expected RED. Once impl is added the type errors clear.

- [ ] **Step 5: Patch pointer-tools.ts — PointerState union**

Open `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`. Find:

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean };
```

Replace with:

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean }
  | { kind: 'drag-rotate'; widgetId: string; startPt: Point; pivot: Point; startBox: Box; startRotate: number };
```

- [ ] **Step 6: Patch PointerToolsCallbacks interface**

Find:

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
  getCurrentRotate: (id: string) => number | undefined;
  onRotated: (id: string, rotate: number) => void;
  onRotateMove: (deg: number | null, pivot: Point | null) => void;
}
```

- [ ] **Step 7: Update geometry import to include applyRotate**

Find:

```ts
import { clientToSvg, applyHandleDrag, snap, computeBbox, intersectsBox, type HandleId, type Box, type Point } from './geometry';
```

Replace with:

```ts
import { clientToSvg, applyHandleDrag, snap, computeBbox, intersectsBox, applyRotate, type HandleId, type Box, type Point } from './geometry';
```

- [ ] **Step 8: Patch handleMouseDown — route rotate handle separately**

Find:

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
```

Replace with:

```ts
  handleMouseDown(e: MouseEvent): void {
    if (this.destroyed) return;
    const pt = this.clientPt(e);

    const handle = this.handles.hitTest(pt);
    if (handle) {
      const widgetHit = this.cb.getWidgetAt(pt);
      if (!widgetHit) return;
      if (handle === 'rotate') {
        const pivot: Point = { x: widgetHit.box.x + widgetHit.box.w / 2, y: widgetHit.box.y + widgetHit.box.h / 2 };
        const startRotate = this.cb.getCurrentRotate(widgetHit.id) ?? 0;
        this.state = { kind: 'drag-rotate', widgetId: widgetHit.id, startPt: pt, pivot, startBox: widgetHit.box, startRotate };
      } else {
        this.state = { kind: 'drag-handle', widgetId: widgetHit.id, handle, startPt: pt, startBox: widgetHit.box };
      }
      return;
    }
```

- [ ] **Step 9: Patch handleMouseMove — add drag-rotate branch first**

Find:

```ts
  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'box-select') {
```

Replace with:

```ts
  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'drag-rotate') {
      const snapStep = e.shiftKey ? 15 : 0;
      const deg = applyRotate(this.state.pivot, this.state.startPt, pt, this.state.startRotate, snapStep);
      this.canvas.applyRotate(this.state.widgetId, deg, this.state.pivot);
      this.cb.onRotateMove(deg, this.state.pivot);
      return;
    }

    if (this.state.kind === 'box-select') {
```

- [ ] **Step 10: Patch handleMouseUp — add drag-rotate branch first**

Find:

```ts
  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'box-select') {
```

Replace with:

```ts
  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);

    if (this.state.kind === 'drag-rotate') {
      const snapStep = e.shiftKey ? 15 : 0;
      const deg = applyRotate(this.state.pivot, this.state.startPt, pt, this.state.startRotate, snapStep);
      if (deg !== this.state.startRotate) this.cb.onRotated(this.state.widgetId, deg);
      this.state = { kind: 'idle' };
      this.cb.onRotateMove(null, null);
      return;
    }

    if (this.state.kind === 'box-select') {
```

- [ ] **Step 11: Patch cancel() — add drag-rotate branch BEFORE drag-body branch**

Find the existing `cancel()` method. Locate this block:

```ts
    if (this.state.kind === 'drag-body') {
      const dragState = this.state;
```

Just BEFORE that line, insert:

```ts
    if (this.state.kind === 'drag-rotate') {
      this.canvas.applyRotate(this.state.widgetId, this.state.startRotate, this.state.pivot);
      this.state = { kind: 'idle' };
      this.cb.onRotateMove(null, null);
      return;
    }

```

- [ ] **Step 12: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -10
```

Expected: 25 + 8 = **33 passed**.

If a test fails because `canvas.applyRotate` is undefined on the mock, add it to canvasMock.ts per Step 1.

- [ ] **Step 13: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/pointer-tools.ts packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts packages/web-ui/src/test/canvasMock.ts
git commit -m "feat(scada-engine): PointerTools drag-rotate state + 3 callbacks (SP-FX-3b.2.2)

PointerState union +drag-rotate{widgetId, startPt, pivot, startBox,
startRotate}. PointerToolsCallbacks +3 (getCurrentRotate/onRotated/
onRotateMove). handleMouseDown rotate handle branches to drag-rotate
(else falls through to drag-handle). handleMouseMove computes angle
via applyRotate (Shift→15° snap from e.shiftKey), live canvas.applyRotate
+ onRotateMove. handleMouseUp commits via onRotated when deg!==startRotate.
cancel() restores via canvas.applyRotate(startRotate). 8 new tests; 25
existing tests preserved unchanged."
```

---

## Task 6: EditorCanvas wire 3 new cb + rotateTooltip ref + 6 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append at the END of `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
describe('EditorCanvas rotate (SP-FX-3b.2.2)', () => {
  function makeViewWithItems(items: Record<string, FuxaWidget>): FuxaView {
    return {
      id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600,
      items,
      schemaVersion: 1,
    } as FuxaView;
  }

  function fireKey(key: string) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  it('rotateTooltip mounted in overlay layer with visibility hidden', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60 } as any,
      }));
    });
    const tooltip = container.querySelector('[data-overlay="rotate-tooltip"]') as SVGGElement;
    expect(tooltip).not.toBeNull();
    expect(tooltip.getAttribute('visibility')).toBe('hidden');
  });

  it('view loaded with widget.rotate=30 renders transform attr on widget node', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 30 } as any,
      }));
    });
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
  });

  it('updateWidget rotate=undefined strips rotate from store (commitRotate(0) path)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 45 } as any,
      }));
    });
    act(() => { useEditorStore.getState().updateWidget('w1', { rotate: undefined } as any); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect('rotate' in w).toBe(false);
  });

  it('TransformHandles position stays at unrotated AABB even when widget.rotate is set', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 90 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('transform') ?? '').not.toContain('rotate');
  });

  it('selection useEffect with rotated widget: selectionRect at unrotated geom', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 45 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const selRect = container.querySelector('[data-overlay="transform"] rect:not([data-handle]):not([data-bbox-corner])') as SVGRectElement;
    expect(selRect).not.toBeNull();
    expect(selRect.getAttribute('x')).toBe('50');
    expect(selRect.getAttribute('y')).toBe('50');
  });

  it('ESC during idle with rotated widget selected does not change widget.rotate', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60, rotate: 45 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => { fireKey('Escape'); });
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.rotate).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -15
```

Expected: at least 1 failure (rotateTooltip not mounted). Other tests may pass already if T1/T4 are landed.

- [ ] **Step 3: Patch EditorCanvas.tsx — imports**

Open `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`. Find:

```tsx
import { TransformHandles, SnapGuides } from './transform-handles';
```

Replace with:

```tsx
import { TransformHandles, SnapGuides, RotateTooltip } from './transform-handles';
```

- [ ] **Step 4: Patch Refs interface**

Find:

```tsx
interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
  snapGuides: SnapGuides;
  rubberBand: SVGRectElement;
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
  rotateTooltip: RotateTooltip;
}
```

- [ ] **Step 5: Patch lifecycle useEffect — instantiate RotateTooltip + add 3 new cb + teardown**

Find:

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
```

Replace with:

```tsx
    const snapGuides = new SnapGuides(canvas.overlayLayer);
    const rotateTooltip = new RotateTooltip(canvas.overlayLayer);
    const rubberBand = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rubberBand.setAttribute('data-overlay', 'rubber-band');
    rubberBand.setAttribute('visibility', 'hidden');
    rubberBand.setAttribute('fill', 'rgba(59,130,246,0.1)');
    rubberBand.setAttribute('stroke', '#3b82f6');
    rubberBand.setAttribute('stroke-dasharray', '4 2');
    rubberBand.setAttribute('pointer-events', 'none');
    (canvas.overlayLayer.node as SVGGElement).appendChild(rubberBand);
```

Find the closing of the PointerTools ctor (`onBoxSelectMove: (rect) => { ... },` block immediately followed by `});`):

```tsx
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

Replace with:

```tsx
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
      getCurrentRotate: (id) => {
        const view = useEditorStore.getState().currentView;
        return (view?.items[id] as { rotate?: number } | undefined)?.rotate;
      },
      onRotated: (id, deg) => {
        const store = useEditorStore.getState();
        if (deg === 0) store.updateWidget(id, { rotate: undefined } as Partial<FuxaWidget>);
        else store.updateWidget(id, { rotate: deg } as Partial<FuxaWidget>);
      },
      onRotateMove: (deg, pivot) => {
        if (!refs.current) return;
        if (deg === null || pivot === null) refs.current.rotateTooltip.hide();
        else refs.current.rotateTooltip.show(deg, pivot);
      },
    });
```

Find:

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

Replace with:

```tsx
    refs.current = { canvas, handles, pointer, snapGuides, rubberBand, rotateTooltip };
    canvas.loadView(currentView);
    const store0 = useEditorStore.getState();
    canvas.setGridVisible(store0.snapEnabled, store0.gridSize);
    return () => {
      pointer.destroy();
      snapGuides.destroy();
      rotateTooltip.destroy();
      canvas.destroy();
      refs.current = null;
    };
```

- [ ] **Step 6: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -10
```

Expected: 23 + 6 = **29 passed**.

- [ ] **Step 7: tsc full pass**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): EditorCanvas wires rotate cb + RotateTooltip ref (SP-FX-3b.2.2)

PointerTools cb now 14 (3 new: getCurrentRotate / onRotated /
onRotateMove). onRotated commits via updateWidget — rotate=0 maps to
{ rotate: undefined } which (per T1) strips the key from store.
rotateTooltip instantiated alongside SnapGuides; destroyed on
teardown. 6 new tests; 23 existing tests preserved."
```

---

## Task 7: editor barrel exports

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`

- [ ] **Step 1: Update barrel exports**

Open `packages/web-ui/src/scada-engine/editor/index.ts`. Find:

```ts
export { TransformHandles, SnapGuides } from './transform-handles';
```

Replace with:

```ts
export { TransformHandles, SnapGuides, RotateTooltip } from './transform-handles';
```

Find:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  type Box, type Point, type HandleId,
} from './geometry';
```

Replace with:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  applyRotate,
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
git commit -m "feat(scada-engine): export RotateTooltip + applyRotate (SP-FX-3b.2.2)"
```

---

## Task 8: Playwright 2 smoke

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-canvas-3b2-2.spec.ts`

- [ ] **Step 1: Write the smoke spec**

Create `packages/web-ui/e2e/scada-editor-canvas-3b2-2.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

test.describe('SP-FX-3b.2.2 — single-widget rotate handle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    await page.waitForTimeout(200);
  });

  test('Rotate handle drag 90°: store rotate ≈ 90, widget node has transform', async ({ page }) => {
    // Select w1 first (fixture: x=50, y=50, w=120, h=80 → pivot=(110, 90))
    await page.locator('[data-widget-id="w1"]').click();
    await page.waitForTimeout(300);

    const rotateHandle = await page.locator('[data-handle="rotate"]').boundingBox();
    if (!rotateHandle) throw new Error('rotate handle bbox unavailable');

    const canvasSvgBbox = await page.evaluate((): { x: number; y: number } | null => {
      const el = document.querySelector<SVGSVGElement>('[data-layer="widgets"]')?.closest('svg');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y };
    });
    if (!canvasSvgBbox) throw new Error('canvas svg bbox unavailable');
    const startX = rotateHandle.x + rotateHandle.width / 2;
    const startY = rotateHandle.y + rotateHandle.height / 2;
    const pivotX = canvasSvgBbox.x + 110;
    const pivotY = canvasSvgBbox.y + 90;
    // Rotate 90° clockwise: from (pivot.x, pivot.y - r) → (pivot.x + r, pivot.y)
    const r = Math.hypot(startX - pivotX, startY - pivotY);
    const endX = pivotX + r;
    const endY = pivotY;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.rotate).toBeGreaterThan(60);
    expect(view.items.w1.rotate).toBeLessThan(120);
    const transform = await page.locator('[data-widget-id="w1"]').getAttribute('transform');
    expect(transform).toContain('rotate(');
  });

  test('ESC mid-rotate restores: rotate undefined, no transform attr', async ({ page }) => {
    await page.locator('[data-widget-id="w1"]').click();
    await page.waitForTimeout(300);
    const rotateHandle = await page.locator('[data-handle="rotate"]').boundingBox();
    if (!rotateHandle) throw new Error('rotate handle bbox unavailable');
    const startX = rotateHandle.x + rotateHandle.width / 2;
    const startY = rotateHandle.y + rotateHandle.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 50, startY + 50, { steps: 5 });  // partial drag
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.rotate).toBeUndefined();
    const transform = await page.locator('[data-widget-id="w1"]').getAttribute('transform');
    expect(transform).toBeNull();
  });
});
```

- [ ] **Step 2: Run Playwright**

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
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/dev/scada-editor-canvas
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas-3b2-2.spec.ts 2>&1 | tail -30
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 2 passed.

If a test fails with rotate-handle bbox unavailable, increase `waitForTimeout` after click to 500 (handle render lag).

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-editor-canvas-3b2-2.spec.ts
git commit -m "test(scada-engine): Playwright single-widget rotate smoke (SP-FX-3b.2.2)

2 smoke tests: rotate handle 90° drag commits store.rotate≈90 with
transform applied; ESC mid-rotate restores (rotate undefined, no
transform attr)."
```

---

## Task 9: Regression + §8 stop-check + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | grep -E "Test Files|Tests" | tail -3
```

Expected: 583 + 4 + 1 + 5 + 3 + 3 + 8 + 6 = **613 passed**.

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

- [ ] **Step 4: Playwright regression (17 total)**

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
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas.spec.ts e2e/scada-editor-canvas-3b1.spec.ts e2e/scada-editor-canvas-3b2-1.spec.ts e2e/scada-editor-canvas-3b2-2.spec.ts 2>&1 | tail -10
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 3 + 7 + 5 + 2 = **17 passed**.

- [ ] **Step 5: §8 stop-condition self-check**

Verify each (per spec §8):
1. Rotate handle drag rotates single widget free angle → pointer-tools T5 + Playwright T8.
2. Shift held during rotate snaps 15° → pointer-tools T5 snap test + geometry T2 snap tests.
3. `rotate === 0` commit omits key → editor-store T1 + EditorCanvas T6 strip test.
4. ESC mid-rotate restores `startRotate` → pointer-tools T5 cancel test + Playwright T8 ESC test.
5. Saved view with `rotate: 45` reloads with `transform="rotate(45 cx cy)"` → canvas-svg T4 upsertWidget test + EditorCanvas T6 load test.
6. Rotated widget drag-body changes x/y only → SP-FX-3b.2.1 drag-body preserved (regression of 33 pointer-tools tests).
7. Rotated widget resize via 8 handles changes w/h only → SP-FX-3a/3b.1 drag-handle preserved.
8. RotateTooltip shows during drag, hides on commit/cancel → transform-handles T3 + pointer-tools T5 onRotateMove asserts + EditorCanvas T6 mount test.
9. TransformHandles overlay stays at unrotated AABB → EditorCanvas T6 AABB test.
10. web-ui 613/613 + server 147 + data-service 84 + tsc clean + Playwright 17/17 → steps 1–4.

If any fails → STOP, surface, no push.

- [ ] **Step 6: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds.

---

## Self-Review

**Spec coverage (§1.1 in-scope items):**
1. Schema `rotate?: number` — T0 ✓
2. Rotate handle becomes active — T5 (handleMouseDown rotate branch) ✓
3. Free + Shift→15° snap — T2 (applyRotate) + T5 (handleMouseMove reads e.shiftKey) ✓
4. FSM drag-rotate state + ESC cancel — T5 ✓
5. Visual SVG transform + RotateTooltip — T3 + T4 + T6 ✓
6. drag-body / drag-handle preserved — implicit (no changes to those paths), verified by regression of 33 pointer-tools tests ✓
7. ESC Tier 1 cancel — T5 cancel() ✓

**Spec §3.2 (editor-store key-aware patch):** T1 ✓
**Spec §4.7 (CanvasController.applyRotate + upsertWidget rotate):** T4 ✓
**Spec §4.8 (RotateTooltip):** T3 ✓
**Spec §4.9 (EditorCanvas integration):** T6 ✓
**Spec §5 test counts:** target 583 → 613 matches +30 sum ✓
**Spec §8 stop conditions:** mapped in T9 step 5 ✓

**Placeholder scan:** none (all code blocks complete, all commands explicit, no TBD/TODO).

**Type consistency:**
- `applyRotate(pivot: Point, startPt: Point, currentPt: Point, startRotate: number, snapStep: number): number` — defined T2, used T5 with matching signature ✓
- `RotateTooltip.show(deg: number, pivot: { x: number; y: number })` — defined T3, called T6 ✓
- `PointerToolsCallbacks` 3 new fields — defined T5, instantiated T6 ✓
- `widgetMap` (not `widgetNodes`) — T4 uses correct field name from canvas-svg.ts:24 ✓
- `CanvasController.applyRotate(id: string, deg: number, pivot: {x,y})` — defined T4, called from pointer-tools T5 ✓

No gaps found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-3b-2-2-rotate-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review (spec compliance + code quality), same-session continuous execution.

**2. Inline Execution** — batch tasks in this session via executing-plans with checkpoints for review.
