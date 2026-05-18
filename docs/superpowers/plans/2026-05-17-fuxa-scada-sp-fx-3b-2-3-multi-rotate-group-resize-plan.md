# SP-FX-3b.2.3 Multi-Select Rotate + Group-Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multi-select rotate (group-rotate) + group-resize via bbox handles in ~1 week.

**Architecture:** Additive change. 3 new pure geometry helpers (`applyMultiRotate`, `applyGroupResize`, `anchorOf`). `transform-handles.showBbox()` rewritten to show 9 handles + 4 corner indicators at bbox positions. `PointerState` union extends with 2 new variants (`group-rotate`, `group-resize`); `PointerToolsCallbacks` adds 2 new fields. `handleMouseDown` bbox-mode routing branches on `selectedIds.length >= 2`. `EditorCanvas.tsx` wires 2 new cb (no Refs / lifecycle changes).

**Tech Stack:** TypeScript 5, React 18, vitest + jsdom + @testing-library/react (existing), Playwright (existing), zustand 4.4 + immer 10 (existing), `@svgdotjs/svg.js ^3.2.4` (existing), Zod 3 (existing). No new dependencies.

---

## File Structure

**Modify:**
- `packages/web-ui/src/scada-engine/editor/geometry.ts` — `+applyMultiRotate`, `+applyGroupResize`, `+anchorOf`, `+MultiRotateResult` / `+GroupResizeResult` types
- `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts` — +6 tests
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` — `showBbox()` rewrite (all 9 handles visible) + `layoutBbox()` ext (handle positions)
- `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts` — +4 tests + update 1 existing test (3b.2.1 assertion flip)
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` — PointerState +2 variants, callbacks +2 fields, handleMouseDown bbox routing, handleMouseMove/Up/cancel +2 branches each
- `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts` — +10 tests
- `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts` — +2 tests (regression cover for rotate update via upsertWidget; no impl change)
- `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts` — +2 tests (multi-key patch + mixed delete/set; no impl change)
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` — PointerTools ctor +2 new cb
- `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx` — +8 tests
- `packages/web-ui/src/scada-engine/editor/index.ts` — re-export 3 new geo helpers

**Create:**
- `packages/web-ui/e2e/scada-editor-canvas-3b2-3.spec.ts` — 3 Playwright smoke

**Not Modified:**
- `canvas-svg.ts` (upsertWidget already honors `rotate` from SP-FX-3b.2.2)
- `models/widget.ts` (schema rotate field added in 3b.2.2 T0)
- `editor-store.ts` (key-aware patch done in 3b.2.2 T1)
- `canvasMock.ts` (no new mock methods needed)

**Test count target:**
- web-ui vitest: 613 → **645** (+32: 6 geo + 4 transform-handles + 10 pointer-tools + 2 canvas-svg + 2 editor-store + 8 EditorCanvas)
- Playwright: 17 → **20** (+3)

---

## Task 0: geometry +applyMultiRotate +applyGroupResize +anchorOf + 6 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/geometry.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`. Update top import:

Find:
```ts
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  applyRotate,
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
  applyMultiRotate, applyGroupResize, anchorOf,
  type Box, type Point,
} from '../geometry';
```

(If actual existing import differs slightly e.g. `HandleId` type also imported, preserve all existing names — just add the 3 new ones.)

Append at END:

```ts
describe('geometry.applyMultiRotate (SP-FX-3b.2.3)', () => {
  it('empty Map returns empty Map', () => {
    const result = applyMultiRotate(new Map(), new Map(), { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, 0);
    expect(result.size).toBe(0);
  });

  it('single widget at bbox center, 90° delta: position unchanged (orbit radius 0), rotate += 90', () => {
    const startBoxes = new Map<string, Box>([['w1', { x: -25, y: -15, w: 50, h: 30 }]]);
    const startRotates = new Map<string, number>([['w1', 0]]);
    const pivot: Point = { x: 0, y: 0 };
    const startPt: Point = { x: 50, y: 0 };
    const currentPt: Point = { x: 0, y: 50 };
    const result = applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, 0);
    const w1 = result.get('w1')!;
    expect(w1.box.x).toBeCloseTo(-25, 5);
    expect(w1.box.y).toBeCloseTo(-15, 5);
    expect(w1.rotate).toBeCloseTo(90, 5);
  });

  it('2 widgets offset from bbox center, 90° delta: centers rotated, rotate accumulates', () => {
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 100, y: -10, w: 20, h: 20 }],
      ['w2', { x: -10, y: 100, w: 20, h: 20 }],
    ]);
    const startRotates = new Map<string, number>([['w1', 0], ['w2', 30]]);
    const pivot: Point = { x: 0, y: 0 };
    const startPt: Point = { x: 50, y: 0 };
    const currentPt: Point = { x: 0, y: 50 };
    const result = applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, 0);
    expect(result.get('w1')!.box.x).toBeCloseTo(-10, 5);
    expect(result.get('w1')!.box.y).toBeCloseTo(100, 5);
    expect(result.get('w1')!.rotate).toBeCloseTo(90, 5);
    expect(result.get('w2')!.box.x).toBeCloseTo(-120, 5);
    expect(result.get('w2')!.box.y).toBeCloseTo(-10, 5);
    expect(result.get('w2')!.rotate).toBeCloseTo(120, 5);
  });

  it('snapStep 15: raw 23° delta snaps to 30°', () => {
    const startBoxes = new Map<string, Box>([['w1', { x: -25, y: -15, w: 50, h: 30 }]]);
    const startRotates = new Map<string, number>([['w1', 0]]);
    const pivot: Point = { x: 0, y: 0 };
    const startPt: Point = { x: 50, y: 0 };
    const currentPt: Point = {
      x: 50 * Math.cos(23 * Math.PI / 180),
      y: 50 * Math.sin(23 * Math.PI / 180),
    };
    const result = applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, 15);
    expect(result.get('w1')!.rotate).toBe(30);
  });
});

describe('geometry.applyGroupResize (SP-FX-3b.2.3)', () => {
  it('SE corner 2x scale: all widgets scale 2x from NW anchor', () => {
    const startBbox: Box = { x: 0, y: 0, w: 100, h: 80 };
    const newBbox: Box = { x: 0, y: 0, w: 200, h: 160 };
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 30, h: 20 }],
      ['w2', { x: 60, y: 50, w: 30, h: 20 }],
    ]);
    const result = applyGroupResize(startBbox, newBbox, 'se', startBoxes, false);
    expect(result).not.toBeNull();
    if (!result) return;
    const w1 = result.widgets.get('w1')!;
    expect(w1.x).toBe(20);
    expect(w1.y).toBe(20);
    expect(w1.w).toBe(60);
    expect(w1.h).toBe(40);
    const w2 = result.widgets.get('w2')!;
    expect(w2.x).toBe(120);
    expect(w2.y).toBe(100);
    expect(w2.w).toBe(60);
    expect(w2.h).toBe(40);
  });

  it('aspectLock on NW corner picks min absolute scale', () => {
    const startBbox: Box = { x: 0, y: 0, w: 100, h: 100 };
    const newBbox: Box = { x: -100, y: -50, w: 200, h: 150 };
    const startBoxes = new Map<string, Box>([['w1', { x: 0, y: 0, w: 100, h: 100 }]]);
    const result = applyGroupResize(startBbox, newBbox, 'nw', startBoxes, true);
    expect(result).not.toBeNull();
    if (!result) return;
    const w1 = result.widgets.get('w1')!;
    expect(w1.w).toBe(150);
    expect(w1.h).toBe(150);
  });

  it('any widget projecting w<5 returns null (freeze)', () => {
    const startBbox: Box = { x: 0, y: 0, w: 100, h: 80 };
    const newBbox: Box = { x: 0, y: 0, w: 2, h: 80 };
    const startBoxes = new Map<string, Box>([['w1', { x: 0, y: 0, w: 100, h: 80 }]]);
    const result = applyGroupResize(startBbox, newBbox, 'e', startBoxes, false);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -15
```

