# SP-FX-3a Editor Canvas Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate a svg.js-based editor canvas end-to-end in 1 week: render widgets, single-select, drag move, resize via SE handle, mouseup commits to editorStore. Three test layers (pure / jsdom / Playwright) gate the spike.

**Architecture:** Five focused files under `packages/web-ui/src/scada-engine/editor/` split by responsibility — `geometry.ts` (pure), `canvas-svg.ts` (svg.js DOM), `transform-handles.ts` (overlay), `pointer-tools.ts` (state machine), `EditorCanvas.tsx` (React shell). Reuses SP-FX-2 `editorStore` for state + history. A temporary `app/dev/scada-editor-canvas/page.tsx` route serves Playwright smoke until SP-FX-4 wires the toolbar.

**Tech Stack:** Node 20+, TypeScript 5, Next.js 14 / React 18 (web-ui), `@svgdotjs/svg.js ^3.2.4` (new, ~50KB MIT), zustand 4.4 (via SP-FX-2 editorStore), immer 10 (existing), vitest + jsdom + @testing-library/react (existing), Playwright (existing config at `packages/web-ui/playwright.config.ts`).

---

## File Structure (what this plan creates / modifies)

**Modify:**
- `packages/web-ui/package.json` — add `@svgdotjs/svg.js ^3.2.4`
- `packages/web-ui/src/scada-engine/models/widget.ts` — patch `FuxaWidgetSchema` add optional `x / y / w / h` (number, ≥0)
- `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts` — +2 tests for new optional fields
- `packages/web-ui/src/scada-engine/index.ts` — re-export `EditorCanvas` + `CanvasController`

**Create (test helpers):**
- `packages/web-ui/src/test/canvasMock.ts` — `mockCanvasController()` stub for pointer-tools tests
- `packages/web-ui/src/test/svgDomHelpers.ts` — `mockClientRect()`, `mockGetCTM()` for jsdom svg tests

**Create (editor):**
- `packages/web-ui/src/scada-engine/editor/geometry.ts` — pure functions
- `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts` — 15 unit tests
- `packages/web-ui/src/scada-engine/editor/canvas-svg.ts` — svg.js wrapper class
- `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts` — 10 jsdom tests
- `packages/web-ui/src/scada-engine/editor/transform-handles.ts` — overlay handles
- `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts` — 8 jsdom tests
- `packages/web-ui/src/scada-engine/editor/pointer-tools.ts` — state machine
- `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts` — 12 state machine tests
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx` — React component
- `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx` — 8 React tests
- `packages/web-ui/src/scada-engine/editor/index.ts` — barrel
- `packages/web-ui/src/scada-engine/editor/README.md` — SP-FX-3a → 3b roadmap

**Create (dev page + e2e):**
- `packages/web-ui/src/app/dev/scada-editor-canvas/page.tsx` — Playwright fixture, production-guarded
- `packages/web-ui/e2e/scada-editor-canvas.spec.ts` — 3 Playwright smoke tests

**Test count target:**
- web-ui 471 → **~526** (+55: 2 model + 15 geo + 10 canvas + 8 handles + 12 pointer + 8 React)
- Playwright +3 smoke (drag / select / resize)

---

## Task 0: Install svg.js + setup test helpers

**Files:**
- Modify: `packages/web-ui/package.json`
- Create: `packages/web-ui/src/test/canvasMock.ts`
- Create: `packages/web-ui/src/test/svgDomHelpers.ts`

- [ ] **Step 1: Add svg.js dep to package.json**

Edit `packages/web-ui/package.json`. Locate `"dependencies"` block. Insert alphabetically:

```json
"@svgdotjs/svg.js": "^3.2.4",
```

(`@playwright/test` already in devDependencies; `playwright.config.ts` already at `packages/web-ui/playwright.config.ts`; `packages/web-ui/e2e/` dir already exists.)

Install:

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm install
```

Expected: `node_modules/@svgdotjs/svg.js/dist/svg.esm.js` exists.

- [ ] **Step 2: Create `canvasMock.ts`**

Create `packages/web-ui/src/test/canvasMock.ts`:

```ts
// Test helper: minimal CanvasController stand-in for pointer-tools unit tests.
// pointer-tools is framework-agnostic and only calls canvas.upsertWidget /
// canvas.getSvgRoot; we stub them out so pointer-tools tests don't drag in
// svg.js + jsdom.
//
// Usage:
//   const canvas = makeMockCanvas();
//   const tools = new PointerTools(canvas, mockHandles, callbacks);
//   tools.handleMouseDown(...)

import { vi } from 'vitest';

export interface MockCanvas {
  upsertWidget: ReturnType<typeof vi.fn>;
  getSvgRoot: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  _svgRoot: SVGSVGElement;
}

export function makeMockCanvas(): MockCanvas {
  const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  document.body.appendChild(svgRoot);
  return {
    upsertWidget: vi.fn(),
    getSvgRoot: vi.fn(() => svgRoot),
    destroy: vi.fn(),
    _svgRoot: svgRoot,
  };
}

export interface MockHandles {
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  updateBox: ReturnType<typeof vi.fn>;
  hitTest: ReturnType<typeof vi.fn>;
}

export function makeMockHandles(): MockHandles {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    updateBox: vi.fn(),
    hitTest: vi.fn(() => null),
  };
}
```

- [ ] **Step 3: Create `svgDomHelpers.ts`**

Create `packages/web-ui/src/test/svgDomHelpers.ts`:

```ts
// jsdom helpers for SVG tests. jsdom does not implement:
// - SVGSVGElement.getCTM / getScreenCTM
// - SVGGraphicsElement.getBBox
// - getBoundingClientRect returning realistic values
// These helpers patch missing methods on specific elements so tests can
// exercise code paths that depend on them.

export function mockGetCTM(svg: SVGSVGElement, ctm?: DOMMatrix): void {
  const matrix = ctm ?? (typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix));
  (svg as any).getCTM = () => matrix;
  (svg as any).getScreenCTM = () => matrix;
}

export function mockBBox(el: SVGGraphicsElement, bbox: { x: number; y: number; width: number; height: number }): void {
  (el as any).getBBox = () => bbox;
}

export function mockClientRect(el: HTMLElement | SVGElement, rect: { left?: number; top?: number; width?: number; height?: number }): void {
  const full = {
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    width: rect.width ?? 800,
    height: rect.height ?? 600,
    right: (rect.left ?? 0) + (rect.width ?? 800),
    bottom: (rect.top ?? 0) + (rect.height ?? 600),
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    toJSON: () => full,
  };
  (el as any).getBoundingClientRect = () => full;
}

export function identityMatrix(): DOMMatrix {
  return typeof DOMMatrix !== 'undefined'
    ? new DOMMatrix()
    : ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix);
}
```

- [ ] **Step 4: Verify helpers compile**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep -E "canvasMock|svgDomHelpers"
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git status --short
git add packages/web-ui/package.json packages/web-ui/src/test/canvasMock.ts packages/web-ui/src/test/svgDomHelpers.ts
git add pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(web-ui): add svg.js dep + canvas/svg test helpers (SP-FX-3a)

@svgdotjs/svg.js ^3.2.4 for editor canvas. canvasMock provides
MockCanvas + MockHandles stubs for pointer-tools unit tests.
svgDomHelpers patches missing jsdom SVG methods (getCTM, getBBox,
getBoundingClientRect)."
```

---

## Task 1: FuxaWidget schema patch (add x/y/w/h optional fields)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/models/widget.ts`
- Modify: `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts`

