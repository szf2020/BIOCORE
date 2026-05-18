# SP-FX-3b.2.3 — FUXA SCADA Editor Canvas: Multi-Select Rotate + Group-Resize (Design Spec)

**Date:** 2026-05-17
**Project:** BIOCore SCADA editor (`packages/web-ui/src/scada-engine/editor/`)
**Predecessor:** SP-FX-3b.2.2 (single-widget rotate) — shipped commit `0467e66` on `main`
**Successor:** (TBD — rotated-widget-aware group-resize, multi-select per-widget rotate, group-skew)
**Scope:** ~1 week incremental change. Multi-select rotate + group-resize via bbox handles. Adds 2 PointerState variants, 2 new callbacks, 3 new geometry helpers, transform-handles bbox mode rewrite.

---

## 1. Scope

### 1.1 In-Scope

1. **transform-handles.showBbox() rewrite** — bbox mode renders all 9 handles (8 resize + 1 rotate) AT bbox positions, plus 4 corner indicators. `hitTest` works against `currentBox` (bbox), so handles are interactive.
2. **Multi-rotate (group-rotate)** — drag rotate handle in bbox mode → all selected widgets rotate as rigid body around bbox center. Each widget's `(x, y)` rotated around pivot + each widget's `rotate` field += delta. Shift→15° snap.
3. **Group-resize** — drag any of 8 handles in bbox mode → bbox scales with anchor at opposite corner/edge; each widget's `(x, y, w, h)` scales proportionally relative to anchor. Shift on corner = aspect-lock (uniform scale, min absolute). Edge handles = 1D scale.
4. **Min-size freeze** — bbox shrinking ignored (handleMouseMove returns) when any widget projects `w < 5` or `h < 5`. Last valid frame remains rendered.
5. **History** — 1 entry per group operation via silent batching (i<N-1 silent, last non-silent).
6. **ESC cancel** — Tier 1 covers group-rotate / group-resize. Mid-drag → restore all widget startBoxes + startRotates via direct `canvas.upsertWidget`. No commit fire.
7. **Tooltip reuse** — `RotateTooltip` from SP-FX-3b.2.2 reused for group-rotate (live delta angle display near pivot).

### 1.2 Out-of-Scope (Deferred)

| Item | Defer to |
|------|----------|
| Rotated-widget-aware group-resize (when any selected widget has `rotate ≠ 0`, math uses unrotated AABB; visual may drift) | Later |
| Multi-select per-widget rotate (each widget rotates around own center) | Later |
| Bbox-center-anchored scale (Alt modifier — Photoshop convention) | Later |
| User-configurable pivot point | Later |
| Edge handle aspect-lock (current: no-op) | Later |
| Group-skew | Later |

---

## 2. Multi-Rotate (Group-Rotate) Math

### 2.1 Pivot

Bbox center: `pivot = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 }`, where `bbox = computeBbox(Array.from(startBoxes.values()))` (SP-FX-3b.2.1 helper).

### 2.2 `applyMultiRotate` pure function

Add to `packages/web-ui/src/scada-engine/editor/geometry.ts`:

```ts
export type MultiRotateResult = Map<string, { box: Box; rotate: number }>;

export function applyMultiRotate(
  startBoxes: Map<string, Box>,
  startRotates: Map<string, number>,
  pivot: Point,
  startPt: Point,
  currentPt: Point,
  snapStep: number,
): MultiRotateResult {
  const a0 = Math.atan2(startPt.y - pivot.y, startPt.x - pivot.x);
  const a1 = Math.atan2(currentPt.y - pivot.y, currentPt.x - pivot.x);
  let delta = (a1 - a0) * 180 / Math.PI;
  if (snapStep > 0) delta = Math.round(delta / snapStep) * snapStep;
  const rad = delta * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: MultiRotateResult = new Map();
  for (const [id, sb] of startBoxes) {
    const sr = startRotates.get(id) ?? 0;
    const wcx = sb.x + sb.w / 2;
    const wcy = sb.y + sb.h / 2;
    const dx = wcx - pivot.x;
    const dy = wcy - pivot.y;
    const newCx = pivot.x + dx * cos - dy * sin;
    const newCy = pivot.y + dx * sin + dy * cos;
    const newBox: Box = { x: newCx - sb.w / 2, y: newCy - sb.h / 2, w: sb.w, h: sb.h };
    let newRotate = ((sr + delta) % 360 + 360) % 360;
    if (newRotate === 360) newRotate = 0;
    out.set(id, { box: newBox, rotate: newRotate });
  }
  return out;
}
```

