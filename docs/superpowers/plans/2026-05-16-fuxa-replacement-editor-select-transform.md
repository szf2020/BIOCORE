# FUXA Replacement — Sub-project 4/8: Editor Select/Transform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a parallel SVG-native editor at `components/scada/svg-editor/` (and route `/scada2/edit/[viewId]`) that lets users click-select widgets, drag handles to resize, drag rotation handle to rotate, drag body to move, with multi-select (shift-click / Ctrl-click / rubber band) and snapshot-based undo/redo. Output writes back to the same `SvgViewJson` schema the SP1-3 viewer consumes.

**Architecture:** Pure SVG handles + Pointer Events API. Zustand store for editor state with snapshot-based history. Pure-function transform math (`transform-math.ts`) independently testable. Animations preserved in JSON but NOT rendered in edit mode (static geometry); optional preview toggle.

**Tech Stack:** React 18 · TypeScript · zustand 4.x · vitest 1.6 + @testing-library/react 14 + jsdom · Next.js 14 App Router.

**Spec:** [/docs/superpowers/specs/2026-05-16-fuxa-replacement-editor-select-transform-design.md](../specs/2026-05-16-fuxa-replacement-editor-select-transform-design.md)

**Branch:** feat/scada-data-model

**Total tests:** ~45 (12 transform-math + 15 store + 5 SelectableWidget + 5 SelectionOverlay + 3 SvgEditorCanvas/rubberband + 5 keyboard)

**Test runner:** `pnpm` at `/Users/mac/.hermes/node/bin/pnpm`. Export `PATH="/Users/mac/.hermes/node/bin:$PATH"` if needed.

**API endpoints (verified):**
- `GET /api/scada/views/:viewId` → `{ is_svg, items, updated_at, ...meta }` (items = SvgViewJson when is_svg=1)
- `PUT /api/scada/views/:viewId` (admin/engineer only), body `{ items, expected_updated_at? }`

---

## File Structure (locked)

**New files (all under `packages/web-ui/src/components/scada/svg-editor/`):**
- `types.ts` — `HandleId`, `AABB`, `ResizeModifiers`, `RotateModifiers`, `SelectMode`, `EditorGesture`
- `transform-math.ts` — `resizeRect`, `rotateAroundCenter`, `snapToGrid`, `intersects`, `svgPoint`
- `useEditorStore.ts` — zustand store with all actions
- `SelectableWidget.tsx` — wraps SvgWidgetInstance with click-to-select; renders without animations
- `SelectionOverlay.tsx` — 8 resize handles + rotation handle + outline rect per selected widget
- `RubberBand.tsx` — drag-selection rectangle
- `SvgEditorCanvas.tsx` — root SVG, manages rubber-band gesture
- `useKeyboardShortcuts.ts` — hook binding global keyboard shortcuts

**New test files (6 under `packages/web-ui/src/components/scada/svg-editor/__tests__/`):**
- `transform-math.test.ts` — 12 tests
- `useEditorStore.test.ts` — 15 tests
- `SelectableWidget.test.tsx` — 5 tests
- `SelectionOverlay.test.tsx` — 5 tests
- `SvgEditorCanvas.rubberband.test.tsx` — 3 tests
- `useKeyboardShortcuts.test.ts` — 5 tests

**New route file:**
- `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx` — Next.js editor page

**Modified files:** none (existing viewer at `/scada2/[viewId]` and legacy editor at `/scada` unchanged).

---

## Task 1: Editor types

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// packages/web-ui/src/components/scada/svg-editor/types.ts
import type { SvgWidgetItem } from '@/widgets/svg/types';

export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type HandleId = ResizeHandleId | 'rotation';

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResizeModifiers {
  aspect: boolean;
  centered: boolean;
}

export interface RotateModifiers {
  snap15: boolean;
}

export type SelectMode = 'replace' | 'toggle' | 'add';

export type GestureType = 'move' | 'resize' | 'rotate' | 'rubberband';

export interface EditorGesture {
  type: GestureType;
  handle?: ResizeHandleId;
  startPoint: { x: number; y: number };
  startBboxes: Record<string, AABB>;
  startRotations: Record<string, number>;
  rubberRect?: AABB;
}

export type WidgetItemMap = Record<string, SvgWidgetItem>;
```

- [ ] **Step 2: Type-check passes**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```

