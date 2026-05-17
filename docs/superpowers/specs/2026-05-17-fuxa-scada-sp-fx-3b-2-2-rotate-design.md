# SP-FX-3b.2.2 — FUXA SCADA Editor Canvas: Single-Widget Rotate Handle (Design Spec)

**Date:** 2026-05-17
**Project:** BIOCore SCADA editor (`packages/web-ui/src/scada-engine/editor/`)
**Predecessor:** SP-FX-3b.2.1 (multi-select + box-select + 4 UX) — shipped commit `ce6aa57` on `main`
**Successor:** SP-FX-3b.2.3 (multi-select rotate + multi-select group-resize)
**Scope:** ~1 week incremental change. Single-widget rotate handle becomes active. Adds rotate to FuxaWidget schema, math, FSM state, callbacks, SVG transform, tooltip overlay, ESC cancel.

---

## 1. Scope

### 1.1 In-Scope

1. **Schema** — `FuxaWidget.rotate?: number` (Zod `z.number().min(0).max(360).optional()`). Stored degrees, normalized 0–360 by editor. `rotate==0` omitted from serialized JSON (backward compat with SP-FX-3b.1/3b.2.1 views).
2. **Rotate handle** — pre-existing green handle (rendered by SP-FX-3a `TransformHandles`, offset 20px above N) becomes mousedown-active. Drag rotates widget around bbox center `(x + w/2, y + h/2)`.
3. **Angle math** — free continuous (mouse-vs-pivot vector delta). Shift held → snap to 15° step (0/15/30/45/...). Pivot fixed at bbox center.
4. **FSM** — new `drag-rotate` state in `PointerState` union. `handleMouseDown` rotate-handle branch → enter. `handleMouseMove` computes delta angle + applies snap → live `canvas.applyRotate` + tooltip update. `handleMouseUp` → `onRotated(id, deg)` commit. `cancel()` restores `startRotate`.
5. **Visual** — widget root `<g>` SVG `transform="rotate(deg cx cy)"` applied via `CanvasController.applyRotate` (live + on load-view reload). `TransformHandles` overlay **stays in unrotated AABB position** (no rotate applied to handles group). New `RotateTooltip` class renders SVG `<text>` showing `${deg.toFixed(1)}°` next to rotate handle during drag.
6. **drag-body / drag-handle preserved** — rotated widgets translate by `x/y` only (drag-body); resize via 8 handles changes `w/h` in unrotated local space (drag-handle).
7. **ESC cancel** — Tier 1 in 3-tier ESC handler (drag-rotate → cancel restores startRotate; tier 2/3 unchanged from SP-FX-3b.2.1).

### 1.2 Out-of-Scope (Deferred)

| Item | Defer to |
|------|----------|
| Multi-select rotate (N widgets together) | SP-FX-3b.2.3 |
| Multi-select group-resize (8 handles on bbox proportional scale) | SP-FX-3b.2.3 |
| User-configurable pivot point | Later |
| Rotated widget hit-test in rotated space | Later (current uses unrotated AABB) |
| `gridSize` UI toolbar control | SP-FX-4 |

---

## 2. Rotate Math

### 2.1 Pivot

Fixed at widget bbox center: `pivot = { x: box.x + box.w / 2, y: box.y + box.h / 2 }`.

Both `x/y/w/h` are unrotated geometry — rotation is a presentation-layer SVG `transform` only. This keeps drag/resize math in local unrotated space.

### 2.2 `applyRotate` pure function

Add to `packages/web-ui/src/scada-engine/editor/geometry.ts`:

