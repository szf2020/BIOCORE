# SP4.5 Editor body-drag + arrow-key nudge — Design Spec

**Date:** 2026-05-16
**Sub-project:** SP4.5 (follow-up to SP4)
**Branch:** `feat/scada-data-model`
**Prerequisites:** SP1–SP7.5 pre-soak shipped at `627850e`

---

## Goal

Add the two missing editor interactions documented in `project_sp4_followups.md`:

1. **Body-drag move** — pointer-down on a widget body (not handle) initiates a drag that moves the widget (or all selected widgets) by the pointer delta. Click without drag → select-only.
2. **Arrow-key nudge** — selected widgets move ±1 px per arrow press, ±10 px with Shift.

After SP7.5 all-drop, the user will rebuild ~13 views in `/scada2/edit/new` by hand. Without body-drag the editor is unusable for this.

**Out of scope:**
- Touch gesture
- Drag-to-reorder z-index
- Grid snap during drag (already applied at `endGesture`)
- Multi-monitor pointer capture quirks

---

## Architecture

Self-contained widget drag — each `SelectableWidget` owns its own pointer-down / move / up handlers via `setPointerCapture`. No canvas coordination. The existing `SvgEditorCanvas.handlePointerDown` already guards `e.target === e.currentTarget`, so widget pointer events do not trigger the rubber-band path.

```
packages/web-ui/src/components/scada/svg-editor/
  useEditorStore.ts          MODIFY  add cancelGesture() action + 1 test
  SelectableWidget.tsx       MODIFY  add body-drag handlers + DRAG_THRESHOLD const + 4 tests
  useKeyboardShortcuts.ts    MODIFY  add Arrow* + ESC-during-drag branches + 4 tests
```

---

## Behavior

### Body-drag state machine

`SelectableWidget` keeps two `useRef`s:

- `startRef: { point: {x,y}, bboxes: Record<id, AABB> } | null`
- `draggingRef: boolean`

**pointer-down handler:**

1. `e.stopPropagation()` (preserve SP4 behavior; canvas does not see widget pointer-down)
2. Determine select mode: `shift` → `toggle`, `ctrl|meta` → `add`, else `replace`
3. If widget is NOT in `selectedIds` OR mode is not `replace`, call `store.select([instance.id], mode)`
4. `e.currentTarget.setPointerCapture(e.pointerId)` (wrapped in try/catch for jsdom)
5. Compute SVG point via `svgPoint(svg, e.clientX, e.clientY)` wrapped in try/catch
6. Snapshot `startBboxes` from ALL currently-selected widgets:
   ```ts
   const startBboxes: Record<string, AABB> = {};
   for (const it of store.view.items) {
     if (store.selectedIds.has(it.id)) {
       startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
     }
   }
   ```
7. Set `startRef.current = { point, bboxes: startBboxes }`; `draggingRef.current = false`

**pointer-move handler:**

1. If `!startRef.current` → return
2. Compute `cur` via `svgPoint`; `dx = cur.x - startRef.current.point.x`, `dy = cur.y - ...point.y`
3. If `!draggingRef.current`:
   - If `Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD` (3) → return
   - Else: `store.beginGesture({ type: 'move', handle: undefined, startPoint: startRef.current.point, startBboxes: startRef.current.bboxes, startRotations: {} })`; `draggingRef.current = true`
4. `store.applyMove(dx, dy)`

**pointer-up handler:**

1. If `draggingRef.current === true`: `store.endGesture()`
2. `startRef.current = null`; `draggingRef.current = false`
3. `releasePointerCapture(e.pointerId)` wrapped in try/catch

### Arrow-key nudge

In `useKeyboardShortcuts`, add Arrow* branch AFTER the `isEditableTarget` guard (so Arrows still navigate cursor inside `<input>`):

```ts
const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown';
if (isArrow) {
  e.preventDefault();
  if (store.selectedIds.size === 0) return;
  const step = e.shiftKey ? 10 : 1;
  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
  const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
  const startBboxes: Record<string, AABB> = {};
  for (const it of store.view.items) {
    if (store.selectedIds.has(it.id)) startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
  }
  store.beginGesture({ type: 'move', startPoint: { x: 0, y: 0 }, startBboxes, startRotations: {} });
  store.applyMove(dx, dy);
  store.endGesture();
  return;
}
```