Expected: no NEW errors mentioning `svg-editor/`.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/types.ts
git commit -m "feat(scada-edit): editor types (HandleId, AABB, ResizeModifiers, EditorGesture, SelectMode)"
```

---

## Task 2: `transform-math.ts` — pure transform functions

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/transform-math.ts`
- Create: `packages/web-ui/src/components/scada/svg-editor/__tests__/transform-math.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/components/scada/svg-editor/__tests__/transform-math.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  resizeRect,
  rotateAroundCenter,
  snapToGrid,
  intersects,
} from '../transform-math';
import type { AABB } from '../types';

const bbox100: AABB = { x: 10, y: 20, w: 100, h: 80 };

describe('resizeRect', () => {
  it('se handle: nw corner stays fixed, w/h grow by dx/dy', () => {
    const r = resizeRect(bbox100, 'se', 30, 20, { aspect: false, centered: false });
    expect(r).toEqual({ x: 10, y: 20, w: 130, h: 100 });
  });

  it('nw handle: se corner stays fixed, x/y shift, w/h shrink by dx/dy', () => {
    const r = resizeRect(bbox100, 'nw', 10, 5, { aspect: false, centered: false });
    expect(r).toEqual({ x: 20, y: 25, w: 90, h: 75 });
  });

  it('n edge: x and width fixed, y shifts, h shrinks', () => {
    const r = resizeRect(bbox100, 'n', 0, 10, { aspect: false, centered: false });
    expect(r).toEqual({ x: 10, y: 30, w: 100, h: 70 });
  });

  it('e edge: only width grows', () => {
    const r = resizeRect(bbox100, 'e', 25, 999, { aspect: false, centered: false });
    expect(r).toEqual({ x: 10, y: 20, w: 125, h: 80 });
  });

  it('aspect lock: locks w/h ratio (dx dominant)', () => {
    // bbox 100x80 → ratio 1.25. drag se by (40, 10) → dx dominant → w=140, h=140/1.25=112
    const r = resizeRect(bbox100, 'se', 40, 10, { aspect: true, centered: false });
    expect(r.w).toBe(140);
    expect(r.h).toBeCloseTo(112);
  });

  it('centered: keeps center fixed (se handle)', () => {
    // se drag by (20, 20) centered → both sides grow by 20 each axis
    const r = resizeRect(bbox100, 'se', 20, 20, { aspect: false, centered: true });
    expect(r).toEqual({ x: -10, y: 0, w: 140, h: 120 });
  });

  it('clamps to minimum 1x1', () => {
    const r = resizeRect(bbox100, 'se', -200, -200, { aspect: false, centered: false });
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });

  it('handles drag-through flip (negative width)', () => {
    // se drag by (-150, -100) → would-be w = -50, flip → x=x+newW, w=|newW|
    const r = resizeRect(bbox100, 'se', -150, -100, { aspect: false, centered: false });
    // After flip, bbox is to the LEFT of original x
    expect(r.x).toBeLessThan(10);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe('rotateAroundCenter', () => {
  it('returns currentRotation + delta from atan2 difference', () => {
    // center = (60, 60). start at (60, 0) above center → angle = -π/2 = -90°
    // current at (120, 60) right of center → angle = 0°
    // delta = 0 - (-90) = +90°
    const r = rotateAroundCenter(
      { x: 10, y: 10, w: 100, h: 100 },
      0,
      { x: 60, y: 0 },
      { x: 120, y: 60 },
      { snap15: false },
    );
    expect(r).toBeCloseTo(90, 1);
  });

  it('snap15: rounds to nearest 15°', () => {
    const r = rotateAroundCenter(
      { x: 0, y: 0, w: 100, h: 100 },
      0,
      { x: 50, y: 0 },
      { x: 87, y: -7 },
      { snap15: true },
    );
    expect(r % 15).toBe(0);
  });
});

describe('snapToGrid', () => {
  it('snaps to nearest multiple of gridSize', () => {
    expect(snapToGrid(13, 10)).toBe(10);
    expect(snapToGrid(16, 10)).toBe(20);
    expect(snapToGrid(20, 10)).toBe(20);
  });
});

describe('intersects', () => {
  it('returns true for overlapping AABBs and false otherwise', () => {
    const a: AABB = { x: 0, y: 0, w: 50, h: 50 };
    const b: AABB = { x: 25, y: 25, w: 50, h: 50 };
    const c: AABB = { x: 100, y: 100, w: 10, h: 10 };
    expect(intersects(a, b)).toBe(true);
    expect(intersects(a, c)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec vitest run src/components/scada/svg-editor/__tests__/transform-math.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../transform-math'".

- [ ] **Step 3: Implement `transform-math.ts`**

Create `packages/web-ui/src/components/scada/svg-editor/transform-math.ts`:

```typescript
// packages/web-ui/src/components/scada/svg-editor/transform-math.ts
import type { AABB, ResizeHandleId, ResizeModifiers, RotateModifiers } from './types';

const MIN_DIM = 1;

/**
 * Resize an AABB by dragging a handle by (dx, dy). Anchor is the opposite handle.
 *
 * Modifiers:
 *   - aspect: lock w/h ratio (dominant axis drives the other)
 *   - centered: keep center fixed (both opposing sides move)
 *
 * Output bbox is normalized: drag-through is handled by flipping w/h to positive
 * and shifting x/y accordingly. Minimum dimensions enforced.
 */
export function resizeRect(
  bbox: AABB,
  handle: ResizeHandleId,
  dx: number,
  dy: number,
  modifiers: ResizeModifiers,
): AABB {
  let x = bbox.x;
  let y = bbox.y;
  let w = bbox.w;
  let h = bbox.h;

  const moveLeft = handle === 'nw' || handle === 'w' || handle === 'sw';
  const moveRight = handle === 'ne' || handle === 'e' || handle === 'se';
  const moveTop = handle === 'nw' || handle === 'n' || handle === 'ne';
  const moveBottom = handle === 'sw' || handle === 's' || handle === 'se';

  if (moveLeft) {
    x = bbox.x + dx;
    w = bbox.w - dx;
  } else if (moveRight) {
    w = bbox.w + dx;
  }
  if (moveTop) {
    y = bbox.y + dy;
    h = bbox.h - dy;
  } else if (moveBottom) {
    h = bbox.h + dy;
  }

  if (modifiers.centered) {
    if (moveLeft) {
      w = bbox.w - 2 * dx;
    } else if (moveRight) {
      x = bbox.x - dx;
      w = bbox.w + 2 * dx;
    }
    if (moveTop) {
      h = bbox.h - 2 * dy;
    } else if (moveBottom) {
      y = bbox.y - dy;
      h = bbox.h + 2 * dy;
    }
  }

  if (modifiers.aspect && bbox.w !== 0 && bbox.h !== 0) {
    const origRatio = bbox.w / bbox.h;
    const dwAbs = Math.abs(w - bbox.w);
    const dhAbs = Math.abs(h - bbox.h);
    if (dwAbs >= dhAbs) {
      const newH = w / origRatio;
      const deltaH = newH - h;
      if (moveTop) {
        y -= deltaH;
      } else if (!moveBottom && !moveTop) {
        y -= deltaH / 2;
      }
      h = newH;
    } else {
      const newW = h * origRatio;
      const deltaW = newW - w;
      if (moveLeft) {
        x -= deltaW;
      } else if (!moveLeft && !moveRight) {
        x -= deltaW / 2;
      }
      w = newW;
    }
  }

  if (w < 0) {
    x = x + w;
    w = -w;
  }
  if (h < 0) {
    y = y + h;
    h = -h;
  }

  if (w < MIN_DIM) w = MIN_DIM;
  if (h < MIN_DIM) h = MIN_DIM;

  return { x, y, w, h };
}

export function rotateAroundCenter(
  bbox: AABB,
  currentRotation: number,
  pointerStart: { x: number; y: number },
  pointerCurrent: { x: number; y: number },
  modifiers: RotateModifiers,
): number {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const startAngle = Math.atan2(pointerStart.y - cy, pointerStart.x - cx);
  const curAngle = Math.atan2(pointerCurrent.y - cy, pointerCurrent.x - cx);
  const deltaDeg = ((curAngle - startAngle) * 180) / Math.PI;
  let result = currentRotation + deltaDeg;
  result = ((result % 360) + 360) % 360;
  if (modifiers.snap15) {
    result = Math.round(result / 15) * 15;
    if (result === 360) result = 0;
  }
  return result;
}