**Why this task exists:** R12 — current `FuxaWidget = { id, type, name?, property }` has no geometry. Editor needs x/y/w/h to render handles and apply drags. Add as optional fields (backward compatible, no schemaVersion bump).

- [ ] **Step 1: Write the failing tests**

Open `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts`. Find the describe block covering `FuxaWidgetSchema` (or `FuxaEventSchema` if widget tests live there). Append at end:

```ts
it('FuxaWidgetSchema accepts optional x/y/w/h geometry fields', () => {
  const parsed = FuxaWidgetSchema.parse({
    id: 'w1', type: 'svg-ext-value', property: {},
    x: 100, y: 50, w: 80, h: 40,
  });
  expect(parsed.x).toBe(100);
  expect(parsed.y).toBe(50);
  expect(parsed.w).toBe(80);
  expect(parsed.h).toBe(40);
});

it('FuxaWidgetSchema parses widget without geometry (backward-compat)', () => {
  const parsed = FuxaWidgetSchema.parse({
    id: 'w1', type: 'svg-ext-value', property: {},
  });
  expect(parsed.x).toBeUndefined();
  expect(parsed.w).toBeUndefined();
});
```

Add `FuxaWidgetSchema` to top-of-file import if not already there (it lives in `../widget`).

- [ ] **Step 2: Run, expect 2 RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/models/__tests__/hmi.test.ts 2>&1 | tail -15
```

Expected: 1+ failures. zod strips unknown fields by default → `parsed.x` undefined → test 1 fails. Test 2 may already pass.

- [ ] **Step 3: Patch FuxaWidgetSchema**

Open `packages/web-ui/src/scada-engine/models/widget.ts`. Current shape:

```ts
export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  property: FuxaPropertySchema,
});
```

Replace with:

```ts
export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),
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

- [ ] **Step 4: Run, expect all GREEN**

Same command as Step 2. Expected: previously passing + 2 new pass.

- [ ] **Step 5: Verify SP-FX-1 models not broken**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/models/ 2>&1 | tail -5
```

Expected: all model tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/models/widget.ts packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts
git commit -m "feat(scada-engine): FuxaWidget add optional x/y/w/h geometry (SP-FX-3a)

Editor canvas needs widget coordinates to render handles + apply drags.
Add as optional fields — backward compatible with v1 FUXA imports that
store coords inside svgcontent. schemaVersion stays at 1. +2 tests for
new fields with/without geometry."
```

---

## Task 2: geometry.ts (pure functions, 15 tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/geometry.ts`
- Create: `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  type Box,
} from '../geometry';
import { identityMatrix } from '@/test/svgDomHelpers';

describe('geometry.clientToSvg (SP-FX-3a)', () => {
  it('identity ctm returns same point', () => {
    expect(clientToSvg({ x: 10, y: 20 }, identityMatrix())).toEqual({ x: 10, y: 20 });
  });

  it('translate matrix shifts point by e/f', () => {
    const m = identityMatrix();
    (m as any).e = 100; (m as any).f = 50;
    const out = clientToSvg({ x: 10, y: 20 }, m);
    expect(out.x).toBe(110);
    expect(out.y).toBe(70);
  });

  it('scale matrix scales point by a/d', () => {
    const m = identityMatrix();
    (m as any).a = 2; (m as any).d = 2;
    expect(clientToSvg({ x: 10, y: 20 }, m)).toEqual({ x: 20, y: 40 });
  });
});

describe('geometry.handlePositions (SP-FX-3a)', () => {
  it('returns 9 handle positions for a 100x80 box at origin', () => {
    const box: Box = { x: 0, y: 0, w: 100, h: 80 };
    const p = handlePositions(box);
    expect(p.nw).toEqual({ x: 0, y: 0 });
    expect(p.n).toEqual({ x: 50, y: 0 });
    expect(p.ne).toEqual({ x: 100, y: 0 });
    expect(p.w).toEqual({ x: 0, y: 40 });
    expect(p.e).toEqual({ x: 100, y: 40 });
    expect(p.sw).toEqual({ x: 0, y: 80 });
    expect(p.s).toEqual({ x: 50, y: 80 });
    expect(p.se).toEqual({ x: 100, y: 80 });
    expect(p.rotate.x).toBe(50);
    expect(p.rotate.y).toBeLessThan(0);
  });

  it('handles offset box', () => {
    const box: Box = { x: 50, y: 30, w: 200, h: 100 };
    const p = handlePositions(box);
    expect(p.se).toEqual({ x: 250, y: 130 });
    expect(p.n).toEqual({ x: 150, y: 30 });
  });

  it('handles 5x5 minimum box', () => {
    const box: Box = { x: 0, y: 0, w: 5, h: 5 };
    const p = handlePositions(box);
    expect(p.se).toEqual({ x: 5, y: 5 });
  });
});

describe('geometry.handleFromPoint (SP-FX-3a)', () => {
  const box: Box = { x: 100, y: 100, w: 80, h: 60 };

  it('detects SE handle within threshold', () => {
    expect(handleFromPoint(box, { x: 180, y: 160 })).toBe('se');
    expect(handleFromPoint(box, { x: 183, y: 162 })).toBe('se');
  });

  it('detects each corner handle', () => {
    expect(handleFromPoint(box, { x: 100, y: 100 })).toBe('nw');
    expect(handleFromPoint(box, { x: 180, y: 100 })).toBe('ne');
    expect(handleFromPoint(box, { x: 100, y: 160 })).toBe('sw');
  });

  it('detects each edge midpoint handle', () => {
    expect(handleFromPoint(box, { x: 140, y: 100 })).toBe('n');
    expect(handleFromPoint(box, { x: 180, y: 130 })).toBe('e');
    expect(handleFromPoint(box, { x: 140, y: 160 })).toBe('s');
    expect(handleFromPoint(box, { x: 100, y: 130 })).toBe('w');
  });

  it('returns null for point well inside body (no handle near)', () => {
    expect(handleFromPoint(box, { x: 140, y: 130 })).toBeNull();
  });

  it('returns null for points far outside', () => {
    expect(handleFromPoint(box, { x: 50, y: 50 })).toBeNull();
    expect(handleFromPoint(box, { x: 300, y: 300 })).toBeNull();
  });

  it('respects custom threshold', () => {
    expect(handleFromPoint(box, { x: 190, y: 170 }, 3)).toBeNull();
    expect(handleFromPoint(box, { x: 190, y: 170 }, 15)).toBe('se');
  });
});

describe('geometry.applyHandleDrag (SP-FX-3a)', () => {
  const box: Box = { x: 100, y: 100, w: 80, h: 60 };

  it('SE handle: dx/dy increases w/h', () => {
    expect(applyHandleDrag(box, 'se', 20, 10)).toEqual({ x: 100, y: 100, w: 100, h: 70 });
  });

  it('NW handle: dx/dy moves x/y and shrinks w/h', () => {
    expect(applyHandleDrag(box, 'nw', 10, 10)).toEqual({ x: 110, y: 110, w: 70, h: 50 });
  });

  it('N handle: dy moves y and shrinks h', () => {
    expect(applyHandleDrag(box, 'n', 0, 15)).toEqual({ x: 100, y: 115, w: 80, h: 45 });
  });

  it('E handle: dx grows w', () => {
    expect(applyHandleDrag(box, 'e', 30, 0)).toEqual({ x: 100, y: 100, w: 110, h: 60 });
  });

  it('clamps SE shrink to 5x5 minimum', () => {
    expect(applyHandleDrag(box, 'se', -200, -200)).toEqual({ x: 100, y: 100, w: 5, h: 5 });
  });

  it('clamps NW over-expand to 5x5 minimum', () => {
    const out = applyHandleDrag(box, 'nw', 200, 200);
    expect(out.w).toBe(5);
    expect(out.h).toBe(5);
  });

  it('rotate handle is a no-op in SP-FX-3a', () => {
    expect(applyHandleDrag(box, 'rotate', 50, 50)).toEqual(box);
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/geometry.test.ts 2>&1 | tail -10
```