```ts
export function applyRotate(
  pivot: Point,
  startPt: Point,        // SVG-space mousedown pt
  currentPt: Point,      // SVG-space current pt
  startRotate: number,   // widget.rotate at mousedown (degrees; 0 if undefined)
  snapStep: number       // 0 = free, 15 = snap to 15° (Shift held)
): number {
  const a0 = Math.atan2(startPt.y - pivot.y, startPt.x - pivot.x);
  const a1 = Math.atan2(currentPt.y - pivot.y, currentPt.x - pivot.x);
  let deg = startRotate + (a1 - a0) * 180 / Math.PI;
  deg = ((deg % 360) + 360) % 360;  // normalize to [0, 360)
  if (snapStep > 0) deg = Math.round(deg / snapStep) * snapStep;
  if (deg === 360) deg = 0;
  return deg;
}
```

Notes:
- Returned `deg` is in `[0, 360)`. Editor stores this as `widget.rotate`.
- `snapStep === 0` → no snap (free continuous).
- `snapStep === 15` (Shift) → quantized to nearest 15° multiple (allowed values: 0/15/30/.../345).
- Boundary collapse: snap of `352.6°` with step 15 → `Math.round(23.5) * 15 = 360` → wraps to 0.

### 2.3 Snap detection

`pointer-tools.handleMouseMove` reads `e.shiftKey` from the active `MouseEvent` each tick. The Shift state is **per-event**, not latched on mousedown — release Shift mid-drag returns to free; press Shift mid-drag snaps the live angle.

---

## 3. Schema & Persistence

### 3.1 Schema patch — `packages/web-ui/src/scada-engine/models/widget.ts`

```ts
export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  property: FuxaPropertySchema,
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().nonnegative().optional(),
  h: z.number().nonnegative().optional(),
  rotate: z.number().min(0).max(360).optional(),  // SP-FX-3b.2.2
});
export type FuxaWidget = z.infer<typeof FuxaWidgetSchema>;
```

Constraints:
- `rotate` is `optional` — omitted key treated as 0 throughout the editor.
- Bounds inclusive: `0` and `360` both accepted (`360` will be normalized to `0` by editor on commit).
- Out-of-range values rejected by Zod parser at boundaries (load-view, save-view).

### 3.2 `editor-store.updateWidget` key-aware patch

Currently `editor-store.ts` uses `Object.assign(draft.items[id], patch)` inside an immer `produce` block, which won't delete keys when patch values are `undefined`. SP-FX-3b.2.2 needs explicit key deletion so that `commitRotate(0)` strips the field for JSON economy:

```ts
updateWidget: (id, patch, opts) => {
  const { currentView } = _store.getState();
  if (!currentView || !currentView.items[id]) return;
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

Behavior diff vs. SP-FX-3b.2.1:
- Old: `updateWidget(id, { x: 50 })` set x=50; `updateWidget(id, { x: undefined })` would have set x=undefined (key kept).
- New: `updateWidget(id, { x: undefined })` deletes the `x` key. Backward-compat-safe because no SP-FX-3b.1/3b.2.1 caller ever passes `undefined` values.

### 3.3 `commitRotate` semantics (caller convention)

EditorCanvas `onRotated` callback (wired into PointerTools):

```ts
onRotated: (id, deg) => {
  const store = useEditorStore.getState();
  if (deg === 0) store.updateWidget(id, { rotate: undefined } as Partial<FuxaWidget>);
  else store.updateWidget(id, { rotate: deg } as Partial<FuxaWidget>);
},
```

### 3.4 Backward Compatibility

- SP-FX-3b.1 / SP-FX-3b.2.1 views (no rotate key) load unchanged. `canvas.upsertWidget` checks `typeof widget.rotate === 'number' && widget.rotate !== 0` before applying transform.
- Save-view (SP-FX-2 routes) calls `FuxaWidgetSchema.parse(widget)` — Zod `optional()` omits undefined keys in `safeParse` output, so JSON volume is unchanged for views with no rotation.
- Any widget where `rotate === undefined` or `rotate === 0` results in no `transform` attribute being set on the SVG node.

---

## 4. FSM, Callbacks & Component Integration

### 4.1 `PointerState` union extension

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean }
  | { kind: 'drag-rotate'; widgetId: string; startPt: Point; pivot: Point; startBox: Box; startRotate: number };
```