export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function intersects(a: AABB, b: AABB): boolean {
  return !(
    b.x + b.w < a.x ||
    a.x + a.w < b.x ||
    b.y + b.h < a.y ||
    a.y + a.h < b.y
  );
}

/**
 * Convert client coords to SVG user-space using inverse CTM. Falls back to
 * raw client coords when getScreenCTM() is unavailable (e.g. in jsdom).
 */
export function svgPoint(
  svgEl: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/transform-math.test.ts 2>&1 | tail -10
```

Expected: `12 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/transform-math.ts \
        packages/web-ui/src/components/scada/svg-editor/__tests__/transform-math.test.ts
git commit -m "feat(scada-edit): transform-math (resize/rotate/snap/intersect/svgPoint) + 12 tests"
```

---

## Task 3: `useEditorStore.ts` — zustand store

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts`
- Create: `packages/web-ui/src/components/scada/svg-editor/__tests__/useEditorStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/components/scada/svg-editor/__tests__/useEditorStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, createEmptyView } from '../useEditorStore';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string, x = 0, y = 0, w = 50, h = 50): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests(createEmptyView());
});

describe('useEditorStore', () => {
  describe('selection', () => {
    it('select replace overwrites prior selection', () => {
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().select(['b'], 'replace');
      expect([...useEditorStore.getState().selectedIds]).toEqual(['b']);
    });

    it('select toggle flips membership', () => {
      useEditorStore.getState().select(['a'], 'toggle');
      useEditorStore.getState().select(['a'], 'toggle');
      expect(useEditorStore.getState().selectedIds.size).toBe(0);
    });

    it('select add appends to existing selection', () => {
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().select(['b'], 'add');
      expect([...useEditorStore.getState().selectedIds].sort()).toEqual(['a', 'b']);
    });

    it('selectAll selects every widget in view', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a'), mkItem('b'), mkItem('c')] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().selectAll();
      expect(useEditorStore.getState().selectedIds.size).toBe(3);
    });

    it('clearSelection empties selection', () => {
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().clearSelection();
      expect(useEditorStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('CRUD', () => {
    it('addWidget appends to view.items', () => {
      useEditorStore.getState().addWidget(mkItem('a', 10, 20));
      expect(useEditorStore.getState().view.items).toHaveLength(1);
      expect(useEditorStore.getState().view.items[0].id).toBe('a');
    });

    it('deleteSelected removes selected and clears selection', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a'), mkItem('b')] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().deleteSelected();
      expect(useEditorStore.getState().view.items.map(i => i.id)).toEqual(['b']);
      expect(useEditorStore.getState().selectedIds.size).toBe(0);
    });

    it('setWidget patches a single item', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 0, 0, 50, 50)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setWidget('a', { x: 100, y: 200 });
      const it = useEditorStore.getState().view.items.find(i => i.id === 'a')!;
      expect(it.x).toBe(100);
      expect(it.y).toBe(200);
    });
  });

  describe('gesture + move/resize/rotate', () => {
    it('applyMove translates all selected by (dx, dy)', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 20), mkItem('b', 50, 60)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a', 'b'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 20, w: 50, h: 50 }, b: { x: 50, y: 60, w: 50, h: 50 } },
        startRotations: { a: 0, b: 0 },
      });
      useEditorStore.getState().applyMove(5, 7);
      const items = useEditorStore.getState().view.items;
      expect(items.find(i => i.id === 'a')!.x).toBe(15);
      expect(items.find(i => i.id === 'a')!.y).toBe(27);
      expect(items.find(i => i.id === 'b')!.x).toBe(55);
      expect(items.find(i => i.id === 'b')!.y).toBe(67);
    });

    it('applyResize resizes single selected via SE handle', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 20, 100, 80)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'resize',
        handle: 'se',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 20, w: 100, h: 80 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyResize('se', 20, 10, { aspect: false, centered: false });
      const it = useEditorStore.getState().view.items[0];
      expect(it.w).toBe(120);
      expect(it.h).toBe(90);
    });

    it('applyRotate writes new rotation to selected', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [{ ...mkItem('a', 0, 0, 100, 100), rotation: 0 }] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'rotate',
        startPoint: { x: 50, y: 0 },
        startBboxes: { a: { x: 0, y: 0, w: 100, h: 100 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyRotate({ x: 100, y: 50 }, { snap15: false });
      const it = useEditorStore.getState().view.items[0];
      expect(it.rotation).toBeCloseTo(90, 0);
    });
  });

  describe('undo/redo', () => {
    it('undo restores previous snapshot; redo reapplies', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 10)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 10, w: 50, h: 50 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyMove(20, 30);
      useEditorStore.getState().endGesture();
      expect(useEditorStore.getState().view.items[0].x).toBe(30);
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().view.items[0].x).toBe(10);
      useEditorStore.getState().redo();
      expect(useEditorStore.getState().view.items[0].x).toBe(30);
    });

    it('history caps at 50 entries (oldest dropped)', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 0, 0)] };
      useEditorStore.getState().__resetForTests(view);
      for (let i = 0; i < 60; i++) {
        useEditorStore.getState().setWidget('a', { x: i + 1 });
      }
      expect(useEditorStore.getState().history.length).toBe(50);
    });

    it('mutation after undo clears the future stack', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setWidget('a', { x: 10 });
      useEditorStore.getState().setWidget('a', { x: 20 });
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().future.length).toBe(1);
      useEditorStore.getState().setWidget('a', { x: 99 });
      expect(useEditorStore.getState().future.length).toBe(0);
    });
  });

  describe('grid snap on commit', () => {
    it('endGesture snaps x/y to gridSize when gridSnap enabled', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 10)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setGridSnap(true);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 10, w: 50, h: 50 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyMove(13, 17);
      useEditorStore.getState().endGesture();
      const it = useEditorStore.getState().view.items[0];
      expect(it.x).toBe(20);
      expect(it.y).toBe(30);
    });
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/useEditorStore.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../useEditorStore'".

- [ ] **Step 3: Implement `useEditorStore.ts`**

Create `packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts`:

```typescript
// packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts
import { create } from 'zustand';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';
import type {
  EditorGesture,
  ResizeHandleId,
  ResizeModifiers,
  RotateModifiers,
  SelectMode,
} from './types';
import { resizeRect, rotateAroundCenter, snapToGrid } from './transform-math';

const HISTORY_CAP = 50;
const DEFAULT_GRID_SIZE = 10;

export function createEmptyView(): SvgViewJson {
  return { width: 800, height: 600, items: [] };
}

export interface EditorStore {
  view: SvgViewJson;
  selectedIds: Set<string>;
  history: SvgViewJson[];
  future: SvgViewJson[];
  gridSnap: boolean;
  gridSize: number;
  previewAnimations: boolean;
  gesture: EditorGesture | null;

  select(ids: string[], mode: SelectMode): void;
  selectAll(): void;
  clearSelection(): void;

  beginGesture(g: EditorGesture): void;
  endGesture(): void;

  applyMove(dx: number, dy: number): void;
  applyResize(handle: ResizeHandleId, dx: number, dy: number, mods: ResizeModifiers): void;
  applyRotate(pointerCurrent: { x: number; y: number }, mods: RotateModifiers): void;

  addWidget(item: SvgWidgetItem): void;
  deleteSelected(): void;
  setWidget(id: string, patch: Partial<SvgWidgetItem>): void;

  undo(): void;
  redo(): void;

  setGridSnap(enabled: boolean): void;
  setPreviewAnimations(enabled: boolean): void;

  __resetForTests(view: SvgViewJson): void;
}

function cloneView(v: SvgViewJson): SvgViewJson {
  return JSON.parse(JSON.stringify(v));
}

function pushHistory(history: SvgViewJson[], snapshot: SvgViewJson): SvgViewJson[] {
  const next = [...history, snapshot];
  if (next.length > HISTORY_CAP) next.shift();
  return next;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  view: createEmptyView(),
  selectedIds: new Set(),
  history: [],
  future: [],
  gridSnap: false,
  gridSize: DEFAULT_GRID_SIZE,
  previewAnimations: false,
  gesture: null,

  select(ids, mode) {
    set((state) => {
      if (mode === 'replace') {
        return { selectedIds: new Set(ids) };
      }
      const next = new Set(state.selectedIds);
      for (const id of ids) {
        if (mode === 'toggle') {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        } else {
          next.add(id);
        }
      }
      return { selectedIds: next };
    });
  },

  selectAll() {
    set((state) => ({ selectedIds: new Set(state.view.items.map((i) => i.id)) }));
  },

  clearSelection() {
    set({ selectedIds: new Set() });
  },

  beginGesture(g) {
    const state = get();
    if (g.type !== 'rubberband') {
      set({
        history: pushHistory(state.history, cloneView(state.view)),
        future: [],
        gesture: g,
      });
    } else {
      set({ gesture: g });
    }
  },

  endGesture() {
    const state = get();
    if (!state.gesture) return;
    if (state.gridSnap && state.gesture.type !== 'rubberband') {
      const items = state.view.items.map((it) => {
        if (!state.selectedIds.has(it.id)) return it;
        return { ...it, x: snapToGrid(it.x, state.gridSize), y: snapToGrid(it.y, state.gridSize) };
      });
      set({ view: { ...state.view, items }, gesture: null });
    } else {
      set({ gesture: null });
    }
  },

  applyMove(dx, dy) {
    const state = get();
    if (!state.gesture) return;
    const items = state.view.items.map((it) => {
      const start = state.gesture!.startBboxes[it.id];
      if (!start) return it;
      return { ...it, x: start.x + dx, y: start.y + dy };
    });
    set({ view: { ...state.view, items } });
  },

  applyResize(handle, dx, dy, mods) {
    const state = get();
    if (!state.gesture) return;
    const items = state.view.items.map((it) => {
      const start = state.gesture!.startBboxes[it.id];
      if (!start) return it;
      const next = resizeRect(start, handle, dx, dy, mods);
      return { ...it, x: next.x, y: next.y, w: next.w, h: next.h };
    });
    set({ view: { ...state.view, items } });
  },

  applyRotate(pointerCurrent, mods) {
    const state = get();
    if (!state.gesture) return;
    const items = state.view.items.map((it) => {
      const start = state.gesture!.startBboxes[it.id];
      if (!start) return it;
      const startRot = state.gesture!.startRotations[it.id] ?? 0;
      const newRot = rotateAroundCenter(start, startRot, state.gesture!.startPoint, pointerCurrent, mods);
      return { ...it, rotation: newRot };
    });
    set({ view: { ...state.view, items } });
  },

  addWidget(item) {
    set((state) => ({
      history: pushHistory(state.history, cloneView(state.view)),
      future: [],
      view: { ...state.view, items: [...state.view.items, item] },
    }));
  },

  deleteSelected() {
    set((state) => {
      const items = state.view.items.filter((it) => !state.selectedIds.has(it.id));
      return {
        history: pushHistory(state.history, cloneView(state.view)),
        future: [],
        view: { ...state.view, items },
        selectedIds: new Set(),
      };
    });
  },

  setWidget(id, patch) {
    set((state) => {
      const items = state.view.items.map((it) => (it.id === id ? { ...it, ...patch } : it));
      return {
        history: pushHistory(state.history, cloneView(state.view)),
        future: [],
        view: { ...state.view, items },
      };
    });
  },

  undo() {
    set((state) => {
      if (state.history.length === 0) return state;
      const last = state.history[state.history.length - 1];
      return {
        history: state.history.slice(0, -1),
        future: [...state.future, cloneView(state.view)],
        view: last,
      };
    });
  },

  redo() {
    set((state) => {
      if (state.future.length === 0) return state;
      const next = state.future[state.future.length - 1];
      return {
        future: state.future.slice(0, -1),
        history: pushHistory(state.history, cloneView(state.view)),
        view: next,
      };
    });
  },

  setGridSnap(enabled) {
    set({ gridSnap: enabled });
  },

  setPreviewAnimations(enabled) {
    set({ previewAnimations: enabled });
  },

  __resetForTests(view) {
    set({
      view: cloneView(view),
      selectedIds: new Set(),
      history: [],
      future: [],
      gridSnap: false,
      gridSize: DEFAULT_GRID_SIZE,
      previewAnimations: false,
      gesture: null,
    });
  },
}));
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/useEditorStore.test.ts 2>&1 | tail -15
```

Expected: `15 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts \
        packages/web-ui/src/components/scada/svg-editor/__tests__/useEditorStore.test.ts