Expected: 15 failures.

- [ ] **Step 3: Write geometry.ts**

Create `packages/web-ui/src/scada-engine/editor/geometry.ts`:

```ts
// SP-FX-3a pure geometry helpers for the editor canvas. No DOM dependency.

export interface Box { x: number; y: number; w: number; h: number; }
export interface Point { x: number; y: number; }

export type HandleId =
  | 'nw' | 'n' | 'ne'
  | 'w'  | 'e'
  | 'sw' | 's' | 'se'
  | 'rotate';

const ROTATE_HANDLE_OFFSET = 20;
const MIN_BOX = 5;

export function clientToSvg(pt: Point, ctm: { a: number; b: number; c: number; d: number; e: number; f: number }): Point {
  return {
    x: ctm.a * pt.x + ctm.c * pt.y + ctm.e,
    y: ctm.b * pt.x + ctm.d * pt.y + ctm.f,
  };
}

export function handlePositions(box: Box): Record<HandleId, Point> {
  const x = box.x;
  const y = box.y;
  const w = box.w;
  const h = box.h;
  return {
    nw: { x, y },
    n:  { x: x + w / 2, y },
    ne: { x: x + w, y },
    w:  { x, y: y + h / 2 },
    e:  { x: x + w, y: y + h / 2 },
    sw: { x, y: y + h },
    s:  { x: x + w / 2, y: y + h },
    se: { x: x + w, y: y + h },
    rotate: { x: x + w / 2, y: y - ROTATE_HANDLE_OFFSET },
  };
}

const HANDLE_ORDER: HandleId[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'];
const DEFAULT_THRESHOLD = 6;

export function handleFromPoint(box: Box, pt: Point, threshold: number = DEFAULT_THRESHOLD): HandleId | null {
  const positions = handlePositions(box);
  for (const h of HANDLE_ORDER) {
    const p = positions[h];
    if (Math.abs(pt.x - p.x) <= threshold && Math.abs(pt.y - p.y) <= threshold) {
      return h;
    }
  }
  return null;
}

export function applyHandleDrag(box: Box, handle: HandleId, dx: number, dy: number): Box {
  let { x, y, w, h } = box;

  switch (handle) {
    case 'nw': x += dx; y += dy; w -= dx; h -= dy; break;
    case 'n':  y += dy; h -= dy; break;
    case 'ne': y += dy; w += dx; h -= dy; break;
    case 'w':  x += dx; w -= dx; break;
    case 'e':  w += dx; break;
    case 'sw': x += dx; w -= dx; h += dy; break;
    case 's':  h += dy; break;
    case 'se': w += dx; h += dy; break;
    case 'rotate': return box;
  }

  // Clamp. If w/h drops below MIN_BOX, pin and freeze x/y on the side that
  // wouldn't pull beyond the opposite edge.
  if (w < MIN_BOX) {
    w = MIN_BOX;
    if (handle === 'nw' || handle === 'w' || handle === 'sw') x = box.x + (box.w - MIN_BOX);
    else x = box.x;
  }
  if (h < MIN_BOX) {
    h = MIN_BOX;
    if (handle === 'nw' || handle === 'n' || handle === 'ne') y = box.y + (box.h - MIN_BOX);
    else y = box.y;
  }

  return { x, y, w, h };
}
```

- [ ] **Step 4: GREEN**

Same command as Step 2. Expected: 15 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/geometry.ts packages/web-ui/src/scada-engine/editor/__tests__/geometry.test.ts
git commit -m "feat(scada-engine): geometry helpers for editor canvas (SP-FX-3a)

Pure functions: clientToSvg (matrix-applied), handlePositions (9 handles
incl rotate offset), handleFromPoint (AABB threshold hit test in handle
priority order), applyHandleDrag (8 dirs + rotate no-op + MIN 5x5 clamp).
15 tests cover positions for 3 box sizes, 9-handle hit detection + miss +
custom threshold, 8 direction deltas + 2 clamp scenarios + rotate no-op."
```

---

## Task 3: canvas-svg.ts (svg.js wrapper, 10 jsdom tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`
- Create: `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from '../canvas-svg';
import type { FuxaView, FuxaWidget } from '../../models';

function makeView(items: Record<string, FuxaWidget> = {}): FuxaView {
  return {
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items, schemaVersion: 1,
  } as FuxaView;
}

function makeWidget(id: string, x = 10, y = 10, w = 50, h = 30): FuxaWidget {
  return { id, type: 'svg-ext-value', property: {}, x, y, w, h } as FuxaWidget;
}

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe('CanvasController (SP-FX-3a)', () => {
  it('ctor creates svg root with widget + overlay layers', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    const svg = c.getSvgRoot();
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('800');
    expect(container.querySelector('[data-layer="widgets"]')).not.toBeNull();
    expect(container.querySelector('[data-layer="overlay"]')).not.toBeNull();
  });

  it('ctor throws on invalid size', () => {
    expect(() => new CanvasController(container, { width: 0, height: 600 })).toThrow(/invalid canvas size/i);
    expect(() => new CanvasController(container, { width: 800, height: -1 })).toThrow(/invalid canvas size/i);
  });

  it('loadView renders one widget per item', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1'), w2: makeWidget('w2', 100, 100) }));
    expect(c.getElement('w1')).toBeDefined();
    expect(c.getElement('w2')).toBeDefined();
  });

  it('upsertWidget creates element on first call', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1', 50, 30, 100, 80));
    const el = c.getElement('w1');
    expect(el).toBeDefined();
    expect(el!.node.getAttribute('x')).toBe('50');
    expect(el!.node.getAttribute('y')).toBe('30');
    expect(el!.node.getAttribute('width')).toBe('100');
    expect(el!.node.getAttribute('height')).toBe('80');
  });

  it('upsertWidget updates existing element on second call', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1', 50, 30));
    c.upsertWidget(makeWidget('w1', 200, 150, 60, 40));
    const el = c.getElement('w1');
    expect(el!.node.getAttribute('x')).toBe('200');
    expect(el!.node.getAttribute('width')).toBe('60');
  });

  it('upsertWidget skips widgets without x/y/w/h (no crash)', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget({ id: 'no-geo', type: 'svg-ext-value', property: {} } as FuxaWidget);
    expect(c.getElement('no-geo')).toBeUndefined();
  });

  it('removeWidget deletes the element', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1'));
    c.removeWidget('w1');
    expect(c.getElement('w1')).toBeUndefined();
  });

  it('removeWidget on missing id is a no-op', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    expect(() => c.removeWidget('ghost')).not.toThrow();
  });

  it('destroy clears all elements and is idempotent', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.upsertWidget(makeWidget('w1'));
    c.destroy();
    expect(container.querySelector('svg')).toBeNull();
    expect(() => c.destroy()).not.toThrow();
    expect(() => c.upsertWidget(makeWidget('w2'))).not.toThrow();
    expect(c.getElement('w2')).toBeUndefined();
  });

  it('loadView replaces existing widget map (idempotent on re-load)', () => {
    const c = new CanvasController(container, { width: 800, height: 600 });
    c.loadView(makeView({ w1: makeWidget('w1') }));
    expect(c.getElement('w1')).toBeDefined();
    c.loadView(makeView({ w2: makeWidget('w2') }));
    expect(c.getElement('w1')).toBeUndefined();
    expect(c.getElement('w2')).toBeDefined();
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts 2>&1 | tail -10
```

