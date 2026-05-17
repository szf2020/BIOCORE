# SP-FX-3b.1 Editor Canvas Low-Risk Increment — Design

**Status:** Draft (awaiting user review)
**Date:** 2026-05-17
**Parent:** SP-FX-3 (FUXA editor canvas port)
**Predecessor:** SP-FX-3a (spike, commit `b5890a5`)
**Successor:** SP-FX-3b.2 (real rotate + multi-select + box-select)

---

## 1. Scope

### 1.1 In-scope (6 features)

1. **Full 8-handle resize e2e coverage** — `applyHandleDrag` already implements all 8 directions in SP-FX-3a; missing only Playwright proof for NW/N/NE/W/E/SW/S (SE shipped).
2. **snap-grid** (10 px, ON/OFF toggle in editorStore, visible svg `<pattern>` background, applies to drag body + resize handle + Arrow nudge).
3. **ESC cancel mid-drag** — restore startBox, no history entry, selection unchanged.
4. **Arrow nudge** — `Arrow`=1 px, `Shift+Arrow`=10 px; calls `editorStore.updateWidget` → 1 history entry per press.
5. **Ctrl+Z / Ctrl+Y undo/redo** — calls existing `editorStore.undo` / `redo`; cross-platform Ctrl only (Mac users use Ctrl too).
6. **keyboard listener** — single `useEffect` on `document.body` inside `EditorCanvas`, guards against `INPUT`/`TEXTAREA`/`contentEditable`.

### 1.2 Out-of-scope (deferred to SP-FX-3b.2)

- Real rotate handle (math + svg transform + `applyHandleDrag` rotate case)
- Multi-select (`Shift+click`, `Ctrl+A`, unified bounding-box on N selected)
- Box-select rubber-band (new pointer-tools state)
- Nudge debounce / history coalesce
- Dynamic `gridSize` (default 10, user-adjustable 8 / 20 / etc.)
- Snap visual feedback (highlight snap lines as widget approaches grid)
- ESC in idle clears selection (VS Code / Figma convention)

### 1.3 Constraints

- TDD RED-first.
- AI / 自动逻辑 / animation / expression-eval **never write PLC directly** (this SP does not touch runtime path).
- HMI manual `set-value` actions go through `writeTag → WS → server` (SP-FX-2 path); this SP is editor-only.
- No new third-party dependencies. svg.js / zustand / immer already in tree.
- All user-facing replies in 简体中文 (per global preferences).

### 1.4 Test count target

- web-ui vitest: 530 → **~551** (+21)
  - geometry +4 (snap math + snapPoint)
  - canvas-svg +3 (setGridVisible)
  - editor-store +3 (snapEnabled state + setSnapEnabled action)
  - pointer-tools +5 (snap in drag, cancel())
  - EditorCanvas +6 (keyboard handler routes + nudge + activeElement guard + cleanup)
- Playwright: 3 → **10** (+7 missing-handle smoke)

---

## 2. File Structure

```
packages/web-ui/src/scada-engine/
├── services/
│   └── editor-store.ts             [MODIFY] +snapEnabled state +setSnapEnabled action; export GRID_SIZE=10
│   └── __tests__/editor-store.test.ts [MODIFY] +3 tests
├── editor/
│   ├── geometry.ts                 [MODIFY] +snap(box, gridSize) +snapPoint(pt, gridSize)
│   ├── __tests__/geometry.test.ts  [MODIFY] +4 tests
│   ├── canvas-svg.ts               [MODIFY] +setGridVisible(visible, gridSize?) (idempotent, destroyed-guard)
│   ├── __tests__/canvas-svg.test.ts [MODIFY] +3 tests
│   ├── pointer-tools.ts            [MODIFY] +cancel() method; +getSnapEnabled callback in PointerToolsCallbacks; snap applied in handleMouseMove / handleMouseUp
│   ├── __tests__/pointer-tools.test.ts [MODIFY] +5 tests
│   ├── EditorCanvas.tsx            [MODIFY] +useEffect keydown handler on document.body; +useEffect for snapEnabled → canvas.setGridVisible
│   └── __tests__/EditorCanvas.test.tsx [MODIFY] +6 tests
└── e2e/
    └── scada-editor-canvas-3b1.spec.ts [NEW] 7 smoke: NW / N / NE / W / E / SW / S handle drags
```

---

## 3. Type Contract

### 3.1 `editor-store.ts`