### 2.3 Notes

- `w/h` preserved per widget (rigid body).
- `(x, y)` rotated around pivot via standard 2D rotation matrix.
- Each widget's `rotate` field accumulates the global `delta` so per-widget visual rotation matches positional displacement.
- Snap delta to 15° step when `snapStep === 15` (Shift held).
- 360° wraps to 0 for canonical [0, 360) range.

---

## 3. Group-Resize Math

### 3.1 Anchor (`anchorOf`)

Add to geometry.ts (export for testing):

```ts
export function anchorOf(handle: HandleId, bbox: Box): Point {
  switch (handle) {
    case 'nw': return { x: bbox.x + bbox.w, y: bbox.y + bbox.h };
    case 'n':  return { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h };
    case 'ne': return { x: bbox.x, y: bbox.y + bbox.h };
    case 'w':  return { x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 };
    case 'e':  return { x: bbox.x, y: bbox.y + bbox.h / 2 };
    case 'sw': return { x: bbox.x + bbox.w, y: bbox.y };
    case 's':  return { x: bbox.x + bbox.w / 2, y: bbox.y };
    case 'se': return { x: bbox.x, y: bbox.y };
    default:   return { x: bbox.x, y: bbox.y };
  }
}
```

`rotate` handle never reaches `anchorOf` (routed to group-rotate state).

### 3.2 `applyGroupResize` pure function

Add to geometry.ts:

```ts
export type GroupResizeResult = { bbox: Box; widgets: Map<string, Box> };

export function applyGroupResize(
  startBbox: Box,
  newBbox: Box,
  handle: HandleId,
  startBoxes: Map<string, Box>,
  aspectLock: boolean,
): GroupResizeResult | null {
  const anchor = anchorOf(handle, startBbox);
  let scaleX = newBbox.w / startBbox.w;
  let scaleY = newBbox.h / startBbox.h;

  // Edge handle: lock orthogonal axis
  if (handle === 'n' || handle === 's') scaleX = 1;
  if (handle === 'w' || handle === 'e') scaleY = 1;

  // Corner + Shift: aspect-lock (uniform scale = min absolute)
  const isCorner = handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se';
  if (aspectLock && isCorner) {
    const s = Math.min(Math.abs(scaleX), Math.abs(scaleY));
    scaleX = scaleX < 0 ? -s : s;
    scaleY = scaleY < 0 ? -s : s;
  }

  const widgets = new Map<string, Box>();
  for (const [id, sb] of startBoxes) {
    const newW = sb.w * scaleX;
    const newH = sb.h * scaleY;
    if (Math.abs(newW) < 5 || Math.abs(newH) < 5) return null;  // freeze
    const newX = anchor.x + (sb.x - anchor.x) * scaleX;
    const newY = anchor.y + (sb.y - anchor.y) * scaleY;
    widgets.set(id, { x: newX, y: newY, w: newW, h: newH });
  }

  // Derive final bbox from anchor + signed dims so handles track even after Shift collapses scale
  const finalW = Math.abs(startBbox.w * scaleX);
  const finalH = Math.abs(startBbox.h * scaleY);
  let bx: number, by: number;
  switch (handle) {
    case 'nw': bx = anchor.x - finalW; by = anchor.y - finalH; break;
    case 'n':  bx = anchor.x - finalW / 2; by = anchor.y - finalH; break;
    case 'ne': bx = anchor.x; by = anchor.y - finalH; break;
    case 'w':  bx = anchor.x - finalW; by = anchor.y - finalH / 2; break;
    case 'e':  bx = anchor.x; by = anchor.y - finalH / 2; break;
    case 'sw': bx = anchor.x - finalW; by = anchor.y; break;
    case 's':  bx = anchor.x - finalW / 2; by = anchor.y; break;
    case 'se': bx = anchor.x; by = anchor.y; break;
    default:   bx = anchor.x; by = anchor.y; break;
  }
  return { bbox: { x: bx, y: by, w: finalW, h: finalH }, widgets };
}
```

