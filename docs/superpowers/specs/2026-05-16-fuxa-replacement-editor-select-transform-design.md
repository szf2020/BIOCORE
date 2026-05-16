# FUXA Replacement — Sub-project 4/8: Editor Select/Transform Design

**Date:** 2026-05-16
**Branch:** feat/scada-data-model
**Depends on:** Sub-projects 1 (SVG canvas runtime), 2 (Widget library v2), 3 (Animation engine)
**Successors:** Sub-project 5 (pages/templates), 6 (write controls), 7 (FUXA removal)

---

## Goal

Build the editor layer for SCADA views: click to select widgets, drag handles to resize, drag rotation handle to rotate, drag widget body to move, with multi-select, rubber-band selection, and undo/redo. Output writes back to the same `SvgViewJson` schema the SP1-3 viewer already consumes.

Existing legacy editor at `components/scada/editor/` operates on the React-component widget system (`WidgetDef`) and stays untouched. SP4 builds a parallel SVG-native editor at `components/scada/svg-editor/` consuming `SvgViewJson` + `SvgWidgetItem`.

## Scope

**In:**
- New route `/scada2/edit/[viewId]` (read existing view JSON, edit, save back)
- Single + multi-select (shift-click toggle, ctrl-click add)
- Rubber-band drag-selection
- 8 resize handles (4 corner + 4 edge) per selected widget; classic opposite-handle anchor
- Rotation handle at top-center; rotates around widget center
- Move-by-drag (widget body)
- Snapshot-based undo/redo (50-step history)
- Keyboard shortcuts: Ctrl+A, Esc, Delete, Ctrl+Z, Ctrl+Shift+Z, arrow nudge, Shift (aspect lock / 15° snap), Alt (center-anchored resize)
- Optional grid snap (toggle, default off)
- Pointer Events (mouse + touch + pen)
- Animation rendering DISABLED in edit mode (widgets show static shape)

**Out (deferred):**
- Pages, templates, multi-view → SP5
- Write controls (sliders/switches/WriteIntent) → SP6
- Copy/paste, group/ungroup, alignment guides, layer-order UI → SP5+
- FUXA removal → SP7
- Asset/image library → SP8

## Architecture

```
/scada2/edit/[viewId]  (Next.js page)
        ↓ fetch view JSON
SvgEditorCanvas  (root SVG <svg>)
  ├─ <rect> background (view.background)
  ├─ <g class="grid"> ............ optional grid (if gridSnap=true)
  ├─ <g class="widgets">
  │   └─ SelectableWidget × view.items
  │       └─ wraps SvgWidgetInstance with animations:undefined (raw geometry)
  ├─ <g class="selection">
  │   └─ SelectionOverlay × selectedIds.size
  │       └─ 8 resize handles + 1 rotation handle + outline rect
  └─ <g class="rubberband">  (during drag-select)
      └─ <rect>

useEditorStore (Zustand):
  view: SvgViewJson
  selectedIds: Set<string>
  history: SvgViewJson[]        snapshot stack, cap 50
  future: SvgViewJson[]         redo stack
  gridSnap: boolean
  gridSize: number              default 10
  gesture: { type, handle?, startPoint, startBbox } | null
```

**Key design properties:**
- Pure-function transform math isolated in `transform-math.ts` (no React); independently testable
- Store actions follow command-pattern naming (`moveSelected`, `resizeSelected`) but use snapshot history under the hood — simpler than inverse-pair commands, fine at this data scale
- Animations from SP3 stay in the JSON; editor passes `animations: undefined` to viewer at render time. Saving preserves the original animations array. Optional "Preview animations" toggle re-enables them.

## Type Contract

```typescript
// components/scada/svg-editor/types.ts

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotation';

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResizeModifiers {
  aspect: boolean;    // Shift held → lock w/h ratio
  centered: boolean;  // Alt held → keep center fixed
}

export interface RotateModifiers {
  snap15: boolean;    // Shift held → snap to 15° increments
}

export type SelectMode = 'replace' | 'toggle' | 'add';

export interface EditorGesture {
  type: 'move' | 'resize' | 'rotate' | 'rubberband';
  handle?: Exclude<HandleId, 'rotation'>;
  startPoint: { x: number; y: number };          // SVG user-space
  startBboxes: Record<string, AABB>;             // per-widget snapshot at gesture start
  startRotations?: Record<string, number>;       // per-widget rotation at gesture start
}
```

## Transform Math (`transform-math.ts`, pure functions)

### `resizeRect(bbox, handle, dx, dy, modifiers): AABB`

Compute the new AABB after dragging `handle` by `(dx, dy)` from `bbox`.

- Each handle has fixed anchor semantics: dragging `se` keeps `nw` fixed; dragging `n` keeps `s` row fixed; etc.
- Edge handles (n/s/e/w) constrain to one axis.
- `aspect=true`: pin `w/h` ratio to original; the dominant delta wins.
- `centered=true`: anchor is the bbox center; opposing side mirrors movement.
- Minimum dimensions enforced (w ≥ 1, h ≥ 1).
- If width or height would go negative, flip the bbox (handle conceptually crosses the anchor — supported, allows "drag-through" resize).