```ts
export const GRID_SIZE = 10;  // module-level const, exported

export interface EditorData {
  // existing: currentView, isDirty, history, selection
  snapEnabled: boolean;  // NEW, default true
}

export interface EditorActions {
  // existing: openView, closeView, updateWidget, addWidget, deleteWidget,
  //           undo, redo, setSelection, markClean, markDirty
  setSnapEnabled: (enabled: boolean) => void;  // NEW; no history entry
}
```

### 3.2 `geometry.ts`

```ts
export function snap(box: Box, gridSize: number): Box;
//   x = Math.round(box.x / gridSize) * gridSize
//   y = Math.round(box.y / gridSize) * gridSize
//   w = max(gridSize, Math.round(box.w / gridSize) * gridSize)
//   h = max(gridSize, Math.round(box.h / gridSize) * gridSize)
//   throws 'invalid grid size' if gridSize <= 0 (defensive; consumers pass GRID_SIZE const).

export function snapPoint(pt: Point, gridSize: number): Point;
//   x = Math.round(pt.x / gridSize) * gridSize
//   y = Math.round(pt.y / gridSize) * gridSize
```

### 3.3 `canvas-svg.ts`

```ts
class CanvasController {
  // existing: ctor, loadView, upsertWidget, removeWidget, getElement, getSvgRoot, destroy
  setGridVisible(visible: boolean, gridSize?: number): void;
  //   No-op if this.destroyed.
  //   When visible:
  //     - Remove any existing grid pattern + rect (idempotent).
  //     - Insert <pattern id="grid-pat" width=gridSize height=gridSize patternUnits="userSpaceOnUse">
  //         <path d="M gridSize 0 L 0 0 0 gridSize" stroke="#e5e7eb" fill="none"/>
  //       </pattern> inside <defs>.
  //     - Insert <rect width=viewBoxW height=viewBoxH fill="url(#grid-pat)" pointer-events="none"
  //                    data-overlay="grid"/> as FIRST child of root (z=0, below widgetLayer).
  //   When not visible:
  //     - Remove pattern + rect if present. No-op if absent.
}
```

### 3.4 `pointer-tools.ts`

```ts
export interface PointerToolsCallbacks {
  // existing: getWidgetAt, onWidgetTransformed, onSelect
  getSnapEnabled: () => boolean;  // NEW; polled every mousemove/mouseup
}

export class PointerTools {
  // existing: state, handleMouseDown, handleMouseMove, handleMouseUp, destroy
  cancel(): void;
  //   if (state.kind === 'idle') return;
  //   canvas.upsertWidget({ id: state.widgetId, type:'svg-ext-value' as any, property:{} as any,
  //                         x: startBox.x, y: startBox.y, w: startBox.w, h: startBox.h });
  //   handles.updateBox(startBox);
  //   state = { kind: 'idle' };
  //   Does NOT call cb.onWidgetTransformed → no history entry.
  //   Does NOT call cb.onSelect → selection unchanged.
}
```

Internal `handleMouseMove` / `handleMouseUp` apply snap to `newBox`:

```ts
let newBox = state.kind === 'drag-body'
  ? { x: startBox.x + dx, y: startBox.y + dy, w: startBox.w, h: startBox.h }
  : applyHandleDrag(startBox, state.handle, dx, dy);
if (cb.getSnapEnabled()) newBox = snap(newBox, GRID_SIZE);
// then canvas.upsertWidget + handles.updateBox (move)
//      OR cb.onWidgetTransformed + state=idle (up)
```

`GRID_SIZE` imported from `../services/editor-store` (single source of truth).

### 3.5 `EditorCanvas.tsx`

New `useEffect` (mount-time, deps `[]`):

```ts
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const ae = document.activeElement;
    const tag = (ae?.tagName ?? '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae as any)?.isContentEditable) return;

    const store = useEditorStore.getState();
    const { selection, currentView, undo, redo, updateWidget, snapEnabled } = store;

    if (e.key === 'Escape') {
      refs.current?.pointer.cancel();
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (refs.current?.pointer.state.kind !== 'idle') return;
      undo();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (refs.current?.pointer.state.kind !== 'idle') return;
      redo();
      return;
    }

    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const id = selection[0];
      if (!id || !currentView) return;
      const w = currentView.items[id];
      if (typeof (w as any).x !== 'number') return;
      const step = e.shiftKey ? GRID_SIZE : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
      const next = { x: (w as any).x + dx, y: (w as any).y + dy };
      const final = snapEnabled ? snapPoint(next, GRID_SIZE) : next;
      updateWidget(id, final);
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, []);
```

New `useEffect` for snap-grid wire:

