# SP-FX-5.5 — Follow-up Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close 3 SP-FX-5 §1.2 deferred items: dialog a11y focus trap, shape category filter scaffold, dev-mode shape file watch.

**Architecture:** Self-contained `useFocusTrap` hook applied to 11 dialogs (no API change). Generator extended to read optional `shape-categories.json` sidecar; ShapePicker gets category dropdown (hidden when empty). New `scripts/watch-shapes.ts` (chokidar) for dev auto-sync.

**Tech Stack:** TypeScript 5, React 18, vitest, chokidar (new dev dep).

**Baseline:** main `9081280` (post SP-FX-5 ship + claude assets). web-ui 791 vitest, scripts 5, server 147, data-service 84, Playwright 25.
**Target:** web-ui 791+~7 = ~798, scripts 5 → 7.

**Out of scope** (with reasons):
- Dialog Playwright smoke — dialogs have 0 mount points in editor; defer to SP-FX-6 widget property panel sprint.
- Pre-populated category map for 154 SVGs — manual classification; sidecar is empty scaffold, user fills over time.
- Build hook auto-cp on prod build — defer to SP-FX-8.

---

## Per-task model hints

| Task | Suggested model | Reason |
|------|-----------------|--------|
| T0 | sonnet | Hook + 11 dialog touchpoints + tests |
| T1 | sonnet | Generator extension + ShapePicker filter + tests |
| T2 | sonnet | Chokidar watcher + dev script |
| T3 | haiku | Regression + push |

---

## Task 0: useFocusTrap hook + apply to 11 dialogs

**Files:**
- Create: `packages/web-ui/src/scada-engine/dialogs/useFocusTrap.ts`
- Create: `packages/web-ui/src/scada-engine/dialogs/__tests__/useFocusTrap.test.tsx`
- Modify: 11 dialog `.tsx` files in `packages/web-ui/src/scada-engine/dialogs/`

### Step 1: Write failing tests

Create `packages/web-ui/src/scada-engine/dialogs/__tests__/useFocusTrap.test.tsx`:

```tsx
import React, { useRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';

function Harness({ isOpen }: { isOpen: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, isOpen);
  return (
    <div ref={ref} data-testid="trap" tabIndex={-1}>
      <button data-testid="a">A</button>
      <button data-testid="b">B</button>
      <button data-testid="c">C</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses first focusable when isOpen toggles true', async () => {
    const { rerender, getByTestId } = render(<Harness isOpen={false} />);
    expect(document.activeElement?.tagName).not.toBe('BUTTON');
    rerender(<Harness isOpen={true} />);
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(getByTestId('a'));
  });

  it('Tab from last focusable wraps to first', async () => {
    const { getByTestId } = render(<Harness isOpen={true} />);
    await act(async () => { await Promise.resolve(); });
    const c = getByTestId('c');
    c.focus();
    fireEvent.keyDown(c, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('a'));
  });

  it('Shift+Tab from first focusable wraps to last', async () => {
    const { getByTestId } = render(<Harness isOpen={true} />);
    await act(async () => { await Promise.resolve(); });
    const a = getByTestId('a');
    a.focus();
    fireEvent.keyDown(a, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('c'));
  });

  it('no-op when isOpen=false', () => {
    const { getByTestId } = render(<Harness isOpen={false} />);
    const c = getByTestId('c');
    c.focus();
    fireEvent.keyDown(c, { key: 'Tab' });
    expect(document.activeElement).toBe(c);
  });

  it('no-op when container has no focusables', () => {
    function Empty(): JSX.Element {
      const ref = useRef<HTMLDivElement | null>(null);
      useFocusTrap(ref, true);
      return <div ref={ref} data-testid="empty" />;
    }
    expect(() => render(<Empty />)).not.toThrow();
  });
});
```

### Step 2: Run tests to verify they fail

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/useFocusTrap.test.tsx
```

Expected: FAIL — module not found.

### Step 3: Implement useFocusTrap

Create `packages/web-ui/src/scada-engine/dialogs/useFocusTrap.ts`:

```ts
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const root = ref.current;
    const initial = getFocusables(root);
    if (initial.length > 0) initial[0]!.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const items = getFocusables(root);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !items.includes(active!)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [isOpen, ref]);
}
```

### Step 4: Run tests to verify they pass

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/__tests__/useFocusTrap.test.tsx
```

Expected: PASS 5/5.

### Step 5: Apply to 11 dialogs