Expected: 10 failures.

- [ ] **Step 3: Write canvas-svg.ts**

Create `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`:

```ts
// SP-FX-3a: svg.js wrapper for the editor canvas. Owns the root <svg> element
// and two layers: widgetLayer (FuxaWidget DOM) and overlayLayer (selection
// box + transform handles). Stateless wrt user interaction.

import { SVG, type Svg, type G, type Element as SvgElement } from '@svgdotjs/svg.js';
import type { FuxaView, FuxaWidget } from '../models';

export interface CanvasOpts {
  width: number;
  height: number;
}

function hasGeometry(w: FuxaWidget): w is FuxaWidget & { x: number; y: number; w: number; h: number } {
  return typeof (w as any).x === 'number'
    && typeof (w as any).y === 'number'
    && typeof (w as any).w === 'number'
    && typeof (w as any).h === 'number';
}

export class CanvasController {
  readonly root: Svg;
  readonly widgetLayer: G;
  readonly overlayLayer: G;
  private widgetMap = new Map<string, SvgElement>();
  private destroyed = false;

  constructor(container: HTMLElement, opts: CanvasOpts) {
    if (opts.width <= 0 || opts.height <= 0) {
      throw new Error('invalid canvas size');
    }
    this.root = SVG().addTo(container).size(opts.width, opts.height).viewbox(0, 0, opts.width, opts.height);
    this.widgetLayer = this.root.group().attr('data-layer', 'widgets');
    this.overlayLayer = this.root.group().attr('data-layer', 'overlay');
  }

  loadView(view: FuxaView): void {
    if (this.destroyed) return;
    for (const [, el] of this.widgetMap) el.remove();
    this.widgetMap.clear();
    for (const id in view.items) {
      this.upsertWidget(view.items[id]);
    }
  }

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
        .move(widget.x, widget.y)
        .attr('data-widget-id', widget.id)
        .attr('fill', '#3b82f6')
        .attr('stroke', '#1e40af');
      this.widgetMap.set(widget.id, el);
    } else {
      el.attr('x', widget.x).attr('y', widget.y).attr('width', widget.w).attr('height', widget.h);
    }
  }

  removeWidget(id: string): void {
    if (this.destroyed) return;
    const el = this.widgetMap.get(id);
    if (!el) return;
    el.remove();
    this.widgetMap.delete(id);
  }

  getElement(id: string): SvgElement | undefined {
    return this.widgetMap.get(id);
  }

  getSvgRoot(): SVGSVGElement {
    return this.root.node as SVGSVGElement;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.widgetMap.clear();
    this.root.remove();
  }
}
```

- [ ] **Step 4: GREEN**

Same command as Step 2. Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/canvas-svg.ts packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts
git commit -m "feat(scada-engine): CanvasController svg.js wrapper (SP-FX-3a)

Root <svg> + widgetLayer + overlayLayer. loadView/upsertWidget (create
or update by id) / removeWidget / destroy (idempotent, use-after-free
guard). Widgets without x/y/w/h skipped with console.warn. 10 jsdom
tests cover ctor + load + upsert + remove + replace + destroy."
```

---

## Task 4: transform-handles.ts (overlay handles, 8 jsdom tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/transform-handles.ts`
- Create: `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasController } from '../canvas-svg';
import { TransformHandles } from '../transform-handles';
import type { Box } from '../geometry';

let container: HTMLDivElement;
let canvas: CanvasController;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  canvas = new CanvasController(container, { width: 800, height: 600 });
});

afterEach(() => {
  canvas.destroy();
  container.remove();
});

describe('TransformHandles (SP-FX-3a)', () => {
  it('starts hidden', () => {
    new TransformHandles(canvas.overlayLayer);
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute('visibility')).toBe('hidden');
  });

  it('show renders 9 handles + selection rect', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    const handles = container.querySelectorAll('[data-handle]');
    expect(handles.length).toBe(9);
    expect(container.querySelector('[data-overlay-part="selection-rect"]')).not.toBeNull();
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
  });

  it('hide collapses the overlay', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 0, y: 0, w: 50, h: 50 });
    h.hide();
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).toBe('hidden');
  });

  it('updateBox moves existing handles to new positions', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 0, y: 0, w: 50, h: 50 });
    const firstSe = container.querySelector('[data-handle="se"]') as SVGRectElement;
    expect(firstSe.getAttribute('x')).toBe(String(50 - 4));
    h.updateBox({ x: 0, y: 0, w: 200, h: 100 });
    const sameSe = container.querySelector('[data-handle="se"]') as SVGRectElement;
    expect(sameSe).toBe(firstSe);
    expect(sameSe.getAttribute('x')).toBe(String(200 - 4));
  });

  it('hitTest returns SE handle at SE position', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    h.show(box);
    expect(h.hitTest({ x: 180, y: 160 })).toBe('se');
  });

  it('hitTest returns NW handle at NW position', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    expect(h.hitTest({ x: 100, y: 100 })).toBe('nw');
  });

  it('hitTest returns rotate handle at rotate position', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    expect(h.hitTest({ x: 140, y: 80 })).toBe('rotate');
  });

  it('hitTest returns null when hidden', () => {
    const h = new TransformHandles(canvas.overlayLayer);
    h.show({ x: 100, y: 100, w: 80, h: 60 });
    h.hide();
    expect(h.hitTest({ x: 180, y: 160 })).toBeNull();
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/transform-handles.test.ts 2>&1 | tail -10
```

Expected: 8 failures.

- [ ] **Step 3: Write transform-handles.ts**

Create `packages/web-ui/src/scada-engine/editor/transform-handles.ts`:

```ts
// SP-FX-3a: selection overlay — 8 resize handles + 1 rotate placeholder + dashed
// selection rect. Owned by an svg.js group passed in by the canvas.

import type { G, Rect } from '@svgdotjs/svg.js';
import { handlePositions, handleFromPoint, type Box, type HandleId } from './geometry';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

export class TransformHandles {
  private group: G;
  private selectionRect: Rect;
  private handles: Record<HandleId, Rect>;
  private currentBox: Box | null = null;
  private visible = false;

  constructor(overlay: G) {
    this.group = overlay.group().attr('data-overlay', 'transform').attr('visibility', 'hidden');
    this.selectionRect = this.group.rect(0, 0)
      .attr('data-overlay-part', 'selection-rect')
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-dasharray', '4 2');
    this.handles = {} as Record<HandleId, Rect>;
    for (const id of ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate'] as HandleId[]) {
      const r = this.group.rect(HANDLE_SIZE, HANDLE_SIZE)
        .attr('data-handle', id)
        .attr('fill', id === 'rotate' ? '#10b981' : '#ffffff')
        .attr('stroke', '#3b82f6');
      this.handles[id] = r;
    }
  }

  show(box: Box): void {
    this.currentBox = box;
    this.visible = true;
    this.group.attr('visibility', 'visible');
    this.layout(box);
  }

  hide(): void {
    this.visible = false;
    this.currentBox = null;
    this.group.attr('visibility', 'hidden');
  }

  updateBox(box: Box): void {
    this.currentBox = box;
    this.layout(box);
  }

  hitTest(pt: { x: number; y: number }): HandleId | null {
    if (!this.visible || !this.currentBox) return null;
    return handleFromPoint(this.currentBox, pt);
  }

  private layout(box: Box): void {
    this.selectionRect.attr('x', box.x).attr('y', box.y).attr('width', box.w).attr('height', box.h);
    const positions = handlePositions(box);
    for (const id in positions) {
      const p = positions[id as HandleId];
      this.handles[id as HandleId].attr('x', p.x - HANDLE_HALF).attr('y', p.y - HANDLE_HALF);
    }
  }
}
```

