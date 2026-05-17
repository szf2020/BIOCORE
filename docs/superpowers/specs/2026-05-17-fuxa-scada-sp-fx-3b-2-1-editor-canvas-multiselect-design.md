# SP-FX-3b.2.1 Editor Canvas Multi-Select + Box-Select + 4 UX — Design

**Status:** Draft (awaiting user review)
**Date:** 2026-05-17
**Parent:** SP-FX-3 (FUXA editor canvas port)
**Predecessor:** SP-FX-3b.1 (snap-grid + ESC cancel + Arrow nudge + Ctrl+Z/Y + 8-handle e2e + keyboard listener, commit `97fd7b6`)
**Successor:** SP-FX-3b.2.2 (real rotate + multi-select group-resize)

---

## 1. Scope

### 1.1 In-scope (6 features)

1. **Multi-select** — `Shift+click` toggles widget in selection; click without modifier replaces; `Ctrl+A` selects all widgets in current view.
2. **Multi-select drag** — when `selection.length >= 2` and user drags a selected widget body, all selected widgets move together with the same delta; single history entry per drag.
3. **Box-select** — mousedown on empty area enters new `box-select` FSM state; rubber-band rect renders during drag; mouseup selects widgets whose AABB intersects the box. Click vs drag distinguished by 3-px threshold.
4. **Nudge coalesce** — keydown-initiated Arrow press pushes 1 history entry; subsequent autorepeat events apply the same delta without pushing history; keyup resets the coalesce state.
5. **Dynamic gridSize** — `editorStore.gridSize` replaces SP-FX-3b.1 const. `setGridSize(n)` accepts 8/10/16/20. UI control deferred to SP-FX-4 toolbar.
6. **Snap visual feedback** — during drag, dashed H/V guide lines render through the snapped top-left corner across full viewBox.

Plus tiered ESC behavior:
- Tier 1 — pointer not idle: `pointer.cancel()` (SP-FX-3b.1 existing behavior).
- Tier 2 — idle + selection non-empty: clear selection.
- Tier 3 — idle + selection empty: no-op.

### 1.2 Out-of-scope (deferred to SP-FX-3b.2.2)

- Real rotate handle (math + svg transform + `applyHandleDrag` rotate case)
- Multi-select group resize (8 handles on bbox; proportional scale across N widgets)
- Rotation of N selected widgets (around group center vs individual centers)

### 1.3 Constraints

- TDD RED-first.
- AI / 自动逻辑 / animation / expression-eval **never write PLC directly** (this SP does not touch runtime path).
- HMI manual `set-value` actions go through `writeTag → WS → server` (SP-FX-2 path); this SP is editor-only.
- No new third-party dependencies.
- All user-facing replies in 简体中文.

### 1.4 Test count target

- web-ui vitest: 551 → **~583** (+32: 6 geo + 5 store + 4 handles + 8 pointer + 9 React)
- Playwright: 10 → **15** (+5 multi-select / box-select / Ctrl+A / multi-drag / ESC)

---

## 2. File Structure