Expected: 6 failures (`applyMultiRotate is not a function`, `applyGroupResize is not a function`).

- [ ] **Step 3: Add 3 functions to geometry.ts**

Open `packages/web-ui/src/scada-engine/editor/geometry.ts`. Append at EOF:

```ts
// SP-FX-3b.2.3: multi-select rotate + group-resize helpers.

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
  if (handle === 'n' || handle === 's') scaleX = 1;
  if (handle === 'w' || handle === 'e') scaleY = 1;
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
    if (Math.abs(newW) < 5 || Math.abs(newH) < 5) return null;
    const newX = anchor.x + (sb.x - anchor.x) * scaleX;
    const newY = anchor.y + (sb.y - anchor.y) * scaleY;
    widgets.set(id, { x: newX, y: newY, w: newW, h: newH });
  }
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

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: 34 + 6 = **40 passed**.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/geometry.ts packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts
git commit -m "feat(scada-engine): geometry applyMultiRotate + applyGroupResize + anchorOf (SP-FX-3b.2.3)

3 pure helpers + 2 result types. applyMultiRotate rotates per-widget
(x,y) around pivot + accumulates rotate field. applyGroupResize
scales per-widget (x,y,w,h) anchored at opposite corner/edge; edge
handles 1D; corner+aspectLock = min absolute uniform scale. Returns
null when any widget projects w<5 || h<5 (freeze). 6 tests cover
empty/single/multi rotate, snap, SE 2x scale, aspect-lock,
min-size freeze."
```

---

## Task 1: transform-handles.showBbox() rewrite + 4 tests + 1 existing test update

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/transform-handles.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`

- [ ] **Step 1: Update existing 3b.2.1 test assertion**

Open `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`.

Find:
```ts
  it('showBbox renders dashed bbox + 4 corner indicators; resize handles hidden', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
    const corners = container.querySelectorAll('[data-bbox-corner]');
    expect(corners.length).toBe(4);
    const resizeHandles = container.querySelectorAll('[data-handle]');
    resizeHandles.forEach((rh) => {
      expect(rh.getAttribute('visibility')).toBe('hidden');
    });
  });
```

Replace with:
```ts
  it('showBbox renders dashed bbox + 4 corner indicators + visible resize handles + rotate (SP-FX-3b.2.3)', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
    const corners = container.querySelectorAll('[data-bbox-corner]');
    expect(corners.length).toBe(4);
    const resizeHandles = container.querySelectorAll('[data-handle]');
    expect(resizeHandles.length).toBe(9);
    resizeHandles.forEach((rh) => {
      expect(rh.getAttribute('visibility')).not.toBe('hidden');
    });
  });