Files:
- `BitmaskDialog.tsx`
- `ConfirmDialog.tsx`
- `DateRangePickerDialog.tsx`
- `EditNameDialog.tsx`
- `FileUploadDialog.tsx`
- `IconSelectorDialog.tsx`
- `RangeNumberDialog.tsx`
- `SectionMessageDialog.tsx`
- `SelOptionsDialog.tsx`
- `TreeTableDialog.tsx`
- `ViewPropertyDialog.tsx`

For each, apply the minimal surgical pattern:

1. Add import at top: `import { useFocusTrap } from './useFocusTrap';`. If `useRef` not already imported from React, add it.

2. Inside the component body, near the top (after existing `useState`/`useEffect` block, BEFORE the early `if (!isOpen) return null;` return):
   ```ts
   const dialogRef = React.useRef<HTMLDivElement | null>(null);
   useFocusTrap(dialogRef, isOpen);
   ```

3. Find the inner `<div role="dialog" ...>` element. Add `ref={dialogRef}` to its props. Keep existing `tabIndex`, `onKeyDown`, `className`, `onClick`, etc. unchanged.

DO NOT modify any other prop / structure / Tailwind class.

### Step 6: Run full dialog test suite

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui vitest run src/scada-engine/dialogs/
```

Expected: all dialog tests pass + useFocusTrap 5 new = no regression.

Full sanity:
```
pnpm --filter @biocore/web-ui vitest run
```

Expected: 791 → 796 (+5).

### Step 7: Commit

```bash
git add packages/web-ui/src/scada-engine/dialogs/useFocusTrap.ts \
        packages/web-ui/src/scada-engine/dialogs/__tests__/useFocusTrap.test.tsx \
        packages/web-ui/src/scada-engine/dialogs/
git commit -m "feat(scada-engine): SP-FX-5.5 T0 useFocusTrap hook + apply to 11 dialogs + 5 tests"
```

---

## Task 1: Shape category filter scaffold

**Files:**
- Create: `packages/web-ui/src/scada-engine/assets/shape-categories.json` (empty `{}` scaffold)
- Modify: `scripts/gen-shape-catalog.ts` (read sidecar JSON, emit `category?` field)
- Modify: `scripts/__tests__/gen-shape-catalog.test.ts` (+2 tests)
- Modify: `packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx` (category dropdown)
- Modify: `packages/web-ui/src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx` (+2 tests)
- Regenerate: `packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts`

### Step 1: Write failing generator tests

Append to `scripts/__tests__/gen-shape-catalog.test.ts`:

```ts
describe('genCatalog category support', () => {
  it('reads sidecar shape-categories.json and emits category field', () => {
    writeFileSync(join(srcDir, 'pump-1.svg'), '<svg/>');
    writeFileSync(join(srcDir, 'valve-3way.svg'), '<svg/>');
    const catsFile = join(tmpRoot, 'cats.json');
    writeFileSync(catsFile, JSON.stringify({ 'pump-1': 'pumps', 'valve-3way': 'valves' }));
    const { count } = genCatalog(srcDir, outFile, catsFile);
    expect(count).toBe(2);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain('category: "pumps"');
    expect(body).toContain('category: "valves"');
  });

  it('no sidecar produces entries without category field', () => {
    writeFileSync(join(srcDir, 'tank.svg'), '<svg/>');
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(1);
    const body = readFileSync(outFile, 'utf8');
    expect(body).not.toContain('category:');
  });
});
```

### Step 2: Run generator tests to verify failure

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -C scripts vitest run
```

Expected: FAIL — 3rd arg unexpected.

### Step 3: Extend generator

Replace `scripts/gen-shape-catalog.ts` contents:

```ts
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const SRC_DIR_DEFAULT = join(__dirname, '../packages/web-ui/src/scada-engine/assets/shapes');
const OUT_FILE_DEFAULT = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts',
);
const CATS_FILE_DEFAULT = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/assets/shape-categories.json',
);

export function toLabel(id: string): string {
  return id
    .split('-')
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function readCategories(catsFile: string): Record<string, string> {
  if (!existsSync(catsFile)) return {};
  try {
    const raw = readFileSync(catsFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {
    // malformed JSON: silently fall back to no categories
  }
  return {};
}

export function genCatalog(srcDir: string, outFile: string, catsFile?: string): { count: number } {
  const files = readdirSync(srcDir)
    .filter((f) => f.endsWith('.svg'))
    .sort();
  const categories = catsFile ? readCategories(catsFile) : {};
  const entries = files
    .map((f) => {
      const id = f.replace(/\.svg$/, '');
      const cat = categories[id];
      const catPart = typeof cat === 'string' && cat.length > 0 ? `, category: ${JSON.stringify(cat)}` : '';
      return `  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(toLabel(id))}, src: ${JSON.stringify('/scada-shapes/' + f)}${catPart} },`;
    })
    .join('\n');
  const body = `// AUTO-GENERATED by scripts/gen-shape-catalog.ts — do not edit manually.