### `rotateAroundCenter(bbox, currentRotation, pointerStart, pointerCurrent, modifiers): number`

Compute new rotation degrees.

- Center = `(bbox.x + bbox.w/2, bbox.y + bbox.h/2)`
- `startAngle = atan2(pointerStart.y - cy, pointerStart.x - cx)`
- `curAngle = atan2(pointerCurrent.y - cy, pointerCurrent.x - cx)`
- `deltaDeg = (curAngle - startAngle) * 180 / π`
- New rotation = `currentRotation + deltaDeg`, normalized to `[0, 360)`
- `snap15=true`: round to nearest 15°

### `snapToGrid(value, gridSize): number`

`Math.round(value / gridSize) * gridSize`. Used on commit (gesture end), not during drag.

### `intersects(a, b): boolean`

AABB overlap test for rubber-band hit detection.

```typescript
return !(b.x + b.w < a.x || a.x + a.w < b.x ||
         b.y + b.h < a.y || a.y + a.h < b.y);
```

### `svgPoint(svgEl, clientX, clientY): { x, y }`

Convert client coords (pointer event) to SVG user-space via `getScreenCTM().inverse().multiply(point)`. Used by canvas to translate pointer events.

## Editor Store (`useEditorStore.ts`)

Zustand store. State shape and action signatures:

```typescript
export interface EditorStore {
  // State
  view: SvgViewJson;
  selectedIds: Set<string>;
  history: SvgViewJson[];
  future: SvgViewJson[];
  gridSnap: boolean;
  gridSize: number;
  previewAnimations: boolean;        // toggle to see live animations
  gesture: EditorGesture | null;

  // Selection
  select(ids: string[], mode: SelectMode): void;
  selectAll(): void;
  clearSelection(): void;

  // Gesture lifecycle
  beginGesture(g: EditorGesture): void;
  endGesture(): void;

  // Transforms (during gesture — no history push per move)
  applyMove(dx: number, dy: number): void;
  applyResize(handle: Exclude<HandleId, 'rotation'>, dx: number, dy: number, mods: ResizeModifiers): void;
  applyRotate(pointerCurrent: { x: number; y: number }, mods: RotateModifiers): void;

  // CRUD (each pushes history)
  addWidget(item: SvgWidgetItem): void;
  deleteSelected(): void;
  setWidget(id: string, patch: Partial<SvgWidgetItem>): void;

  // Undo/redo
  undo(): void;
  redo(): void;

  // Settings
  setGridSnap(enabled: boolean): void;
  setPreviewAnimations(enabled: boolean): void;
}
```

**History semantics:**
- `beginGesture` snapshots `view` to `history` (only if gesture mutates view: move/resize/rotate, not rubber-band)
- `applyMove`/`applyResize`/`applyRotate` mutate the working `view` without pushing further snapshots
- `endGesture` applies grid snap (if enabled) as a final position adjustment, then clears gesture
- `addWidget`/`deleteSelected`/`setWidget` each push to history immediately
- `undo`: pop `history` → push current view to `future` → restore popped state
- `redo`: pop `future` → push current to `history` → restore
- Capacity: `history` truncated to last 50 entries; `future` cleared on any non-undo mutation

## Selection Behavior

| Trigger | Action |
|---|---|
| Pointer-down on a widget (no modifiers) | `select([id], 'replace')` |
| Shift + pointer-down on a widget | `select([id], 'toggle')` |
| Ctrl/Cmd + pointer-down on a widget | `select([id], 'add')` |
| Pointer-down on empty canvas | Begin rubber-band gesture |
| Pointer-up after rubber-band | `select(idsInBand, shift ? 'add' : 'replace')` |
| Ctrl/Cmd + A | `selectAll()` |
| Esc | `clearSelection()` |

Multi-select transforms: drag any selected widget → move all selected by same `(dx, dy)`. Drag a resize handle on the multi-bbox → resize all selected proportionally (each widget's bbox scaled by the same factor relative to multi-bbox anchor). Drag rotation handle → rotate all selected around the multi-bbox center (each widget's individual rotation accumulates).

## Animation Display in Edit Mode

- `SelectableWidget` clones the `SvgWidgetItem` with `animations: undefined` (or omits the field) before passing to `SvgWidgetInstance`
- Editor shows the widget's static geometry, not its tag-driven animated state
- The original animations array is preserved in the store's `view.items[i].animations`; saving roundtrips it
- Toggle `previewAnimations`: when `true`, `SelectableWidget` passes the original item through (with animations); useful for testing animation results without leaving edit mode

## Keyboard Shortcuts (`useKeyboardShortcuts.ts`)

Bind once at editor page mount; release on unmount.

| Key | Action |
|---|---|
| `Cmd/Ctrl+A` | `selectAll()` |
| `Esc` | `clearSelection()` |
| `Delete` / `Backspace` | `deleteSelected()` |
| `Cmd/Ctrl+Z` | `undo()` |
| `Cmd/Ctrl+Shift+Z` | `redo()` |
| Arrow keys | nudge selected ±1px (`applyMove(±1, 0)` + commit) |
| `Shift`+Arrow | nudge ±10px |