git commit -m "feat(scada-edit): useEditorStore (zustand: selection/CRUD/gesture/undo-redo) + 15 tests"
```

---

## Task 4: `SelectableWidget.tsx`

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx`
- Create: `packages/web-ui/src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SelectableWidget } from '../SelectableWidget';
import { useEditorStore, createEmptyView } from '../useEditorStore';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgWidgetItem } from '@/widgets/svg/types';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
  useEditorStore.getState().__resetForTests(createEmptyView());
});

const baseItem: SvgWidgetItem = {
  id: 'w1',
  type: 'svg-rect',
  x: 10,
  y: 20,
  w: 100,
  h: 50,
};

describe('SelectableWidget', () => {
  it('pointer-down with no modifiers replaces selection', () => {
    const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    fireEvent.pointerDown(wrap, { pointerId: 1, shiftKey: false, ctrlKey: false, metaKey: false });
    expect([...useEditorStore.getState().selectedIds]).toEqual(['w1']);
  });

  it('shift+pointer-down toggles selection', () => {
    useEditorStore.getState().select(['w1'], 'replace');
    const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    fireEvent.pointerDown(wrap, { pointerId: 1, shiftKey: true });
    expect(useEditorStore.getState().selectedIds.has('w1')).toBe(false);
  });

  it('ctrl+pointer-down adds to selection', () => {
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    fireEvent.pointerDown(wrap, { pointerId: 1, ctrlKey: true });
    expect([...useEditorStore.getState().selectedIds].sort()).toEqual(['a', 'w1']);
  });

  it('does not allow animation fillColor override when previewAnimations=false', () => {
    const item: SvgWidgetItem = {
      ...baseItem,
      animations: [{
        type: 'color',
        tag: 'F01.AI-0',
        rule: { kind: 'discreteMap', map: { '1': '#abc' }, default: '#fff' },
        configKey: 'fillColor',
      }],
    };
    const { container } = renderInSvg(<SelectableWidget instance={item} reactorId="F01" />);
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('fill')).not.toBe('#abc');
  });

  it('pointer-down stops propagation to parent', () => {
    const onCanvasDown = vi.fn();
    const { container } = render(
      <svg onPointerDown={onCanvasDown}>
        <SelectableWidget instance={baseItem} reactorId="F01" />
      </svg>,
    );
    const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
    fireEvent.pointerDown(wrap, { pointerId: 1 });
    expect(onCanvasDown).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx 2>&1 | tail -15
```