export interface PaletteShape {
  id: string;
  label: string;
  src: string;
  category?: string;
}

export const SHAPE_CATALOG: ReadonlyArray<PaletteShape> = [
${entries}
] as const;
`;
  writeFileSync(outFile, body, 'utf8');
  return { count: files.length };
}

if (require.main === module) {
  const { count } = genCatalog(SRC_DIR_DEFAULT, OUT_FILE_DEFAULT, CATS_FILE_DEFAULT);
  // eslint-disable-next-line no-console
  console.log(`gen-shape-catalog: wrote ${count} shapes to ${OUT_FILE_DEFAULT}`);
}
```

### Step 4: Create empty categories sidecar

Create `packages/web-ui/src/scada-engine/assets/shape-categories.json`:

```json
{}
```

### Step 5: Run generator tests + regenerate catalog

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -C scripts vitest run
pnpm gen:shape-catalog
```

Expected: 5 pre-existing + 2 new = 7/7 passing. Generator output: 154 shapes (no `category:` field since sidecar is empty).

### Step 6: Write failing-then-passing ShapePicker tests

Append to `packages/web-ui/src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx`:

```tsx
describe('ShapePicker category filter', () => {
  it('omits category dropdown when SHAPE_CATALOG has no category entries', () => {
    render(<ShapePicker />);
    expect(document.querySelector('[data-input="shape-category"]')).toBeNull();
  });

  it('renders search input alongside no-category state', () => {
    render(<ShapePicker />);
    expect(screen.getByPlaceholderText('搜索形状...')).toBeInTheDocument();
  });
});
```

(These lock in the "dropdown hidden when no categories" wiring. Strict RED isn't possible because the existing ShapePicker also has no dropdown — so both tests pass at baseline AND after impl. They guard the wiring once category data is filled in.)

### Step 7: Run ShapePicker tests

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx
```

Expected: 6 existing + 2 new = 8 passing.

### Step 8: Modify ShapePicker to support categories

Replace `packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx`:

```tsx
import React, { useState, useMemo } from 'react';
import { SHAPE_CATALOG, type PaletteShape } from './shape-catalog';

export function ShapePicker(): JSX.Element {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const distinctCats = useMemo(() => {
    const s = new Set<string>();
    for (const e of SHAPE_CATALOG) if (e.category) s.add(e.category);
    return Array.from(s).sort();
  }, []);
  const filtered = useMemo<ReadonlyArray<PaletteShape>>(() => {
    let xs: ReadonlyArray<PaletteShape> = SHAPE_CATALOG;
    if (cat) xs = xs.filter((s) => s.category === cat);
    if (q.trim()) {
      const lo = q.toLowerCase();
      xs = xs.filter(
        (s) => s.id.toLowerCase().includes(lo) || s.label.toLowerCase().includes(lo),
      );
    }
    return xs;
  }, [q, cat]);

  return (
    <div data-panel="shape-picker" className="flex flex-col flex-1 min-h-0 border-t border-zinc-700">
      {distinctCats.length > 0 ? (
        <select
          data-input="shape-category"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="m-2 px-2 py-1 text-sm bg-zinc-800 text-zinc-100 rounded"
        >
          <option value="">全部</option>
          {distinctCats.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      ) : null}
      <input
        data-input="shape-search"
        type="text"
        placeholder="搜索形状..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="m-2 mt-0 px-2 py-1 text-sm bg-zinc-800 text-zinc-100 rounded"
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

### Step 9: Run all ShapePicker + Palette tests

```
pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/
```

Expected: 8 ShapePicker + 5 Palette + 11 palette-items = 24 passing.

### Step 10: Commit

```bash
git add scripts/gen-shape-catalog.ts scripts/__tests__/gen-shape-catalog.test.ts \
        packages/web-ui/src/scada-engine/assets/shape-categories.json \
        packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts \
        packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx \
        packages/web-ui/src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx
git commit -m "feat(scada-engine): SP-FX-5.5 T1 shape category filter scaffold + 4 tests"
```

---

## Task 2: Dev-mode shape file watch

**Files:**
- Create: `scripts/watch-shapes.ts`
- Modify: root `package.json` (add `dev:shape-watch` script + `chokidar` devDep)

### Step 1: Add chokidar devDep

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm add -w -D chokidar@^3.6.0
```

(`chokidar` is build-tooling devDep, not runtime.)

### Step 2: Create the watcher

Create `scripts/watch-shapes.ts`:

```ts
import chokidar from 'chokidar';
import { copyFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { genCatalog } from './gen-shape-catalog';

const SRC_DIR = join(__dirname, '../packages/web-ui/src/scada-engine/assets/shapes');
const PUB_DIR = join(__dirname, '../packages/web-ui/public/scada-shapes');
const OUT_FILE = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts',
);
const CATS_FILE = join(
  __dirname,
  '../packages/web-ui/src/scada-engine/assets/shape-categories.json',
);

let debounceTimer: NodeJS.Timeout | null = null;

function syncMirror(): void {
  if (!existsSync(PUB_DIR)) mkdirSync(PUB_DIR, { recursive: true });
  const srcSet = new Set(readdirSync(SRC_DIR).filter((f) => f.endsWith('.svg')));
  for (const f of readdirSync(PUB_DIR)) {
    if (f.endsWith('.svg') && !srcSet.has(f)) unlinkSync(join(PUB_DIR, f));
  }
  for (const f of srcSet) {
    copyFileSync(join(SRC_DIR, f), join(PUB_DIR, f));
  }
}

function regen(): void {
  syncMirror();
  const { count } = genCatalog(SRC_DIR, OUT_FILE, CATS_FILE);
  // eslint-disable-next-line no-console
  console.log(`[shape-watch] synced ${count} shapes`);
}

function schedule(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(regen, 200);
}

const watcher = chokidar.watch(join(SRC_DIR, '*.svg'), { ignoreInitial: false });
watcher.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log(`[shape-watch] watching ${SRC_DIR}`);
  regen();
});
watcher.on('add', schedule);
watcher.on('change', schedule);
watcher.on('unlink', schedule);
```

### Step 3: Add npm script

Edit root `package.json` `"scripts"`:

```json
"dev:shape-watch": "tsx scripts/watch-shapes.ts"
```

### Step 4: Smoke test

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm dev:shape-watch &
WATCH_PID=$!
sleep 2
```

Expected stdout: `[shape-watch] watching .../assets/shapes` then `[shape-watch] synced 154 shapes`.

Simulate change:

```bash
touch packages/web-ui/src/scada-engine/assets/shapes/agitator-disc.svg
sleep 1
```

Expected: another `[shape-watch] synced 154 shapes` line.

Kill watcher:

```bash
kill $WATCH_PID 2>/dev/null
wait $WATCH_PID 2>/dev/null
```

Verify mirror still in sync:

```bash
diff <(ls packages/web-ui/src/scada-engine/assets/shapes/*.svg | xargs -n1 basename | sort) \
     <(ls packages/web-ui/public/scada-shapes/*.svg | xargs -n1 basename | sort)
```

Expected: empty diff.

### Step 5: Commit

```bash
git add scripts/watch-shapes.ts package.json pnpm-lock.yaml
git commit -m "feat(scada-engine): SP-FX-5.5 T2 dev shape file watcher (chokidar)"
```

---

## Task 3: Regression + push

**Files:** none modified.

### Step 1: web-ui vitest

```
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui vitest run
```

Expected: ≥798 (791 + 5 useFocusTrap + 2 ShapePicker).

### Step 2: scripts vitest

```
pnpm -C scripts vitest run
```

Expected: 7 (5 + 2 category).

### Step 3: server + data-service

```
pnpm --filter @biocore/server vitest run
pnpm --filter @biocore/data-service vitest run
```

Expected: 147 / 84 unchanged.

### Step 4: tsc

```
pnpm --filter @biocore/web-ui exec tsc --noEmit
```

Expected: 0 errors.

### Step 5: Push

```
git push origin HEAD
```

---

## Self-Review

**Spec coverage check:**

| Spec deferred item | Plan task |
|---|---|
| Tab focus trap in dialogs | T0 |
| Shape category UI | T1 (scaffold; user fills mapping over time) |
| Shape file watch + auto-regen | T2 |
| Dialog Playwright smoke | OUT OF SCOPE — dialogs no mount points yet, defer to SP-FX-6 |
| Per-shape default size | OUT OF SCOPE — SP-FX-6 widget metadata |
| touch-keyboard / webcam-player | OUT OF SCOPE — SP-FX-7 |

**Constraints**:
- 中文 user-facing only ("全部", "搜索形状...", "无匹配"); identifiers English.
- TDD RED-first where deterministic; T1 ShapePicker wiring locked-in-test (both pass before+after since dropdown only renders when categories present).
- pnpm via `$HOME/.hermes/node/bin`.
- 1 new devDep: `chokidar@^3.6.0` (build tooling, not runtime).
- AI/animation never directly writes PLC — untouched.

---

End of plan.