```
packages/web-ui/src/scada-engine/
├── services/
│   ├── editor-store.ts             [MODIFY]
│   │   + gridSize: number (state, default 10, replaces module GRID_SIZE const)
│   │   + setGridSize(n: 8|10|16|20) (no history push, validates whitelist)
│   │   + updateWidget(id, patch, opts?: { silent?: boolean }) (silent=true skips history push)
│   │   - GRID_SIZE @deprecated re-export kept as `export const GRID_SIZE = 10` for SP-FX-3b.1 compatibility
│   └── __tests__/editor-store.test.ts [MODIFY] +5 tests
├── editor/
│   ├── geometry.ts                 [MODIFY]
│   │   + computeBbox(boxes: Box[]): Box
│   │   + intersectsBox(a: Box, b: Box): boolean
│   │   + applyMultiDrag(boxes: Box[], dx: number, dy: number): Box[]
│   ├── __tests__/geometry.test.ts  [MODIFY] +6 tests
│   ├── canvas-svg.ts               [unchanged]
│   ├── transform-handles.ts        [MODIFY]
│   │   + showBbox(bbox: Box): void  (multi-select mode: dashed bbox + 4 corner indicators, hide resize handles)
│   │   + new class SnapGuides exported (H/V dashed guides via reusable <line>)
│   ├── __tests__/transform-handles.test.ts [MODIFY] +4 tests
│   ├── pointer-tools.ts            [MODIFY]
│   │   + state 'box-select' { startPt; currentPt; shiftKey }
│   │   + drag-body state: widgetIds: string[] + startBoxes: Map<string, Box>
│   │   + PointerToolsCallbacks: getSelectedIds, getWidgetBoxes, getAllWidgetBoxes, onBoxSelect, onWidgetTransformedBatch, onDragVisualUpdate, onBoxSelectMove
│   │   + onSelect signature extended: (id: string | null, additive: boolean) => void
│   │   + CLICK_DRAG_THRESHOLD = 3 (px in client coords)
│   ├── __tests__/pointer-tools.test.ts [MODIFY] +8 tests
│   ├── EditorCanvas.tsx            [MODIFY]
│   │   + PointerTools cb wires all new callbacks
│   │   + handles.show ↔ handles.showBbox switch based on selection.length
│   │   + SnapGuides instantiated alongside TransformHandles; show on onDragVisualUpdate(box), hide on null
│   │   + rubberBand <rect> in overlay layer; toggled by onBoxSelectMove
│   │   + keyboard: Ctrl+A select all, ESC 3-tier, nudge coalesce (nudgeStateRef.lastKey)
│   │   + keyup handler resets nudgeStateRef
│   │   + window blur listener resets nudgeStateRef
│   └── __tests__/EditorCanvas.test.tsx [MODIFY] +9 tests
└── e2e/
    └── scada-editor-canvas-3b2-1.spec.ts [NEW] 5 Playwright smoke
```

---

## 3. Type Contract

### 3.1 `editor-store.ts`

```ts
/** @deprecated Read editorStore.gridSize instead */
export const GRID_SIZE = 10;

export interface EditorData {
  currentView: FuxaView | null;
  isDirty: boolean;
  history: { past: FuxaView[]; future: FuxaView[] };
  selection: string[];
  snapEnabled: boolean;
  gridSize: number;  // NEW, default 10
}

export interface EditorActions {
  // existing...
  setGridSize: (n: number) => void;
  updateWidget: (id: string, patch: Partial<FuxaWidget>, opts?: { silent?: boolean }) => void;  // EXTEND
}
```

`setGridSize` impl:
```ts
setGridSize: (n) => {
  if (![8, 10, 16, 20].includes(n)) return;
  _store.setState({ gridSize: n });
}
```

`updateWidget` impl:
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
}
```

### 3.2 `geometry.ts`

```ts
export function computeBbox(boxes: Box[]): Box;
//   Empty array → {x:0,y:0,w:0,h:0}.
//   Else: minX/minY/maxX/maxY across boxes; w=maxX-minX, h=maxY-minY.

export function intersectsBox(a: Box, b: Box): boolean;
//   AABB overlap: !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y).
//   Edge-touch counts as intersect.

export function applyMultiDrag(boxes: Box[], dx: number, dy: number): Box[];
//   Each box translated, w/h preserved.
```

### 3.3 `transform-handles.ts`

```ts
export class TransformHandles {
  // existing: show(box), hide(), updateBox(box), hitTest(pt)

  showBbox(bbox: Box): void;
  //   Multi-select mode: dashed bbox + 4 small corner indicator rects.
  //   Hide the 8 resize handles + rotate handle.
  //   Reuse selection-rect DOM with stroke-dasharray="6 3" for distinct look.

  // hide() also restores resize-handle state for next single-select.
}

export class SnapGuides {
  constructor(overlay: G);
  //   <g data-overlay="snap-guides" visibility="hidden"> inside overlay layer.
  //   Inside: 2 reusable <line> (data-guide="h" + data-guide="v"),
  //     stroke="#ec4899", stroke-dasharray="3 2", stroke-width=1, pointer-events="none".

  show(snappedBox: Box, viewBox: { w: number; h: number }): void;
  //   H line: x1=0, y1=box.y, x2=viewBox.w, y2=box.y.
  //   V line: x1=box.x, y1=0, x2=box.x, y2=viewBox.h.