### 4.2 `PointerToolsCallbacks` adds 3 fields

Existing 11 (SP-FX-3b.2.1) + 3 new = **14 total**:

```ts
getCurrentRotate: (id: string) => number | undefined;
onRotated: (id: string, rotate: number) => void;             // mouseup commit
onRotateMove: (deg: number | null, pivot: Point | null) => void;  // live tooltip; null = hide
```

### 4.3 `handleMouseDown` rotate branch

```ts
const handle = this.handles.hitTest(pt);
if (handle === 'rotate') {
  const widgetHit = this.cb.getWidgetAt(pt);
  if (widgetHit) {
    const pivot = { x: widgetHit.box.x + widgetHit.box.w / 2, y: widgetHit.box.y + widgetHit.box.h / 2 };
    const startRotate = this.cb.getCurrentRotate(widgetHit.id) ?? 0;
    this.state = { kind: 'drag-rotate', widgetId: widgetHit.id, startPt: pt, pivot, startBox: widgetHit.box, startRotate };
  }
  return;
}
if (handle) {
  // ... existing drag-handle path (8 resize handles unchanged) ...
}
```

Note: rotate handle hit-test is **prioritized** by checking `handle === 'rotate'` first inside the existing handle branch. `getWidgetAt` is called to identify which widget's handle was hit (handle hit-test alone doesn't tell us the widget id).

### 4.4 `handleMouseMove` drag-rotate branch

Insert before the existing `box-select` branch:

```ts
if (this.state.kind === 'drag-rotate') {
  const snapStep = e.shiftKey ? 15 : 0;
  const deg = applyRotate(this.state.pivot, this.state.startPt, pt, this.state.startRotate, snapStep);
  this.canvas.applyRotate(this.state.widgetId, deg, this.state.pivot);
  this.cb.onRotateMove(deg, this.state.pivot);
  return;
}
```

### 4.5 `handleMouseUp` drag-rotate branch

```ts
if (this.state.kind === 'drag-rotate') {
  const snapStep = e.shiftKey ? 15 : 0;
  const deg = applyRotate(this.state.pivot, this.state.startPt, pt, this.state.startRotate, snapStep);
  if (deg !== this.state.startRotate) this.cb.onRotated(this.state.widgetId, deg);
  this.state = { kind: 'idle' };
  this.cb.onRotateMove(null, null);
  return;
}
```

Short-circuit: if `deg === startRotate` (click on rotate handle without movement, or rotation went around full circle), no `onRotated` fires — no history entry. Tooltip hidden either way.

### 4.6 `cancel()` drag-rotate branch

```ts
if (this.state.kind === 'drag-rotate') {
  this.canvas.applyRotate(this.state.widgetId, this.state.startRotate, this.state.pivot);
  this.state = { kind: 'idle' };
  this.cb.onRotateMove(null, null);
  return;
}
```

No `onRotated` fires (no commit). `canvas.applyRotate` directly restores the SVG transform; store state is untouched (no need for `updateWidget` since store rotate never changed during drag — only live SVG transform).

### 4.7 `CanvasController.applyRotate`

Add to `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`:

```ts
applyRotate(id: string, deg: number, pivot: Point): void {
  const node = this.widgetNodes.get(id);  // existing widget-id → svg.js group map (SP-FX-3a CanvasController field)
  if (!node) return;
  if (deg === 0) node.attr('transform', null);
  else node.attr('transform', `rotate(${deg} ${pivot.x} ${pivot.y})`);
}
```

`upsertWidget` (existing method) is extended to also honor `widget.rotate` when (re)rendering:

```ts
// after positioning the group via x/y/w/h:
const rotateDeg = typeof widget.rotate === 'number' ? widget.rotate : 0;
if (rotateDeg === 0) node.attr('transform', null);
else {
  const cx = widget.x + widget.w / 2;
  const cy = widget.y + widget.h / 2;
  node.attr('transform', `rotate(${rotateDeg} ${cx} ${cy})`);
}
```