- [ ] **Step 4: GREEN**

Same command as Step 2. Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/transform-handles.ts packages/web-ui/src/scada-engine/editor/__tests__/transform-handles.test.ts
git commit -m "feat(scada-engine): TransformHandles overlay (SP-FX-3a)

8 resize handles + 1 rotate placeholder + dashed selection rect.
show/hide/updateBox/hitTest. 8 jsdom tests cover initial hidden,
show rendering, hide collapse, updateBox repositioning, hitTest at
SE/NW/rotate positions, hitTest returns null when hidden."
```

---

## Task 5: pointer-tools.ts (state machine, 12 tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`
- Create: `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PointerTools } from '../pointer-tools';
import { makeMockCanvas, makeMockHandles, type MockCanvas, type MockHandles } from '@/test/canvasMock';
import { mockGetCTM, identityMatrix } from '@/test/svgDomHelpers';
import type { Box } from '../geometry';

let canvas: MockCanvas;
let handles: MockHandles;
let onWidgetTransformed: ReturnType<typeof vi.fn>;
let onSelect: ReturnType<typeof vi.fn>;
let getWidgetAt: ReturnType<typeof vi.fn>;
let tools: PointerTools;

beforeEach(() => {
  canvas = makeMockCanvas();
  mockGetCTM(canvas._svgRoot, identityMatrix());
  handles = makeMockHandles();
  onWidgetTransformed = vi.fn();
  onSelect = vi.fn();
  getWidgetAt = vi.fn();
  tools = new PointerTools(canvas as any, handles as any, {
    getWidgetAt: (pt) => getWidgetAt(pt),
    onWidgetTransformed: (id, box) => onWidgetTransformed(id, box),
    onSelect: (id) => onSelect(id),
  });
});

afterEach(() => {
  tools.destroy();
  canvas._svgRoot.remove();
});

function md(x: number, y: number): MouseEvent {
  return new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true });
}
function mm(x: number, y: number): MouseEvent {
  return new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true });
}
function mu(x: number, y: number): MouseEvent {
  return new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true });
}

describe('PointerTools (SP-FX-3a)', () => {
  it('starts in idle state', () => {
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown on empty area: onSelect(null), stays idle', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown on widget body: onSelect + transitions to drag-body', () => {
    const box: Box = { x: 10, y: 10, w: 50, h: 30 };
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    tools.handleMouseDown(md(30, 25));
    expect(onSelect).toHaveBeenCalledWith('w1');
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetId).toBe('w1');
      expect(tools.state.startBox).toEqual(box);
    }
  });

  it('mousedown on handle: transitions to drag-handle', () => {
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    tools.handleMouseDown(md(180, 160));
    expect(tools.state.kind).toBe('drag-handle');
    if (tools.state.kind === 'drag-handle') {
      expect(tools.state.handle).toBe('se');
    }
  });

  it('drag-body mousemove updates canvas + handles with translated box', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    expect(canvas.upsertWidget).toHaveBeenCalled();
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.x).toBe(20);
    expect(lastCall.y).toBe(15);
    expect(handles.updateBox).toHaveBeenCalledWith({ x: 20, y: 15, w: 50, h: 30 });
  });

  it('drag-body mouseup fires onWidgetTransformed and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    tools.handleMouseUp(mu(30, 25));
    expect(onWidgetTransformed).toHaveBeenCalledWith('w1', { x: 20, y: 15, w: 50, h: 30 });
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-handle SE: mousemove applies handle delta', () => {
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 100, y: 100, w: 80, h: 60 } });
    tools.handleMouseDown(md(180, 160));
    tools.handleMouseMove(mm(200, 175));
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.w).toBe(100);
    expect(lastCall.h).toBe(75);
  });

  it('drag-handle mouseup fires onWidgetTransformed with resized box', () => {
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 100, y: 100, w: 80, h: 60 } });
    tools.handleMouseDown(md(180, 160));
    tools.handleMouseUp(mu(200, 175));
    expect(onWidgetTransformed).toHaveBeenCalledWith('w1', expect.objectContaining({ w: 100, h: 75 }));
    expect(tools.state.kind).toBe('idle');
  });

  it('mousemove in idle does not throw', () => {
    expect(() => tools.handleMouseMove(mm(10, 10))).not.toThrow();
  });

  it('mouseup in idle does not throw', () => {
    expect(() => tools.handleMouseUp(mu(10, 10))).not.toThrow();
  });

  it('destroy makes subsequent calls no-op', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.destroy();
    tools.handleMouseDown(md(20, 20));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('re-mousedown after mouseup starts a fresh drag', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseUp(mu(20, 20));
    expect(tools.state.kind).toBe('idle');
    getWidgetAt.mockReturnValue({ id: 'w2', box: { x: 100, y: 100, w: 60, h: 40 } });
    tools.handleMouseDown(md(110, 110));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetId).toBe('w2');
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/pointer-tools.test.ts 2>&1 | tail -10
```

Expected: 12 failures.

- [ ] **Step 3: Write pointer-tools.ts**

Create `packages/web-ui/src/scada-engine/editor/pointer-tools.ts`:

```ts
// SP-FX-3a: framework-agnostic pointer state machine for the editor canvas.
// Owns the mousedown/move/up listeners on the SVG root. Drives canvas DOM
// updates during drag (60fps) and only fires onWidgetTransformed on mouseup
// (single history entry per drag).

import type { CanvasController } from './canvas-svg';
import type { TransformHandles } from './transform-handles';
import { clientToSvg, applyHandleDrag, type HandleId, type Box, type Point } from './geometry';

export type PointerState =
  | { kind: 'idle' }
  | { kind: 'drag-body'; widgetId: string; startPt: Point; startBox: Box }
  | { kind: 'drag-handle'; widgetId: string; handle: HandleId; startPt: Point; startBox: Box };

export interface PointerToolsCallbacks {
  getWidgetAt: (pt: Point) => { id: string; box: Box } | null;
  onWidgetTransformed: (id: string, newBox: Box) => void;
  onSelect: (id: string | null) => void;
}

export class PointerTools {
  state: PointerState = { kind: 'idle' };
  private destroyed = false;
  private boundDown: (e: MouseEvent) => void;
  private boundMove: (e: MouseEvent) => void;
  private boundUp: (e: MouseEvent) => void;

  constructor(
    private canvas: CanvasController,
    private handles: TransformHandles,
    private cb: PointerToolsCallbacks,
  ) {
    this.boundDown = (e) => this.handleMouseDown(e);
    this.boundMove = (e) => this.handleMouseMove(e);
    this.boundUp = (e) => this.handleMouseUp(e);
    const root = this.canvas.getSvgRoot();
    root.addEventListener('mousedown', this.boundDown);
    root.addEventListener('mousemove', this.boundMove);
    root.addEventListener('mouseup', this.boundUp);
  }

  private clientPt(e: MouseEvent): Point {
    const root = this.canvas.getSvgRoot();
    const ctm = (root as any).getScreenCTM?.();
    if (!ctm) return { x: e.clientX, y: e.clientY };
    const inverse = (ctm as any).inverse ? ctm.inverse() : ctm;
    return clientToSvg({ x: e.clientX, y: e.clientY }, inverse);
  }

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

    const widgetHit = this.cb.getWidgetAt(pt);
    if (widgetHit) {
      this.cb.onSelect(widgetHit.id);
      this.state = { kind: 'drag-body', widgetId: widgetHit.id, startPt: pt, startBox: widgetHit.box };
    } else {
      this.cb.onSelect(null);
    }
  }

  handleMouseMove(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    this.canvas.upsertWidget({ id: this.state.widgetId, type: 'svg-ext-value' as any, property: {} as any, x: newBox.x, y: newBox.y, w: newBox.w, h: newBox.h });
    this.handles.updateBox(newBox);
  }

  handleMouseUp(e: MouseEvent): void {
    if (this.destroyed) return;
    if (this.state.kind === 'idle') return;
    const pt = this.clientPt(e);
    const dx = pt.x - this.state.startPt.x;
    const dy = pt.y - this.state.startPt.y;
    const newBox = this.state.kind === 'drag-body'
      ? { x: this.state.startBox.x + dx, y: this.state.startBox.y + dy, w: this.state.startBox.w, h: this.state.startBox.h }
      : applyHandleDrag(this.state.startBox, this.state.handle, dx, dy);
    this.cb.onWidgetTransformed(this.state.widgetId, newBox);
    this.state = { kind: 'idle' };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const root = this.canvas.getSvgRoot();
    root.removeEventListener('mousedown', this.boundDown);
    root.removeEventListener('mousemove', this.boundMove);
    root.removeEventListener('mouseup', this.boundUp);
    this.state = { kind: 'idle' };
  }
}
```