```

- [ ] **Step 2: Append 4 new tests at END**

```ts
describe('TransformHandles.showBbox SP-FX-3b.2.3 group-resize handles', () => {
  it('showBbox positions resize handles at bbox edges', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const se = container.querySelector('[data-handle="se"]') as SVGRectElement;
    expect(se).not.toBeNull();
    const seX = Number(se.getAttribute('x'));
    const seY = Number(se.getAttribute('y'));
    expect(Math.abs(seX + 4 - 300)).toBeLessThanOrEqual(5);
    expect(Math.abs(seY + 4 - 180)).toBeLessThanOrEqual(5);
  });

  it('showBbox positions rotate handle above bbox top center', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const rotate = container.querySelector('[data-handle="rotate"]') as SVGRectElement;
    expect(rotate).not.toBeNull();
    const rX = Number(rotate.getAttribute('x'));
    const rY = Number(rotate.getAttribute('y'));
    expect(Math.abs(rX + 4 - 200)).toBeLessThanOrEqual(5);
    expect(rY).toBeLessThan(100);
  });

  it('showBbox→show(single) transition: corners hidden, handles re-layout to single widget', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 0, y: 0, w: 200, h: 80 });
    h.show({ x: 50, y: 50, w: 100, h: 60 });
    const corners = container.querySelectorAll('[data-bbox-corner]');
    corners.forEach((c) => {
      expect(c.getAttribute('visibility')).toBe('hidden');
    });
    const se = container.querySelector('[data-handle="se"]') as SVGRectElement;
    const seX = Number(se.getAttribute('x'));
    const seY = Number(se.getAttribute('y'));
    expect(Math.abs(seX + 4 - 150)).toBeLessThanOrEqual(5);
    expect(Math.abs(seY + 4 - 110)).toBeLessThanOrEqual(5);
  });

  it('showBbox hitTest finds rotate handle above bbox top center', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.showBbox({ x: 100, y: 100, w: 200, h: 80 });
    const hit = h.hitTest({ x: 200, y: 80 });
    expect(hit).toBe('rotate');
  });
});
```

- [ ] **Step 3: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -20
```

Expected: 4 new failures + 1 existing test flipped (now asserts visibility != 'hidden' but impl still hides handles → fail).

- [ ] **Step 4: Patch transform-handles.ts — showBbox rewrite**

Open `packages/web-ui/src/scada-engine/editor/transform-handles.ts`. Find:

```ts
  showBbox(bbox: Box): void {
    this.currentBox = bbox;
    this.visible = true;
    this.mode = 'bbox';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', BBOX_DASH);
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'hidden');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'visible');
    this.layoutBbox(bbox);
  }
```

Replace with:

```ts
  showBbox(bbox: Box): void {
    this.currentBox = bbox;
    this.visible = true;
    this.mode = 'bbox';
    this.group.attr('visibility', 'visible');
    this.selectionRect.attr('stroke-dasharray', BBOX_DASH);
    // SP-FX-3b.2.3: all 9 handles visible in bbox mode for group-resize / group-rotate
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      this.handles[id].attr('visibility', 'visible');
    }
    for (const c of this.bboxCorners) c.attr('visibility', 'visible');
    this.layoutBbox(bbox);
  }
```

- [ ] **Step 5: Patch layoutBbox to position handles at bbox edges**

Find:

```ts
  private layoutBbox(bbox: Box): void {
    this.selectionRect.attr('x', bbox.x).attr('y', bbox.y).attr('width', bbox.w).attr('height', bbox.h);
    const half = BBOX_CORNER_SIZE / 2;
    this.bboxCorners[0].attr('x', bbox.x - half).attr('y', bbox.y - half);
    this.bboxCorners[1].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y - half);
    this.bboxCorners[2].attr('x', bbox.x - half).attr('y', bbox.y + bbox.h - half);
    this.bboxCorners[3].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y + bbox.h - half);
  }
```

Replace with:

```ts
  private layoutBbox(bbox: Box): void {
    this.selectionRect.attr('x', bbox.x).attr('y', bbox.y).attr('width', bbox.w).attr('height', bbox.h);
    const half = BBOX_CORNER_SIZE / 2;
    this.bboxCorners[0].attr('x', bbox.x - half).attr('y', bbox.y - half);
    this.bboxCorners[1].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y - half);
    this.bboxCorners[2].attr('x', bbox.x - half).attr('y', bbox.y + bbox.h - half);
    this.bboxCorners[3].attr('x', bbox.x + bbox.w - half).attr('y', bbox.y + bbox.h - half);
    // SP-FX-3b.2.3: position 9 handles (8 resize + rotate) at bbox edges
    const positions = handlePositions(bbox);
    for (const id in positions) {
      const p = positions[id as HandleId];
      this.handles[id as HandleId].attr('x', p.x - HANDLE_HALF).attr('y', p.y - HANDLE_HALF);
    }
  }
```

- [ ] **Step 6: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -10
```

Expected: 15 + 4 = **19 passed**.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/transform-handles.ts packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts
git commit -m "feat(scada-engine): showBbox renders all 9 handles at bbox positions (SP-FX-3b.2.3)

Bbox mode now shows 8 resize handles + rotate handle + 4 bbox corner
indicators (all visibility=visible). layoutBbox positions resize+rotate
handles via handlePositions(bbox) so hitTest works against bbox edges.
Updated 1 existing 3b.2.1 test assertion (resize handles now visible
in bbox mode); +4 new tests cover SE position, rotate position,
showBbox→show transition, rotate hitTest above bbox."
```

---

## Task 2: pointer-tools state +2 + cb +2 + handlers + 10 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`

- [ ] **Step 1: Update test top-of-file declarations + beforeEach**

Open `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`.

Find:
```ts
let onRotateMove: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

Replace with:
```ts
let onRotateMove: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getCurrentRotates: ReturnType<typeof vi.fn<any[], any>>;
let onGroupRotated: ReturnType<typeof vi.fn>;
let tools: PointerTools;
```

In `beforeEach`, find the tools instantiation block ending with `onRotateMove: (deg, pivot) => onRotateMove(deg, pivot),` and the closing `});`. Replace the closing portion:

Find:
```ts
    getCurrentRotate: (id) => getCurrentRotate(id) as number | undefined,
    onRotated: (id, rotate) => onRotated(id, rotate),
    onRotateMove: (deg, pivot) => onRotateMove(deg, pivot),
  });