Expected: FAIL "Cannot find module '../SelectableWidget'".

- [ ] **Step 3: Implement `SelectableWidget.tsx`**

Create `packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx`:

```tsx
// packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx
'use client';
import React from 'react';
import { SvgWidgetInstance } from '@/components/scada/SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { useEditorStore } from './useEditorStore';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

export function SelectableWidget({ instance, reactorId }: Props) {
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore((s) => s.selectedIds.has(instance.id));
  const previewAnimations = useEditorStore((s) => s.previewAnimations);

  const renderItem: SvgWidgetItem = previewAnimations
    ? instance
    : { ...instance, animations: undefined };

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const mode = e.shiftKey ? 'toggle' : e.ctrlKey || e.metaKey ? 'add' : 'replace';
    select([instance.id], mode);
  };

  return (
    <g
      data-widget-id={instance.id}
      onPointerDown={handlePointerDown}
      style={{ cursor: 'pointer' }}
    >
      <SvgWidgetInstance instance={renderItem} reactorId={reactorId} />
      {isSelected && (
        <rect
          x={instance.x}
          y={instance.y}
          width={instance.w}
          height={instance.h}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1}
          strokeDasharray="3,3"
          pointerEvents="none"
          data-testid={`selection-outline-${instance.id}`}
        />
      )}
    </g>
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx \
        packages/web-ui/src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx
git commit -m "feat(scada-edit): SelectableWidget (click-select; no animations in edit) + 5 tests"
```

---

## Task 5: `SelectionOverlay.tsx`

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/SelectionOverlay.tsx`
- Create: `packages/web-ui/src/components/scada/svg-editor/__tests__/SelectionOverlay.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/components/scada/svg-editor/__tests__/SelectionOverlay.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SelectionOverlay } from '../SelectionOverlay';
import { useEditorStore, createEmptyView } from '../useEditorStore';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string, x = 10, y = 20, w = 100, h = 80): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests(createEmptyView());
});