  hide(): void;
  destroy(): void;
}
```

### 3.4 `pointer-tools.ts`

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean };

export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null, additive: boolean) => void;    // EXTEND
  getSnapEnabled: () => boolean;
  getSelectedIds: () => string[];                                // NEW
  getWidgetBoxes: (ids: string[]) => Map<string, Box>;           // NEW
  getAllWidgetBoxes: () => Map<string, Box>;                     // NEW
  onBoxSelect: (idsInBox: string[], additive: boolean) => void;  // NEW
  onWidgetTransformedBatch: (entries: { id: string; newBox: Box }[]) => void;  // NEW
  onDragVisualUpdate: (box: Box | null) => void;                 // NEW
  onBoxSelectMove: (rect: Box | null) => void;                   // NEW
}

export class PointerTools {
  private static CLICK_DRAG_THRESHOLD = 3;  // px
  // existing methods + cancel()
}
```

`handleMouseDown` flow:
```
1. pt = clientPt(e)
2. handle = handles.hitTest(pt); if handle: drag-handle (unchanged)
3. widgetHit = getWidgetAt(pt)
4. if widgetHit and e.shiftKey: onSelect(widgetHit.id, true); state stays idle
5. if widgetHit and id in getSelectedIds() and selected.length >= 2:
     startBoxes = getWidgetBoxes(selected)
     state = drag-body { widgetIds: selected, startBoxes }
6. if widgetHit (else): onSelect(widgetHit.id, false); state = drag-body single widget
7. empty: state = box-select { startPt, currentPt: startPt, shiftKey }; defer onSelect to mouseup
```

`handleMouseMove`:
- drag-body: compute newBoxes per widget; snap each if enabled; canvas.upsertWidget per widget; handles.updateBox (single box or bbox); onDragVisualUpdate(bbox or single).
- drag-handle: SP-FX-3b.1 path; onDragVisualUpdate(newBox).
- box-select: currentPt = pt; onBoxSelectMove(rect).

`handleMouseUp`:
- drag-body: short-circuit if dx=dy=0. Else compute newBoxes; onWidgetTransformedBatch(entries). state=idle. onDragVisualUpdate(null).
- drag-handle: unchanged from SP-FX-3b.1. onDragVisualUpdate(null).
- box-select: Chebyshev distance < 3 → onSelect(null, shiftKey); else compute idsInBox via intersectsBox over getAllWidgetBoxes(), call onBoxSelect(idsInBox, shiftKey). state=idle. onBoxSelectMove(null).

`cancel`:
- drag-body: restore all widgets via canvas.upsertWidget(startBoxes); handles.updateBox(bbox or single); state=idle; onDragVisualUpdate(null).
- drag-handle: SP-FX-3b.1 path.
- box-select: state=idle; onBoxSelectMove(null).
- idle: no-op.

### 3.5 `EditorCanvas.tsx`

Refs:
```tsx
const refs = useRef<{
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
  snapGuides: SnapGuides;
  rubberBand: SVGRectElement;
} | null>(null);

const nudgeStateRef = useRef<{ lastKey: string | null }>({ lastKey: null });
```

PointerTools cb (all new callbacks):
```ts
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
```

Selection useEffect updated to dispatch between show / showBbox / hide:
```tsx
useEffect(() => {
  if (!refs.current || !currentView) return;
  if (selection.length === 0) { refs.current.handles.hide(); return; }
  if (selection.length === 1) {
    const g = getWidgetGeom(currentView.items[selection[0]]);
    if (g) refs.current.handles.show(g);
    else refs.current.handles.hide();
    return;
  }
  const boxes: Box[] = [];
  for (const id of selection) {
    const g = getWidgetGeom(currentView.items[id]);
    if (g) boxes.push(g);
  }
  if (boxes.length === 0) refs.current.handles.hide();
  else refs.current.handles.showBbox(computeBbox(boxes));
}, [selection, items]);
```

Keyboard handler (extends SP-FX-3b.1):
```tsx
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

New useEffect for gridSize:
```tsx
const gridSize = useEditorStore((s) => s.gridSize);
useEffect(() => {
  if (!refs.current) return;
  refs.current.canvas.setGridVisible(useEditorStore.getState().snapEnabled, gridSize);
}, [gridSize]);
```

---

## 4. Data Flow

### 4.1 Click widget body (single-select replace)

```
mousedown w2 (selection=['w1'], no Shift)
  → handle hit null, widgetHit={id:'w2', box}; w2 not in selected
  → cb.onSelect('w2', false) → setSelection(['w2'])
  → state = drag-body { widgetIds:['w2'], startBoxes }