```ts
useEffect(() => {
  if (!refs.current) return;
  refs.current.canvas.setGridVisible(snapEnabled, GRID_SIZE);
}, [snapEnabled]);
```

---

## 4. Data Flow

### 4.1 snap-toggle ON

```
User → setSnapEnabled(true)
  → editorStore zustand set({ snapEnabled: true })   // no history push
  → EditorCanvas useEffect[snapEnabled] fires
  → refs.current.canvas.setGridVisible(true, 10)
  → CanvasController inserts <defs><pattern></defs> + <rect data-overlay="grid"/> as first root child
  → DOM: grid visible behind widgets
```

OFF reverses (pattern + rect removed).

### 4.2 Drag widget body, snap ON

```
mousedown widget body → state=drag-body{startBox:{50,50,120,80}, startPt:{60,60}}
mousemove {73,78} → dx=13, dy=18
  → newBox = {63, 68, 120, 80}    // translate
  → getSnapEnabled() === true
  → newBox = snap(newBox, 10) = {60, 70, 120, 80}
  → canvas.upsertWidget(newBox); handles.updateBox(newBox)
mouseup → same snap → cb.onWidgetTransformed('w1', {60,70,120,80})
  → editorStore.updateWidget pushes 1 history entry
```

### 4.3 Resize via handle, snap ON

```
mousedown [data-handle="ne"] → state=drag-handle{handle:'ne', startBox:{50,50,120,80}, startPt:{170,50}}
mousemove {188, 33} → dx=18, dy=-17
  → newBox = applyHandleDrag(startBox, 'ne', 18, -17) = {50, 33, 138, 97}
  → snap → {50, 30, 140, 100}
  → canvas.upsertWidget + handles.updateBox
mouseup → onWidgetTransformed → editorStore.updateWidget → 1 history entry
```

Same path for all 8 directions; `applyHandleDrag` already covers them.

### 4.4 ESC mid-drag

```
state=drag-body{startBox:{50,50,120,80}}   // mid-drag, DOM currently shows {60,70,...}
User → Escape
  → keydown handler matches 'Escape'
  → refs.current.pointer.cancel()
    → canvas.upsertWidget(startBox)   // DOM restored
    → handles.updateBox(startBox)
    → state = idle
  → onWidgetTransformed NOT called → editorStore unchanged → no history entry
  → selection unchanged (handles stay visible)
```

ESC in idle: pointer-tools returns early, no-op.

### 4.5 Arrow nudge

```
selection=['w1'], currentView.items.w1={x:50, y:50, w:120, h:80}
User → ArrowRight
  → tag guard pass; preventDefault
  → step = 1 (no Shift)
  → next = {x:51, y:50}
  → snapEnabled ? snapPoint(next, 10) = {x:50, y:50}  // snaps back!
              : next = {x:51, y:50}
  → updateWidget('w1', final) → 1 history entry
```

Note: with snap ON, Arrow nudges effectively jump to nearest grid (consistent with §1 decision "drag/resize/nudge 全 snap"). Power users disable snap for sub-grid.

`Shift+ArrowRight`: step=10 → next={60,50} → snap → {60,50} (already on grid).

### 4.6 Ctrl+Z undo

```
User → Ctrl+Z
  → keydown handler: ctrlKey + key='z' → preventDefault
  → if pointer.state.kind !== 'idle': skip   // defensive
  → editorStore.undo()
    → past.pop() → restore as currentView; future.push(prev)
  → EditorCanvas useEffect[items] re-syncs canvas DOM
  → useEffect[selection, items] re-shows handles on restored geometry
```

Ctrl+Y mirrors.

---

## 5. Error Handling

