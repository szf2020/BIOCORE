# SP4.5 Editor body-drag + arrow-key nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add body-drag move + arrow-key nudge + ESC-cancel-drag to the SVG editor so users can rebuild ~13 dropped FUXA views in `/scada2/edit/new` by hand.

**Architecture:** Self-contained widget drag — `SelectableWidget` owns its own pointer-down/move/up handlers via `setPointerCapture`. New `cancelGesture()` store action restores `startBboxes` + pops history. `useKeyboardShortcuts` gains Arrow\* and ESC-during-drag branches.

**Tech Stack:** Next.js 14 + React 18 + TypeScript, zustand 4, vitest 1.6 + @testing-library/react + jsdom, SVG-native + Pointer Events API.

**Spec:** `docs/superpowers/specs/2026-05-16-editor-body-drag-arrow-key-design.md` (commit `943cba5`).

**Branch:** `feat/scada-data-model` (parent commit `627850e` after SP7.5 pre-soak; spec adds `943cba5`).

**Constants:**
- `DRAG_THRESHOLD = 3` (px, L1 norm: `|dx| + |dy|`)
- `ARROW_STEP = 1`
- `ARROW_SHIFT_STEP = 10`

---

## Task 1: `cancelGesture` store action

**Files:**
- Modify: `packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts`
- Test: `packages/web-ui/src/components/scada/svg-editor/__tests__/useEditorStore.test.ts`

Model: sonnet (touches store; must understand history/gesture interaction).

- [ ] **Step 1: Write the failing test**

Append to `packages/web-ui/src/components/scada/svg-editor/__tests__/useEditorStore.test.ts` inside the existing top-level `describe('useEditorStore', () => { ... })` block (before its closing brace), as a new nested `describe`:

```ts
  describe('cancelGesture', () => {
    it('reverts in-progress move and pops the history entry pushed by beginGesture', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [mkItem('a', 10, 20, 50, 50), mkItem('b', 100, 100, 50, 50)],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');

      const startBboxes = {
        a: { x: 10, y: 20, w: 50, h: 50 },
      };
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes,
        startRotations: {},
      });
      // beginGesture pushed one history snapshot
      expect(useEditorStore.getState().history).toHaveLength(1);

      useEditorStore.getState().applyMove(40, 60);
      // widget moved
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 50, y: 80 });

      useEditorStore.getState().cancelGesture();

      const s = useEditorStore.getState();
      expect(s.gesture).toBeNull();
      expect(s.view.items[0]).toMatchObject({ x: 10, y: 20, w: 50, h: 50 });
      expect(s.history).toHaveLength(0); // popped
    });

    it('is a no-op when no gesture is active', () => {
      useEditorStore.getState().cancelGesture();
      expect(useEditorStore.getState().gesture).toBeNull();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/useEditorStore.test.ts -t cancelGesture
```

Expected: FAIL with "cancelGesture is not a function" (or a TypeScript error if `tsc` is checking).

- [ ] **Step 3: Add the interface signature**

Edit `packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts`. In the `EditorStore` interface (`export interface EditorStore { ... }`), insert immediately after the existing `endGesture(): void;` line:

```ts
  cancelGesture(): void;
```

- [ ] **Step 4: Add the implementation**

Edit `packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts`. Immediately after the `endGesture() { ... }` implementation block (and before `applyMove(dx, dy) { ... }`), insert:

```ts
  cancelGesture() {
    const state = get();
    if (!state.gesture) return;
    if (state.gesture.type === 'rubberband') {
      set({ gesture: null });
      return;
    }
    const startBboxes = state.gesture.startBboxes;
    const startRotations = state.gesture.startRotations;
    const items = state.view.items.map((it) => {
      const start = startBboxes[it.id];
      if (!start) return it;
      const startRot = startRotations[it.id];
      return {
        ...it,
        x: start.x,
        y: start.y,
        w: start.w,
        h: start.h,
        rotation: startRot ?? it.rotation,
      };
    });
    const history = state.history.slice(0, -1); // pop the snapshot pushed by beginGesture
    set({ view: { ...state.view, items }, gesture: null, history });
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/useEditorStore.test.ts -t cancelGesture
```