### ESC during drag

Existing Escape branch in `useKeyboardShortcuts`: `clearSelection()`. Extend:

```ts
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
```

### New `cancelGesture` action

In `useEditorStore.ts`, add to `EditorStore` interface + implementation:

```ts
cancelGesture(): void;

cancelGesture() {
  const state = get();
  if (!state.gesture) return;
  const items = state.view.items.map((it) => {
    const start = state.gesture!.startBboxes[it.id];
    if (!start) return it;
    const startRot = state.gesture!.startRotations[it.id];
    return {
      ...it,
      x: start.x, y: start.y, w: start.w, h: start.h,
      rotation: startRot ?? it.rotation,
    };
  });
  const history = [...state.history];
  history.pop();  // un-push snapshot from beginGesture
  set({ view: { ...state.view, items }, gesture: null, history });
}
```

`history.pop()` undoes the snapshot push that `beginGesture` did. If the gesture was a `rubberband`, no history was pushed, so this branch is guarded by `gesture.type in ['move','resize','rotate']` at call sites.

---

## Constants

```ts
const DRAG_THRESHOLD = 3;  // px (L1 norm: |dx| + |dy|)
const ARROW_STEP = 1;
const ARROW_SHIFT_STEP = 10;
```

---

## Tests (~9 new)

| Layer | File | New tests | Notes |
|---|---|---|---|
| Store | `__tests__/useEditorStore.test.ts` | +1 | cancelGesture reverts move + pops history |
| Widget | `__tests__/SelectableWidget.test.tsx` | +4 | drag below threshold = no move; drag above threshold = move; click-without-drag = select-only; pre-selected group moves together |
| Shortcuts | `__tests__/useKeyboardShortcuts.test.tsx` | +4 | Arrow* nudges ±1; Shift+Arrow nudges ±10; Arrow with no selection = no-op; ESC during move calls cancelGesture |

Existing SP4 tests must still pass (15 + 5 + 5 = 25 tests in the three files).

---

## Edge cases

- **pointer-down on widget but `selectedIds.size === 0`**: select-only-this widget; startBboxes contains only this widget; drag moves only it
- **Shift+pointer-down on selected widget**: toggle off then drag — but drag picked up empty startBboxes (since just deselected). Behavior: nothing moves on drag. Acceptable — user can shift-click again to re-select then drag
- **pointer-leave during drag**: `setPointerCapture` ensures pointer events continue to fire on the widget element; no event loss
- **jsdom missing `getScreenCTM`**: existing `safeSvgPoint` pattern (SP4 SelectionOverlay) — wrap in try/catch, fall back to client coords
- **Arrow key in `<input>` field (editor toolbar inputs)**: `isEditableTarget` already guards; Arrow falls through to cursor nav
- **Two pointer-downs in quick succession**: second pointer-down resets `startRef`/`draggingRef`; first drag (if dragging) does not properly endGesture. Acceptable — multi-touch out of scope
- **Drag a widget into negative coordinates**: allowed; `applyMove` doesn't clamp. Acceptable — user can drag back
- **history overflow during nudge spam**: each Arrow press pushes one history entry. SP4's HISTORY_CAP=50 already shifts on overflow

---

## Done criteria

- 9 new tests green; existing 25 in touched files still green; full web-ui suite green
- `pnpm exec tsc --noEmit` clean on touched files
- Manual smoke: in `/scada2/edit/<viewId>`, click + drag a widget — moves; click without drag — only selects; press Arrow keys — selected nudges by 1px; Shift+Arrow — 10px; ESC during drag — widget snaps back
- All commits on `feat/scada-data-model`; FF-merged to `main`

---

## Not covered (defer to SP4.6 or beyond)

- Touch gesture
- Snap-to-grid preview during drag (currently only on endGesture)
- Drag handle constraint (e.g., only drag with header bar)
- Multi-select marquee + drag in one gesture