- [ ] **Step 4: GREEN**

Same command as Step 2. Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/pointer-tools.ts packages/web-ui/src/scada-engine/editor/__tests__/pointer-tools.test.ts
git commit -m "feat(scada-engine): PointerTools state machine (SP-FX-3a)

Framework-agnostic mousedown/move/up state machine on canvas svg root.
States: idle / drag-body / drag-handle. Handles priority: hitTest first
(resize/rotate), then widget body (select + drag). DOM updates during
move via canvas.upsertWidget; mouseup fires onWidgetTransformed once
(single history entry). 12 tests cover all transitions + geometry +
destroy + re-mousedown."
```

---

## Task 6: EditorCanvas.tsx (React shell, 8 tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EditorCanvas } from '../EditorCanvas';
import { useEditorStore } from '../../services/editor-store';
import type { FuxaView, FuxaWidget } from '../../models';

function makeView(items: Record<string, FuxaWidget> = {}): FuxaView {
  return {
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items, schemaVersion: 1,
  } as FuxaView;
}

function makeWidget(id: string, x = 10, y = 10, w = 50, h = 30): FuxaWidget {
  return { id, type: 'svg-ext-value', property: {}, x, y, w, h } as FuxaWidget;
}

beforeEach(() => {
  useEditorStore.setState({
    currentView: null,
    isDirty: false,
    history: { past: [], future: [] },
    selection: [],
  } as any, true);
});

describe('EditorCanvas (SP-FX-3a)', () => {
  it('renders "无视图" placeholder when currentView is null', () => {
    render(<EditorCanvas />);
    expect(screen.getByText(/无视图/)).toBeInTheDocument();
  });

  it('mounts canvas controller when currentView becomes set', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') }));
    });
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('[data-layer="widgets"]')).not.toBeNull();
  });

  it('renders one rect per widget with geometry', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeView({
        w1: makeWidget('w1', 10, 10, 50, 30),
        w2: makeWidget('w2', 100, 100, 60, 40),
      }));
    });
    const widgets = container.querySelectorAll('[data-widget-id]');
    expect(widgets.length).toBe(2);
  });

  it('hides handles when selection is empty', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).toBe('hidden');
  });

  it('shows handles when a widget is selected', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    act(() => { useEditorStore.getState().setSelection(['w1']); });
    const overlay = container.querySelector('[data-overlay="transform"]') as SVGGElement;
    expect(overlay.getAttribute('visibility')).not.toBe('hidden');
  });

  it('updates handles when selected widget changes geometry', () => {
    const { container } = render(<EditorCanvas />);
    act(() => {
      useEditorStore.getState().openView(makeView({ w1: makeWidget('w1', 10, 10, 50, 30) }));
      useEditorStore.getState().setSelection(['w1']);
    });
    act(() => {
      useEditorStore.getState().updateWidget('w1', { x: 100, y: 100, w: 200, h: 100 } as any);
    });
    const selRect = container.querySelector('[data-overlay-part="selection-rect"]');
    expect(selRect?.getAttribute('width')).toBe('200');
  });

  it('switches canvas when view.id changes', () => {
    const { container } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    expect(container.querySelectorAll('[data-widget-id]').length).toBe(1);
    act(() => {
      useEditorStore.getState().openView({ ...makeView({ w2: makeWidget('w2'), w3: makeWidget('w3', 50, 50) }), id: 'v2' });
    });
    const widgets = container.querySelectorAll('[data-widget-id]');
    expect(widgets.length).toBe(2);
  });

  it('unmount destroys canvas (no leftover svg)', () => {
    const { container, unmount } = render(<EditorCanvas />);
    act(() => { useEditorStore.getState().openView(makeView({ w1: makeWidget('w1') })); });
    expect(container.querySelector('svg')).not.toBeNull();
    unmount();
    expect(container.querySelector('svg')).toBeNull();
  });
});
```

- [ ] **Step 2: RED**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx 2>&1 | tail -10
```

Expected: 8 failures.

- [ ] **Step 3: Write EditorCanvas.tsx**

Create `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`:

```tsx
'use client';
import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../services/editor-store';
import { CanvasController } from './canvas-svg';
import { TransformHandles } from './transform-handles';
import { PointerTools } from './pointer-tools';
import type { Box } from './geometry';
import type { FuxaWidget } from '../models';

interface Refs {
  canvas: CanvasController;
  handles: TransformHandles;
  pointer: PointerTools;
}