mouseup same pt (dx=dy=0)
  → drag-body mouseup: short-circuit (no Batch)
  → state = idle
```

### 4.2 Shift+click widget (toggle)

```
selection=['w1','w2'], Shift+click w3
  → cb.onSelect('w3', true) → addToSelection('w3') → ['w1','w2','w3']
  → state stays idle
```

### 4.3 Ctrl+A select all

```
Ctrl+A → setSelection(Object.keys(currentView.items))
  → useEffect[selection, items] → handles.showBbox(computeBbox(boxes))
```

### 4.4 Multi-select drag-body (1 history entry)

```
selection=['w1','w2','w3'], mousedown on w1 no Shift
  → w1 in selected, selected.length>=2 → state=drag-body { widgetIds:['w1','w2','w3'], startBoxes }
mousemove dx=13 dy=18 snap ON
  → per id: snap each newBox; canvas.upsertWidget per id; handles.updateBox(bbox); onDragVisualUpdate(bbox)
mouseup
  → onWidgetTransformedBatch([{w1,nb1},{w2,nb2},{w3,nb3}])
    → updateWidget(w1, nb1, {silent:true}); updateWidget(w2, nb2, {silent:true}); updateWidget(w3, nb3) → 1 history entry
  → state=idle; snapGuides.hide()
```

### 4.5 Box-select rubber-band

```
mousedown empty (50,50) no Shift
  → state=box-select { startPt:(50,50), currentPt:(50,50), shiftKey:false }
mousemove (150,200) distance 150 ≥ 3
  → currentPt=(150,200); rect={x:50,y:50,w:100,h:150}
  → cb.onBoxSelectMove(rect) → rubberBand visible
mouseup (150,200)
  → distance ≥ 3 → box-select commit
  → finalBox; iterate cb.getAllWidgetBoxes(); intersectsBox per widget
  → cb.onBoxSelect(idsInBox, false) → setSelection(idsInBox)
  → state=idle; rubberBand hidden
```

Click on empty (distance < 3):
```
mouseup (51,50): distance 1 < 3 → cb.onSelect(null, false) → setSelection([])
```

### 4.6 Arrow nudge coalesce

```
ArrowRight first press → lastKey=null → isRepeat=false → push history +1; lastKey='ArrowRight'
ArrowRight repeat → e.repeat=true → silent → no push
keyup ArrowRight → lastKey=null
ArrowRight fresh → push +1
```

### 4.7 ESC 3-tier

```
Tier 1: pointer not idle → cancel().
Tier 2: idle + selection non-empty → setSelection([]); preventDefault.
Tier 3: idle + selection empty → no-op.
```

### 4.8 setGridSize

```
setGridSize(20) → state.gridSize=20
  → useEffect[gridSize] → canvas.setGridVisible(snapEnabled, 20) → grid bg redrawn
  → next pointer drag reads state.gridSize=20 for snap
```

---

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| `computeBbox([])` | Returns `{x:0,y:0,w:0,h:0}`. |
| `computeBbox` with NaN/Infinity | Not defended. Upstream Box finite (zod). |
| `intersectsBox` with 0×0 box | Edge-touch counts as intersect. Accepted. |
| `applyMultiDrag([], dx, dy)` | Returns `[]`. |
| Multi-drag widget without x/y | Skipped from startBoxes Map; drag-body iterates Map entries only. |
| Multi-drag widget deleted mid-drag | updateWidget early-returns on missing; batch's non-silent commit targets last surviving widget. If all deleted, no history (accepted). |
| Box-select fully off-canvas | idsInBox=[]; setSelection([]). |
| Box-select + ESC mid-drag | Tier 1: pointer.cancel(); rubber-band hidden; no onBoxSelect. selection unchanged. |
| 3-px click/drag threshold edge | Chebyshev distance; < 3 → click semantics; ≥ 3 → drag commit. |
| Box-select Shift+drag | shiftKey captured at mousedown; mouseup additive=true → merge with selection. |
| Ctrl+A, currentView null | early return. |
| Ctrl+A, items empty | setSelection([]). |
| Ctrl+A, activeElement=INPUT | Top-of-handler guard blocks. Browser text select-all applies. |
| nudge `e.repeat` unsupported | Fallback `lastKey === e.key`. Tested. |
| nudge key switch | lastKey changes; isRepeat=false; new history entry. |
| nudge blur | `window.blur` listener resets lastKey=null. |
| nudge selection includes widget without x/y | Filtered via `survivingIds`. |
| setGridSize non-whitelist | silent reject. |
| setGridSize during drag | Pointer reads state.gridSize per frame; new value applies next mousemove. |
| GRID_SIZE deprecated re-export | Kept for SP-FX-3b.1 compat; subsequent SP removes. |
| ESC tier transitions | Tier 1 → 2 → 3 in priority order. |
| SnapGuides after destroy | `destroyed` flag; subsequent show is no-op. |
| Multi-drag dx=dy=0 mouseup | Short-circuit; no Batch fire. |
| onSelect(null, true) (Shift+click empty) | No-op (don't clear). |
| Cancel multi-drag | All widgets restored; no Batch fire. |
| Rubber-band rect intercepts widget click | `pointer-events="none"`. |
| EditorCanvas unmount during drag | Cleanup → pointer.destroy() → all listeners + DOM removed. |

---

## 6. Testing

### 6.1 Pure (geometry) — +6 tests

```
geometry.computeBbox (SP-FX-3b.2.1):
  - empty array → {0,0,0,0}
  - single box → same box
  - 2 disjoint boxes → union min/max