| Scenario | Behavior |
|---|---|
| `snap(box, gridSize)` with box.w < gridSize | Clamp w to max(gridSize, MIN_BOX=5). Widget never snaps below 1 cell. |
| `snap()` with gridSize ≤ 0 | Throw `'invalid grid size'`. Defensive; consumers pass GRID_SIZE const. |
| ESC in idle | pointer-tools.cancel() early return. No side effect. |
| ESC, refs.current === null | EditorCanvas short-circuit `refs.current?.pointer.cancel()`. |
| ArrowKey, selection.length === 0 | keydown handler early return. |
| ArrowKey, widget without x/y | typeof guard early return. No warn. |
| ArrowKey, currentView === null | early return. |
| Ctrl+Z, history.past empty | `editorStore.undo()` first line `if (past.length === 0) return` (SP-FX-2). No additional guard needed. |
| Ctrl+Y, history.future empty | Same `redo()` guard. |
| Ctrl+Z/Y during drag-body or drag-handle | keydown handler `if (pointer.state.kind !== 'idle') return`. Prevents startBox stale. |
| keyboard handler, activeElement is INPUT/TEXTAREA/contentEditable | Early return. Dialog inputs (FileUpload, ViewProperty) not intercepted. |
| keyboard handler, EditorCanvas unmount | useEffect cleanup removeEventListener. No stale handler on next page. |
| setGridVisible after destroy | `if (this.destroyed) return`. Same guard pattern as upsertWidget. |
| setGridVisible(true) already visible | Idempotent: remove existing pattern+rect first, then re-insert (or no-op if same gridSize). |
| snapEnabled toggle mid-drag | `getSnapEnabled` polled per frame; next mousemove uses new value. Drag completes coherently. |
| Nudge long-press autorepeat | 1 history entry per repeat. Accepted UX. Ctrl+Z multiple times to undo. |
| Ctrl+Y in Firefox triggers browser history | `preventDefault` blocks it. |
| ArrowKey causes page scroll | `preventDefault` blocks scroll. EditorCanvas `overflow:auto` not affected. |
| grid `<rect>` intercepts widget click | `pointer-events="none"` on grid rect. e2e verifies widget click still works. |

---

## 6. Testing

### 6.1 Pure (geometry) — 4 tests

```
geometry.snap (SP-FX-3b.1):
  - rounds box.x/y down to grid
  - rounds box.x/y up to grid
  - rounds w/h to grid
  - clamps w/h to gridSize when snap would zero

(snapPoint covered in one of the above or in its own it; total +4)
```

### 6.2 jsdom (canvas-svg) — 3 tests

```
CanvasController.setGridVisible (SP-FX-3b.1):
  - true inserts <pattern data-grid> + <rect data-overlay="grid"> as first root child
  - false removes both (idempotent: second false call is no-op)
  - re-true after false re-inserts; toggling does not break widgetLayer
```

### 6.3 jsdom (editor-store) — 3 tests

```
editorStore SP-FX-3b.1:
  - default snapEnabled === true
  - setSnapEnabled(false) updates state, history.past unchanged
  - setSnapEnabled does not affect currentView/items
```

### 6.4 State machine (pointer-tools) — 5 tests

```
PointerTools SP-FX-3b.1 (mocks include getSnapEnabled in callbacks):
  - drag-body with getSnapEnabled→true: mousemove snaps newBox to 10px grid (assert canvas.upsertWidget call args)
  - drag-body with getSnapEnabled→false: raw delta passes through (no snap)
  - drag-handle SE with snap: w/h snapped to 10
  - cancel() in drag-body: canvas.upsertWidget called with startBox, handles.updateBox called with startBox, state===idle, onWidgetTransformed NOT called
  - cancel() in idle: no canvas calls (no-op)
```

### 6.5 React (EditorCanvas) — 6 tests

```
EditorCanvas keyboard handler SP-FX-3b.1:
  - Escape calls pointer.cancel() (spy on internal pointer ref via dom event)
  - Ctrl+Z calls editorStore.undo
  - Ctrl+Y calls editorStore.redo
  - Ctrl+Z while pointer state !== 'idle' is skipped (set state via mid-drag fixture)
  - ArrowRight with selection moves widget x+1, pushes history (assert items reference + history.past length)
  - Shift+ArrowRight moves x+10
  - activeElement=INPUT skip + handler cleanup on unmount (combined in 1 it)

(Total = 6 it() blocks; the 6th combines two related assertions.)
```

### 6.6 Playwright e2e — 7 smoke

```
e2e/scada-editor-canvas-3b1.spec.ts:
  beforeEach: login + goto /dev/scada-editor-canvas + __resetEditorStore

  - NW handle drag: w/h shrink, x/y move inward
  - N handle drag: h shrinks, y moves down
  - NE handle drag: w grows, h shrinks, y moves down
  - W handle drag: w shrinks, x moves right
  - E handle drag: w grows
  - SW handle drag: w shrinks, h grows, x moves right
  - S handle drag: h grows
```

### 6.7 Coverage matrix

| Feature | Pure | jsdom | State machine | React | Playwright |
|---|---|---|---|---|---|
| snap math | 4 | - | 3 | - | - |
| grid pattern DOM | - | 3 | - | 1 (toggle wires) | - |
| snapEnabled store | - | 3 | - | - | - |
| ESC cancel | - | - | 1 | 1 | - |
| Arrow nudge | - | - | - | 2 | - |
| Ctrl+Z/Y | - | - | - | 3 | - |
| activeElement guard | - | - | - | 1 | - |
| 8-handle resize | (SP-FX-3a) | (SP-FX-3a) | (SP-FX-3a) | - | 7 |

