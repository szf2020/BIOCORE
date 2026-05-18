# SP-FX-5 — Shapes + Remaining Dialogs + Widgets-Extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 154 FUXA SVG shapes to the palette (build-time catalog + image-tag render), implement 7 remaining dialogs, and 5 widgets-extras (gauge/slider/switch/scheduler/uplot-chart).

**Architecture:** Build-time `scripts/gen-shape-catalog.ts` reads `assets/shapes/*.svg`, writes static `shape-catalog.ts`. 209 SVG copied to `public/scada-shapes/` (manual, one-time). `ShapePicker.tsx` renders 3-col grid with search; dragstart sets `palette-shape` dataTransfer. `EditorCanvas.onDrop` parses both `palette-item` and `palette-shape`. `canvas-svg.upsertWidget` adds `'shape'` case using raw `createElementNS('image')` to avoid svg.js jsdom getBBox issues. Dialogs and widgets-extras live in sibling dirs under `scada-engine/`, each self-contained with Tailwind styles and controlled props.

**Tech Stack:** TypeScript 5, React 18, Tailwind, @svgdotjs/svg.js, vitest + @testing-library/react, Playwright, uplot@^1.6.31 (new), lucide-react (existing).

**Baseline:** main `a901e0f` (spec). web-ui vitest 706, server 147, data-service 84, Playwright 23.
**Target:** web-ui 795 (+89), Playwright 25 (+2), server 147, data-service 84.

**Note on shape count:** Spec quotes 209 but the live `assets/shapes/` currently contains 154 SVGs. Tests are written count-agnostic (`expect(SHAPE_CATALOG.length).toBeGreaterThan(0)` or against a fixture dir, not against a hard count). The generator runs against the real dir at build time; the produced count is whatever exists.

---

## Per-task model hints

| Task | Suggested model | Reason |
|------|-----------------|--------|
| T0 | sonnet | Build script + IO + tmp fs testing |
| T1 | haiku | Mechanical cp + README write |
| T2 | haiku | Single function + 4 tests |
| T3 | sonnet | React + drag + grid + search |
| T4 | sonnet | Palette composition + existing test fix |
| T5 | sonnet | svg.js + raw DOM bridge |
| T6 | sonnet | onDrop branching + JSON parse |
| T7 | sonnet | Date inputs + range validation |
| T8 | haiku | Simple text input dialog |
| T9 | sonnet | Multi/single select toggle |
| T10 | sonnet | Tree recursion + selection state |
| T11 | haiku | Bitmask checkboxes |
| T12 | haiku | Two number inputs |
| T13 | sonnet | Lucide icon grid + search |
| T14 | sonnet | Gauge + Switch (2 widgets) |
| T15 | sonnet | NouiSlider + Scheduler (2 widgets) |
| T16 | sonnet | uplot lifecycle + jsdom canvas mock |
| T17 | haiku | Barrel exports |
| T18 | sonnet | Playwright + drag dispatch |
| T19 | haiku | Regression + push |

---

## Task 0: gen-shape-catalog build script + 4 tests

**Files:**
- Create: `scripts/gen-shape-catalog.ts`
- Create: `scripts/__tests__/gen-shape-catalog.test.ts`
- Modify: `package.json` (root, add `gen:shape-catalog` script)
- Generate: `packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts`

- [ ] **Step 1: Write the failing tests**

Create `scripts/__tests__/gen-shape-catalog.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { genCatalog, toLabel } from '../gen-shape-catalog';

let tmpRoot: string;
let srcDir: string;
let outFile: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'gsc-'));
  srcDir = join(tmpRoot, 'src');
  outFile = join(tmpRoot, 'out.ts');
  mkdirSync(srcDir);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('toLabel', () => {
  it('converts kebab-case to Title Case', () => {
    expect(toLabel('agitator-disc')).toBe('Agitator Disc');
    expect(toLabel('tank1')).toBe('Tank1');
    expect(toLabel('a-b-c')).toBe('A B C');
  });
});

describe('genCatalog', () => {
  it('reads SVG names and writes SHAPE_CATALOG with N entries sorted', () => {
    writeFileSync(join(srcDir, 'b.svg'), '<svg/>');
    writeFileSync(join(srcDir, 'a.svg'), '<svg/>');
    writeFileSync(join(srcDir, 'readme.md'), 'ignore'); // non-svg ignored
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(2);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain("export const SHAPE_CATALOG");
    expect(body).toContain("{ id: \"a\", label: \"A\", src: '/scada-shapes/a.svg' }");
    expect(body).toContain("{ id: \"b\", label: \"B\", src: '/scada-shapes/b.svg' }");
    // sorted: a before b
    expect(body.indexOf('a.svg')).toBeLessThan(body.indexOf('b.svg'));
  });

  it('empty dir produces empty array body', () => {
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(0);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain('SHAPE_CATALOG: ReadonlyArray<PaletteShape> = [');
    expect(body).toContain('] as const;');
  });

  it('filename with quote/special char is JSON-escaped', () => {
    writeFileSync(join(srcDir, "a\"b.svg"), '<svg/>');
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(1);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain('a\\"b');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm -w vitest run scripts/__tests__/gen-shape-catalog.test.ts`
Expected: FAIL — "Cannot find module '../gen-shape-catalog'"

- [ ] **Step 3: Implement the script**

Create `scripts/gen-shape-catalog.ts`:

```ts
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR_DEFAULT = join(__dirname, '../packages/web-ui/src/scada-engine/assets/shapes');
const OUT_FILE_DEFAULT = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts',
);

export function toLabel(id: string): string {
  return id
    .split('-')
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function genCatalog(srcDir: string, outFile: string): { count: number } {
  const files = readdirSync(srcDir)
    .filter((f) => f.endsWith('.svg'))
    .sort();
  const entries = files
    .map((f) => {
      const id = f.replace(/\.svg$/, '');
      return `  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(toLabel(id))}, src: '/scada-shapes/${f}' },`;
    })
    .join('\n');
  const body = `// AUTO-GENERATED by scripts/gen-shape-catalog.ts — do not edit manually.

export interface PaletteShape {
  id: string;
  label: string;
  src: string;
}

export const SHAPE_CATALOG: ReadonlyArray<PaletteShape> = [
${entries}
] as const;
`;
  writeFileSync(outFile, body, 'utf8');
  return { count: files.length };
}

if (require.main === module) {
  const { count } = genCatalog(SRC_DIR_DEFAULT, OUT_FILE_DEFAULT);
  // eslint-disable-next-line no-console
  console.log(`gen-shape-catalog: wrote ${count} shapes to ${OUT_FILE_DEFAULT}`);
}
```

- [ ] **Step 4: Add npm script to root package.json**

Edit root `package.json`, add to `"scripts"`:

```json
"gen:shape-catalog": "tsx scripts/gen-shape-catalog.ts"
```