geometry.intersectsBox (SP-FX-3b.2.1):
  - disjoint → false
  - overlapping + edge-touch → true

geometry.applyMultiDrag (SP-FX-3b.2.1):
  - empty → []; translation preserves w/h
```

### 6.2 jsdom (editor-store) — +5 tests

```
editorStore gridSize + setGridSize (SP-FX-3b.2.1):
  - default gridSize === 10
  - setGridSize(20) sets state; history unchanged
  - setGridSize(12) silent reject

editorStore updateWidget silent (SP-FX-3b.2.1):
  - updateWidget(id, patch, {silent:true}) applies patch; history unchanged
  - updateWidget default pushes history (regression)
```

### 6.3 jsdom (transform-handles) — +4 tests

```
TransformHandles.showBbox (SP-FX-3b.2.1):
  - showBbox renders dashed bbox + 4 corner indicators; resize handles hidden
  - showBbox followed by show(single) restores 8-handle mode

SnapGuides (SP-FX-3b.2.1):
  - show(box, viewBox) renders H at y=box.y and V at x=box.x spanning viewBox
  - hide() sets visibility=hidden; idempotent
```

### 6.4 State machine (pointer-tools) — +8 tests

```
PointerTools multi + box-select (SP-FX-3b.2.1):
  - drag-body single widget regression (widgetIds=[id])
  - drag-body multi: mousemove updates N canvas + bbox; mouseup fires onWidgetTransformedBatch
  - drag-body multi cancel(): all widgets restored
  - Shift+click body: onSelect(id, true) + state stays idle
  - mousedown empty → state=box-select; mousemove ≥3 → onBoxSelectMove(rect)
  - mousedown empty + mouseup within 3px → onSelect(null, false)
  - box-select Shift+drag → onBoxSelect(ids, true)
  - drag-body dx=dy=0 mouseup → no onWidgetTransformedBatch
```

### 6.5 React (EditorCanvas) — +9 tests

```
EditorCanvas SP-FX-3b.2.1:
  - Ctrl+A selects all items in currentView
  - Ctrl+A while activeElement=INPUT does NOT trigger
  - Arrow with selection N>=2: all widgets move; 1 history entry
  - Arrow nudge first press +1 history; e.repeat=true: no push; new fresh +1
  - ESC tier 1: drag→idle; no selection change
  - ESC tier 2: idle + selection non-empty → []
  - ESC tier 3: idle + selection empty → no-op
  - selection.length >= 2: handles render as bbox
  - setGridSize → grid bg redrawn (canvas.setGridVisible called with new size)
```

### 6.6 Playwright e2e — +5 smoke

```
e2e/scada-editor-canvas-3b2-1.spec.ts:
  beforeEach: login + goto /dev/scada-editor-canvas + __resetEditorStore

  - Shift+click adds widget to selection
  - Ctrl+A selects all widgets
  - Box-select rubber-band selects intersecting widgets
  - Multi-select drag moves all selected widgets together
  - ESC clears selection