Expected: PASS (both new cases).

- [ ] **Step 6: Run the full store test file to confirm no regression**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/useEditorStore.test.ts
```

Expected: All existing useEditorStore tests still PASS plus the 2 new ones.

- [ ] **Step 7: Type-check**

Run:

```bash
cd packages/web-ui && npx tsc --noEmit
```

Expected: no errors related to `useEditorStore.ts`.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/useEditorStore.ts \
        packages/web-ui/src/components/scada/svg-editor/__tests__/useEditorStore.test.ts
git commit -m "feat(scada-editor): add cancelGesture() store action

Reverts in-progress move/resize/rotate to startBboxes/startRotations and
pops the history snapshot pushed by beginGesture. No-op for rubberband
(no history pushed) and when no gesture is active.

SP4.5 T1 — prerequisite for ESC-during-drag."
```

---

## Task 2: `SelectableWidget` body-drag handlers

**Files:**
- Modify: `packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx`
- Test: `packages/web-ui/src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx`

Model: sonnet (pointer capture + threshold state machine + multi-select dispatch).

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx` and:

1. **Add a generalized pointer-event helper.** Replace the existing `firePointerDown` function with:

```ts
function firePointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  options: {
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    clientX?: number;
    clientY?: number;
  } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
  }) as any;
  event.pointerId = 1;
  act(() => {
    element.dispatchEvent(event);
  });
}