```

Replace with:
```ts
    getCurrentRotate: (id) => getCurrentRotate(id) as number | undefined,
    onRotated: (id, rotate) => onRotated(id, rotate),
    onRotateMove: (deg, pivot) => onRotateMove(deg, pivot),
    getCurrentRotates: (ids) => getCurrentRotates(ids) as Map<string, number>,
    onGroupRotated: (entries) => onGroupRotated(entries),
  });
```

Then INSIDE `beforeEach`, after `onRotateMove = vi.fn();` add:
```ts
  getCurrentRotates = vi.fn(() => new Map<string, number>());
  onGroupRotated = vi.fn();
```

- [ ] **Step 2: Append 10 new tests at END**

```ts
describe('PointerTools group-rotate + group-resize (SP-FX-3b.2.3)', () => {
  it('mousedown rotate handle in bbox mode (selectedIds≥2): state=group-rotate with pivot=bbox center', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 200, y: 100, w: 100, h: 60 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>([['w1', 10], ['w2', 20]]));
    tools.handleMouseDown(md(150, 60));
    expect(tools.state.kind).toBe('group-rotate');
    if (tools.state.kind === 'group-rotate') {
      expect(tools.state.pivot).toEqual({ x: 150, y: 80 });
      expect(tools.state.widgetIds).toEqual(['w1', 'w2']);
      expect(tools.state.startRotates.get('w1')).toBe(10);
      expect(tools.state.startRotates.get('w2')).toBe(20);
    }
  });

  it('mousedown SE corner in bbox mode: state=group-resize with anchor at NW', () => {
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 200, y: 100, w: 100, h: 60 }],
    ]));
    tools.handleMouseDown(md(300, 160));
    expect(tools.state.kind).toBe('group-resize');
    if (tools.state.kind === 'group-resize') {
      expect(tools.state.handle).toBe('se');
      expect(tools.state.anchor).toEqual({ x: 0, y: 0 });
    }
  });

  it('mousedown N edge in bbox mode: state=group-resize with anchor at S edge midpoint', () => {
    handles.hitTest.mockReturnValue('n');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 200, y: 100, w: 100, h: 60 }],
    ]));
    tools.handleMouseDown(md(150, 0));
    expect(tools.state.kind).toBe('group-resize');
    if (tools.state.kind === 'group-resize') {
      expect(tools.state.handle).toBe('n');
      expect(tools.state.anchor).toEqual({ x: 150, y: 160 });
    }
  });

  it('group-rotate mousemove 90°: canvas.upsertWidget fires per widget with rotated coords + rotate field', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>());
    tools.handleMouseDown(md(220, 160));
    canvas.upsertWidget.mockClear();
    tools.handleMouseMove(mm(160, 220));
    expect(canvas.upsertWidget.mock.calls.length).toBeGreaterThanOrEqual(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Call = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Call).toBeDefined();
    expect(w1Call![0].rotate).toBeCloseTo(90, 0);
  });

  it('group-rotate mouseup commits via onGroupRotated with N entries', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>());
    tools.handleMouseDown(md(220, 160));
    tools.handleMouseUp(mu(160, 220));
    expect(onGroupRotated).toHaveBeenCalledTimes(1);
    const entries = onGroupRotated.mock.calls[0][0];
    expect(entries.length).toBe(2);
    expect(entries[0].newRotate).toBeCloseTo(90, 0);
    expect(tools.state.kind).toBe('idle');
  });

  it('cancel() in group-rotate restores all widget startBoxes + startRotates; no onGroupRotated', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]);
    getWidgetBoxes.mockReturnValue(startBoxes);
    getCurrentRotates.mockReturnValue(new Map<string, number>([['w1', 15], ['w2', 0]]));
    tools.handleMouseDown(md(220, 160));
    tools.handleMouseMove(mm(160, 220));
    canvas.upsertWidget.mockClear();
    tools.cancel();
    expect(onGroupRotated).not.toHaveBeenCalled();
    expect(canvas.upsertWidget.mock.calls.length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Restore = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Restore![0].x).toBe(100);
    expect(w1Restore![0].rotate).toBe(15);
    expect(tools.state.kind).toBe('idle');
  });

  it('group-resize SE corner drag 2x: all widgets x/y/w/h scale from NW anchor', () => {
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 30, h: 20 }],
      ['w2', { x: 60, y: 50, w: 30, h: 20 }],
    ]));
    tools.handleMouseDown(md(90, 70));
    canvas.upsertWidget.mockClear();
    tools.handleMouseMove(mm(170, 130));
    expect(canvas.upsertWidget.mock.calls.length).toBeGreaterThanOrEqual(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Call = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Call![0].x).toBe(10);
    expect(w1Call![0].y).toBe(10);
    expect(w1Call![0].w).toBe(60);
    expect(w1Call![0].h).toBe(40);
  });

  it('group-resize Shift on NE corner: aspect-lock applied (uniform scale = min)', () => {
    handles.hitTest.mockReturnValue('ne');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 100 }],
      ['w2', { x: 110, y: 110, w: 10, h: 10 }],
    ]));
    const shiftDown = new MouseEvent('mousedown', { clientX: 120, clientY: 0, shiftKey: true, bubbles: true });
    tools.handleMouseDown(shiftDown);
    canvas.upsertWidget.mockClear();
    const shiftMove = new MouseEvent('mousemove', { clientX: 320, clientY: -60, shiftKey: true, bubbles: true });
    tools.handleMouseMove(shiftMove);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Call = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Call![0].w).toBe(150);
    expect(w1Call![0].h).toBe(150);
  });

  it('group-resize any widget projects w<5: handleMouseMove no canvas.upsertWidget call', () => {
    handles.hitTest.mockReturnValue('e');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 110, y: 10, w: 50, h: 40 }],
    ]));
    tools.handleMouseDown(md(160, 30));
    canvas.upsertWidget.mockClear();
    tools.handleMouseMove(mm(2, 30));
    expect(canvas.upsertWidget).not.toHaveBeenCalled();
  });

  it('cancel() in group-resize restores all widget startBoxes; no commit', () => {
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 30, h: 20 }],
      ['w2', { x: 60, y: 50, w: 30, h: 20 }],
    ]);
    getWidgetBoxes.mockReturnValue(startBoxes);
    tools.handleMouseDown(md(90, 70));
    tools.handleMouseMove(mm(170, 130));
    canvas.upsertWidget.mockClear();
    tools.cancel();
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(canvas.upsertWidget.mock.calls.length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Restore = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Restore![0].x).toBe(10);
    expect(w1Restore![0].w).toBe(30);
    expect(tools.state.kind).toBe('idle');
  });
});
```

- [ ] **Step 3: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -20
```