```

### 6.7 Coverage matrix

| Feature | Pure | jsdom | State machine | React | Playwright |
|---|---|---|---|---|---|
| computeBbox / intersectsBox / applyMultiDrag | 6 | - | - | - | - |
| gridSize + setGridSize | - | 3 | - | 1 | - |
| updateWidget silent | - | 2 | - | - | - |
| showBbox + SnapGuides | - | 4 | - | 1 | - |
| multi-drag FSM | - | - | 4 | 1 | 1 |
| box-select FSM | - | - | 3 | - | 1 |
| Shift+click | - | - | 1 | - | 1 |
| Ctrl+A | - | - | - | 2 | 1 |
| nudge coalesce | - | - | - | 2 | - |
| ESC tiered | - | - | - | 3 | 1 |

---

## 7. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | PointerState union change (drag-body widgetId→widgetIds) breaks SP-FX-3b.1 tests | Update existing tests' state assertions to `state.widgetIds[0]`. |
| R2 | GRID_SIZE const→state migration breaks SP-FX-3b.1 imports | Keep `@deprecated` re-export; migrate consumers. |
| R3 | Multi-drag batch with deleted widget | Reverse-iteration commits non-silent on surviving widget; if all deleted, no history (accepted). |
| R4 | nudge `e.repeat` browser compat | Double-check `e.repeat OR lastKey === e.key`. |
| R5 | nudge blur leaves lastKey stuck | `window.blur` listener resets. |
| R6 | Ctrl+A conflict with INPUT text select-all | Top-of-handler activeElement guard. |
| R7 | Rubber-band rect intercepts widget click | `pointer-events="none"`. |
| R8 | box-select Shift triggers Ctrl+A coincidentally | Independent handlers; no interaction. |
| R9 | Multi-drag snap per-widget vs per-bbox | Decision: per-widget independently. Matches single-drag. |
| R10 | snapGuides for multi-drag bbox | Guides drawn on bbox top-left only. |
| R11 | ESC tier misroute | 3 explicit tests. |
| R12 | drag-body external selection change mid-drag | startBoxes captured at mousedown; later setSelection ignored by in-progress drag. |
| R13 | `intersectsBox` floating-point | Integer coords post-snap; `≤`/`≥` not strict equality. |
| R14 | Batch commit consistency nudge vs drag | Same pattern: silent N-1, non-silent last. |
| R15 | EditorCanvas useEffect deps growth | Zustand selectors field-granular. gridSize change paints grid bg, no remount. |
| R16 | setGridSize during drag | Per-frame read; new value applies next mousemove. |

---

## 8. Stop Conditions

| Condition | Measurement |
|---|---|
| Multi-select drag 3+ widgets move together (1 history entry) | pointer-tools test + Playwright |
| Box-select rubber-band picks intersecting widgets | pointer-tools test + Playwright |
| Shift+click toggles widget in selection | pointer-tools test + Playwright |
| Ctrl+A selects all (INPUT activeElement does not trigger) | EditorCanvas test |
| Nudge single +1 history; long-press +1 history | EditorCanvas test |
| ESC tier 1/2/3 correct | EditorCanvas test |
| setGridSize(20) repaints + next drag uses 20 snap | editor-store test + EditorCanvas test |
| SnapGuides show during drag, hide on mouseup | transform-handles + EditorCanvas test |
| web-ui ≥ 583, server 147, data-service 84 | regression |
| tsc clean + Playwright 15/15 | regression |

Any failure → STOP, surface, do not push.

---

## 9. Deferred to SP-FX-3b.2.2

- Real rotate handle (math + svg transform + `applyHandleDrag` rotate case)
- Multi-select group resize (8 handles on bbox; proportional scale across N widgets)
- Rotation of N selected widgets

---

## 10. Acceptance Criteria

- §8 stop conditions all green
- /dev/scada-editor-canvas manual smoke:
  - Shift+click 2 widgets → both selected, bbox shown, drag moves both
  - Ctrl+A → all selected, bbox covers all
  - Rubber-band over 2 widgets → both selected
  - ESC mid-drag restores; ESC idle clears selection; ESC empty no-op
  - Long-press ArrowRight → widget moves repeatedly, Ctrl+Z rolls back to start
  - Switch gridSize 8/16/20 → grid bg + snap reflect change
  - Drag widget → H/V dashed guide lines appear through snapped top-left
- web-ui 583/583 + Playwright 15/15 + tsc clean
- Editor module ready for SP-FX-3b.2.2 (rotate)