### 3.3 Caveat (documented in §1.2)

If any selected widget has `rotate ≠ 0`, group-resize math operates on the unrotated `(x, y, w, h)` AABB. The rendered transform applies rotate AFTER position/size, so visual position may drift from the bbox handles. Acceptable simplification for 3b.2.3.

---

## 4. FSM, Callbacks & Component Integration

### 4.1 PointerState union extension (5 → 7 variants)

Existing 5 + 2 new:

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean }
  | { kind: 'drag-rotate'; widgetId: string; startPt: Point; pivot: Point; startBox: Box; startRotate: number }
  | { kind: 'group-rotate'; widgetIds: string[]; startPt: Point; pivot: Point; startBboxes: Map<string, Box>; startRotates: Map<string, number>; startBbox: Box }
  | { kind: 'group-resize'; widgetIds: string[]; handle: HandleId; startPt: Point; startBbox: Box; startBoxes: Map<string, Box>; anchor: Point };
```

### 4.2 PointerToolsCallbacks adds 2 fields (14 → 16 total)

```ts
getCurrentRotates: (ids: string[]) => Map<string, number>;
onGroupRotated: (entries: { id: string; newBox: Box; newRotate: number }[]) => void;
```

Reuse: `getWidgetBoxes`, `onWidgetTransformedBatch` (for group-resize commit), `onRotateMove` (tooltip), `onDragVisualUpdate`.

### 4.3 `handleMouseDown` bbox-mode routing

`handle` non-null branch resolves widget set differently based on selection size:

```ts
if (handle) {
  const selectedIds = this.cb.getSelectedIds();

  // Multi-select bbox mode
  if (selectedIds.length >= 2) {
    const startBoxes = this.cb.getWidgetBoxes(selectedIds);
    if (startBoxes.size === 0) return;
    const startBbox = computeBbox(Array.from(startBoxes.values()));
    if (handle === 'rotate') {
      const pivot: Point = { x: startBbox.x + startBbox.w / 2, y: startBbox.y + startBbox.h / 2 };
      const startRotates = this.cb.getCurrentRotates(selectedIds);
      this.state = {
        kind: 'group-rotate',
        widgetIds: selectedIds,
        startPt: pt,
        pivot,
        startBboxes: startBoxes,
        startRotates,
        startBbox,
      };
    } else {
      const anchor = anchorOf(handle, startBbox);
      this.state = {
        kind: 'group-resize',
        widgetIds: selectedIds,
        handle,
        startPt: pt,
        startBbox,
        startBoxes,
        anchor,
      };
    }
    return;
  }

  // Single-select (existing 3b.2.2 path unchanged)
  if (selectedIds.length !== 1) return;
  // ... existing drag-rotate / drag-handle logic
}
```

### 4.4 `handleMouseMove` — 2 new branches

Insert BEFORE existing single-select `drag-rotate` branch (consistent state ordering):

```ts
if (this.state.kind === 'group-rotate') {
  const snapStep = e.shiftKey ? 15 : 0;
  const result = applyMultiRotate(this.state.startBboxes, this.state.startRotates, this.state.pivot, this.state.startPt, pt, snapStep);
  for (const [id, { box, rotate }] of result) {
    this.canvas.upsertWidget({
      id, type: 'svg-ext-value' as any, property: {} as any,
      x: box.x, y: box.y, w: box.w, h: box.h, rotate,
    } as any);
  }
  const newBbox = computeBbox(Array.from(result.values()).map((v) => v.box));
  this.handles.updateBox(newBbox);
  // Compute delta for tooltip
  const a0 = Math.atan2(this.state.startPt.y - this.state.pivot.y, this.state.startPt.x - this.state.pivot.x);
  const a1 = Math.atan2(pt.y - this.state.pivot.y, pt.x - this.state.pivot.x);
  let delta = (a1 - a0) * 180 / Math.PI;
  if (snapStep > 0) delta = Math.round(delta / snapStep) * snapStep;
  delta = ((delta % 360) + 360) % 360;
  this.cb.onRotateMove(delta, this.state.pivot);
  return;
}