describe('SelectionOverlay', () => {
  it('renders 8 resize handles + 1 rotation handle when one widget is selected', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    expect(container.querySelectorAll('[data-handle]').length).toBe(9);
  });

  it('renders nothing when no widget is selected', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
    useEditorStore.getState().__resetForTests(view);
    const { container } = renderInSvg(<SelectionOverlay />);
    expect(container.querySelectorAll('[data-handle]').length).toBe(0);
  });

  it('rotation handle is positioned above top-center of bbox', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 20, 100, 80)] };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    const rot = container.querySelector('[data-handle="rotation"]');
    expect(rot).not.toBeNull();
    const cx = Number(rot?.getAttribute('cx'));
    const cy = Number(rot?.getAttribute('cy'));
    expect(cx).toBeCloseTo(60, 0);
    expect(cy).toBeLessThan(20);
  });

  it('resize handle pointer-down initiates a resize gesture in the store', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    const seHandle = container.querySelector('[data-handle="se"]') as SVGElement;
    fireEvent.pointerDown(seHandle, { pointerId: 1, clientX: 100, clientY: 100 });
    const gesture = useEditorStore.getState().gesture;
    expect(gesture?.type).toBe('resize');
    expect(gesture?.handle).toBe('se');
  });

  it('multi-select shows a single bbox spanning all selected widgets', () => {
    const view: SvgViewJson = {
      width: 800,
      height: 600,
      items: [mkItem('a', 0, 0, 50, 50), mkItem('b', 100, 100, 50, 50)],
    };
    useEditorStore.getState().__resetForTests(view);
    useEditorStore.getState().select(['a', 'b'], 'replace');
    const { container } = renderInSvg(<SelectionOverlay />);
    const outline = container.querySelector('[data-testid="multi-bbox"]');
    expect(outline).not.toBeNull();
    expect(outline?.getAttribute('x')).toBe('0');
    expect(outline?.getAttribute('y')).toBe('0');
    expect(outline?.getAttribute('width')).toBe('150');
    expect(outline?.getAttribute('height')).toBe('150');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/SelectionOverlay.test.tsx 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../SelectionOverlay'".

- [ ] **Step 3: Implement `SelectionOverlay.tsx`**

Create `packages/web-ui/src/components/scada/svg-editor/SelectionOverlay.tsx`:

```tsx
// packages/web-ui/src/components/scada/svg-editor/SelectionOverlay.tsx
'use client';
import React from 'react';
import { useEditorStore } from './useEditorStore';
import type { AABB, ResizeHandleId } from './types';
import { svgPoint } from './transform-math';
import type { SvgWidgetItem } from '@/widgets/svg/types';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;
const ROTATION_OFFSET = 24;

const RESIZE_HANDLES: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function unionBbox(items: SvgWidgetItem[]): AABB | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function handleCenter(bbox: AABB, handle: ResizeHandleId): { cx: number; cy: number } {
  const cxMid = bbox.x + bbox.w / 2;
  const cyMid = bbox.y + bbox.h / 2;
  const left = bbox.x;
  const right = bbox.x + bbox.w;
  const top = bbox.y;
  const bottom = bbox.y + bbox.h;
  switch (handle) {
    case 'nw': return { cx: left, cy: top };
    case 'n':  return { cx: cxMid, cy: top };
    case 'ne': return { cx: right, cy: top };
    case 'e':  return { cx: right, cy: cyMid };
    case 'se': return { cx: right, cy: bottom };
    case 's':  return { cx: cxMid, cy: bottom };
    case 'sw': return { cx: left, cy: bottom };
    case 'w':  return { cx: left, cy: cyMid };
  }
}

export function SelectionOverlay() {
  const items = useEditorStore((s) => s.view.items);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const beginGesture = useEditorStore((s) => s.beginGesture);

  const selectedItems = items.filter((it) => selectedIds.has(it.id));
  if (selectedItems.length === 0) return null;

  const bbox = unionBbox(selectedItems);
  if (!bbox) return null;

  const startBboxes: Record<string, AABB> = {};
  const startRotations: Record<string, number> = {};
  for (const it of selectedItems) {
    startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
    startRotations[it.id] = it.rotation ?? 0;
  }

  const onHandlePointerDown = (
    e: React.PointerEvent<SVGElement>,
    handle: ResizeHandleId | 'rotation',
  ) => {
    e.stopPropagation();
    const target = e.currentTarget as Element;
    try {
      (target as Element & { setPointerCapture?: (id: number) => void })
        .setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom no-op
    }
    const svgEl = target.closest('svg') as SVGSVGElement | null;
    const start = svgEl
      ? svgPoint(svgEl, e.clientX, e.clientY)
      : { x: e.clientX, y: e.clientY };
    beginGesture({
      type: handle === 'rotation' ? 'rotate' : 'resize',
      handle: handle === 'rotation' ? undefined : handle,
      startPoint: start,
      startBboxes,
      startRotations,
    });
  };

  const cxMid = bbox.x + bbox.w / 2;

  return (
    <g data-testid="selection-overlay">
      <rect
        data-testid="multi-bbox"
        x={bbox.x}
        y={bbox.y}
        width={bbox.w}
        height={bbox.h}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1}
        pointerEvents="none"
      />
      <line
        x1={cxMid}
        y1={bbox.y}
        x2={cxMid}
        y2={bbox.y - ROTATION_OFFSET}
        stroke="#3b82f6"
        strokeWidth={1}
        pointerEvents="none"
      />
      {RESIZE_HANDLES.map((h) => {
        const c = handleCenter(bbox, h);
        return (
          <rect
            key={h}
            data-handle={h}
            x={c.cx - HANDLE_HALF}
            y={c.cy - HANDLE_HALF}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#fff"
            stroke="#3b82f6"
            strokeWidth={1}
            style={{ cursor: `${h}-resize` }}
            onPointerDown={(e) => onHandlePointerDown(e, h)}
          />
        );
      })}
      <circle
        data-handle="rotation"
        cx={cxMid}
        cy={bbox.y - ROTATION_OFFSET}
        r={HANDLE_HALF}
        fill="#fff"
        stroke="#3b82f6"
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => onHandlePointerDown(e, 'rotation')}
      />
    </g>
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/SelectionOverlay.test.tsx 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/SelectionOverlay.tsx \
        packages/web-ui/src/components/scada/svg-editor/__tests__/SelectionOverlay.test.tsx
git commit -m "feat(scada-edit): SelectionOverlay (8 handles + rotation; gesture init) + 5 tests"
```

---

## Task 6: `RubberBand.tsx` + `SvgEditorCanvas.tsx`

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/RubberBand.tsx`
- Create: `packages/web-ui/src/components/scada/svg-editor/SvgEditorCanvas.tsx`
- Create: `packages/web-ui/src/components/scada/svg-editor/__tests__/SvgEditorCanvas.rubberband.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/components/scada/svg-editor/__tests__/SvgEditorCanvas.rubberband.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SvgEditorCanvas } from '../SvgEditorCanvas';
import { useEditorStore } from '../useEditorStore';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string, x = 0, y = 0, w = 50, h = 50): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
});