Every feature has ≥ 1 test layer. 8-handle Playwright is the critical SP-FX-3a gap-fill.

---

## 7. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | snap toggle mid-drag causes startBox jump | `getSnapEnabled` polled per frame; newBox always recomputed from startBox (non-cumulative). Toggling ON next frame snaps cleanly. |
| R2 | Nudge long-press pollutes history | Accepted UX tradeoff. SP-FX-3b.2 may add debounce / coalesce. TODO noted. |
| R3 | keyboard handler intercepts dialog INPUT | activeElement guard; 1 unit test + 1 Playwright (mount FileUploadDialog and verify). Dialog inputs portaled via Radix still satisfy `tagName === 'INPUT'` check. |
| R4 | Ctrl+Y triggers Firefox history | `preventDefault`. 1 test verifies `e.defaultPrevented`. |
| R5 | Undo during drag conflicts | keydown checks `pointer.state.kind !== 'idle'`, skips undo/redo. 1 test. |
| R6 | grid `<rect>` intercepts widget click | `pointer-events="none"`. 1 Playwright (snap ON, widget click still hits widgetLayer). |
| R7 | grid pattern not redrawn on viewBox change | setGridVisible re-callable; current spec has no dynamic viewBox. Not blocking. |
| R8 | snap math vs floating-point in Playwright | snap outputs integers (GRID_SIZE=10, Math.round). e2e uses `expect(x).toBe(60)` exact. |
| R9 | 8-handle e2e flaky (widget shrinks below bbox visibility) | beforeEach __resetEditorStore; widget=120×80 (large); dx delta within bounds. |
| R10 | EditorCanvas keydown closure stale | Handler uses `useEditorStore.getState()` for latest state; deps `[]` is correct. 1 test: toggle snap after mount → next event uses new snap. |
| R11 | snap-grid bg svg `<pattern>` performance on large canvas | 800×600 single `<pattern>` (1 path + 1 rect) — microsecond reflow. SP-FX-3a baseline drag = 60fps; pattern bg unchanged. |
| R12 | setSnapEnabled accidentally pushes history | Action explicitly does NOT push. 1 test verifies `history.past.length` unchanged after toggle. |

---

## 8. Stop Conditions

All conditions must hold at SP-FX-3b.1 completion:

| Condition | Measurement |
|---|---|
| 7 missing-handle Playwright tests green | scada-editor-canvas-3b1.spec.ts 7/7 pass |
| snap-toggle changes grid bg DOM | jsdom test (setGridVisible call count + DOM diff) |
| snap ON drag result: widget x/y/w/h % 10 === 0 | pointer-tools test |
| ESC restores widget to startBox | pointer-tools test |
| Arrow 1 px / Shift+Arrow 10 px move + history | EditorCanvas test |
| Ctrl+Z calls editorStore.undo | EditorCanvas test |
| INPUT activeElement does not trigger handler | EditorCanvas test |
| web-ui vitest ≥ 551, no regression | T10 regression step |
| tsc clean | T10 regression step |

Any condition failing → STOP, surface to user, do not push. No threshold lowering, no skip.

---

## 9. Deferred to SP-FX-3b.2

- Real rotate handle (math + svg transform + `applyHandleDrag` rotate case)
- Multi-select (Shift+click, Ctrl+A, unified bounding-box on N selected)
- Box-select rubber-band (new pointer-tools state)
- Nudge debounce / history coalesce
- Dynamic gridSize (currently fixed 10; user-adjustable 8 / 20 in 3b.2)
- Snap visual feedback (highlight snap lines as widget approaches)
- ESC in idle clears selection (VS Code / Figma convention)

---

## 10. Acceptance Criteria

- All §8 stop conditions green
- User manual smoke at `/dev/scada-editor-canvas`:
  - All 7 missing handles drag and resize correctly
  - snap-grid ON: visible grid bg, drag aligns to 10 px
  - snap-grid OFF: no grid bg, raw drag
  - ESC mid-drag: widget snaps back
  - Arrow nudge 1 px / Shift+Arrow 10 px
  - Ctrl+Z restores; Ctrl+Y re-applies
  - Dialog input fields (open ViewPropertyDialog) accept text without canvas keyboard handler firing
- web-ui 551/551 + Playwright 10/10 + tsc clean
- Editor module ready for SP-FX-4 (toolbar) to wire snap-toggle button + undo/redo buttons