function getWidgetGeom(w: FuxaWidget): Box | null {
  if (typeof (w as any).x !== 'number') return null;
  return { x: (w as any).x, y: (w as any).y, w: (w as any).w, h: (w as any).h };
}

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refs = useRef<Refs | null>(null);
  const currentView = useEditorStore((s) => s.currentView);
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!containerRef.current || !currentView) return;
    const canvas = new CanvasController(containerRef.current, {
      width: currentView.width,
      height: currentView.height,
    });
    const handles = new TransformHandles(canvas.overlayLayer);
    const { updateWidget, setSelection } = useEditorStore.getState();
    const pointer = new PointerTools(canvas, handles, {
      getWidgetAt: (pt) => {
        const view = useEditorStore.getState().currentView;
        if (!view) return null;
        const ids = Object.keys(view.items).reverse();
        for (const id of ids) {
          const geom = getWidgetGeom(view.items[id]);
          if (!geom) continue;
          if (pt.x >= geom.x && pt.x <= geom.x + geom.w && pt.y >= geom.y && pt.y <= geom.y + geom.h) {
            return { id, box: geom };
          }
        }
        return null;
      },
      onWidgetTransformed: (id, box) => updateWidget(id, box as Partial<FuxaWidget>),
      onSelect: (id) => setSelection(id ? [id] : []),
    });
    refs.current = { canvas, handles, pointer };
    canvas.loadView(currentView);
    return () => {
      pointer.destroy();
      canvas.destroy();
      refs.current = null;
    };
  }, [currentView?.id]);

  useEffect(() => {
    if (!refs.current || !currentView) return;
    for (const id in currentView.items) {
      refs.current.canvas.upsertWidget(currentView.items[id]);
    }
  }, [items]);

  useEffect(() => {
    if (!refs.current || !currentView) return;
    const id = selection[0];
    if (!id) { refs.current.handles.hide(); return; }
    const widget = currentView.items[id];
    if (!widget) { refs.current.handles.hide(); return; }
    const geom = getWidgetGeom(widget);
    if (!geom) { refs.current.handles.hide(); return; }
    refs.current.handles.show(geom);
  }, [selection, items]);

  if (!currentView) {
    return <div className="p-8 text-center text-muted-foreground">无视图</div>;
  }
  return <div ref={containerRef} className="w-full h-full overflow-auto bg-white" />;
}
```

- [ ] **Step 4: GREEN**

Same command as Step 2. Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): EditorCanvas React shell (SP-FX-3a)

Mount-once CanvasController + TransformHandles + PointerTools keyed on
currentView.id (no re-mount on items change). Three useEffect:
lifecycle (id), DOM sync (items), handle sync (selection + items).
Calls editorStore.updateWidget on drag mouseup, setSelection on click.
'No view' placeholder when currentView null. 8 React tests."
```

---

## Task 7: editor barrel + README + main barrel update

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/index.ts`
- Create: `packages/web-ui/src/scada-engine/editor/README.md`
- Modify: `packages/web-ui/src/scada-engine/index.ts`

- [ ] **Step 1: Create editor/index.ts barrel**

Create `packages/web-ui/src/scada-engine/editor/index.ts`:

```ts
// SP-FX-3a editor barrel
export { EditorCanvas } from './EditorCanvas';
export { CanvasController, type CanvasOpts } from './canvas-svg';
export { TransformHandles } from './transform-handles';
export { PointerTools, type PointerState, type PointerToolsCallbacks } from './pointer-tools';
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  type Box, type Point, type HandleId,
} from './geometry';
```

- [ ] **Step 2: Create editor/README.md**

Create `packages/web-ui/src/scada-engine/editor/README.md`:

```markdown
# editor/

SCADA editor canvas. SP-FX-3 splits into:

- **SP-FX-3a (this commit set)** — Spike. svg.js + 8-handle scaffold + drag move + SE handle resize.
- **SP-FX-3b (next)** — snap-grid, true rotate, multi-select, full 8-handle resize, keyboard nudge, Esc cancel.

## Files

| File | Purpose |
|------|---------|
| `geometry.ts` | Pure functions: handle positions, hit test, drag delta |
| `canvas-svg.ts` | svg.js wrapper: root + widgetLayer + overlayLayer |
| `transform-handles.ts` | Selection overlay: 8 resize + 1 rotate handle + dashed rect |
| `pointer-tools.ts` | mousedown/move/up state machine |
| `EditorCanvas.tsx` | React shell, wires the above to editorStore |

## Test layers

- Pure (vitest) — `geometry.test.ts`
- jsdom (vitest) — `canvas-svg.test.ts`, `transform-handles.test.ts`, `EditorCanvas.test.tsx`
- State machine (vitest + mock canvas) — `pointer-tools.test.ts`
- E2E (Playwright) — `../../../../e2e/scada-editor-canvas.spec.ts`

## Constraints

- `'use client'` only (no SSR).
- Single mount per page — `editorStore` is a singleton.
- Widgets need `x/y/w/h` to render. Legacy FUXA imports without geometry skip with `console.warn` (SP-FX-3b will extend).
- Drag DOM updates run via `canvas.upsertWidget` (60fps); `editorStore.updateWidget` only fires on `mouseup` (single history entry per drag).

## Dev page

For Playwright fixture access: `app/dev/scada-editor-canvas/page.tsx`. Production-guarded. SP-FX-4 will wire the toolbar and delete this dev page.
```

- [ ] **Step 3: Update scada-engine/index.ts**

Open `packages/web-ui/src/scada-engine/index.ts`. Append (keep existing exports above):

```ts
// SP-FX-3a additions
export * from './editor';
```

- [ ] **Step 4: tsc clean**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | grep -E "scada-engine/editor" | head -10
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/editor/index.ts packages/web-ui/src/scada-engine/editor/README.md packages/web-ui/src/scada-engine/index.ts
git commit -m "feat(scada-engine): editor barrel + README (SP-FX-3a)

editor/index.ts re-exports EditorCanvas + supporting classes + geometry
helpers. Main scada-engine/index.ts barrel pulls editor into public
surface. README documents file layout, test layers, constraints,
dev page convention. tsc clean."
```

---

## Task 8: Dev page (Playwright fixture)

**Files:**
- Create: `packages/web-ui/src/app/dev/scada-editor-canvas/page.tsx`

- [ ] **Step 1: Create the dev page**

Create `packages/web-ui/src/app/dev/scada-editor-canvas/page.tsx`:

```tsx
'use client';
import React, { useEffect } from 'react';
import { EditorCanvas } from '@/scada-engine/editor';
import { useEditorStore } from '@/scada-engine/services/editor-store';
import type { FuxaView, FuxaWidget } from '@/scada-engine/models';

function fixtureView(): FuxaView {
  const items: Record<string, FuxaWidget> = {
    w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 120, h: 80 } as FuxaWidget,
    w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 300, y: 200, w: 100, h: 60 } as FuxaWidget,
  };
  return {
    id: 'fixture-1', name: 'Fixture', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items, schemaVersion: 1,
  } as FuxaView;
}

export default function DevScadaEditorCanvas() {
  if (process.env.NODE_ENV === 'production') {
    return <div style={{ padding: 24 }}>dev only</div>;
  }

  useEffect(() => {
    useEditorStore.getState().openView(fixtureView());
    if (typeof window !== 'undefined') {
      (window as any).__getCurrentView = () => useEditorStore.getState().currentView;
      (window as any).__resetEditorStore = () => useEditorStore.getState().openView(fixtureView());
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
        <strong>SP-FX-3a dev: scada-editor-canvas</strong>
      </header>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <EditorCanvas />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke (dev server)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pkill -f "next dev" 2>/dev/null; true
sleep 1
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 10
curl -s http://localhost:3000/dev/scada-editor-canvas | head -1
```

Expected: `<!DOCTYPE html>` returned. Open browser to `http://localhost:3000/dev/scada-editor-canvas` and visually verify:
- 2 blue rectangles render
- Click rectangle → handles appear
- Drag body → moves
- Drag SE handle → resizes

Cleanup:
```bash
pkill -f "next dev" 2>/dev/null; true
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/app/dev/scada-editor-canvas/page.tsx
git commit -m "feat(scada-engine): dev page for editor canvas smoke (SP-FX-3a)

Production-guarded dev route /dev/scada-editor-canvas that mounts
EditorCanvas with a 2-widget fixture view + exposes
window.__getCurrentView and __resetEditorStore for Playwright.
Will be deleted in SP-FX-4 when the real editor route exists."
```

---