describe('SvgEditorCanvas — rubber-band selection', () => {
  it('pointer-down on empty area starts rubber band', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 100, 100)] };
    useEditorStore.getState().__resetForTests(view);
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(useEditorStore.getState().gesture?.type).toBe('rubberband');
  });

  it('pointer-move during rubber band updates the rectangle', () => {
    const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 100, 100)] };
    useEditorStore.getState().__resetForTests(view);
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 20 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 70, clientY: 80 });
    const rect = useEditorStore.getState().gesture?.rubberRect;
    expect(rect).toBeDefined();
    expect(rect!.w).toBeGreaterThan(0);
    expect(rect!.h).toBeGreaterThan(0);
  });

  it('pointer-up selects widgets intersecting the rubber band', () => {
    const view: SvgViewJson = {
      width: 800,
      height: 600,
      items: [mkItem('inside', 50, 50, 40, 40), mkItem('outside', 300, 300, 40, 40)],
    };
    useEditorStore.getState().__resetForTests(view);
    const { container } = render(<SvgEditorCanvas reactorId="F01" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 100, clientY: 100 });
    const sel = useEditorStore.getState().selectedIds;
    expect(sel.has('inside')).toBe(true);
    expect(sel.has('outside')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/SvgEditorCanvas.rubberband.test.tsx 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../SvgEditorCanvas'".

- [ ] **Step 3: Implement `RubberBand.tsx`**

Create `packages/web-ui/src/components/scada/svg-editor/RubberBand.tsx`:

```tsx
// packages/web-ui/src/components/scada/svg-editor/RubberBand.tsx
'use client';
import React from 'react';
import { useEditorStore } from './useEditorStore';

export function RubberBand() {
  const gesture = useEditorStore((s) => s.gesture);
  if (!gesture || gesture.type !== 'rubberband' || !gesture.rubberRect) return null;
  const r = gesture.rubberRect;
  return (
    <rect
      data-testid="rubber-band"
      x={r.x}
      y={r.y}
      width={r.w}
      height={r.h}
      fill="rgba(59, 130, 246, 0.1)"
      stroke="#3b82f6"
      strokeWidth={1}
      strokeDasharray="3,3"
      pointerEvents="none"
    />
  );
}
```

- [ ] **Step 4: Implement `SvgEditorCanvas.tsx`**

Create `packages/web-ui/src/components/scada/svg-editor/SvgEditorCanvas.tsx`:

```tsx
// packages/web-ui/src/components/scada/svg-editor/SvgEditorCanvas.tsx
'use client';
import React, { useRef } from 'react';
import { useEditorStore } from './useEditorStore';
import { SelectableWidget } from './SelectableWidget';
import { SelectionOverlay } from './SelectionOverlay';
import { RubberBand } from './RubberBand';
import { svgPoint, intersects } from './transform-math';
import type { AABB } from './types';

interface Props {
  reactorId: string;
}

export function SvgEditorCanvas({ reactorId }: Props) {
  const view = useEditorStore((s) => s.view);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const endGesture = useEditorStore((s) => s.endGesture);
  const select = useEditorStore((s) => s.select);
  const items = view.items;
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    const start = svgRef.current
      ? svgPoint(svgRef.current, e.clientX, e.clientY)
      : { x: e.clientX, y: e.clientY };
    beginGesture({
      type: 'rubberband',
      startPoint: start,
      startBboxes: {},
      startRotations: {},
      rubberRect: { x: start.x, y: start.y, w: 0, h: 0 },
    });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = useEditorStore.getState().gesture;
    if (!g || g.type !== 'rubberband') return;
    const cur = svgRef.current
      ? svgPoint(svgRef.current, e.clientX, e.clientY)
      : { x: e.clientX, y: e.clientY };
    const rect: AABB = {
      x: Math.min(g.startPoint.x, cur.x),
      y: Math.min(g.startPoint.y, cur.y),
      w: Math.abs(cur.x - g.startPoint.x),
      h: Math.abs(cur.y - g.startPoint.y),
    };
    useEditorStore.setState({ gesture: { ...g, rubberRect: rect } });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = useEditorStore.getState().gesture;
    if (!g || g.type !== 'rubberband' || !g.rubberRect) {
      endGesture();
      return;
    }
    const hits = items
      .filter((it) => intersects(g.rubberRect!, { x: it.x, y: it.y, w: it.w, h: it.h }))
      .map((it) => it.id);
    select(hits, e.shiftKey ? 'add' : 'replace');
    endGesture();
  };

  return (
    <svg
      ref={svgRef}
      width={view.width}
      height={view.height}
      viewBox={`0 0 ${view.width} ${view.height}`}
      style={{ background: view.background ?? '#fff', userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      data-testid="svg-editor-canvas"
    >
      <g data-testid="widgets-layer">
        {items.map((it) => (
          <SelectableWidget key={it.id} instance={it} reactorId={reactorId} />
        ))}
      </g>
      <SelectionOverlay />
      <RubberBand />
    </svg>
  );
}
```

- [ ] **Step 5: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/SvgEditorCanvas.rubberband.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/RubberBand.tsx \
        packages/web-ui/src/components/scada/svg-editor/SvgEditorCanvas.tsx \
        packages/web-ui/src/components/scada/svg-editor/__tests__/SvgEditorCanvas.rubberband.test.tsx
git commit -m "feat(scada-edit): SvgEditorCanvas + RubberBand (rubber-band select) + 3 tests"
```

---

## Task 7: `useKeyboardShortcuts.ts`

**Files:**
- Create: `packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts`
- Create: `packages/web-ui/src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { useEditorStore } from '../useEditorStore';
import type { SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string): SvgWidgetItem {
  return { id, type: 'svg-rect', x: 0, y: 0, w: 50, h: 50 };
}

function dispatchKey(opts: KeyboardEventInit & { key: string }) {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
  window.dispatchEvent(ev);
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests({ width: 800, height: 600, items: [mkItem('a'), mkItem('b')] });
});

describe('useKeyboardShortcuts', () => {
  it('Ctrl+A selects all', () => {
    renderHook(() => useKeyboardShortcuts());
    dispatchKey({ key: 'a', ctrlKey: true });
    expect(useEditorStore.getState().selectedIds.size).toBe(2);
  });

  it('Escape clears selection', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    dispatchKey({ key: 'Escape' });
    expect(useEditorStore.getState().selectedIds.size).toBe(0);
  });

  it('Delete removes selected widgets', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    dispatchKey({ key: 'Delete' });
    expect(useEditorStore.getState().view.items.map(i => i.id)).toEqual(['b']);
  });

  it('Ctrl+Z undoes last commit', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    useEditorStore.getState().deleteSelected();
    dispatchKey({ key: 'z', ctrlKey: true });
    expect(useEditorStore.getState().view.items.length).toBe(2);
  });

  it('Ctrl+Shift+Z redoes', () => {
    renderHook(() => useKeyboardShortcuts());
    useEditorStore.getState().select(['a'], 'replace');
    useEditorStore.getState().deleteSelected();
    useEditorStore.getState().undo();
    dispatchKey({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(useEditorStore.getState().view.items.map(i => i.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts 2>&1 | tail -10
```

Expected: FAIL "Cannot find module '../useKeyboardShortcuts'".

- [ ] **Step 3: Implement `useKeyboardShortcuts.ts`**

Create `packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts`:

```typescript
// packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts
'use client';
import { useEffect } from 'react';
import { useEditorStore } from './useEditorStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const store = useEditorStore.getState();
      const meta = e.ctrlKey || e.metaKey;

      if (meta && (e.key === 'a' || e.key === 'A') && !e.shiftKey) {
        e.preventDefault();
        store.selectAll();
        return;
      }
      if (meta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (meta && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        store.undo();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        store.clearSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts \
        packages/web-ui/src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts
git commit -m "feat(scada-edit): useKeyboardShortcuts (Ctrl+A/Esc/Delete/Ctrl+Z/Ctrl+Shift+Z) + 5 tests"
```

---

## Task 8: Editor Next.js route page

**Files:**
- Create: `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx`

- [ ] **Step 1: Create the editor page**

Create `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx`:

```tsx
// packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgEditorCanvas } from '@/components/scada/svg-editor/SvgEditorCanvas';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { useKeyboardShortcuts } from '@/components/scada/svg-editor/useKeyboardShortcuts';
import type { SvgViewJson } from '@/widgets/svg/types';

ensureBuiltinSvgWidgetsRegistered();

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'ready'; updatedAt: string };

export default function Page() {
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const reactorId = search?.get('reactor') ?? 'F01';
  const viewId = params?.viewId ?? '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const setView = useEditorStore((s) => s.__resetForTests);
  const view = useEditorStore((s) => s.view);
  useKeyboardShortcuts();

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/scada/views/${encodeURIComponent(viewId)}`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) { window.location.assign('/login'); return; }
      if (r.status === 404) { setState({ kind: 'error', status: 404, message: '画面不存在' }); return; }
      if (!r.ok) { setState({ kind: 'error', status: r.status, message: '服务器错误' }); return; }
      const body = (await r.json()) as { is_svg?: number; items?: unknown; updated_at?: string };
      if (body.is_svg !== 1) {
        setState({ kind: 'error', status: 400, message: '此画面不是 SVG 格式,不能在此编辑器编辑' });
        return;
      }
      setView(body.items as SvgViewJson);
      setState({ kind: 'ready', updatedAt: body.updated_at ?? '' });
    } catch {
      setState({ kind: 'error', status: 0, message: '无法加载画面' });
    }
  }, [viewId, setView]);

  useEffect(() => { void load(); }, [load]);

  const onSave = useCallback(async () => {
    if (state.kind !== 'ready') return;
    setSaving(true);
    try {
      const r = await fetch(`/api/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: view,
          expected_updated_at: state.updatedAt || null,
        }),
      });
      if (r.status === 409) {
        alert('画面已被他人修改,请刷新后重试');
        await load();
        return;
      }
      if (!r.ok) {
        alert('保存失败');
        return;
      }
      const body = (await r.json()) as { updated_at: string };
      setState({ kind: 'ready', updatedAt: body.updated_at });
    } finally {
      setSaving(false);
    }
  }, [state, viewId, view, load]);

  if (state.kind === 'loading') return <div style={{ padding: 16 }}>加载中…</div>;
  if (state.kind === 'error') return <div style={{ padding: 16, color: '#dc2626' }}>错误 ({state.status}): {state.message}</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
        <button onClick={() => useEditorStore.getState().undo()}>撤销</button>
        <button onClick={() => useEditorStore.getState().redo()}>重做</button>
        <button onClick={() => useEditorStore.getState().setGridSnap(!useEditorStore.getState().gridSnap)}>
          网格吸附
        </button>
      </div>
      <SvgEditorCanvas reactorId={reactorId} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check passes**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `app/scada2/edit/`.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx
git commit -m "feat(scada-edit): /scada2/edit/[viewId] route — fetch + edit + save (PUT /api/scada/views)"
```

---

## Task 9: Full regression check + manual smoke + push

**Files:** none modified.

- [ ] **Step 1: Run the full web-ui test suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -25
```

Expected: all green. Sub-projects 1-3 contribute ~246 tests; SP4 adds ~45 new tests. Total ~291. Report actual counts.

If any test FAILS, STOP and report — do not proceed.

- [ ] **Step 2: Type-check passes**

```bash
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `svg-editor/` or `app/scada2/edit/`.

- [ ] **Step 3: Manual smoke (best-effort, only if both dev servers running)**

```bash
lsof -i :3000 -sTCP:LISTEN -n -P 2>&1 | head -2
lsof -i :3001 -sTCP:LISTEN -n -P 2>&1 | head -2
```

If both running, navigate to `http://localhost:3000/scada2/edit/<existing-svg-view-id>` in a browser (or `curl -I` it) and verify:
- The page returns 200
- The canvas renders any existing items
- (manual) click → selection outline appears
- (manual) drag handle → resize works
- (manual) Save button → server returns 200

If servers NOT running, SKIP and report.

- [ ] **Step 4: Push branch + FF-merge to main**

```bash
cd /Volumes/SSD/BIOCORE
git push origin feat/scada-data-model 2>&1 | tail -5
git checkout main
git fetch origin main 2>&1 | tail -3
git merge --ff-only feat/scada-data-model 2>&1 | tail -3
git push origin main 2>&1 | tail -3
git checkout feat/scada-data-model
```

If FF fails (origin/main diverged), STOP and report — do not force-push.

---

## Done criteria

- ~45 new tests, all green; existing ~246 tests still green
- `pnpm exec tsc --noEmit` clean for new files
- Editor route `/scada2/edit/[viewId]` renders, fetches SVG view, supports click-select / drag-resize / rotate / multi-select / undo-redo
- Save endpoint round-trips (`PUT /api/scada/views/:viewId` with `items` + `expected_updated_at`)
- View JSON saved by editor renders identically in viewer at `/scada2/[viewId]`
- 9 commits pushed to `feat/scada-data-model` and FF-merged to `main`
- Branch ready for sub-project 5 (pages/templates)