(If `tsx` not in root deps, fall back to `node --loader tsx scripts/gen-shape-catalog.ts` — verify which is installed.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm -w vitest run scripts/__tests__/gen-shape-catalog.test.ts`
Expected: PASS 4/4

- [ ] **Step 6: Run the generator against real dir**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm -w gen:shape-catalog`
Expected: stdout `gen-shape-catalog: wrote <N> shapes to .../shape-catalog.ts`. Verify file `packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts` exists, starts with `// AUTO-GENERATED`, has `export const SHAPE_CATALOG: ReadonlyArray<PaletteShape> = [` and `] as const;`.

- [ ] **Step 7: Commit**

```bash
git add scripts/gen-shape-catalog.ts scripts/__tests__/gen-shape-catalog.test.ts package.json packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts
git commit -m "feat(scada-engine): SP-FX-5 T0 shape catalog generator + 4 tests"
```

---

## Task 1: Copy 209 SVG to public/scada-shapes/ + README

**Files:**
- Create: `packages/web-ui/public/scada-shapes/*.svg` (all SVG copies)
- Create: `packages/web-ui/src/scada-engine/assets/README.md`

- [ ] **Step 1: Verify source dir**

Run: `ls packages/web-ui/src/scada-engine/assets/shapes/*.svg | wc -l`
Expected: a positive integer (e.g., 154).

- [ ] **Step 2: Create destination dir + copy SVGs**

```bash
mkdir -p packages/web-ui/public/scada-shapes
cp packages/web-ui/src/scada-engine/assets/shapes/*.svg packages/web-ui/public/scada-shapes/
```

- [ ] **Step 3: Verify copy succeeded**

Run: `ls packages/web-ui/public/scada-shapes/*.svg | wc -l`
Expected: same integer as Step 1.

- [ ] **Step 4: Write README**

Create `packages/web-ui/src/scada-engine/assets/README.md`:

```markdown
# SCADA Engine Assets

## Shapes (FUXA-imported)

`shapes/*.svg` — 154 SVG icons imported from FUXA.

### Public serving

Next.js serves `packages/web-ui/public/scada-shapes/` at URL path `/scada-shapes/<file>.svg`.

After adding, removing, or renaming any file in `shapes/`:

```bash
# 1. Regenerate the catalog (used by palette ShapePicker)
pnpm -w gen:shape-catalog

# 2. Manually copy SVG to the public dir (Next.js does not auto-mirror)
cp packages/web-ui/src/scada-engine/assets/shapes/*.svg \
   packages/web-ui/public/scada-shapes/
```

(SP-FX-8 may automate the copy step via a build hook.)

### Why two directories?

- `assets/shapes/` is the **source of truth** versioned with the engine code.
- `public/scada-shapes/` is the **served copy** Next.js exposes to browsers (only files under `public/` get a public URL).
- The catalog generator reads from `assets/shapes/`. The runtime `<image href>` resolves from `public/scada-shapes/`.
```

- [ ] **Step 5: Verify file written**

Run: `cat packages/web-ui/src/scada-engine/assets/README.md | wc -l`
Expected: > 20 lines.

- [ ] **Step 6: Commit**

```bash
git add packages/web-ui/public/scada-shapes packages/web-ui/src/scada-engine/assets/README.md
git commit -m "feat(scada-engine): SP-FX-5 T1 copy 154 SVG to public/scada-shapes + assets README"
```

---

## Task 2: palette-items.makeShapeWidget + 4 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/palette/palette-items.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts`:

```ts
import { makeShapeWidget } from '../palette-items';

describe('palette-items makeShapeWidget', () => {
  it('defaults w=80 h=80', () => {
    const w = makeShapeWidget('tank1', '/scada-shapes/tank1.svg', { x: 0, y: 0 }, 10);
    expect(w.type).toBe('shape');
    expect(w.w).toBe(80);
    expect(w.h).toBe(80);
  });

  it('snaps x/y to gridSize', () => {
    const w = makeShapeWidget('tank1', '/scada-shapes/tank1.svg', { x: 23, y: 47 }, 10);
    expect(w.x).toBe(20);
    expect(w.y).toBe(50);
  });

  it('stores src and shapeId in property', () => {
    const w = makeShapeWidget('valve-3way', '/scada-shapes/valve-3way.svg', { x: 0, y: 0 }, 1);
    expect((w.property as { src: string }).src).toBe('/scada-shapes/valve-3way.svg');
    expect((w.property as { shapeId: string }).shapeId).toBe('valve-3way');
  });

  it('id matches w_<digits>_<6chars> regex', () => {
    const w = makeShapeWidget('tank1', '/scada-shapes/tank1.svg', { x: 0, y: 0 }, 1);
    expect(w.id).toMatch(/^w_\d+_[a-z0-9]{6}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/palette-items.test.ts`
Expected: FAIL — "makeShapeWidget is not a function"

- [ ] **Step 3: Implement makeShapeWidget**

Append to `packages/web-ui/src/scada-engine/editor/palette/palette-items.ts`:

```ts
export function makeShapeWidget(
  shapeId: string,
  src: string,
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget {
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  const step = gridSize > 0 ? gridSize : 1;
  return {
    id,
    type: 'shape',
    property: { src, shapeId } as Record<string, unknown>,
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: 80,
    h: 80,
  } as FuxaWidget;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/palette-items.test.ts`
Expected: PASS (existing 7 + new 4 = 11/11)

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/palette/palette-items.ts packages/web-ui/src/scada-engine/editor/palette/__tests__/palette-items.test.ts
git commit -m "feat(scada-engine): SP-FX-5 T2 makeShapeWidget factory + 4 tests"
```

---

## Task 3: ShapePicker.tsx + 6 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShapePicker } from '../ShapePicker';
import { SHAPE_CATALOG } from '../shape-catalog';

describe('ShapePicker', () => {
  it('renders one cell per catalog entry when search empty', () => {
    render(<ShapePicker />);
    const grid = screen.getByRole('list', { hidden: true });
    expect(grid.querySelectorAll('li').length).toBe(SHAPE_CATALOG.length);
  });

  it('renders a search input', () => {
    render(<ShapePicker />);
    expect(screen.getByPlaceholderText('搜索形状...')).toBeInTheDocument();
  });

  it('search filters by id or label substring (case-insensitive)', () => {
    render(<ShapePicker />);
    const input = screen.getByPlaceholderText('搜索形状...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tank' } });
    const grid = document.querySelector('[data-panel="shape-picker"] ul');
    expect(grid).toBeTruthy();
    const cells = (grid as HTMLElement).querySelectorAll('li');
    // every visible cell must match
    cells.forEach((li) => {
      const id = li.getAttribute('data-palette-shape') ?? '';
      expect(id.toLowerCase().includes('tank')).toBe(true);
    });
  });

  it('empty filter result shows 无匹配 placeholder', () => {
    render(<ShapePicker />);
    const input = screen.getByPlaceholderText('搜索形状...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zzzzznotexist' } });
    expect(screen.getByText('无匹配')).toBeInTheDocument();
  });

  it('dragstart sets palette-shape data with JSON id+src', () => {
    render(<ShapePicker />);
    const li = document.querySelector('[data-palette-shape]') as HTMLElement;
    expect(li).toBeTruthy();
    const setData = vi.fn();
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { setData, get effectAllowed() { return ''; }, set effectAllowed(_v) { /* no-op */ } },
    });
    li.dispatchEvent(event);
    expect(setData).toHaveBeenCalledWith(
      'palette-shape',
      expect.stringMatching(/^\{"id":".+","src":".+"\}$/),
    );
  });

  it('clearing search restores full list', () => {
    render(<ShapePicker />);
    const input = screen.getByPlaceholderText('搜索形状...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tank' } });
    fireEvent.change(input, { target: { value: '' } });
    const grid = document.querySelector('[data-panel="shape-picker"] ul');
    expect((grid as HTMLElement).querySelectorAll('li').length).toBe(SHAPE_CATALOG.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx`
Expected: FAIL — "Cannot find module '../ShapePicker'"

- [ ] **Step 3: Implement ShapePicker**

Create `packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx`:

```tsx
import React, { useState, useMemo } from 'react';
import { SHAPE_CATALOG, type PaletteShape } from './shape-catalog';

export function ShapePicker(): JSX.Element {
  const [q, setQ] = useState('');
  const filtered = useMemo<ReadonlyArray<PaletteShape>>(() => {
    if (!q.trim()) return SHAPE_CATALOG;
    const lo = q.toLowerCase();
    return SHAPE_CATALOG.filter(
      (s) => s.id.toLowerCase().includes(lo) || s.label.toLowerCase().includes(lo),
    );
  }, [q]);

  return (
    <div data-panel="shape-picker" className="flex flex-col flex-1 min-h-0 border-t border-zinc-700">
      <input
        data-input="shape-search"
        type="text"
        placeholder="搜索形状..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="m-2 px-2 py-1 text-sm bg-zinc-800 text-zinc-100 rounded"
      />
      {filtered.length === 0 ? (
        <p data-empty className="px-2 text-sm text-zinc-500">无匹配</p>
      ) : (
        <ul data-grid className="grid grid-cols-3 gap-1 p-2 overflow-y-auto">
          {filtered.map((shape) => (
            <li
              key={shape.id}
              draggable
              data-palette-shape={shape.id}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'palette-shape',
                  JSON.stringify({ id: shape.id, src: shape.src }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={shape.label}
              className="cursor-grab aspect-square flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded"
            >
              <img src={shape.src} alt={shape.label} className="w-full h-full p-1" draggable={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx packages/web-ui/src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T3 ShapePicker with search + 6 tests"
```

---

## Task 4: Palette.tsx extend with ShapePicker + update existing test

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/palette/Palette.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx`

- [ ] **Step 1: Read current Palette.tsx + test**

Run: `cat packages/web-ui/src/scada-engine/editor/palette/Palette.tsx`

The current top-level is `<ul data-panel="palette" ...>`. We will wrap in `<div data-panel="palette">` and move the basic-items list to `<ul data-section="basic">`, then mount `<ShapePicker />` after it.

- [ ] **Step 2: Update Palette.test.tsx existing assertions first (RED)**

In `packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx`, change every assertion that targets `ul[data-panel="palette"]` to target `[data-panel="palette"]` (the wrapper div) and any `<li>` count assertion to target `ul[data-section="basic"] > li` instead. Add one new assertion: `expect(container.querySelector('[data-panel="shape-picker"]')).toBeInTheDocument()`.

Concretely, replace:

```ts
// OLD (whatever the existing selector is, examples):
const ul = container.querySelector('ul[data-panel="palette"]') as HTMLUListElement;
expect(ul).toBeInTheDocument();
// items rendered as <li> inside <ul data-panel="palette">
const items = Array.from(ul.children).filter(c => c.tagName === 'LI');
expect(items.length).toBe(3);
```

With:

```ts
const panel = container.querySelector('[data-panel="palette"]') as HTMLElement;
expect(panel).toBeInTheDocument();
const basic = panel.querySelector('ul[data-section="basic"]') as HTMLUListElement;
expect(basic).toBeInTheDocument();
const items = Array.from(basic.children).filter((c) => c.tagName === 'LI');
expect(items.length).toBe(3);
expect(panel.querySelector('[data-panel="shape-picker"]')).toBeInTheDocument();
```

Apply this transform to every test that touches the panel structure.

- [ ] **Step 3: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/Palette.test.tsx`
Expected: FAIL — at least one assertion fails because `data-section="basic"` doesn't exist yet, and `data-panel="shape-picker"` is missing.

- [ ] **Step 4: Rewrite Palette.tsx**

Replace contents of `packages/web-ui/src/scada-engine/editor/palette/Palette.tsx`:

```tsx
// SP-FX-4 + SP-FX-5: palette panel — basic shapes on top, ShapePicker below.

import React from 'react';
import { PALETTE_ITEMS } from './palette-items';
import { ShapePicker } from './ShapePicker';

export function Palette(): JSX.Element {
  return (
    <div data-panel="palette" className="w-[200px] flex-shrink-0 flex flex-col border-r border-zinc-700 bg-zinc-900 overflow-hidden">
      <ul data-section="basic" className="p-2 space-y-1">
        {PALETTE_ITEMS.map((item) => (
          <li
            key={item.id}
            draggable
            data-palette-item={item.id}
            onDragStart={(e) => {
              e.dataTransfer.setData('palette-item', item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="cursor-grab px-2 py-1 text-sm text-zinc-100 hover:bg-zinc-800 rounded"
          >
            {item.label}
          </li>
        ))}
      </ul>
      <ShapePicker />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/`
Expected: PASS all Palette + ShapePicker + palette-items tests.

- [ ] **Step 6: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/palette/Palette.tsx packages/web-ui/src/scada-engine/editor/palette/__tests__/Palette.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T4 mount ShapePicker in Palette + reshape data attrs"
```

---

## Task 5: canvas-svg.ts upsertWidget 'shape' case + 3 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts`:

```ts
describe('canvas-svg shape widget', () => {
  it('creates <image> with href/x/y/width/height/preserveAspectRatio', () => {
    const host = document.createElement('div');
    const c = new CanvasController(host, { width: 800, height: 600 });
    c.upsertWidget({
      id: 'w1',
      type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 100, y: 50, w: 80, h: 80,
    } as any);
    const img = host.querySelector('image[data-widget-id="w1"]') as SVGImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('href') || img.getAttribute('xlink:href')).toBe('/scada-shapes/tank1.svg');
    expect(img.getAttribute('x')).toBe('100');
    expect(img.getAttribute('y')).toBe('50');
    expect(img.getAttribute('width')).toBe('80');
    expect(img.getAttribute('height')).toBe('80');
    expect(img.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  it('resize updates width and height attrs in place', () => {
    const host = document.createElement('div');
    const c = new CanvasController(host, { width: 800, height: 600 });
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 0, y: 0, w: 80, h: 80,
    } as any);
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 0, y: 0, w: 160, h: 120,
    } as any);
    const img = host.querySelector('image[data-widget-id="w1"]') as SVGImageElement;
    expect(img.getAttribute('width')).toBe('160');
    expect(img.getAttribute('height')).toBe('120');
    expect(host.querySelectorAll('image[data-widget-id="w1"]').length).toBe(1);
  });

  it('src change updates href attr in place', () => {
    const host = document.createElement('div');
    const c = new CanvasController(host, { width: 800, height: 600 });
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/tank1.svg', shapeId: 'tank1' },
      x: 0, y: 0, w: 80, h: 80,
    } as any);
    c.upsertWidget({
      id: 'w1', type: 'shape',
      property: { src: '/scada-shapes/valve.svg', shapeId: 'valve' },
      x: 0, y: 0, w: 80, h: 80,
    } as any);
    const img = host.querySelector('image[data-widget-id="w1"]') as SVGImageElement;
    expect(img.getAttribute('href') || img.getAttribute('xlink:href')).toBe('/scada-shapes/valve.svg');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts`
Expected: FAIL — type 'shape' falls through to default rect rendering, no `<image>` created.

- [ ] **Step 3: Implement 'shape' case in createElementForType + updateElementForType**

Open `packages/web-ui/src/scada-engine/editor/canvas-svg.ts`. In the `createElementForType` switch, add the new case BEFORE `default`:

```ts
case 'shape': {
  const src = (widget.property as { src?: string }).src ?? '';
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'image');
  node.setAttribute('href', src);
  node.setAttribute('x', String(widget.x));
  node.setAttribute('y', String(widget.y));
  node.setAttribute('width', String(widget.w));
  node.setAttribute('height', String(widget.h));
  node.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  node.setAttribute('data-widget-id', widget.id);
  this.widgetLayer.node.appendChild(node);
  return SVG(node) as SvgElement;
}
```

In `updateElementForType` switch, add BEFORE `default`:

```ts
case 'shape': {
  const src = (widget.property as { src?: string }).src ?? '';
  const node = el.node as SVGImageElement;
  node.setAttribute('href', src);
  el.attr({ x: widget.x, y: widget.y, width: widget.w, height: widget.h });
  break;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/__tests__/canvas-svg.test.ts`
Expected: PASS — all existing canvas-svg tests + 3 new tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/canvas-svg.ts packages/web-ui/src/scada-engine/editor/__tests__/canvas-svg.test.ts
git commit -m "feat(scada-engine): SP-FX-5 T5 canvas-svg shape <image> case + 3 tests"
```

---

## Task 6: EditorCanvas.tsx onDrop palette-shape branch + 3 tests

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- Modify: `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`:

```tsx
describe('EditorCanvas shape drop', () => {
  it('onDragOver with palette-shape types preventDefault', () => {
    render(<EditorCanvas />);
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const ev = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', {
      value: { types: ['palette-shape'] },
    });
    host.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('onDrop with valid palette-shape JSON calls addWidget(type=shape)', () => {
    const addWidgetSpy = vi.fn();
    vi.spyOn(useEditorStore, 'getState').mockReturnValue({
      addWidget: addWidgetSpy,
      gridSize: 10,
      // minimal store shape used by onDrop
    } as any);

    render(<EditorCanvas />);
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: 100 });
    Object.defineProperty(ev, 'clientY', { value: 50 });
    Object.defineProperty(ev, 'dataTransfer', {
      value: {
        types: ['palette-shape'],
        getData: (k: string) =>
          k === 'palette-shape'
            ? JSON.stringify({ id: 'tank1', src: '/scada-shapes/tank1.svg' })
            : '',
      },
    });
    host.dispatchEvent(ev);
    expect(addWidgetSpy).toHaveBeenCalled();
    const arg = addWidgetSpy.mock.calls[0][0];
    expect(arg.type).toBe('shape');
    expect((arg.property as any).shapeId).toBe('tank1');
    expect((arg.property as any).src).toBe('/scada-shapes/tank1.svg');
  });

  it('onDrop with malformed JSON is a no-op (no throw)', () => {
    const addWidgetSpy = vi.fn();
    vi.spyOn(useEditorStore, 'getState').mockReturnValue({
      addWidget: addWidgetSpy,
      gridSize: 10,
    } as any);

    render(<EditorCanvas />);
    const host = document.querySelector('[data-editor-canvas-host]') as HTMLElement;
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: 0 });
    Object.defineProperty(ev, 'clientY', { value: 0 });
    Object.defineProperty(ev, 'dataTransfer', {
      value: {
        types: ['palette-shape'],
        getData: (k: string) => (k === 'palette-shape' ? '{not json' : ''),
      },
    });
    expect(() => host.dispatchEvent(ev)).not.toThrow();
    expect(addWidgetSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`
Expected: FAIL — `palette-shape` branch not handled; addWidget not called.

- [ ] **Step 3: Extend onDrop and onDragOver in EditorCanvas.tsx**

Locate the current `onDrop` handler. Add `makeShapeWidget` to the import:

```tsx
import { makeWidget, makeShapeWidget } from './palette/palette-items';
```

Then extend the handler:

```tsx
onDrop={(e) => {
  e.preventDefault();
  const host = e.currentTarget as HTMLElement;
  const svg = host.querySelector('svg') as SVGSVGElement | null;
  let local: { x: number; y: number };
  try {
    const ctm = svg?.getScreenCTM();
    if (ctm) {
      local = clientToSvg({ x: e.clientX, y: e.clientY }, ctm.inverse());
    } else {
      const r = host.getBoundingClientRect();
      local = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
  } catch {
    const r = host.getBoundingClientRect();
    local = { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const store = useEditorStore.getState();

  const basicType = e.dataTransfer.getData('palette-item') as 'rect' | 'ellipse' | 'text' | '';
  if (basicType && ['rect', 'ellipse', 'text'].includes(basicType)) {
    store.addWidget(makeWidget(basicType, local, store.gridSize));
    return;
  }

  const shapeJson = e.dataTransfer.getData('palette-shape');
  if (shapeJson) {
    try {
      const { id, src } = JSON.parse(shapeJson) as { id?: string; src?: string };
      if (typeof id === 'string' && id && typeof src === 'string' && src) {
        store.addWidget(makeShapeWidget(id, src, local, store.gridSize));
      }
    } catch {
      // malformed JSON; silently ignore
    }
  }
}}

onDragOver={(e) => {
  const types = e.dataTransfer.types;
  if (types.includes('palette-item') || types.includes('palette-shape')) {
    e.preventDefault();
  }
}}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/__tests__/EditorCanvas.test.tsx`
Expected: PASS (existing + 3 new = +3).

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx packages/web-ui/src/scada-engine/editor/__tests__/EditorCanvas.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T6 EditorCanvas palette-shape onDrop branch + 3 tests"
```

---

## Task 7: DateRangePickerDialog + 6 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/DateRangePickerDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/DateRangePickerDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/DateRangePickerDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangePickerDialog } from '../DateRangePickerDialog';

const today = new Date('2026-05-17T00:00:00Z');
const tomorrow = new Date('2026-05-18T00:00:00Z');

describe('DateRangePickerDialog', () => {
  it('returns null when isOpen=false', () => {
    const { container } = render(
      <DateRangePickerDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when isOpen=true', () => {
    render(
      <DateRangePickerDialog isOpen onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirm fires onConfirm({from,to})', () => {
    const onConfirm = vi.fn();
    render(
      <DateRangePickerDialog
        isOpen
        initialValue={{ from: today, to: tomorrow }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const arg = onConfirm.mock.calls[0][0];
    expect(arg.from).toBeInstanceOf(Date);
    expect(arg.to).toBeInstanceOf(Date);
    expect(arg.from.getTime()).toBeLessThanOrEqual(arg.to.getTime());
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <DateRangePickerDialog isOpen onClose={onClose} onConfirm={() => {}} />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('from > to disables confirm button', () => {
    render(
      <DateRangePickerDialog
        isOpen
        initialValue={{ from: tomorrow, to: today }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(
      <DateRangePickerDialog isOpen onClose={onClose} onConfirm={() => {}} />,
    );
    const backdrop = document.querySelector('[data-backdrop]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/DateRangePickerDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DateRangePickerDialog**

Create `packages/web-ui/src/scada-engine/dialogs/DateRangePickerDialog.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';

export interface DateRangePickerDialogProps {
  isOpen: boolean;
  initialValue?: { from: Date; to: Date };
  title?: string;
  onClose: () => void;
  onConfirm: (value: { from: Date; to: Date }) => void;
}

function toInputValue(d: Date): string {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

function fromInputValue(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function DateRangePickerDialog({
  isOpen,
  initialValue,
  title = '选择日期范围',
  onClose,
  onConfirm,
}: DateRangePickerDialogProps): JSX.Element | null {
  const init = initialValue ?? { from: new Date(), to: new Date() };
  const [from, setFrom] = useState<Date>(init.from);
  const [to, setTo] = useState<Date>(init.to);

  useEffect(() => {
    if (isOpen) {
      setFrom(init.from);
      setTo(init.to);
    }
  }, [isOpen]); // re-init when reopened

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;
  const invalid = from.getTime() > to.getTime();

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="date-range-picker"
        onKeyDown={handleKey}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-80"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <label className="block text-sm mb-1">起始</label>
        <input
          type="date"
          value={toInputValue(from)}
          onChange={(e) => setFrom(fromInputValue(e.target.value))}
          className={`w-full px-2 py-1 mb-2 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
        />
        <label className="block text-sm mb-1">结束</label>
        <input
          type="date"
          value={toInputValue(to)}
          onChange={(e) => setTo(fromInputValue(e.target.value))}
          className={`w-full px-2 py-1 mb-3 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => onConfirm({ from, to })}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/DateRangePickerDialog.test.tsx`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/DateRangePickerDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/DateRangePickerDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T7 DateRangePickerDialog + 6 tests"
```

---

## Task 8: EditNameDialog + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/EditNameDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/EditNameDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/EditNameDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditNameDialog } from '../EditNameDialog';

describe('EditNameDialog', () => {
  it('returns null when isOpen=false', () => {
    const { container } = render(
      <EditNameDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with text input when isOpen=true', () => {
    render(<EditNameDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('confirm fires onConfirm(string)', () => {
    const onConfirm = vi.fn();
    render(
      <EditNameDialog
        isOpen
        initialValue="hello"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'world' } });
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith('world');
  });

  it('blank string disables confirm', () => {
    render(<EditNameDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<EditNameDialog isOpen onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/EditNameDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement EditNameDialog**

Create `packages/web-ui/src/scada-engine/dialogs/EditNameDialog.tsx`:

```tsx
import React, { useState, useEffect } from 'react';

export interface EditNameDialogProps {
  isOpen: boolean;
  initialValue?: string;
  title?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export function EditNameDialog({
  isOpen,
  initialValue = '',
  title = '编辑名称',
  onClose,
  onConfirm,
}: EditNameDialogProps): JSX.Element | null {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  if (!isOpen) return null;
  const invalid = value.trim().length === 0;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="edit-name"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-72"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full px-2 py-1 mb-3 bg-zinc-800 rounded"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => onConfirm(value)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/EditNameDialog.test.tsx`
Expected: PASS 5/5

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/EditNameDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/EditNameDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T8 EditNameDialog + 5 tests"
```

---

## Task 9: SelOptionsDialog + 6 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/SelOptionsDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/SelOptionsDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/SelOptionsDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelOptionsDialog } from '../SelOptionsDialog';

const opts = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('SelOptionsDialog', () => {
  it('multi=true confirm returns string[]', () => {
    const onConfirm = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        multi
        initialValue={['a']}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('multi=false confirm returns single string', () => {
    const onConfirm = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Cherry'));
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith('c');
  });

  it('empty options shows 无可选项 placeholder', () => {
    render(
      <SelOptionsDialog
        isOpen
        options={[]}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('无可选项')).toBeInTheDocument();
  });

  it('clicking same option twice toggles in multi mode', () => {
    const onConfirm = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        multi
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Apple'));
    fireEvent.click(screen.getByText('Apple'));
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm.mock.calls[0][0]).toEqual([]);
  });

  it('confirm disabled with no selection (single mode)', () => {
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        onClose={onClose}
        onConfirm={() => {}}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/SelOptionsDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SelOptionsDialog**

Create `packages/web-ui/src/scada-engine/dialogs/SelOptionsDialog.tsx`:

```tsx
import React, { useState, useEffect } from 'react';

export interface SelOptionsDialogProps {
  isOpen: boolean;
  options: { value: string; label: string }[];
  multi?: boolean;
  initialValue?: string | string[];
  title?: string;
  onClose: () => void;
  onConfirm: (value: string | string[]) => void;
}

export function SelOptionsDialog({
  isOpen,
  options,
  multi = false,
  initialValue,
  title = '选择',
  onClose,
  onConfirm,
}: SelOptionsDialogProps): JSX.Element | null {
  const [selected, setSelected] = useState<string[]>(() => {
    if (Array.isArray(initialValue)) return initialValue;
    if (typeof initialValue === 'string') return [initialValue];
    return [];
  });

  useEffect(() => {
    if (isOpen) {
      if (Array.isArray(initialValue)) setSelected(initialValue);
      else if (typeof initialValue === 'string') setSelected([initialValue]);
      else setSelected([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (v: string) => {
    if (multi) {
      setSelected((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
    } else {
      setSelected([v]);
    }
  };

  const invalid = selected.length === 0;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="sel-options"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-80 max-h-[80vh] flex flex-col"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">无可选项</p>
        ) : (
          <ul className="overflow-y-auto mb-3 space-y-1">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={`w-full text-left px-2 py-1 text-sm rounded ${selected.includes(o.value) ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!multi && invalid}
            onClick={() => onConfirm(multi ? selected : selected[0]!)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/SelOptionsDialog.test.tsx`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/SelOptionsDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/SelOptionsDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T9 SelOptionsDialog + 6 tests"
```

---

## Task 10: TreeTableDialog + 6 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/TreeTableDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/TreeTableDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/TreeTableDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeTableDialog, type TreeTableNode } from '../TreeTableDialog';

const tree: TreeTableNode[] = [
  {
    id: 'root',
    label: 'Root',
    children: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  },
];

describe('TreeTableDialog', () => {
  it('renders top-level nodes', () => {
    render(<TreeTableDialog isOpen tree={tree} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('renders nested children when expanded', () => {
    render(<TreeTableDialog isOpen tree={tree} onClose={() => {}} onConfirm={() => {}} />);
    fireEvent.click(screen.getByText('Root'));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('click on leaf toggles selection', () => {
    const onConfirm = vi.fn();
    render(<TreeTableDialog isOpen tree={tree} onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Root'));
    const checkbox = screen.getByLabelText('A') as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(['a']);
  });

  it('initialValue prepopulates selection', () => {
    const onConfirm = vi.fn();
    render(
      <TreeTableDialog
        isOpen
        tree={tree}
        initialValue={['b']}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(['b']);
  });

  it('empty tree shows 无可选项', () => {
    render(<TreeTableDialog isOpen tree={[]} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('无可选项')).toBeInTheDocument();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<TreeTableDialog isOpen tree={tree} onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/TreeTableDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TreeTableDialog**

Create `packages/web-ui/src/scada-engine/dialogs/TreeTableDialog.tsx`:

```tsx
import React, { useState, useEffect } from 'react';

export interface TreeTableNode {
  id: string;
  label: string;
  children?: TreeTableNode[];
}

export interface TreeTableDialogProps {
  isOpen: boolean;
  tree: TreeTableNode[];
  initialValue?: string[];
  title?: string;
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

interface NodeRowProps {
  node: TreeTableNode;
  depth: number;
  selected: Set<string>;
  toggleSel: (id: string) => void;
}

function NodeRow({ node, depth, selected, toggleSel }: NodeRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasKids = Array.isArray(node.children) && node.children.length > 0;
  return (
    <>
      <li className="flex items-center text-sm" style={{ paddingLeft: depth * 12 }}>
        {hasKids ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-4 mr-1 text-zinc-400"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 mr-1" />
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label={node.label}
            checked={selected.has(node.id)}
            onChange={() => toggleSel(node.id)}
          />
          <span onClick={() => hasKids && setExpanded((v) => !v)}>{node.label}</span>
        </label>
      </li>
      {hasKids && expanded
        ? node.children!.map((c) => (
            <NodeRow key={c.id} node={c} depth={depth + 1} selected={selected} toggleSel={toggleSel} />
          ))
        : null}
    </>
  );
}

export function TreeTableDialog({
  isOpen,
  tree,
  initialValue,
  title = '选择节点',
  onClose,
  onConfirm,
}: TreeTableDialogProps): JSX.Element | null {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialValue ?? []));

  useEffect(() => {
    if (isOpen) setSelected(new Set(initialValue ?? []));
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSel = (id: string) => {
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="tree-table"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-96 max-h-[80vh] flex flex-col"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        {tree.length === 0 ? (
          <p className="text-sm text-zinc-500">无可选项</p>
        ) : (
          <ul className="overflow-y-auto mb-3 space-y-1">
            {tree.map((n) => (
              <NodeRow key={n.id} node={n} depth={0} selected={selected} toggleSel={toggleSel} />
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(Array.from(selected))}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/TreeTableDialog.test.tsx`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/TreeTableDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/TreeTableDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T10 TreeTableDialog + 6 tests"
```

---

## Task 11: BitmaskDialog + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/BitmaskDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/BitmaskDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/BitmaskDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BitmaskDialog } from '../BitmaskDialog';

describe('BitmaskDialog', () => {
  it('renders 8 checkboxes by default', () => {
    render(<BitmaskDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });

  it('renders N checkboxes when bits prop set', () => {
    render(<BitmaskDialog isOpen bits={4} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('toggling bits updates onConfirm value (LSB = bit 0)', () => {
    const onConfirm = vi.fn();
    render(<BitmaskDialog isOpen bits={4} onClose={() => {}} onConfirm={onConfirm} />);
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]); // bit 0 → +1
    fireEvent.click(boxes[2]); // bit 2 → +4
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(5);
  });

  it('initialValue prepopulates bits', () => {
    render(
      <BitmaskDialog
        isOpen
        bits={4}
        initialValue={6}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[2].checked).toBe(true);
    expect(boxes[3].checked).toBe(false);
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<BitmaskDialog isOpen onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/BitmaskDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement BitmaskDialog**

Create `packages/web-ui/src/scada-engine/dialogs/BitmaskDialog.tsx`:

```tsx
import React, { useState, useEffect } from 'react';

export interface BitmaskDialogProps {
  isOpen: boolean;
  bits?: number;
  initialValue?: number;
  title?: string;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

export function BitmaskDialog({
  isOpen,
  bits = 8,
  initialValue = 0,
  title = '位掩码',
  onClose,
  onConfirm,
}: BitmaskDialogProps): JSX.Element | null {
  const [value, setValue] = useState<number>(Math.round(initialValue));

  useEffect(() => {
    if (isOpen) setValue(Math.round(initialValue));
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const toggleBit = (i: number) => {
    setValue((v) => v ^ (1 << i));
  };

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="bitmask"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-80"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {Array.from({ length: bits }).map((_, i) => (
            <label key={i} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={(value & (1 << i)) !== 0}
                onChange={() => toggleBit(i)}
              />
              bit{i}
            </label>
          ))}
        </div>
        <div className="text-sm mb-3">值: <span data-bitmask-value>{value}</span></div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(value)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/BitmaskDialog.test.tsx`
Expected: PASS 5/5

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/BitmaskDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/BitmaskDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T11 BitmaskDialog + 5 tests"
```

---

## Task 12: RangeNumberDialog + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/RangeNumberDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/RangeNumberDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/RangeNumberDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RangeNumberDialog } from '../RangeNumberDialog';

describe('RangeNumberDialog', () => {
  it('renders min and max number inputs', () => {
    render(
      <RangeNumberDialog isOpen onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByLabelText('最小值')).toBeInTheDocument();
    expect(screen.getByLabelText('最大值')).toBeInTheDocument();
  });

  it('confirm returns {min, max}', () => {
    const onConfirm = vi.fn();
    render(
      <RangeNumberDialog
        isOpen
        initialValue={{ min: 0, max: 10 }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText('最小值'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('最大值'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith({ min: 3, max: 12 });
  });

  it('min > max disables confirm', () => {
    render(
      <RangeNumberDialog
        isOpen
        initialValue={{ min: 10, max: 0 }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('initialValue prepopulates inputs', () => {
    render(
      <RangeNumberDialog
        isOpen
        initialValue={{ min: 5, max: 25 }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect((screen.getByLabelText('最小值') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('最大值') as HTMLInputElement).value).toBe('25');
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <RangeNumberDialog isOpen onClose={onClose} onConfirm={() => {}} />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/RangeNumberDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RangeNumberDialog**

Create `packages/web-ui/src/scada-engine/dialogs/RangeNumberDialog.tsx`:

```tsx
import React, { useState, useEffect, useId } from 'react';

export interface RangeNumberDialogProps {
  isOpen: boolean;
  initialValue?: { min: number; max: number };
  title?: string;
  onClose: () => void;
  onConfirm: (value: { min: number; max: number }) => void;
}

export function RangeNumberDialog({
  isOpen,
  initialValue = { min: 0, max: 100 },
  title = '范围',
  onClose,
  onConfirm,
}: RangeNumberDialogProps): JSX.Element | null {
  const [min, setMin] = useState<number>(initialValue.min);
  const [max, setMax] = useState<number>(initialValue.max);
  const minId = useId();
  const maxId = useId();

  useEffect(() => {
    if (isOpen) {
      setMin(initialValue.min);
      setMax(initialValue.max);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  const invalid = min > max;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="range-number"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-72"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <label htmlFor={minId} className="block text-sm mb-1">最小值</label>
        <input
          id={minId}
          type="number"
          value={min}
          onChange={(e) => setMin(Number(e.target.value))}
          className={`w-full px-2 py-1 mb-2 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
        />
        <label htmlFor={maxId} className="block text-sm mb-1">最大值</label>
        <input
          id={maxId}
          type="number"
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
          className={`w-full px-2 py-1 mb-3 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => onConfirm({ min, max })}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/RangeNumberDialog.test.tsx`
Expected: PASS 5/5

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/RangeNumberDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/RangeNumberDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T12 RangeNumberDialog + 5 tests"
```

---

## Task 13: IconSelectorDialog + 6 tests (Lucide ~50 icons)

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/IconSelectorDialog.tsx`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/IconSelectorDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/IconSelectorDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconSelectorDialog, ICON_LIST } from '../IconSelectorDialog';

describe('IconSelectorDialog', () => {
  it('renders all icons by default', () => {
    render(<IconSelectorDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    const grid = document.querySelector('[data-dialog="icon-selector"] ul') as HTMLElement;
    expect(grid.querySelectorAll('li').length).toBe(ICON_LIST.length);
  });

  it('ICON_LIST has at least 50 entries', () => {
    expect(ICON_LIST.length).toBeGreaterThanOrEqual(50);
  });

  it('search filters by icon name (case-insensitive)', () => {
    render(<IconSelectorDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    const input = screen.getByPlaceholderText('搜索图标...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'home' } });
    const grid = document.querySelector('[data-dialog="icon-selector"] ul') as HTMLElement;
    grid.querySelectorAll('li').forEach((li) => {
      expect((li.getAttribute('data-icon') ?? '').toLowerCase().includes('home')).toBe(true);
    });
  });

  it('clicking icon then confirm fires onConfirm(iconId)', () => {
    const onConfirm = vi.fn();
    render(<IconSelectorDialog isOpen onClose={() => {}} onConfirm={onConfirm} />);
    const first = document.querySelector('[data-dialog="icon-selector"] li[data-icon]') as HTMLElement;
    fireEvent.click(first);
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(first.getAttribute('data-icon'));
  });

  it('initialValue highlights the matching icon', () => {
    const id = ICON_LIST[2]!;
    render(
      <IconSelectorDialog
        isOpen
        initialValue={id}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const cell = document.querySelector(`[data-icon="${id}"]`) as HTMLElement;
    expect(cell.getAttribute('data-selected')).toBe('true');
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<IconSelectorDialog isOpen onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/IconSelectorDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement IconSelectorDialog**

Create `packages/web-ui/src/scada-engine/dialogs/IconSelectorDialog.tsx`:

```tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  Home, Settings, User, Lock, Unlock, Bell, Mail, Search,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Plus, Minus, X, Check, Pencil, Trash2,
  Save, FileText, Folder, FolderOpen, Download, Upload,
  Power, Pause, Play, Square as StopSquare, RefreshCw, RotateCcw,
  Activity, AlertTriangle, AlertCircle, Info, CheckCircle, XCircle,
  Eye, EyeOff, Star, Heart, Tag, Filter,
  Calendar, Clock, MapPin, Phone, Camera, Image,
  type LucideIcon,
} from 'lucide-react';

interface IconEntry {
  id: string;
  Icon: LucideIcon;
}

const ENTRIES: IconEntry[] = [
  { id: 'home', Icon: Home }, { id: 'settings', Icon: Settings }, { id: 'user', Icon: User },
  { id: 'lock', Icon: Lock }, { id: 'unlock', Icon: Unlock }, { id: 'bell', Icon: Bell },
  { id: 'mail', Icon: Mail }, { id: 'search', Icon: Search },
  { id: 'chevron-up', Icon: ChevronUp }, { id: 'chevron-down', Icon: ChevronDown },
  { id: 'chevron-left', Icon: ChevronLeft }, { id: 'chevron-right', Icon: ChevronRight },
  { id: 'arrow-up', Icon: ArrowUp }, { id: 'arrow-down', Icon: ArrowDown },
  { id: 'arrow-left', Icon: ArrowLeft }, { id: 'arrow-right', Icon: ArrowRight },
  { id: 'plus', Icon: Plus }, { id: 'minus', Icon: Minus }, { id: 'x', Icon: X },
  { id: 'check', Icon: Check }, { id: 'pencil', Icon: Pencil }, { id: 'trash', Icon: Trash2 },
  { id: 'save', Icon: Save }, { id: 'file-text', Icon: FileText },
  { id: 'folder', Icon: Folder }, { id: 'folder-open', Icon: FolderOpen },
  { id: 'download', Icon: Download }, { id: 'upload', Icon: Upload },
  { id: 'power', Icon: Power }, { id: 'pause', Icon: Pause }, { id: 'play', Icon: Play },
  { id: 'stop', Icon: StopSquare }, { id: 'refresh', Icon: RefreshCw }, { id: 'rotate', Icon: RotateCcw },
  { id: 'activity', Icon: Activity }, { id: 'warning', Icon: AlertTriangle },
  { id: 'alert', Icon: AlertCircle }, { id: 'info', Icon: Info },
  { id: 'success', Icon: CheckCircle }, { id: 'error', Icon: XCircle },
  { id: 'eye', Icon: Eye }, { id: 'eye-off', Icon: EyeOff },
  { id: 'star', Icon: Star }, { id: 'heart', Icon: Heart },
  { id: 'tag', Icon: Tag }, { id: 'filter', Icon: Filter },
  { id: 'calendar', Icon: Calendar }, { id: 'clock', Icon: Clock },
  { id: 'map-pin', Icon: MapPin }, { id: 'phone', Icon: Phone },
  { id: 'camera', Icon: Camera }, { id: 'image', Icon: Image },
];

export const ICON_LIST: ReadonlyArray<string> = ENTRIES.map((e) => e.id);

export interface IconSelectorDialogProps {
  isOpen: boolean;
  initialValue?: string;
  title?: string;
  onClose: () => void;
  onConfirm: (iconId: string) => void;
}

export function IconSelectorDialog({
  isOpen,
  initialValue,
  title = '选择图标',
  onClose,
  onConfirm,
}: IconSelectorDialogProps): JSX.Element | null {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | undefined>(initialValue);

  useEffect(() => {
    if (isOpen) {
      setQ('');
      setSel(initialValue);
    }
  }, [isOpen, initialValue]);

  const filtered = useMemo(() => {
    if (!q.trim()) return ENTRIES;
    const lo = q.toLowerCase();
    return ENTRIES.filter((e) => e.id.toLowerCase().includes(lo));
  }, [q]);

  if (!isOpen) return null;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="icon-selector"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-96 max-h-[80vh] flex flex-col"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <input
          type="text"
          placeholder="搜索图标..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="px-2 py-1 mb-2 bg-zinc-800 rounded text-sm"
        />
        <ul className="grid grid-cols-6 gap-2 overflow-y-auto mb-3">
          {filtered.map(({ id, Icon }) => (
            <li
              key={id}
              data-icon={id}
              data-selected={sel === id ? 'true' : 'false'}
              onClick={() => setSel(id)}
              title={id}
              className={`cursor-pointer p-2 rounded flex items-center justify-center ${sel === id ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
            >
              <Icon size={20} />
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!sel}
            onClick={() => onConfirm(sel!)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/IconSelectorDialog.test.tsx`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/dialogs/IconSelectorDialog.tsx packages/web-ui/src/scada-engine/dialogs/__tests__/IconSelectorDialog.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T13 IconSelectorDialog + 6 tests"
```

---

## Task 14: Gauge + Switch widgets-extras + 11 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/widgets-extras/Gauge.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/Switch.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/__tests__/Gauge.test.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/__tests__/Switch.test.tsx`

- [ ] **Step 1: Write Gauge failing tests**

Create `packages/web-ui/src/scada-engine/widgets-extras/__tests__/Gauge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gauge } from '../Gauge';

describe('Gauge', () => {
  it('renders the numeric value text', () => {
    render(<Gauge value={42} min={0} max={100} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('clamps value above max to max', () => {
    render(<Gauge value={200} min={0} max={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('clamps value below min to min', () => {
    render(<Gauge value={-10} min={0} max={100} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<Gauge value={50} min={0} max={100} label="Temp" />);
    expect(screen.getByText('Temp')).toBeInTheDocument();
  });

  it('shows Invalid range when min>=max', () => {
    render(<Gauge value={50} min={100} max={0} />);
    expect(screen.getByText('Invalid range')).toBeInTheDocument();
  });

  it('applies threshold color to filled arc', () => {
    const { container } = render(
      <Gauge
        value={80}
        min={0}
        max={100}
        thresholds={[
          { value: 0, color: 'green' },
          { value: 75, color: 'red' },
        ]}
      />,
    );
    const arc = container.querySelector('[data-arc="value"]') as SVGPathElement;
    expect(arc).toBeTruthy();
    expect(arc.getAttribute('stroke')).toBe('red');
  });
});
```

- [ ] **Step 2: Write Switch failing tests**

Create `packages/web-ui/src/scada-engine/widgets-extras/__tests__/Switch.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '../Switch';

describe('Switch', () => {
  it('renders role=switch', () => {
    render(<Switch checked={false} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('aria-checked reflects state', () => {
    const { rerender } = render(<Switch checked={false} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('click fires onChange(!checked)', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders labelOn / labelOff', () => {
    const { rerender } = render(
      <Switch checked={false} labelOn="ON" labelOff="OFF" onChange={() => {}} />,
    );
    expect(screen.getByText('OFF')).toBeInTheDocument();
    rerender(
      <Switch checked labelOn="ON" labelOff="OFF" onChange={() => {}} />,
    );
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('disabled blocks click', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/widgets-extras/__tests__/Gauge.test.tsx src/scada-engine/widgets-extras/__tests__/Switch.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement Gauge**

Create `packages/web-ui/src/scada-engine/widgets-extras/Gauge.tsx`:

```tsx
import React from 'react';

export interface GaugeThreshold {
  value: number;
  color: string;
}

export interface GaugeProps {
  value: number;
  min: number;
  max: number;
  thresholds?: GaugeThreshold[];
  label?: string;
  width?: number;
  height?: number;
}

function pickColor(value: number, thresholds: GaugeThreshold[] | undefined, fallback: string): string {
  if (!thresholds || thresholds.length === 0) return fallback;
  let color = fallback;
  for (const t of thresholds) {
    if (value >= t.value) color = t.color;
  }
  return color;
}

export function Gauge({
  value,
  min,
  max,
  thresholds,
  label,
  width = 160,
  height = 100,
}: GaugeProps): JSX.Element {
  if (min >= max) {
    return (
      <div data-widget="gauge" data-state="invalid" className="text-xs text-red-500">
        Invalid range
      </div>
    );
  }
  const v = Math.min(max, Math.max(min, value));
  const ratio = (v - min) / (max - min);
  // Semicircle from -180 to 0 deg
  const cx = width / 2;
  const cy = height;
  const r = Math.min(width, height * 2) / 2 - 8;
  function polar(angleDeg: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  const startA = 180;
  const endA = 180 + 180 * ratio;
  const start = polar(startA);
  const end = polar(endA);
  const largeArc = endA - startA > 180 ? 1 : 0;
  const color = pickColor(v, thresholds, '#3b82f6');
  return (
    <div data-widget="gauge" className="flex flex-col items-center">
      <svg width={width} height={height + 8}>
        <path
          d={`M ${polar(180).x} ${polar(180).y} A ${r} ${r} 0 1 1 ${polar(360).x} ${polar(360).y}`}
          fill="none"
          stroke="#374151"
          strokeWidth={10}
        />
        <path
          data-arc="value"
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="14" fill="#111827">
          {v}
        </text>
      </svg>
      {label ? <span className="text-xs text-zinc-400">{label}</span> : null}
    </div>
  );
}
```

- [ ] **Step 5: Implement Switch**

Create `packages/web-ui/src/scada-engine/widgets-extras/Switch.tsx`:

```tsx
import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (b: boolean) => void;
  labelOn?: string;
  labelOff?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  labelOn,
  labelOff,
  disabled = false,
}: SwitchProps): JSX.Element {
  const on = Boolean(checked);
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-zinc-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      {on && labelOn ? <span className="text-sm">{labelOn}</span> : null}
      {!on && labelOff ? <span className="text-sm">{labelOff}</span> : null}
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/widgets-extras/__tests__/Gauge.test.tsx src/scada-engine/widgets-extras/__tests__/Switch.test.tsx`
Expected: PASS (6 Gauge + 5 Switch = 11).

- [ ] **Step 7: Commit**

```bash
git add packages/web-ui/src/scada-engine/widgets-extras/Gauge.tsx packages/web-ui/src/scada-engine/widgets-extras/Switch.tsx packages/web-ui/src/scada-engine/widgets-extras/__tests__/Gauge.test.tsx packages/web-ui/src/scada-engine/widgets-extras/__tests__/Switch.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T14 Gauge + Switch widgets-extras + 11 tests"
```

---

## Task 15: NouiSlider + Scheduler widgets-extras + 13 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/widgets-extras/NouiSlider.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/Scheduler.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/__tests__/NouiSlider.test.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/__tests__/Scheduler.test.tsx`

- [ ] **Step 1: Write NouiSlider failing tests**

Create `packages/web-ui/src/scada-engine/widgets-extras/__tests__/NouiSlider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NouiSlider } from '../NouiSlider';

describe('NouiSlider', () => {
  it('renders role=slider', () => {
    render(<NouiSlider value={50} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('aria-valuenow reflects value', () => {
    render(<NouiSlider value={42} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '42');
  });

  it('change fires onChange with new number', () => {
    const onChange = vi.fn();
    render(<NouiSlider value={50} min={0} max={100} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
    expect(onChange).toHaveBeenCalledWith(70);
  });

  it('step rounding', () => {
    render(<NouiSlider value={50} min={0} max={100} step={10} onChange={() => {}} />);
    const el = screen.getByRole('slider') as HTMLInputElement;
    expect(el.step).toBe('10');
  });

  it('clamps value to max if above range', () => {
    render(<NouiSlider value={200} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps value to min if below range', () => {
    render(<NouiSlider value={-50} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  });

  it('step<=0 falls back to 1', () => {
    render(<NouiSlider value={50} min={0} max={100} step={0} onChange={() => {}} />);
    const el = screen.getByRole('slider') as HTMLInputElement;
    expect(el.step).toBe('1');
  });
});
```

- [ ] **Step 2: Write Scheduler failing tests**

Create `packages/web-ui/src/scada-engine/widgets-extras/__tests__/Scheduler.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Scheduler, validateCron } from '../Scheduler';

describe('Scheduler', () => {
  it('renders 5 cron fields from initial cron', () => {
    render(<Scheduler cron="0 12 * * 1" onChange={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(5);
    expect((inputs[0] as HTMLInputElement).value).toBe('0');
    expect((inputs[1] as HTMLInputElement).value).toBe('12');
    expect((inputs[4] as HTMLInputElement).value).toBe('1');
  });

  it('editing a field fires onChange with new full cron', () => {
    const onChange = vi.fn();
    render(<Scheduler cron="0 12 * * *" onChange={onChange} />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[1], { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith('0 15 * * *');
  });

  it('* wildcard accepted', () => {
    expect(validateCron('* * * * *')).toBeNull();
  });

  it('6-field cron rejected (only 5 supported)', () => {
    expect(validateCron('0 0 12 * * *')).not.toBeNull();
  });

  it('invalid cron shows red border on container', () => {
    render(<Scheduler cron="not a cron string" onChange={() => {}} />);
    const container = document.querySelector('[data-widget="scheduler"]') as HTMLElement;
    expect(container.className).toContain('border-red-500');
  });

  it('validateCron returns null for valid', () => {
    expect(validateCron('0 12 * * 1')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/widgets-extras/__tests__/NouiSlider.test.tsx src/scada-engine/widgets-extras/__tests__/Scheduler.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement NouiSlider**

Create `packages/web-ui/src/scada-engine/widgets-extras/NouiSlider.tsx`:

```tsx
import React from 'react';

export interface NouiSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
}

export function NouiSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  label,
}: NouiSliderProps): JSX.Element {
  const safeStep = step > 0 ? step : 1;
  const clamped = Math.min(max, Math.max(min, value));
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs text-zinc-400">{label}</span> : null}
      <input
        type="range"
        role="slider"
        aria-valuenow={clamped}
        aria-valuemin={min}
        aria-valuemax={max}
        value={clamped}
        min={min}
        max={max}
        step={safeStep}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
```

- [ ] **Step 5: Implement Scheduler**

Create `packages/web-ui/src/scada-engine/widgets-extras/Scheduler.tsx`:

```tsx
import React from 'react';

export interface SchedulerProps {
  cron: string;
  onChange: (cron: string) => void;
  disabled?: boolean;
}

const FIELD_RE = /^(\*|\d+|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;

export function validateCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return '必须是 5 字段 cron';
  for (const p of parts) {
    if (!FIELD_RE.test(p)) return `字段格式错误: ${p}`;
  }
  return null;
}

const LABELS = ['分', '时', '日', '月', '周'];

export function Scheduler({ cron, onChange, disabled = false }: SchedulerProps): JSX.Element {
  const parts = cron.trim().split(/\s+/);
  const padded = parts.length === 5 ? parts : ['*', '*', '*', '*', '*'];
  const error = validateCron(cron);
  return (
    <div
      data-widget="scheduler"
      className={`flex gap-2 ${error ? 'border border-red-500 p-1 rounded' : ''}`}
    >
      {padded.map((v, i) => (
        <label key={i} className="flex flex-col items-center text-xs">
          <span className="text-zinc-400">{LABELS[i]}</span>
          <input
            type="text"
            value={v}
            disabled={disabled}
            onChange={(e) => {
              const next = [...padded];
              next[i] = e.target.value;
              onChange(next.join(' '));
            }}
            className="w-12 px-1 py-0.5 bg-zinc-800 text-zinc-100 rounded text-center"
          />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/widgets-extras/__tests__/NouiSlider.test.tsx src/scada-engine/widgets-extras/__tests__/Scheduler.test.tsx`
Expected: PASS (7 + 6 = 13).

- [ ] **Step 7: Commit**

```bash
git add packages/web-ui/src/scada-engine/widgets-extras/NouiSlider.tsx packages/web-ui/src/scada-engine/widgets-extras/Scheduler.tsx packages/web-ui/src/scada-engine/widgets-extras/__tests__/NouiSlider.test.tsx packages/web-ui/src/scada-engine/widgets-extras/__tests__/Scheduler.test.tsx
git commit -m "feat(scada-engine): SP-FX-5 T15 NouiSlider + Scheduler widgets-extras + 13 tests"
```

---

## Task 16: UplotChart + uplot dep + jsdom canvas mock + 6 tests

**Files:**
- Modify: `packages/web-ui/package.json` (add `uplot@^1.6.31`)
- Modify: `packages/web-ui/src/test/setup.ts` (jsdom canvas mock)
- Create: `packages/web-ui/src/scada-engine/widgets-extras/UplotChart.tsx`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/__tests__/UplotChart.test.tsx`

- [ ] **Step 1: Add uplot dep**

Run:
```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui add uplot@^1.6.31
```
Expected: `packages/web-ui/package.json` includes `"uplot": "^1.6.31"` in dependencies. Lockfile updated.

- [ ] **Step 2: Add jsdom canvas mock to setup**

Read `packages/web-ui/src/test/setup.ts`. Append (only if HTMLCanvasElement.getContext stub not already present):

```ts
if (typeof HTMLCanvasElement !== 'undefined' && !('__SP_FX_5_CANVAS_STUB__' in HTMLCanvasElement.prototype)) {
  (HTMLCanvasElement.prototype as any).__SP_FX_5_CANVAS_STUB__ = true;
  HTMLCanvasElement.prototype.getContext = (() => {
    return {
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      setTransform: () => {},
      drawImage: () => {},
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillText: () => {},
      strokeText: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray() }),
      putImageData: () => {},
      canvas: { width: 0, height: 0 },
    };
  }) as any;
}
```

- [ ] **Step 3: Write UplotChart failing tests**

Create `packages/web-ui/src/scada-engine/widgets-extras/__tests__/UplotChart.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { UplotChart } from '../UplotChart';

const setData = vi.fn();
const setSize = vi.fn();
const destroy = vi.fn();

vi.mock('uplot', () => {
  const ctor = vi.fn().mockImplementation(() => ({ setData, setSize, destroy }));
  return { default: ctor };
});

beforeEach(() => {
  setData.mockClear();
  setSize.mockClear();
  destroy.mockClear();
});

describe('UplotChart', () => {
  it('returns null when width<=0', () => {
    const { container } = render(
      <UplotChart series={[{ x: [0], y: [0] }]} width={0} height={100} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when height<=0', () => {
    const { container } = render(
      <UplotChart series={[{ x: [0], y: [0] }]} width={100} height={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('mounts uplot with width and height', async () => {
    const uplot = (await import('uplot')).default as unknown as { mock: { calls: any[][] } };
    render(
      <UplotChart series={[{ x: [0, 1, 2], y: [1, 2, 3] }]} width={400} height={200} />,
    );
    const lastCall = uplot.mock.calls[uplot.mock.calls.length - 1]!;
    expect(lastCall[0].width).toBe(400);
    expect(lastCall[0].height).toBe(200);
  });

  it('setData called on series change', () => {
    const { rerender } = render(
      <UplotChart series={[{ x: [0, 1], y: [1, 2] }]} width={400} height={200} />,
    );
    rerender(
      <UplotChart series={[{ x: [0, 1, 2], y: [3, 4, 5] }]} width={400} height={200} />,
    );
    expect(setData).toHaveBeenCalled();
  });

  it('destroy called on unmount', () => {
    const { unmount } = render(
      <UplotChart series={[{ x: [0], y: [0] }]} width={400} height={200} />,
    );
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  it('empty series array does not throw', () => {
    expect(() =>
      render(<UplotChart series={[]} width={400} height={200} />),
    ).not.toThrow();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/widgets-extras/__tests__/UplotChart.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement UplotChart**

Create `packages/web-ui/src/scada-engine/widgets-extras/UplotChart.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';

export interface UplotSeries {
  x: number[];
  y: number[];
  label?: string;
  stroke?: string;
}

export interface UplotChartProps {
  series: UplotSeries[];
  width: number;
  height: number;
  title?: string;
}

function seriesToData(series: UplotSeries[]): uPlot.AlignedData {
  if (series.length === 0) return [[]];
  const xs = series[0]!.x;
  const ys = series.map((s) => s.y);
  return [xs, ...ys] as uPlot.AlignedData;
}

function seriesToOpts(series: UplotSeries[], width: number, height: number, title?: string): uPlot.Options {
  return {
    width,
    height,
    title,
    series: [
      {},
      ...series.map((s, i) => ({
        label: s.label ?? `s${i}`,
        stroke: s.stroke ?? '#3b82f6',
      })),
    ],
  };
}

export function UplotChart({ series, width, height, title }: UplotChartProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (width <= 0 || height <= 0) return;
    const opts = seriesToOpts(series, width, height, title);
    const data = seriesToData(series);
    instanceRef.current = new uPlot(opts, data, containerRef.current);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!instanceRef.current) return;
    if (width <= 0 || height <= 0) return;
    instanceRef.current.setData(seriesToData(series));
    instanceRef.current.setSize({ width, height });
  }, [series, width, height]);

  if (width <= 0 || height <= 0) return null;

  return <div ref={containerRef} data-widget="uplot-chart" style={{ width, height }} />;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run src/scada-engine/widgets-extras/__tests__/UplotChart.test.tsx`
Expected: PASS 6/6

- [ ] **Step 7: Commit**

```bash
git add packages/web-ui/package.json packages/web-ui/src/test/setup.ts packages/web-ui/src/scada-engine/widgets-extras/UplotChart.tsx packages/web-ui/src/scada-engine/widgets-extras/__tests__/UplotChart.test.tsx pnpm-lock.yaml
git commit -m "feat(scada-engine): SP-FX-5 T16 UplotChart + uplot dep + canvas stub + 6 tests"
```

---

## Task 17: Barrel exports (editor + dialogs + widgets-extras)

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`
- Modify: `packages/web-ui/src/scada-engine/dialogs/index.ts`
- Create: `packages/web-ui/src/scada-engine/widgets-extras/index.ts`

- [ ] **Step 1: Read current editor/index.ts**

It currently re-exports SP-FX-3 and SP-FX-4 modules. Append:

```ts
// SP-FX-5
export { ShapePicker } from './palette/ShapePicker';
export { makeShapeWidget } from './palette/palette-items';
export { SHAPE_CATALOG, type PaletteShape } from './palette/shape-catalog';
```

- [ ] **Step 2: Read current dialogs/index.ts**

It currently re-exports 4 dialogs. Append:

```ts
// SP-FX-5
export { DateRangePickerDialog, type DateRangePickerDialogProps } from './DateRangePickerDialog';
export { EditNameDialog, type EditNameDialogProps } from './EditNameDialog';
export { SelOptionsDialog, type SelOptionsDialogProps } from './SelOptionsDialog';
export { TreeTableDialog, type TreeTableDialogProps, type TreeTableNode } from './TreeTableDialog';
export { BitmaskDialog, type BitmaskDialogProps } from './BitmaskDialog';
export { RangeNumberDialog, type RangeNumberDialogProps } from './RangeNumberDialog';
export { IconSelectorDialog, type IconSelectorDialogProps, ICON_LIST } from './IconSelectorDialog';
```

- [ ] **Step 3: Create widgets-extras/index.ts**

Create `packages/web-ui/src/scada-engine/widgets-extras/index.ts`:

```ts
// SP-FX-5: widgets-extras barrel
export { Gauge, type GaugeProps, type GaugeThreshold } from './Gauge';
export { Switch, type SwitchProps } from './Switch';
export { NouiSlider, type NouiSliderProps } from './NouiSlider';
export { Scheduler, type SchedulerProps, validateCron } from './Scheduler';
export { UplotChart, type UplotChartProps, type UplotSeries } from './UplotChart';
```

- [ ] **Step 4: Run tsc to verify no type errors**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Run full vitest suite to confirm nothing regressed**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run`
Expected: ≥795 tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/index.ts packages/web-ui/src/scada-engine/dialogs/index.ts packages/web-ui/src/scada-engine/widgets-extras/index.ts
git commit -m "feat(scada-engine): SP-FX-5 T17 barrel exports (editor + dialogs + widgets-extras)"
```

---

## Task 18: Playwright 2 smoke (shape drag + resize)

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-shapes.spec.ts`

- [ ] **Step 1: Read existing SP-FX-4 Playwright spec for pattern**

Run: `cat packages/web-ui/e2e/scada-editor-shell.spec.ts`. Note: it logs in, navigates to `/scada2/edit-v2/<viewId>`, dispatches drag events synthetically.

- [ ] **Step 2: Write the 2 failing E2E tests**

Create `packages/web-ui/e2e/scada-editor-shapes.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const TEST_VIEW_ID = process.env.TEST_VIEW_ID ?? '1';

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name=email]', process.env.E2E_EMAIL ?? 'admin@biocore.local');
  await page.fill('input[name=password]', process.env.E2E_PASS ?? 'admin');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/dashboard/);
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/scada2/edit-v2/${TEST_VIEW_ID}`);
  await page.waitForSelector('[data-editor-canvas-host]');
}

async function dragShapeOntoCanvas(page: Page, shapeId: string): Promise<void> {
  // Find shape cell in picker
  const cell = page.locator(`[data-palette-shape="${shapeId}"]`);
  await expect(cell).toBeVisible();
  const host = page.locator('[data-editor-canvas-host]');

  // Synthetic D&D via browser_evaluate is required because Playwright .dragTo()
  // does not exercise the HTML5 dataTransfer API the same way the source does.
  await page.evaluate(
    ({ srcSel, dstSel, id }) => {
      const src = document.querySelector(srcSel) as HTMLElement;
      const dst = document.querySelector(dstSel) as HTMLElement;
      const data = new DataTransfer();
      const payload = JSON.stringify({ id, src: `/scada-shapes/${id}.svg` });
      data.setData('palette-shape', payload);
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
      const r = dst.getBoundingClientRect();
      dst.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: r.left + 100,
          clientY: r.top + 100,
        }),
      );
    },
    { srcSel: `[data-palette-shape="${shapeId}"]`, dstSel: '[data-editor-canvas-host]', id: shapeId },
  );
}

test.describe('SP-FX-5 SCADA editor shapes', () => {
  test('shape drag + save', async ({ page }) => {
    await login(page);
    await openEditor(page);

    // Use first available shape in catalog
    const firstCell = page.locator('[data-palette-shape]').first();
    const shapeId = await firstCell.getAttribute('data-palette-shape');
    expect(shapeId).toBeTruthy();

    await dragShapeOntoCanvas(page, shapeId!);

    const img = page.locator(`[data-editor-canvas-host] image[href*="/scada-shapes/${shapeId}.svg"]`);
    await expect(img).toBeVisible();

    // Save
    const respPromise = page.waitForResponse((r) => r.url().includes(`/api/v1/fuxa-views/${TEST_VIEW_ID}`) && r.request().method() === 'PUT');
    await page.keyboard.press('Meta+S');
    const resp = await respPromise;
    expect(resp.status()).toBe(200);
  });

  test('shape select shows transform handles', async ({ page }) => {
    await login(page);
    await openEditor(page);

    const firstCell = page.locator('[data-palette-shape]').first();
    const shapeId = await firstCell.getAttribute('data-palette-shape');
    await dragShapeOntoCanvas(page, shapeId!);

    const img = page.locator(`[data-editor-canvas-host] image[href*="/scada-shapes/"]`).first();
    await img.click();

    await expect(page.locator('[data-overlay="handles"], [data-handle]').first()).toBeVisible();
  });
});
```

- [ ] **Step 3: Run Playwright in headed mode (verify scenario)**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui exec playwright test e2e/scada-editor-shapes.spec.ts --headed --reporter=line`
Expected: both tests pass. If the first run fails because the dev server isn't running, start `pnpm --filter @biocore/web-ui dev` in another terminal and rerun.

- [ ] **Step 4: Commit**

```bash
git add packages/web-ui/e2e/scada-editor-shapes.spec.ts
git commit -m "test(scada-engine): SP-FX-5 T18 Playwright shape drag + resize smoke (2)"
```

---

## Task 19: Full regression + push

**Files:** none modified

- [ ] **Step 1: Run full web-ui vitest suite**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui vitest run`
Expected: ≥795 tests passing (706 baseline + 89 new).

- [ ] **Step 2: Run server vitest (regression)**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/server vitest run`
Expected: 147/147 passing.

- [ ] **Step 3: Run data-service vitest (regression)**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/data-service vitest run`
Expected: 84/84 passing.

- [ ] **Step 4: Run full Playwright suite**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui exec playwright test`
Expected: ≥25 passing (23 baseline + 2 new).

- [ ] **Step 5: Run tsc clean check**

Run: `export PATH=$HOME/.hermes/node/bin:$PATH && pnpm --filter @biocore/web-ui tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Push to remote**

```bash
git push origin HEAD
```

Expected: push succeeds. (No PR creation in this plan — user decides whether to open one.)

---

## Self-Review

**Spec coverage check:**

| Spec section | Plan task(s) |
|--------------|--------------|
| §1.1 Shapes — gen-shape-catalog | T0 |
| §1.1 Shapes — 209 SVG copy + README | T1 |
| §1.1 Shapes — makeShapeWidget | T2 |
| §1.1 Shapes — ShapePicker | T3 |
| §1.1 Shapes — Palette extension | T4 |
| §1.1 Shapes — canvas-svg 'shape' case | T5 |
| §1.1 Shapes — EditorCanvas onDrop | T6 |
| §1.1 Dialogs — DateRangePickerDialog | T7 |
| §1.1 Dialogs — EditNameDialog | T8 |
| §1.1 Dialogs — SelOptionsDialog | T9 |
| §1.1 Dialogs — TreeTableDialog | T10 |
| §1.1 Dialogs — BitmaskDialog | T11 |
| §1.1 Dialogs — RangeNumberDialog | T12 |
| §1.1 Dialogs — IconSelectorDialog | T13 |
| §1.1 Widgets-extras — Gauge | T14 |
| §1.1 Widgets-extras — Switch | T14 |
| §1.1 Widgets-extras — NouiSlider | T15 |
| §1.1 Widgets-extras — Scheduler | T15 |
| §1.1 Widgets-extras — UplotChart + uplot dep | T16 |
| §1.4 Test count target +89 / +2 | T19 verification |
| §6.3 jsdom canvas mock | T16 setup mod |
| §7 Stop Conditions 1-12 | T19 |

All spec items covered.

**Placeholder check:** no TBD / TODO / "similar to X" placeholders. Every test block, every implementation block has runnable code.

**Type consistency check:**
- `makeShapeWidget(shapeId, src, pt, gridSize)` signature consistent T2/T6/T18
- `PaletteShape { id, label, src }` consistent T0/T3
- Dialog props all extend `{ isOpen, onClose, onConfirm, title?, initialValue? }` — consistent T7-T13
- Widget props each have full type definitions in their task, no cross-task drift
- `SHAPE_CATALOG: ReadonlyArray<PaletteShape>` consistent T0/T3
- `validateCron(cron: string): string | null` consistent T15

**Coverage of constraints:**
- TDD RED-first: every task has Step 1=test, Step 2=run-fail, Step 3=impl, Step 4=run-pass.
- macOS BSD sed: plan uses Edit/Write tool replacements only, no sed.
- pnpm path: every command prefixed with `export PATH=$HOME/.hermes/node/bin:$PATH`.
- 1 new dep: uplot@^1.6.31 added in T16 only.
- AI/animation/expression-eval/writeTag isolation: nothing in SP-FX-5 touches `editor-store.addWidget` semantics or runtime tags; SCADA write paths untouched.

---

End of plan.