Expected: 10 failures (group-rotate / group-resize states don't exist, cb missing).

- [ ] **Step 4: Patch PointerState union**

Open `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`. Find:

```ts
export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetIds: string[]; startPt: Point; startBoxes: Map<string, Box> }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box }
  | { kind: 'box-select'; startPt: Point; currentPt: Point; shiftKey: boolean }
  | { kind: 'drag-rotate'; widgetId: string; startPt: Point; pivot: Point; startBox: Box; startRotate: number };
```

Replace with:

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

- [ ] **Step 5: Patch PointerToolsCallbacks interface**

Find:
```ts
  getCurrentRotate: (id: string) => number | undefined;
  onRotated: (id: string, rotate: number) => void;
  onRotateMove: (deg: number | null, pivot: Point | null) => void;
}
```

Replace with:
```ts
  getCurrentRotate: (id: string) => number | undefined;
  onRotated: (id: string, rotate: number) => void;
  onRotateMove: (deg: number | null, pivot: Point | null) => void;
  getCurrentRotates: (ids: string[]) => Map<string, number>;
  onGroupRotated: (entries: { id: string; newBox: Box; newRotate: number }[]) => void;
}
```

- [ ] **Step 6: Update geometry import**

Find:

```ts
import { clientToSvg, applyHandleDrag, snap, computeBbox, intersectsBox, applyRotate, type HandleId, type Box, type Point } from './geometry';
```

Replace with:

```ts
import { clientToSvg, applyHandleDrag, snap, computeBbox, intersectsBox, applyRotate, applyMultiRotate, applyGroupResize, anchorOf, type HandleId, type Box, type Point } from './geometry';
```

- [ ] **Step 7: Patch handleMouseDown — bbox-mode routing**

Find the existing `handleMouseDown` `if (handle)` block (post-3b.2.2). It currently:
1. Calls `selectedIds = this.cb.getSelectedIds()`
2. Returns if `selectedIds.length !== 1`
3. Routes rotate handle to drag-rotate / else drag-handle

Replace the entire `if (handle)` block with:

```ts
    if (handle) {
      const selectedIds = this.cb.getSelectedIds();

      // Multi-select bbox mode (SP-FX-3b.2.3)
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

      // Single-select (existing 3b.2.2 path)
      if (selectedIds.length !== 1) return;
      const widgetId = selectedIds[0];
      const boxes = this.cb.getWidgetBoxes([widgetId]);
      const box = boxes.get(widgetId);
      if (!box) return;
      const widgetHit = { id: widgetId, box };
      if (handle === 'rotate') {
        const pivot: Point = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        const startRotate = this.cb.getCurrentRotate(widgetId) ?? 0;
        this.state = { kind: 'drag-rotate', widgetId, startPt: pt, pivot, startBox: box, startRotate };
      } else {
        this.state = { kind: 'drag-handle', widgetId, handle, startPt: pt, startBox: box };
      }
      return;
    }
```

- [ ] **Step 8: Patch handleMouseMove — add 2 new branches BEFORE drag-rotate**

Find the existing drag-rotate branch in handleMouseMove:

```ts
    if (this.state.kind === 'drag-rotate') {
```

Just BEFORE that line, insert:

```ts
    if (this.state.kind === 'group-rotate') {
      const snapStep = e.shiftKey ? 15 : 0;
      const result = applyMultiRotate(this.state.startBboxes, this.state.startRotates, this.state.pivot, this.state.startPt, pt, snapStep);
      for (const [id, { box, rotate }] of result) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: box.x, y: box.y, w: box.w, h: box.h, rotate } as any);
      }
      const newBbox = computeBbox(Array.from(result.values()).map((v) => v.box));
      this.handles.updateBox(newBbox);
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
      if (!result) return;
      for (const [id, box] of result.widgets) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: box.x, y: box.y, w: box.w, h: box.h } as any);
      }
      this.handles.updateBox(result.bbox);
      this.cb.onDragVisualUpdate(result.bbox);
      return;
    }

```

- [ ] **Step 9: Patch handleMouseUp — add 2 new branches BEFORE drag-rotate**

Find the existing drag-rotate branch in handleMouseUp:

```ts
    if (this.state.kind === 'drag-rotate') {
```

Just BEFORE that line, insert:

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

- [ ] **Step 10: Patch cancel() — add 2 new branches BEFORE drag-rotate**

Find the existing drag-rotate branch in cancel():

```ts
    if (this.state.kind === 'drag-rotate') {
```

Just BEFORE that line, insert:

```ts
    if (this.state.kind === 'group-rotate') {
      for (const [id, sb] of this.state.startBboxes) {
        const sr = this.state.startRotates.get(id) ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: sb.x, y: sb.y, w: sb.w, h: sb.h, rotate: sr } as any);
      }
      this.handles.updateBox(this.state.startBbox);
      this.state = { kind: 'idle' };
      this.cb.onRotateMove(null, null);
      return;
    }

    if (this.state.kind === 'group-resize') {
      for (const [id, sb] of this.state.startBoxes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.canvas.upsertWidget({ id, type: 'svg-ext-value' as any, property: {} as any, x: sb.x, y: sb.y, w: sb.w, h: sb.h } as any);
      }
      this.handles.updateBox(this.state.startBbox);
      this.state = { kind: 'idle' };
      this.cb.onDragVisualUpdate(null);
      return;
    }

```

- [ ] **Step 11: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -10
```

Expected: 33 + 10 = **43 passed**.

- [ ] **Step 12: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/pointer-tools.ts packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts
git commit -m "feat(scada-engine): PointerTools group-rotate + group-resize FSM (SP-FX-3b.2.3)

PointerState union +group-rotate{widgetIds[], pivot, startBboxes,
startRotates, startBbox} + group-resize{widgetIds[], handle, startBbox,
startBoxes, anchor}. PointerToolsCallbacks +getCurrentRotates +
onGroupRotated (14→16 total). handleMouseDown bbox-mode routing:
selectedIds.length>=2 + rotate handle → group-rotate; else → group-resize
(anchor at opposite corner/edge). handleMouseMove/Up/cancel +2 branches
each. Shift→15° snap (rotate) / aspect-lock (corner resize). Min-size
freeze when any widget projects w<5||h<5. 10 new tests; 33 existing
tests preserved."
```

---

## Task 3: canvas-svg test additions (regression cover) + 2 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`

(No impl change — `upsertWidget` from SP-FX-3b.2.2 T4 already handles rotate updates.)

- [ ] **Step 1: Write the tests**

Append at the END of `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`:

```ts
describe('CanvasController.upsertWidget rotate regression (SP-FX-3b.2.3)', () => {
  it('upsertWidget existing widget rotate 30→60 updates transform attr', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = { ...makeWidget('w1', 50, 50, 100, 60), rotate: 30 } as any;
    c.loadView(makeView({ w1: w }));
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
    c.upsertWidget({ ...w, rotate: 60 });
    expect(el.getAttribute('transform')).toBe('rotate(60 100 80)');
    c.destroy();
  });

  it('upsertWidget existing widget rotate set to undefined removes transform attr', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = { ...makeWidget('w1', 50, 50, 100, 60), rotate: 30 } as any;
    c.loadView(makeView({ w1: w }));
    const el = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    expect(el.getAttribute('transform')).toBe('rotate(30 100 80)');
    c.upsertWidget(makeWidget('w1', 50, 50, 100, 60));
    expect(el.getAttribute('transform')).toBeNull();
    c.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify GREEN (no impl change expected)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -10
```

Expected: 16 + 2 = **18 passed**.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts
git commit -m "test(scada-engine): canvas-svg rotate regression coverage (SP-FX-3b.2.3)

2 tests verify upsertWidget honors rotate field changes:
30→60 updates transform attr; rotate field removed clears transform.
No impl change (covered by 3b.2.2 T4 upsertWidget patch)."
```

---

## Task 4: editor-store test additions + 2 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`

(No impl change — `updateWidget` from SP-FX-3b.2.2 T1 already supports multi-key + delete.)

- [ ] **Step 1: Write the tests**

Append at END of `packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts`:

```ts
describe('editorStore updateWidget multi-key + mixed patch (SP-FX-3b.2.3)', () => {
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
      items: { w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 50, h: 30, rotate: 30 } },
      schemaVersion: 1,
    } as any);
  });

  it('updateWidget multi-key {x, y, rotate}: all 3 fields set', () => {
    useEditorStore.getState().updateWidget('w1', { x: 100, y: 200, rotate: 90 } as any);
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect(w.x).toBe(100);
    expect(w.y).toBe(200);
    expect(w.rotate).toBe(90);
  });

  it('updateWidget mixed {rotate: undefined, x: 100}: deletes rotate + sets x', () => {
    useEditorStore.getState().updateWidget('w1', { rotate: undefined, x: 100 } as any);
    const w = useEditorStore.getState().currentView!.items.w1 as any;
    expect('rotate' in w).toBe(false);
    expect(w.x).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify GREEN (no impl change expected)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/services/__tests__/editor-store.test.ts 2>&1 | tail -10
```

Expected: 27 + 2 = **29 passed**.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/services/__tests__/editor-store.test.ts
git commit -m "test(scada-engine): editorStore updateWidget multi-key regression (SP-FX-3b.2.3)

2 tests verify key-aware patch (per 3b.2.2 T1): multi-key {x,y,rotate}
sets all 3 atomically; mixed {rotate: undefined, x: 100} deletes rotate
key while setting x. No impl change."
```

---

## Task 5: EditorCanvas wire 2 new cb + 8 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append at END of `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
describe('EditorCanvas multi-select group operations (SP-FX-3b.2.3)', () => {
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

  it('multi-select (2 widgets) bbox shows 8 resize + rotate handles visible', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 100, w: 100, h: 60 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const handles = container.querySelectorAll('[data-handle]');
    const visibleCount = Array.from(handles).filter((h) => h.getAttribute('visibility') !== 'hidden').length;
    expect(visibleCount).toBe(9);
  });

  it('multi-select group-rotate: store widgets rotate field updates after commit', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 20, h: 20 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 20, h: 20 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { x: 100, y: 100, w: 20, h: 20, rotate: 90 } as any, { silent: true });
      useEditorStore.getState().updateWidget('w2', { x: 200, y: 200, w: 20, h: 20, rotate: 90 } as any);
    });
    expect((useEditorStore.getState().currentView!.items.w1 as any).rotate).toBe(90);
    expect((useEditorStore.getState().currentView!.items.w2 as any).rotate).toBe(90);
  });

  it('multi-select group-rotate commit produces 1 history entry (silent batch)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 100, y: 100, w: 20, h: 20 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 200, w: 20, h: 20 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const past0 = useEditorStore.getState().history.past.length;
    act(() => {
      useEditorStore.getState().updateWidget('w1', { rotate: 45 } as any, { silent: true });
      useEditorStore.getState().updateWidget('w2', { rotate: 45 } as any);
    });
    expect(useEditorStore.getState().history.past.length).toBe(past0 + 1);
  });

  it('multi-select group-resize SE: both widgets w/h scale via updateWidget batch', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 10, y: 10, w: 30, h: 20 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 60, y: 50, w: 30, h: 20 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { x: 10, y: 10, w: 60, h: 40 } as any, { silent: true });
      useEditorStore.getState().updateWidget('w2', { x: 120, y: 90, w: 60, h: 40 } as any);
    });
    const w1 = useEditorStore.getState().currentView!.items.w1 as any;
    const w2 = useEditorStore.getState().currentView!.items.w2 as any;
    expect(w1.w).toBe(60);
    expect(w2.w).toBe(60);
    expect(w2.x).toBe(120);
  });

  it('single-select still uses single mode (4 bbox corners hidden, handles at widget box)', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 100, h: 60 } as any,
      }));
      useEditorStore.getState().setSelection(['w1']);
    });
    const corners = container.querySelectorAll('[data-bbox-corner]');
    corners.forEach((c) => {
      expect(c.getAttribute('visibility')).toBe('hidden');
    });
    const handles = container.querySelectorAll('[data-handle]');
    expect(handles.length).toBe(9);
  });

  it('multi-select with 2 rotated widgets renders both transform attrs', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60, rotate: 30 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 100, w: 100, h: 60, rotate: 45 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    const el1 = container.querySelector('[data-widget-id="w1"]') as SVGElement;
    const el2 = container.querySelector('[data-widget-id="w2"]') as SVGElement;
    expect(el1.getAttribute('transform')).toContain('rotate(30');
    expect(el2.getAttribute('transform')).toContain('rotate(45');
  });

  it('ESC clears selection in idle when 2 widgets selected (regression of 3b.2.1 Tier 2)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60 } as any,
        w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 200, y: 100, w: 100, h: 60 } as any,
      }));
      useEditorStore.getState().setSelection(['w1', 'w2']);
    });
    act(() => { fireKey('Escape'); });
    expect(useEditorStore.getState().selection).toEqual([]);
  });

  it('group operation commit strips rotate=0 in last entry (commitRotate(0) regression)', () => {
    render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeViewWithItems({
        w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 0, y: 0, w: 100, h: 60, rotate: 30 } as any,
      }));
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { rotate: undefined } as any);
    });
    const w1 = useEditorStore.getState().currentView!.items.w1 as any;
    expect('rotate' in w1).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -15