Shortcuts disabled while focus is in an `<input>` or `<textarea>`.

## File Structure

```
packages/web-ui/src/components/scada/svg-editor/
  ├─ types.ts                              // HandleId, AABB, modifiers, gesture
  ├─ transform-math.ts                     // pure functions
  ├─ useEditorStore.ts                     // zustand store
  ├─ SvgEditorCanvas.tsx                   // root SVG + pointer handling
  ├─ SelectableWidget.tsx                  // single widget + click-to-select
  ├─ SelectionOverlay.tsx                  // 8 handles + rotation handle
  ├─ RubberBand.tsx                        // drag-selection rect
  ├─ useKeyboardShortcuts.ts               // keymap hook
  └─ __tests__/
      ├─ transform-math.test.ts            // ~12 tests
      ├─ useEditorStore.test.ts            // ~15 tests
      ├─ SelectableWidget.test.tsx         // ~5 tests
      ├─ SelectionOverlay.test.tsx         // ~5 tests
      ├─ SvgEditorCanvas.rubberband.test.tsx  // ~3 tests
      └─ useKeyboardShortcuts.test.ts      // ~5 tests

packages/web-ui/src/app/scada2/edit/[viewId]/
  └─ page.tsx                              // editor route (fetch view, render SvgEditorCanvas)
```

**Total new tests:** ~45.

## Test Plan Highlights

### `transform-math.test.ts` (~12)

```typescript
describe('resizeRect', () => {
  it('SE handle: NW corner stays fixed, w/h grow by dx/dy');
  it('NW handle: SE corner stays fixed, x/y shift, w/h shrink by dx/dy');
  it('N edge: x fixed, y shifts down, h shrinks');
  it('E edge: only width grows');
  it('aspect lock keeps w/h ratio');
  it('centered keeps bbox center fixed');
  it('clamps to minimum 1x1');
  it('handles negative deltas (drag-through flip)');
});
describe('rotateAroundCenter', () => {
  it('returns currentRotation + deltaDeg');
  it('snap15 rounds to 15° increments');
});
describe('snapToGrid', () => {
  it('snaps to nearest gridSize');
});
describe('intersects', () => {
  it('returns true for overlapping AABBs, false otherwise');
});
```

### `useEditorStore.test.ts` (~15)

Selection (replace/toggle/add/selectAll/clear), CRUD (add/delete with id uniqueness, history push), gesture lifecycle (begin/end with snapshot), undo/redo (forward/back with future cleared on new mutation), history capacity (51 entries → oldest dropped), grid snap applied on endGesture.

### `SelectableWidget.test.tsx` (~5)

Pointer-down with various modifiers → correct `select()` mode. Renders widget WITHOUT animations field even when item has them. Selected widget renders outline.

### `SelectionOverlay.test.tsx` (~5)

8 resize handles + 1 rotation handle (9 total). Rotation handle 24px above top-center. Handle pointer-down initiates correct gesture in store. Multi-select shows single bbox spanning all selected widgets.

### `SvgEditorCanvas.rubberband.test.tsx` (~3)

Empty-canvas pointer-down starts rubber band. Rect grows on pointer-move. Pointer-up selects intersecting widgets.

### `useKeyboardShortcuts.test.ts` (~5)

Each of Ctrl+A, Esc, Delete, Ctrl+Z, Ctrl+Shift+Z triggers correct store action. Shortcuts ignored when focus in `<input>`.

## Performance Budget

- 100 widgets, 1 selected → 1 SelectionOverlay re-render per gesture frame
- Zustand selector slicing: non-selected `SelectableWidget` components re-render only when their item changes (via `useEditorStore((s) => s.view.items[i])` with shallow compare)
- Pointer-move @ 60 Hz = 16.7 ms budget; transform math < 1 ms; React reconcile dominant
- History: 50 × ~10 KB JSON = ~500 KB worst case (acceptable)

## Error Handling

- Pointer events outside canvas during gesture → `setPointerCapture` ensures events still route to the canvas; `pointerup` always fires `endGesture`
- `pointercancel` (browser interrupts) → call `endGesture` without committing (rolls back via undo)
- Invalid handle in store action → no-op + console.warn (defensive; should never happen with typed enum)
- Save endpoint returns 5xx → toast + keep local state (no destructive rollback)

## Backward Compatibility

- Existing `/scada2/[viewId]` viewer unchanged
- Existing legacy editor at `/scada/...` unchanged
- New route `/scada2/edit/[viewId]` is purely additive
- `SvgViewJson` schema unchanged (already has `x/y/w/h/rotation` on items)

## Done Criteria

- 45 new tests, all green; existing suite still green
- `pnpm exec tsc --noEmit` clean
- Editor page renders, click selects, drag handles resizes, rotation handle rotates, body drag moves
- Multi-select works (shift-click + rubber band); transforms operate on all selected
- Undo/redo across gesture boundaries
- Saved view JSON round-trips through `/scada2/[viewId]` viewer without visible difference
- Branch `feat/scada-data-model` ready for sub-project 5 (pages/templates)