This ensures load-view + undo/redo (which call `loadView` → `upsertWidget` per widget) render the saved rotation.

### 4.8 `RotateTooltip` class

Add to `packages/web-ui/src/scada-engine/editor/transform-handles.ts`:

```ts
export class RotateTooltip {
  private group: G;
  private text: Text;
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

  show(deg: number, pivot: Point): void {
    if (this.destroyed) return;
    // Tooltip positioned relative to pivot (12px right, 4px above center).
    // Future enhancement: pass startBox for handle-relative placement.
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

Note: tooltip placement uses `pivot` as anchor for simplicity. For SP-FX-3b.2.2 the pivot-offset is sufficient (always visible near the rotated widget).

### 4.9 `EditorCanvas.tsx` integration

Refs extension:
```ts
interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
  snapGuides: SnapGuides;
  rubberBand: SVGRectElement;
  rotateTooltip: RotateTooltip;   // SP-FX-3b.2.2
}
```

Lifecycle ctor (inside lifecycle `useEffect`):
```ts
const rotateTooltip = new RotateTooltip(canvas.overlayLayer);
// ... PointerTools ctor adds 3 new cb:
//   getCurrentRotate: (id) => (useEditorStore.getState().currentView?.items[id] as any)?.rotate,
//   onRotated: (id, deg) => useEditorStore.getState().updateWidget(id, (deg === 0 ? { rotate: undefined } : { rotate: deg }) as any),
//   onRotateMove: (deg, pivot) => {
//     if (deg === null || pivot === null) refs.current?.rotateTooltip.hide();
//     else refs.current?.rotateTooltip.show(deg, pivot);
//   },
refs.current = { canvas, handles, pointer, snapGuides, rubberBand, rotateTooltip };
return () => {
  pointer.destroy();
  snapGuides.destroy();
  rotateTooltip.destroy();
  canvas.destroy();
  refs.current = null;
};
```

ESC handler already invokes `pointer.cancel()` for any non-idle state via SP-FX-3b.2.1 keyboard `useEffect` Tier 1. No change needed there — drag-rotate is automatically covered.

---

## 5. Test Plan

### 5.1 Vitest unit tests

| File | New tests | Coverage |
|------|-----------|----------|
| `geometry.test.ts` | +5 | applyRotate free (no rotation), 90° rotation, snap 23→30, snap 7→0, normalize 350+30→20 |
| `models/__tests__/widget.test.ts` (new) | +4 | rotate 45 ok, rotate 360 ok, rotate -5 reject, rotate 400 reject |
| `transform-handles.test.ts` | +3 | RotateTooltip show renders text, hide sets visibility, destroy removes node |
| `canvas-svg.test.ts` | +3 | applyRotate sets transform, applyRotate(0) clears transform, upsertWidget honors widget.rotate |
| `pointer-tools.test.ts` | +8 | mousedown rotate handle → drag-rotate; mousemove free; mousemove Shift snap; mouseup commit; mouseup unchanged short-circuit; cancel restores; cancel no onRotated; mousedown rotate no widget hit stays idle |
| `EditorCanvas.test.tsx` | +6 | rotate 90° integration; Shift snap 30; ESC restores; rotate=0 commit strips key; tooltip mounted hidden; handles stay at unrotated AABB |
| `editor-store.test.ts` | +1 | updateWidget with `{rotate: undefined}` patch deletes the key |

**Total unit:** +30. Target: **583 → 613**.

### 5.2 Playwright e2e (+2 → 17 total)

Create `packages/web-ui/e2e/scada-editor-canvas-3b2-2.spec.ts`:

- `Rotate handle drag 90°: store.items.w1.rotate ≈ 90 (±5° tolerance for mouse imprecision), widget node transform attr contains "rotate("` 
- `ESC mid-rotate restores: rotate back to startRotate (or absent if was 0)`

### 5.3 Regression Targets

- web-ui: **583 → 613** (+30)
- server: 147 (unchanged)
- data-service: 84 (unchanged)
- Playwright: **15 → 17** (+2)
- tsc: clean

---

## 6. File Structure

### 6.1 Modified

- `packages/web-ui/src/scada-engine/models/widget.ts` (schema)
- `packages/web-ui/src/scada-engine/editor/geometry.ts` (applyRotate)
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` (RotateTooltip class)
- `packages/web-ui/src/scada-engine/editor/canvas-svg.ts` (applyRotate method; upsertWidget honors rotate)
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` (drag-rotate state, 3 new cb, handlers ext)
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` (rotateTooltip ref + 3 cb wiring)
- `packages/web-ui/src/scada-engine/services/editor-store.ts` (updateWidget key-aware patch)
- `packages/web-ui/src/scada-engine/editor/index.ts` (re-export RotateTooltip + applyRotate)
- 7 corresponding `__tests__/*.ts(x)` files (test additions)