if (this.state.kind === 'group-resize') {
  const dx = pt.x - this.state.startPt.x;
  const dy = pt.y - this.state.startPt.y;
  const newBbox = applyHandleDrag(this.state.startBbox, this.state.handle, dx, dy);
  const aspectLock = e.shiftKey;
  const result = applyGroupResize(this.state.startBbox, newBbox, this.state.handle, this.state.startBoxes, aspectLock);
  if (!result) return;  // min-size freeze
  for (const [id, box] of result.widgets) {
    this.canvas.upsertWidget({
      id, type: 'svg-ext-value' as any, property: {} as any,
      x: box.x, y: box.y, w: box.w, h: box.h,
    } as any);
  }
  this.handles.updateBox(result.bbox);
  this.cb.onDragVisualUpdate(result.bbox);
  return;
}
```

### 4.5 `handleMouseUp` — 2 new branches

```ts
if (this.state.kind === 'group-rotate') {
  const snapStep = e.shiftKey ? 15 : 0;
  const result = applyMultiRotate(this.state.startBboxes, this.state.startRotates, this.state.pivot, this.state.startPt, pt, snapStep);
  let changed = false;
  const entries: { id: string; newBox: Box; newRotate: number }[] = [];
  for (const [id, { box, rotate }] of result) {
    const sb = this.state.startBboxes.get(id)!;
    const sr = this.state.startRotates.get(id) ?? 0;
    if (box.x !== sb.x || box.y !== sb.y || rotate !== sr) changed = true;
    entries.push({ id, newBox: box, newRotate: rotate });
  }
  if (changed) this.cb.onGroupRotated(entries);
  this.state = { kind: 'idle' };
  this.cb.onRotateMove(null, null);
  return;
}

if (this.state.kind === 'group-resize') {
  const dx = pt.x - this.state.startPt.x;
  const dy = pt.y - this.state.startPt.y;
  if (dx === 0 && dy === 0) {
    this.state = { kind: 'idle' };
    this.cb.onDragVisualUpdate(null);
    return;
  }
  const newBbox = applyHandleDrag(this.state.startBbox, this.state.handle, dx, dy);
  const aspectLock = e.shiftKey;
  const result = applyGroupResize(this.state.startBbox, newBbox, this.state.handle, this.state.startBoxes, aspectLock);
  if (result) {
    const entries = Array.from(result.widgets, ([id, box]) => ({ id, newBox: box }));
    this.cb.onWidgetTransformedBatch(entries);
  }
  this.state = { kind: 'idle' };
  this.cb.onDragVisualUpdate(null);
  return;
}
```

### 4.6 `cancel()` — 2 new branches

Insert BEFORE existing drag-rotate / drag-body branches:

```ts
if (this.state.kind === 'group-rotate') {
  for (const [id, sb] of this.state.startBboxes) {
    const sr = this.state.startRotates.get(id) ?? 0;
    this.canvas.upsertWidget({
      id, type: 'svg-ext-value' as any, property: {} as any,
      x: sb.x, y: sb.y, w: sb.w, h: sb.h, rotate: sr,
    } as any);
  }
  this.handles.updateBox(this.state.startBbox);
  this.state = { kind: 'idle' };
  this.cb.onRotateMove(null, null);
  return;
}