## Task 9: Playwright 3 smoke

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-canvas.spec.ts`

- [ ] **Step 1: Inspect existing Playwright config + sibling spec**

```bash
cd /Volumes/SSD/projects/BIOCore
cat packages/web-ui/playwright.config.ts | head -40
ls packages/web-ui/e2e/
head -30 packages/web-ui/e2e/scada-smoke.spec.ts
```

Note baseURL and test pattern conventions.

- [ ] **Step 2: Write the smoke spec**

Create `packages/web-ui/e2e/scada-editor-canvas.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('SP-FX-3a editor canvas smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/scada-editor-canvas');
    await page.waitForSelector('[data-layer="widgets"]');
    await page.evaluate(() => (window as any).__resetEditorStore?.());
  });

  test('drag widget body moves x/y', async ({ page }) => {
    const widget = await page.waitForSelector('[data-widget-id="w1"]');
    const before = await widget.boundingBox();
    if (!before) throw new Error('widget bbox unavailable');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 100, before.y + before.height / 2 + 50, { steps: 10 });
    await page.mouse.up();
    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.x).toBeGreaterThan(50);
    expect(view.items.w1.y).toBeGreaterThan(50);
  });

  test('select widget shows handles, click empty hides them', async ({ page }) => {
    await page.click('[data-widget-id="w1"]');
    let overlayVis = await page.getAttribute('[data-overlay="transform"]', 'visibility');
    expect(overlayVis).not.toBe('hidden');

    await page.mouse.click(10, 10);
    overlayVis = await page.getAttribute('[data-overlay="transform"]', 'visibility');
    expect(overlayVis).toBe('hidden');
  });

  test('drag SE handle resizes widget', async ({ page }) => {
    await page.click('[data-widget-id="w1"]');
    const seHandle = await page.waitForSelector('[data-handle="se"]');
    const box = await seHandle.boundingBox();
    if (!box) throw new Error('SE handle bbox unavailable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + 60, { steps: 10 });
    await page.mouse.up();
    const view = await page.evaluate(() => (window as any).__getCurrentView());
    expect(view.items.w1.w).toBeGreaterThan(120);
    expect(view.items.w1.h).toBeGreaterThan(80);
  });
});
```

- [ ] **Step 3: Run Playwright**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-canvas.spec.ts 2>&1 | tail -20
```

Expected: 3 passed.

If "browsers not installed": `pnpm --filter @biocore/web-ui exec playwright install chromium`.

If dev server not auto-started by `playwright.config.ts` (check the file for a `webServer` block):
```bash
pkill -f "next dev" 2>/dev/null; true
nohup pnpm --filter @biocore/web-ui dev > /tmp/biocore-web.log 2>&1 < /dev/null &
disown
sleep 8
# rerun playwright
pkill -f "next dev" # after
```

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/e2e/scada-editor-canvas.spec.ts
git commit -m "test(scada-engine): Playwright smoke for editor canvas (SP-FX-3a)

3 smoke tests against /dev/scada-editor-canvas: drag body moves x/y,
select toggles handle visibility, SE handle drag resizes w/h. Uses
window.__getCurrentView for assertions + __resetEditorStore in
beforeEach for isolation."
```

---

## Task 10: Regression + push

**Files:** none (verification only)

- [ ] **Step 1: web-ui vitest full**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | tail -8
```

Expected: 471 + 2 (T1 model) + 15 (T2) + 10 (T3) + 8 (T4) + 12 (T5) + 8 (T6) = **526 passed**. Zero failures.

If a previously-green test broke, STOP and fix before pushing.

- [ ] **Step 2: server + data-service regression**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run 2>&1 | tail -5
pnpm --filter @biocore/data-service exec vitest run 2>&1 | tail -5
```

Expected: server 147/147, data-service 84/84.

- [ ] **Step 3: tsc full pass**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | tail -10
```

Expected: clean (or pre-existing errors only).

- [ ] **Step 4: 6.2 stop conditions self-check**

Walk through spec §6.2:

1. **R11 流畅度** — was the dev page drag smooth at 60fps in T8 manual smoke?
2. **R6 双渲染** — Chrome DevTools React profiler on `/dev/scada-editor-canvas`: drag a widget, confirm rerender count is bounded (handful, not hundreds).
3. **R12 schema 错配** — T1 patched; dev page renders 2 widgets → R12 closed.
4. **R2 + R5** — geometry coverage and Playwright 3/3.

If any trips, STOP and surface to user; do not push.

- [ ] **Step 5: Push**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds. SP-FX-3a ships as ~10 atomic commits.

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| §1.1 in-scope (svg.js + select + drag + SE resize + mouseup commit) | T0/T2/T3/T4/T5/T6 |
| §1.3 file structure | T2-T6 + T7 barrel |
| §1.4 安全约束 (read-only; manual writes deferred) | preserved by NOT importing writeTag anywhere |
| §1.5 测试基线 (web-ui +53) | actual +55 (T1 +2 model on top of plan figure) |
| §1.6 deps | T0 |
| §2.1 geometry | T2 |
| §2.2 canvas-svg | T3 |
| §2.3 transform-handles | T4 |
| §2.4 pointer-tools | T5 |
| §2.5 EditorCanvas | T6 |
| §2.6 Playwright smoke | T9 |
| §2.7 dev page | T8 |
| §3 data flow (5 sub-flows) | covered by T3/T4/T5/T6 |
| §4 error handling | T3 ctor size check + T3 missing-geo skip + T3 destroy guard + T5 idle no-throw + T6 SSR/null guards |
| §5 testing layers | T2 pure / T3+T4 jsdom svg / T5 state machine / T6 React / T9 Playwright |
| §6.1 R1 SSR | T6 'use client' + window guard |
| §6.1 R2 jsdom getCTM | T0 svgDomHelpers.mockGetCTM + T5 inject |
| §6.1 R3 svg.js + jsdom | T3 tests `node.getAttribute` direct read |
| §6.1 R4 SVG event bubble | T5 listener on root + T9 Playwright real-bubble cover |
| §6.1 R5 Playwright + dev server | T9 step 3 manual-start fallback |
| §6.1 R6 store→rerender→remount | T6 useEffect deps split (id for lifecycle, items for sync) |
| §6.1 R7 handle vs body | T5 handleMouseDown checks handles first |
| §6.1 R8 clamp flip | T2 applyHandleDrag clamp + tests |
| §6.1 R9 dev page → prod | T8 NODE_ENV guard |
| §6.1 R10 bundle size | T10 step 4 (manual) |
| §6.1 R11 spike fluency | T8 manual smoke + T10 step 4 self-check |
| §6.1 R12 FuxaWidget no geometry | T1 model patch |
| §6.2 stop conditions | T10 step 4 explicit |
| §6.3 deferred items | not in plan by design |
| §7 acceptance criteria | T10 |

**Gaps found:** none.

**Placeholder scan:** every code block complete; every command has expected output; no TBD/TODO/Similar-to-Task-N.

**Type consistency:**
- `Box {x,y,w,h}` consistent across T2/T3/T4/T5/T6
- `HandleId` union identical across T2/T4/T5
- `Point {x,y}` consistent
- `PointerState` discriminated union shape used by T5 + T6 callbacks
- `PointerToolsCallbacks` matches T5 ctor + T6 usage
- `FuxaWidget.x/y/w/h` declared in T1, consumed in T3 (hasGeometry guard) + T5 (upsertWidget partial) + T6 (getWidgetGeom helper)
- `CanvasController.overlayLayer` exposed as `readonly G` in T3, consumed by T4 ctor + T6 mount

**Execution Handoff**

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-3a-editor-canvas-spike-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + spec/code review between tasks (proven pattern from SP-FX-1 + SP-FX-2)
2. **Inline Execution** — execute tasks in this session via executing-plans, batch checkpoints

Which approach?