```

Expected: at least 1 failure (other tests may pass post-T1).

- [ ] **Step 3: Patch EditorCanvas.tsx — add 2 new cb to PointerTools ctor**

Open `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`. Find the closing of PointerTools ctor (after `onRotateMove` cb, before the closing `});`):

```tsx
      onRotateMove: (deg, pivot) => {
        if (!refs.current) return;
        if (deg === null || pivot === null) refs.current.rotateTooltip.hide();
        else refs.current.rotateTooltip.show(deg, pivot);
      },
    });
```

Replace with:

```tsx
      onRotateMove: (deg, pivot) => {
        if (!refs.current) return;
        if (deg === null || pivot === null) refs.current.rotateTooltip.hide();
        else refs.current.rotateTooltip.show(deg, pivot);
      },
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
    });
```

- [ ] **Step 4: Run test to verify GREEN**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -10
```

Expected: 29 + 8 = **37 passed**.

- [ ] **Step 5: tsc full pass**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep "error TS" | head -10
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): EditorCanvas wires group-rotate/resize cb (SP-FX-3b.2.3)

PointerTools cb now 16 (2 new: getCurrentRotates / onGroupRotated).
onGroupRotated commits via silent batching (i<N-1 silent, last non-silent)
producing 1 history entry per group operation. rotate=0 maps to
{rotate: undefined} stripping the key per 3b.2.2 convention. 8 new
tests; 29 existing tests preserved."
```

---

## Task 6: editor barrel +exports

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`