if (this.state.kind === 'group-resize') {
  for (const [id, sb] of this.state.startBoxes) {
    this.canvas.upsertWidget({
      id, type: 'svg-ext-value' as any, property: {} as any,
      x: sb.x, y: sb.y, w: sb.w, h: sb.h,
    } as any);
  }
  this.handles.updateBox(this.state.startBbox);
  this.state = { kind: 'idle' };
  this.cb.onDragVisualUpdate(null);
  return;
}
```

### 4.7 `transform-handles.showBbox()` rewrite

Current (SP-FX-3b.2.1) hides all 9 handles in bbox mode. 3b.2.3 shows them at bbox positions:

```ts
showBbox(bbox: Box): void {
  this.currentBox = bbox;
  this.visible = true;
  this.mode = 'bbox';
  this.group.attr('visibility', 'visible');
  this.selectionRect.attr('stroke-dasharray', BBOX_DASH);
  // SP-FX-3b.2.3: all 9 handles + 4 corners visible in bbox mode
  for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
    this.handles[id].attr('visibility', 'visible');
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
  // SP-FX-3b.2.3: position 9 handles at bbox edges
  const positions = handlePositions(bbox);
  for (const id in positions) {
    const p = positions[id as HandleId];
    this.handles[id as HandleId].attr('x', p.x - HANDLE_HALF).attr('y', p.y - HANDLE_HALF);
  }
}
```

`hitTest()` already uses `currentBox` (set to bbox in bbox mode) → handles interactive at bbox positions.

### 4.8 EditorCanvas integration

PointerTools ctor adds 2 cb (no Refs change, no lifecycle change):

```ts
getCurrentRotates: (ids) => {
  const view = useEditorStore.getState().currentView;
  const m = new Map<string, number>();
  if (!view) return m;
  for (const id of ids) {
    const r = (view.items[id] as { rotate?: number } | undefined)?.rotate;
    if (typeof r === 'number') m.set(id, r);
  }
  return m;
},
onGroupRotated: (entries) => {
  if (entries.length === 0) return;
  const store = useEditorStore.getState();
  for (let i = 0; i < entries.length - 1; i++) {
    const e = entries[i];
    const patch = {
      x: e.newBox.x, y: e.newBox.y, w: e.newBox.w, h: e.newBox.h,
      rotate: e.newRotate === 0 ? undefined : e.newRotate,
    };
    store.updateWidget(e.id, patch as Partial<FuxaWidget>, { silent: true });
  }
  const last = entries[entries.length - 1];
  const lastPatch = {
    x: last.newBox.x, y: last.newBox.y, w: last.newBox.w, h: last.newBox.h,
    rotate: last.newRotate === 0 ? undefined : last.newRotate,
  };
  store.updateWidget(last.id, lastPatch as Partial<FuxaWidget>);
},
```

ESC handler already covers all non-idle states (calls `pointer.cancel()`) — no keyboard useEffect change.

---

## 5. Test Plan

### 5.1 Vitest unit tests

| File | New tests | Coverage |
|------|-----------|----------|
| `geometry.test.ts` | +6 | applyMultiRotate empty/single/2-widget/snap; applyGroupResize SE-corner-2x; aspect-lock min-absolute |
| `pointer-tools.test.ts` | +10 | mousedown rotate (bbox)→group-rotate; mousedown corner (bbox)→group-resize; mousedown edge (bbox)→group-resize; group-rotate move 90°; group-rotate mouseup commits; group-rotate cancel; group-resize SE scale; group-resize Shift aspect; group-resize min-size freeze; group-resize cancel |
| `transform-handles.test.ts` | +4 | showBbox renders 8 handles + rotate + 4 corners visible; layoutBbox positions handles at bbox edges; showBbox→show transition restores single mode; bbox hitTest finds rotate handle above bbox |
| `canvas-svg.test.ts` | +2 | upsertWidget rotate update via patch (30→60); upsertWidget rotate=undefined removes transform |
| `editor-store.test.ts` | +2 | updateWidget multi-key patch (x+y+rotate together); mixed delete+set ({rotate: undefined, x: 100}) |
| `EditorCanvas.test.tsx` | +8 | multi-select bbox shows all handles; group-rotate 90° integration; group-rotate Shift snap; group-rotate ESC restores; group-resize SE 2x; group-resize Shift aspect; group-resize N edge 1D; single-select still shows single mode |

**Total unit:** +32. Target: **613 → 645**.

### 5.2 Playwright e2e (+3 → 20 total)

Create `packages/web-ui/e2e/scada-editor-canvas-3b2-3.spec.ts`:

- `Multi-select rotate handle 90° drag: w1+w2 store rotate ≈ 90, positions orbited around bbox center`
- `Multi-select SE corner drag +50 +50: both widgets w/h grew proportionally; NW anchor unchanged`
- `Multi-select Shift+NE corner uneven drag: aspect ratio of bbox preserved post-drag`

### 5.3 Regression Targets

- web-ui: **613 → 645** (+32)
- server: 147 (unchanged)
- data-service: 84 (unchanged)
- Playwright: **17 → 20** (+3)
- tsc: clean

---

## 6. File Structure

### 6.1 Modified

- `packages/web-ui/src/scada-engine/editor/geometry.ts` (applyMultiRotate, applyGroupResize, anchorOf)
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` (showBbox rewrite + layoutBbox extension)
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` (PointerState +2, cb +2, handlers +2 branches each, cancel +2 branches)
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` (PointerTools ctor +2 cb wired)
- `packages/web-ui/src/scada-engine/editor/index.ts` (re-export applyMultiRotate, applyGroupResize, anchorOf)
- 6 corresponding `__tests__/*.ts(x)` files (test additions)