### 6.2 Created

- `packages/web-ui/src/scada-engine/models/__tests__/widget.test.ts` (if absent) — schema tests
- `packages/web-ui/e2e/scada-editor-canvas-3b2-2.spec.ts` — 2 smoke tests

---

## 7. Constraints

- All user-facing replies in 简体中文 (per repo convention).
- AI / automation / animation / expression-eval may never write directly to PLC (out-of-scope for this SP).
- HMI manual set-value continues via `writeTag → WS → server` (SP-FX-2 interface, out-of-scope).
- TDD RED-first strictly enforced.
- macOS BSD sed: literal substitutions only (no `\b`).
- `pnpm` via `export PATH=$HOME/.hermes/node/bin:$PATH`.
- No new third-party dependencies (svg.js + zustand + immer + zod already present).

---

## 8. Stop Conditions

1. Rotate handle drag rotates single widget by free angle (continuous).
2. Shift held during rotate drag snaps to 15° step.
3. `rotate === 0` on commit omits key from store and serialized JSON.
4. ESC mid-rotate restores `startRotate` (no history entry, no commit).
5. Saved view with `rotate: 45` reloads with `transform="rotate(45 cx cy)"` applied.
6. Rotated widget drag-body changes `x/y` only — rotate unchanged.
7. Rotated widget resize via 8 handles changes `w/h` only in unrotated local space.
8. `RotateTooltip` shows during rotate-drag; hides on commit / cancel.
9. `TransformHandles` overlay stays in unrotated AABB position regardless of widget rotation.
10. **Regression baselines:** web-ui 613/613 vitest, server 147/147, data-service 84/84, tsc clean, Playwright 17/17.

If any fails → STOP, surface, no push.

---

## 9. Deferred to SP-FX-3b.2.3

- Multi-select rotate (N widgets rotated together — pick rigid-around-bbox-center vs per-widget origin during 3b.2.3 brainstorm)
- Multi-select group-resize (8 handles on bbox, proportional scale with anchor at opposite corner; aspect-lock with Shift)
- User-configurable pivot

---

## 10. Acceptance Criteria

- §8 stop conditions all green.
- `/dev/scada-editor-canvas` manual smoke:
  - Drag rotate handle 90° → widget visually rotates, tooltip "90.0°", commit; reload retains 90°.
  - Shift + arbitrary drag → snap to 15° multiples (15.0 / 30.0 / 45.0 / ...).
  - Rotated widget drag-body → position changes, angle preserved.
  - Rotated widget corner-handle drag → w/h changes, angle preserved.
  - ESC mid-rotate → angle reverts to start.
  - Rotate to 0° (back upright) → save+reload, JSON has no `rotate` key.
- web-ui 613/613 + server 147 + data-service 84 + tsc clean + Playwright 17/17.
- Editor module ready for SP-FX-3b.2.3 (multi-select rotate + group-resize).