- [ ] **Step 1: Update barrel**

Find:

```ts
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  applyRotate,
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
  applyMultiRotate, applyGroupResize, anchorOf,
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
git commit -m "feat(scada-engine): export applyMultiRotate + applyGroupResize + anchorOf (SP-FX-3b.2.3)"
```

---

## Task 7: Playwright 3 smoke

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-canvas-3b2-3.spec.ts`

- [ ] **Step 1: Write the smoke spec**

Create `packages/web-ui/e2e/scada-editor-canvas-3b2-3.spec.ts`:

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

test.describe('SP-FX-3b.2.3 — multi-select rotate + group-resize', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
    await page.waitForTimeout(200);
  });

  test('Ctrl+A + rotate handle drag ~90°: both widgets rotate field updated and positions orbit bbox center', async ({ page }) => {
    await page.keyboard.press('Control+a');
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
    // Fixture: w1 (50, 50, 120, 80); w2 (300, 200, 100, 60). bbox = (50, 50, 350, 210) → center (225, 155)
    const pivotX = canvasSvgBbox.x + 225;
    const pivotY = canvasSvgBbox.y + 155;
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
    expect(view.items.w2.rotate).toBeGreaterThan(60);
    expect(view.items.w2.rotate).toBeLessThan(120);
  });

  test('Ctrl+A + SE corner drag +50 +50: both widgets grow proportionally; NW anchor unchanged', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    const seHandle = await page.locator('[data-handle="se"]').boundingBox();
    if (!seHandle) throw new Error('SE handle bbox unavailable');

    const w1Before = await page.evaluate(() => (window as any).__getCurrentView().items.w1);

    await page.mouse.move(seHandle.x + seHandle.width / 2, seHandle.y + seHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(seHandle.x + seHandle.width / 2 + 50, seHandle.y + seHandle.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.x).toBe(w1Before.x);
    expect(view.items.w1.y).toBe(w1Before.y);
    expect(view.items.w1.w).toBeGreaterThan(w1Before.w);
    expect(view.items.w1.h).toBeGreaterThan(w1Before.h);
  });

  test('Ctrl+A + Shift+NE corner drag uneven: aspect ratio preserved', async ({ page }) => {
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    const neHandle = await page.locator('[data-handle="ne"]').boundingBox();
    if (!neHandle) throw new Error('NE handle bbox unavailable');

    const w1Before = await page.evaluate(() => (window as any).__getCurrentView().items.w1);
    const aspectBefore = w1Before.w / w1Before.h;

    await page.keyboard.down('Shift');
    await page.mouse.move(neHandle.x + neHandle.width / 2, neHandle.y + neHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(neHandle.x + neHandle.width / 2 + 100, neHandle.y + neHandle.height / 2 - 30, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    const view = await page.evaluate(() => (window as any).__getCurrentView());
    const aspectAfter = view.items.w1.w / view.items.w1.h;
    expect(Math.abs(aspectAfter - aspectBefore)).toBeLessThan(0.01);
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
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas-3b2-3.spec.ts 2>&1 | tail -30
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-editor-canvas-3b2-3.spec.ts
git commit -m "test(scada-engine): Playwright multi-select rotate + group-resize smoke (SP-FX-3b.2.3)

3 smoke tests: Ctrl+A + rotate handle 90° drag commits both widgets'
rotate ≈ 90; SE corner drag scales both widgets w/h while preserving
NW anchor; Shift+NE corner uneven drag preserves widget aspect ratio."
```