function firePointerDown(
  element: Element,
  options: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; clientX?: number; clientY?: number } = {},
) {
  firePointer(element, 'pointerdown', options);
}
```

2. **Add jsdom stubs for `setPointerCapture` / `releasePointerCapture`.** Merge into the existing `beforeEach` block (do not duplicate the block):

```ts
beforeEach(() => {
  ensureBuiltinSvgWidgetsRegistered();
  useEditorStore.getState().__resetForTests(createEmptyView());
  if (!('setPointerCapture' in Element.prototype)) {
    (Element.prototype as any).setPointerCapture = function () {};
    (Element.prototype as any).releasePointerCapture = function () {};
    (Element.prototype as any).hasPointerCapture = function () {
      return false;
    };
  }
});
```

3. **Append 4 new test cases** inside the existing `describe('SelectableWidget', () => { ... })` block (before its closing brace), as a nested `describe`:

```ts
  describe('body-drag', () => {
    it('pointer-move below threshold does NOT start a move gesture', () => {
      const view = { width: 800, height: 600, items: [baseItem] };
      useEditorStore.getState().__resetForTests(view);
      const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointermove', { clientX: 2, clientY: 0 }); // L1 = 2 < 3
      expect(useEditorStore.getState().gesture).toBeNull();
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: baseItem.x, y: baseItem.y });
    });

    it('pointer-move above threshold starts a move gesture and translates the widget', () => {
      const view = { width: 800, height: 600, items: [baseItem] };
      useEditorStore.getState().__resetForTests(view);
      const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointermove', { clientX: 20, clientY: 0 }); // L1 = 20 >= 3
      const s = useEditorStore.getState();
      expect(s.gesture).not.toBeNull();
      expect(s.gesture?.type).toBe('move');
      expect(s.view.items[0]).toMatchObject({ x: baseItem.x + 20, y: baseItem.y });
    });

    it('pointer-down then pointer-up without movement selects without moving', () => {
      const view = { width: 800, height: 600, items: [baseItem] };
      useEditorStore.getState().__resetForTests(view);
      const { container } = renderInSvg(<SelectableWidget instance={baseItem} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointerup', { clientX: 0, clientY: 0 });
      const s = useEditorStore.getState();
      expect(s.gesture).toBeNull();
      expect([...s.selectedIds]).toEqual(['w1']);
      expect(s.view.items[0]).toMatchObject({ x: baseItem.x, y: baseItem.y });
    });

    it('drag on a pre-selected group moves all selected widgets', () => {
      const itemA = baseItem;
      const itemB: SvgWidgetItem = { id: 'w2', type: 'svg-rect', x: 200, y: 200, w: 50, h: 50 };
      const view = { width: 800, height: 600, items: [itemA, itemB] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['w1', 'w2'], 'replace');
      const { container } = renderInSvg(<SelectableWidget instance={itemA} reactorId="F01" />);
      const wrap = container.querySelector('[data-widget-id="w1"]') as Element;
      firePointerDown(wrap, { clientX: 0, clientY: 0 });
      firePointer(wrap, 'pointermove', { clientX: 30, clientY: 30 });
      const s = useEditorStore.getState();
      expect(s.view.items.find((i) => i.id === 'w1')).toMatchObject({ x: itemA.x + 30, y: itemA.y + 30 });
      expect(s.view.items.find((i) => i.id === 'w2')).toMatchObject({ x: itemB.x + 30, y: itemB.y + 30 });
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx -t "body-drag"
```

Expected: 4 new tests FAIL (no pointer-move handler yet; `gesture` stays null at L1=20; group drag never moves w2).

- [ ] **Step 3: Rewrite `SelectableWidget.tsx` with body-drag handlers**

Overwrite `packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx`:

```tsx
'use client';
import React, { useCallback, useRef } from 'react';
import { SvgWidgetInstance } from '@/components/scada/SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { useEditorStore } from './useEditorStore';
import { svgPoint } from './transform-math';

const DRAG_THRESHOLD = 3; // px (L1 norm: |dx| + |dy|)

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

function safeSvgPoint(svgEl: SVGSVGElement | null, clientX: number, clientY: number) {
  if (!svgEl) return { x: clientX, y: clientY };
  try {
    return svgPoint(svgEl, clientX, clientY);
  } catch {
    return { x: clientX, y: clientY };
  }
}

export function SelectableWidget({ instance, reactorId }: Props) {
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore((s) => s.selectedIds.has(instance.id));
  const previewAnimations = useEditorStore((s) => s.previewAnimations);

  const startRef = useRef<{
    point: { x: number; y: number };
    bboxes: Record<string, { x: number; y: number; w: number; h: number }>;
  } | null>(null);
  const draggingRef = useRef(false);

  const renderItem: SvgWidgetItem = previewAnimations
    ? instance
    : { ...instance, animations: undefined };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      e.stopPropagation();
      const store = useEditorStore.getState();
      const mode = e.shiftKey ? 'toggle' : e.ctrlKey || e.metaKey ? 'add' : 'replace';

      const alreadySelected = store.selectedIds.has(instance.id);
      if (!alreadySelected || mode !== 'replace') {
        store.select([instance.id], mode);
      }

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom or unsupported environment — ignore
      }

      const svgEl = e.currentTarget.ownerSVGElement;
      const point = safeSvgPoint(svgEl, e.clientX, e.clientY);

      const after = useEditorStore.getState();
      const startBboxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const it of after.view.items) {
        if (after.selectedIds.has(it.id)) {
          startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
        }
      }
      startRef.current = { point, bboxes: startBboxes };
      draggingRef.current = false;
    },
    [instance.id],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!startRef.current) return;
    const svgEl = e.currentTarget.ownerSVGElement;
    const cur = safeSvgPoint(svgEl, e.clientX, e.clientY);
    const dx = cur.x - startRef.current.point.x;
    const dy = cur.y - startRef.current.point.y;
    const store = useEditorStore.getState();
    if (!draggingRef.current) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      store.beginGesture({
        type: 'move',
        startPoint: startRef.current.point,
        startBboxes: startRef.current.bboxes,
        startRotations: {},
      });
      draggingRef.current = true;
    }
    store.applyMove(dx, dy);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (draggingRef.current) {
      useEditorStore.getState().endGesture();
    }
    startRef.current = null;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <g
      data-widget-id={instance.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
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

- [ ] **Step 4: Run the new tests to verify they pass**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx -t "body-drag"
```

Expected: All 4 PASS.

- [ ] **Step 5: Run the full widget test file to confirm no regression on the 5 existing tests**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx
```

Expected: 5 existing + 4 new = 9 tests PASS.

- [ ] **Step 6: Run rubberband + canvas tests to confirm widget pointer-down still does not trigger canvas rubberband**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/SvgEditorCanvas.rubberband.test.tsx
```

Expected: All existing PASS.

- [ ] **Step 7: Type-check**

Run:

```bash
cd packages/web-ui && npx tsc --noEmit
```

Expected: no errors related to `SelectableWidget.tsx`.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/SelectableWidget.tsx \
        packages/web-ui/src/components/scada/svg-editor/__tests__/SelectableWidget.test.tsx
git commit -m "feat(scada-editor): body-drag move on SelectableWidget

Pointer-down on the widget body captures the pointer and snapshots
startBboxes for every selected widget. Pointer-move under 3px (L1) is
ignored — click-without-drag stays a pure select. Once threshold is
crossed, beginGesture('move') runs and applyMove translates the entire
selection. Pointer-up calls endGesture (grid snap applied if enabled).

DRAG_THRESHOLD=3px. setPointerCapture wrapped in try/catch for jsdom.

SP4.5 T2."
```

---

## Task 3: `useKeyboardShortcuts` Arrow\* + ESC-during-drag

**Files:**
- Modify: `packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts`
- Test: `packages/web-ui/src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts`

Model: haiku (mostly verbatim transcription from spec).

- [ ] **Step 1: Inspect the current shortcuts test file structure**

Open `packages/web-ui/src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts` and identify the render pattern used by the existing tests (Ctrl+A, Ctrl+Z, Escape, Delete). Reuse that same pattern verbatim in the new tests. If the file uses `renderHook(() => useKeyboardShortcuts())` from `@testing-library/react`, follow it; otherwise mirror whatever wrapper component the existing tests use.

- [ ] **Step 2: Write the failing tests**

Append the following two nested `describe` blocks inside the top-level `describe('useKeyboardShortcuts', () => { ... })` (before its closing brace). Adjust imports and the rendering helper to match the existing tests in the file:

```ts
  describe('arrow-key nudge', () => {
    it('ArrowRight without shift moves selected widgets by +1px x', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      renderHook(() => useKeyboardShortcuts());
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 11, y: 20 });
      expect(useEditorStore.getState().gesture).toBeNull();
    });

    it('Shift+ArrowDown moves selected widgets by +10px y', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      renderHook(() => useKeyboardShortcuts());
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true }));
      });
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 10, y: 30 });
    });

    it('arrow key with no selection is a no-op', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      renderHook(() => useKeyboardShortcuts());
      const before = useEditorStore.getState().view.items[0];
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      });
      expect(useEditorStore.getState().view.items[0]).toEqual(before);
    });
  });

  describe('escape during gesture', () => {
    it('Escape while a move gesture is active calls cancelGesture (snaps widgets back)', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [{ id: 'a', type: 'svg-rect', x: 10, y: 20, w: 50, h: 50 }],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      const startBboxes = { a: { x: 10, y: 20, w: 50, h: 50 } };
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes,
        startRotations: {},
      });
      useEditorStore.getState().applyMove(40, 50);
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 50, y: 70 });

      renderHook(() => useKeyboardShortcuts());
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      const s = useEditorStore.getState();
      expect(s.gesture).toBeNull();
      expect(s.view.items[0]).toMatchObject({ x: 10, y: 20 });
      // Selection preserved (ESC during drag must NOT also clear selection)
      expect(s.selectedIds.has('a')).toBe(true);
    });
  });
```

Make sure the file's imports include `SvgViewJson` from `@/widgets/svg/types` and `act` (and `renderHook` if used) from `@testing-library/react`.

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts -t "arrow-key nudge"
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts -t "escape during gesture"
```

Expected: All 4 new tests FAIL (no Arrow branch; ESC clears selection instead of cancelling gesture).

- [ ] **Step 4: Rewrite the hook**

Overwrite `packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts`:

```ts
'use client';
import { useEffect } from 'react';
import { useEditorStore } from './useEditorStore';

const ARROW_STEP = 1;
const ARROW_SHIFT_STEP = 10;

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
        const g = store.gesture;
        if (g && (g.type === 'move' || g.type === 'resize' || g.type === 'rotate')) {
          store.cancelGesture();
        } else {
          store.clearSelection();
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelected();
        return;
      }

      const isArrow =
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown';
      if (isArrow) {
        e.preventDefault();
        if (store.selectedIds.size === 0) return;
        const step = e.shiftKey ? ARROW_SHIFT_STEP : ARROW_STEP;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy =
          e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const startBboxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
        for (const it of store.view.items) {
          if (store.selectedIds.has(it.id)) {
            startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
          }
        }
        store.beginGesture({
          type: 'move',
          startPoint: { x: 0, y: 0 },
          startBboxes,
          startRotations: {},
        });
        store.applyMove(dx, dy);
        store.endGesture();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run:

```bash
cd packages/web-ui && npx vitest run src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts
```

Expected: All existing tests + 4 new tests PASS.

- [ ] **Step 6: Type-check**

Run:

```bash
cd packages/web-ui && npx tsc --noEmit
```

Expected: no errors related to `useKeyboardShortcuts.ts`.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/svg-editor/useKeyboardShortcuts.ts \
        packages/web-ui/src/components/scada/svg-editor/__tests__/useKeyboardShortcuts.test.ts
git commit -m "feat(scada-editor): Arrow* nudge + ESC-during-drag cancel

ArrowLeft/Right/Up/Down moves selected widgets by 1px (Shift = 10px) via
a one-frame beginGesture/applyMove/endGesture sequence so each press
pushes one history entry. Escape now branches: if an active move/resize/
rotate gesture exists, cancelGesture (revert + pop history); otherwise
the existing clearSelection behavior is preserved.

SP4.5 T3."
```

---

## Task 4: Regression + tsc + browser smoke + push

**Files:**
- Touched only by verification commands (no code edits unless a regression appears).

Model: sonnet (must triage any regression that surfaces).

- [ ] **Step 1: Run the full web-ui test suite**

Run:

```bash
cd packages/web-ui && npx vitest run
```

Expected: ALL tests PASS. If a regression appears, STOP and triage. Fix and re-run; do not skip or silence failing tests.

- [ ] **Step 2: Type-check the whole web-ui package**

Run:

```bash
cd packages/web-ui && npx tsc --noEmit
```

Expected: clean. Fix any new errors before proceeding.

- [ ] **Step 3: Boot the dev environment and run the editor smoke**

In one terminal:

```bash
cd /Volumes/SSD/BIOCORE
docker compose up -d
```

In another:

```bash
cd packages/web-ui && pnpm dev
```

Open `http://localhost:3000/scada2/edit/demo_edit_v1` in a browser and verify:

1. Click a widget — selection outline appears, no movement.
2. Click + drag the widget body — widget follows the pointer; on release it stays put (grid-snapped if Grid Snap is on).
3. Shift-click a second widget — both selected; drag either — both move together.
4. Click empty canvas — selection clears.
5. Press ArrowRight — selected widget moves +1 px.
6. Press Shift+ArrowDown — selected widget moves +10 px.
7. Start a drag, press ESC mid-drag — widget snaps back to start position, selection preserved.
8. Press Cmd/Ctrl+Z — last move undone.

If any step fails, capture which step + a screenshot + console errors, STOP, and report before pushing.

- [ ] **Step 4: Push branch**

```bash
cd /Volumes/SSD/BIOCORE
git push -u origin feat/scada-data-model
```

If the push fails with "no configured push destination" or similar (BIOCORE has historically had no remote), report and stop — do not invent a remote.

- [ ] **Step 5: No commit needed**

This task verifies only; if all checks pass (and push succeeds or is correctly reported as unavailable), the task is complete. Do not amend prior commits.

---

## Done criteria (whole plan)

- 9 new tests green (1 store + 4 widget + 4 shortcuts).
- Existing 25 tests across the three touched files still green.
- `pnpm exec tsc --noEmit` clean in `packages/web-ui`.
- Browser smoke (Task 4 Step 3) passes all 8 sub-checks.
- 3 new commits land on `feat/scada-data-model` and are pushed (or push-block reported).