### 6.2 Created

- `packages/web-ui/e2e/scada-editor-canvas-3b2-3.spec.ts` (3 smoke)

### 6.3 Not Modified

- `canvas-svg.ts` (`upsertWidget` already honors `rotate` from SP-FX-3b.2.2 — group-rotate/resize reuses)
- `models/widget.ts` (schema rotate field already added in 3b.2.2 T0)
- `editor-store.ts` (key-aware patch already done in 3b.2.2 T1)
- `canvasMock.ts` (no new mock methods needed — upsertWidget covers all use cases)

---

## 7. Constraints

- All user-facing replies in 简体中文.
- AI / automation / animation / expression-eval may never write directly to PLC (out-of-scope).
- HMI manual set-value continues via `writeTag → WS → server` (SP-FX-2, out-of-scope).
- TDD RED-first strictly enforced.
- macOS BSD sed: literal substitutions only.
- `pnpm` via `export PATH=$HOME/.hermes/node/bin:$PATH`.
- No new third-party dependencies.

---

## 8. Stop Conditions

1. Bbox mode (selectedIds≥2) shows 8 resize handles + rotate handle + 4 corner indicators (all `visibility=visible` at bbox positions).
2. Group-rotate via rotate handle drag updates each widget's `(x, y)` + `rotate` field; widgets rotate as rigid body around bbox center.
3. Group-rotate Shift held snaps delta to 15°.
4. Group-resize via corner/edge handle drag scales all widgets proportionally; anchor at opposite corner/edge stays fixed.
5. Group-resize Shift on corner locks aspect ratio (uniform scale = min absolute).
6. Group-resize freezes (no live update) when any widget projects `w < 5` or `h < 5`.
7. ESC mid-group-rotate / mid-group-resize restores all widget startBoxes + startRotates; no history entry.
8. Group operation commits 1 history entry per drag (silent batching: i<N-1 silent, last non-silent).
9. Existing single-select drag-rotate / drag-handle / drag-body paths preserved (regression: 33 pointer-tools tests + 29 EditorCanvas tests stay green).
10. Baselines: web-ui 645/645, server 147/147, data-service 84/84, tsc clean, Playwright 20/20.

If any fails → STOP, surface, no push.

---

## 9. Acceptance Criteria

- §8 stop conditions all green.
- `/dev/scada-editor-canvas` manual smoke:
  - Ctrl+A → bbox shows 4 corners + 8 resize handles + rotate handle.
  - Drag rotate handle 90° → both widgets orbit bbox center; widget.rotate += 90.
  - Drag SE corner +100 +50 → both widgets scale toward NW anchor; bbox grows.
  - Shift + drag NE corner uneven → aspect locked.
  - Drag N edge down 30 → only h shrinks (anchor at S edge); x/w unchanged.
  - ESC mid-rotate → widgets return to startBoxes.
  - Ctrl+Z after group-resize → all widgets back in one undo step.
- web-ui 645/645 + server 147 + data-service 84 + tsc clean + Playwright 20/20.
- Editor module ready for future increments (rotated-bbox group-resize, group-skew).