---

## Task 8: Regression + §8 stop-check + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | grep -E "Test Files|Tests" | tail -3
```

Expected: 613 + 6 + 4 + 10 + 2 + 2 + 8 = **645 passed**.

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

- [ ] **Step 4: Playwright regression (20 total)**

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
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas.spec.ts e2e/scada-editor-canvas-3b1.spec.ts e2e/scada-editor-canvas-3b2-1.spec.ts e2e/scada-editor-canvas-3b2-2.spec.ts e2e/scada-editor-canvas-3b2-3.spec.ts 2>&1 | tail -10
pkill -f "next dev" 2>/dev/null; true
pkill -f "@biocore/server" 2>/dev/null; true
```

Expected: 3 + 7 + 5 + 2 + 3 = **20 passed**.

- [ ] **Step 5: §8 stop-condition self-check**

Verify each (per spec §8):
1. Bbox mode shows 8 resize + rotate handles + 4 corner indicators → T1 + T5.
2. Group-rotate rigid body around bbox center → T0 + T2 + T7.
3. Group-rotate Shift→15° snap → T0 snap test + T2.
4. Group-resize anchor at opposite corner/edge → T0 anchorOf + T2.
5. Group-resize Shift aspect-lock → T0 + T2 + T7.
6. Group-resize min-size freeze → T0 + T2.
7. ESC mid-group-rotate / mid-group-resize restores all → T2 cancel tests.
8. 1 history entry per group operation → T5 silent batch test.
9. Existing single-select preserved → T2 33 existing tests + T5 29 EditorCanvas tests preserved.
10. web-ui 645/645 + server 147 + data-service 84 + tsc clean + Playwright 20/20 → steps 1-4.

If any fails → STOP, surface, no push.

- [ ] **Step 6: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds.

---

## Self-Review

**Spec coverage (§1.1 in-scope):**
1. transform-handles.showBbox rewrite → T1 ✓
2. Multi-rotate rigid around bbox center → T0 + T2 ✓
3. Group-resize 8 handles anchor at opposite → T0 + T2 ✓
4. Min-size freeze → T0 + T2 ✓
5. History 1 entry per drag → T5 ✓
6. ESC cancel Tier 1 covers group ops → T2 cancel ✓
7. RotateTooltip reused → T2 group-rotate calls cb.onRotateMove ✓

**Spec §4.7 (showBbox rewrite):** T1 ✓
**Spec §4.8 (EditorCanvas 2 new cb):** T5 ✓
**Spec §5 test counts:** target 613 → 645 (+32) = 6+4+10+2+2+8 = 32 ✓
**Spec §8 stop conditions:** mapped in T8 step 5 ✓

**Placeholder scan:** none.

**Type consistency:**
- `applyMultiRotate(startBoxes, startRotates, pivot, startPt, currentPt, snapStep) → MultiRotateResult` — T0 def, T2 use ✓
- `applyGroupResize(startBbox, newBbox, handle, startBoxes, aspectLock) → GroupResizeResult | null` — T0 def, T2 use ✓
- `anchorOf(handle, bbox) → Point` — T0 def, T2 use ✓
- `getCurrentRotates(ids) → Map<string, number>` — T2 interface, T5 wire ✓
- `onGroupRotated(entries: { id; newBox; newRotate }[])` — T2 interface, T5 wire ✓
- `PointerState` 7 variants — T2 ✓

No gaps found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-3b-2-3-multi-rotate-group-resize-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review (spec compliance + code quality), same-session continuous execution.

**2. Inline Execution** — batch tasks in this session via executing-plans with checkpoints for review.
