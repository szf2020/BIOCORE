# SP-FX-5 — Shapes + Remaining Dialogs + Widgets-Extras Design

**Date:** 2026-05-17
**Status:** Spec — pending implementation plan
**Parent:** `2026-05-17-fuxa-scada-port-design.md` §5.2 SP-FX-5
**Predecessor:** SP-FX-4 (editor shell + palette + toolbar) shipped at `e3b1227` main

---

## 1. Scope

### 1.1 In-scope (3 subsystems)

1. **Shapes** — 209 FUXA SVG shapes → palette picker → drag onto canvas → render via `<image>`.
   - `scripts/gen-shape-catalog.ts` build script (fs.readdirSync → `shape-catalog.ts`)
   - 209 SVG copy to `packages/web-ui/public/scada-shapes/`
   - `editor/palette/ShapePicker.tsx` (search + 3-col grid)
   - `editor/palette/Palette.tsx` extends with ShapePicker section
   - `editor/palette/palette-items.ts` adds `makeShapeWidget`
   - `editor/canvas-svg.ts` `upsertWidget` adds `'shape'` case → `<image href>`
   - `editor/EditorCanvas.tsx` `onDrop` handles `palette-shape` dataTransfer

2. **Remaining dialogs (7)** — Tailwind, sibling to current 4 dialogs:
   - `DateRangePickerDialog` (onConfirm `{from, to}`)
   - `EditNameDialog` (onConfirm `string`)
   - `SelOptionsDialog` (multi/single select, onConfirm `string[]` or `string`)
   - `TreeTableDialog` (tree node picker, onConfirm `string[]`)
   - `BitmaskDialog` (int bitmask editor, onConfirm `number`)
   - `RangeNumberDialog` (min/max range, onConfirm `{min, max}`)
   - `IconSelectorDialog` (~50 Lucide icons, onConfirm `string`)

3. **Widgets-extras (5)** — self-implemented ngx-* replacements:
   - `Gauge` (semicircle gauge with thresholds)
   - `NouiSlider` (range slider)
   - `Switch` (toggle)
   - `Scheduler` (cron 5-field editor)
   - `UplotChart` (uplot lib wrapper)

### 1.2 Out-of-scope (deferred)

| Item | Defer to |
|------|----------|
| Shape category UI (FUXA 3 cats: shapes/proc-eng/ape-shapes) | Future polish; SP-FX-5 single-list MVP |
| `touch-keyboard` dialog | SP-FX-6 widget panel if needed |
| `webcam-player` dialog | SP-FX-7 runtime camera-view widget |
| Per-shape default size override (currently 80x80) | SP-FX-6 widget metadata |
| Shape file watch + auto-regen catalog | SP-FX-8 build polish |
| Tab-key focus trap in dialogs | Future a11y polish |
| Dialog Playwright smoke | SP-FX-6 widget property panel sprint |

### 1.3 Constraints (verbatim)

- TDD RED-first.
- All user-facing replies in 简体中文.
- AI / animation / expression-eval **never write PLC directly** (SP does not touch runtime).
- HMI manual `set-value` actions go through `writeTag → WS → server` (SP-FX-2 path; not in this SP).
- macOS BSD sed (no `\b`); literal Edit replacements preferred.
- pnpm via `export PATH=$HOME/.hermes/node/bin:$PATH`.
- ONE new third-party dep: `uplot@^1.6.31` (~47KB MIT). All other widgets-extras self-implemented.
- 209 existing SVG assets at `packages/web-ui/src/scada-engine/assets/shapes/` (FUXA imported).

### 1.4 Test count target

| Package | Baseline | Target | Delta |
|---------|----------|--------|-------|
| web-ui vitest | 706 | **795** | +89 |
| server vitest | 147 | 147 | 0 |
| data-service vitest | 84 | 84 | 0 |
| Playwright | 23 | **25** | +2 |

Vitest +89 breakdown:
- 4 (gen-shape-catalog) + 4 (palette-items.makeShapeWidget) + 6 (ShapePicker) + 3 (canvas-svg shape) + 3 (EditorCanvas shape drop)
- 6 (DateRangePicker) + 5 (EditName) + 6 (SelOptions) + 6 (TreeTable) + 5 (Bitmask) + 5 (RangeNumber) + 6 (IconSelector)
- 6 (Gauge) + 7 (NouiSlider) + 5 (Switch) + 6 (Scheduler) + 6 (UplotChart)
- Total = 4+4+6+3+3 + 6+5+6+6+5+5+6 + 6+7+5+6+6 = 89

---

## 2. File Structure

### 2.1 New files

```
scripts/
└── gen-shape-catalog.ts                                                ~40 lines (build helper)
scripts/__tests__/
└── gen-shape-catalog.test.ts                                           4 tests

packages/web-ui/public/scada-shapes/                                    209 SVG files (copied from assets/shapes/)

packages/web-ui/src/scada-engine/editor/palette/
├── shape-catalog.ts                                                    auto-generated, ~215 lines
├── ShapePicker.tsx                                                     ~120 lines
└── __tests__/
    └── ShapePicker.test.tsx                                            6 tests

packages/web-ui/src/scada-engine/dialogs/
├── DateRangePickerDialog.tsx                                           ~130 lines
├── EditNameDialog.tsx                                                  ~80 lines
├── SelOptionsDialog.tsx                                                ~110 lines
├── TreeTableDialog.tsx                                                 ~150 lines
├── BitmaskDialog.tsx                                                   ~100 lines
├── RangeNumberDialog.tsx                                               ~95 lines
├── IconSelectorDialog.tsx                                              ~120 lines
└── __tests__/
    ├── DateRangePickerDialog.test.tsx                                  6 tests
    ├── EditNameDialog.test.tsx                                         5 tests
    ├── SelOptionsDialog.test.tsx                                       6 tests
    ├── TreeTableDialog.test.tsx                                        6 tests
    ├── BitmaskDialog.test.tsx                                          5 tests
    ├── RangeNumberDialog.test.tsx                                      5 tests
    └── IconSelectorDialog.test.tsx                                     6 tests

packages/web-ui/src/scada-engine/widgets-extras/
├── Gauge.tsx                                                           ~110 lines
├── NouiSlider.tsx                                                      ~130 lines
├── Switch.tsx                                                          ~70 lines
├── Scheduler.tsx                                                       ~140 lines
├── UplotChart.tsx                                                      ~100 lines
├── index.ts                                                            barrel
└── __tests__/
    ├── Gauge.test.tsx                                                  6 tests
    ├── NouiSlider.test.tsx                                             7 tests
    ├── Switch.test.tsx                                                 5 tests
    ├── Scheduler.test.tsx                                              6 tests
    └── UplotChart.test.tsx                                             6 tests

packages/web-ui/e2e/
└── scada-editor-shapes.spec.ts                                         2 Playwright smoke
```

### 2.2 Modified files

```
packages/web-ui/src/scada-engine/editor/
├── palette/Palette.tsx                              extend with ShapePicker section
├── palette/palette-items.ts                         +makeShapeWidget
├── palette/__tests__/palette-items.test.ts          +4 tests
├── canvas-svg.ts                                    upsertWidget +'shape' case
├── __tests__/canvas-svg.test.ts                     +3 tests
├── EditorCanvas.tsx                                 onDrop +palette-shape branch
├── __tests__/EditorCanvas.test.tsx                  +3 tests
└── index.ts                                         +exports (ShapePicker, makeShapeWidget, SHAPE_CATALOG, PaletteShape)

packages/web-ui/src/scada-engine/dialogs/
└── index.ts                                         +7 new dialog exports

packages/web-ui/
├── package.json                                     +uplot dep
└── public/scada-shapes/                             (new dir, 209 files)

packages/web-ui/src/scada-engine/
└── index.ts (if widgets-extras barrel re-exported)  +widgets-extras barrel
```

### 2.3 Not modified

- `scada-engine/dialogs/{ConfirmDialog,FileUploadDialog,SectionMessageDialog,ViewPropertyDialog}.tsx` (SP-FX-4 4 dialogs)
- `scada-engine/editor/pointer-tools.ts` / `transform-handles.ts` / `geometry.ts` (SP-FX-3 pure)
- `scada-engine/services/editor-store.ts` (SP-FX-4 actions sufficient; shape widget uses addWidget path)
- `scada-engine/assets/shapes/*` (source SVG remain; `public/scada-shapes/` is the served copy)
- `/scada2/edit-v2/[viewId]` page (SP-FX-4 entrypoint unchanged)
- server `/api/v1/fuxa-views/*` (unchanged)

---

## 3. Type Contract

### 3.1 `scripts/gen-shape-catalog.ts`

```ts
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(__dirname, '../packages/web-ui/src/scada-engine/assets/shapes');
const OUT_FILE = join(__dirname, '../packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts');

function toLabel(id: string): string {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function genCatalog(srcDir: string, outFile: string): { count: number } {
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.svg')).sort();
  const entries = files.map((f) => {
    const id = f.replace(/\.svg$/, '');
    const label = JSON.stringify(toLabel(id));
    return `  { id: ${JSON.stringify(id)}, label: ${label}, src: '/scada-shapes/${f}' },`;
  }).join('\n');
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
  const { count } = genCatalog(SRC_DIR, OUT_FILE);
  // eslint-disable-next-line no-console
  console.log(`gen-shape-catalog: wrote ${count} shapes to ${OUT_FILE}`);
}
```

### 3.2 `editor/palette/shape-catalog.ts` (generated)

```ts
// AUTO-GENERATED by scripts/gen-shape-catalog.ts — do not edit manually.

export interface PaletteShape {
  id: string;
  label: string;
  src: string;
}

export const SHAPE_CATALOG: ReadonlyArray<PaletteShape> = [
  { id: 'agitator-disc', label: 'Agitator Disc', src: '/scada-shapes/agitator-disc.svg' },
  { id: 'agitator-paddle', label: 'Agitator Paddle', src: '/scada-shapes/agitator-paddle.svg' },
  // ... 207 more entries
] as const;
```

### 3.3 `editor/palette/palette-items.ts` extension

```ts
// existing: PaletteItemType, PALETTE_ITEMS, makeWidget

// ADD:
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
    property: { src, shapeId } as any,
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: 80,
    h: 80,
  } as FuxaWidget;
}
```

### 3.4 `editor/palette/ShapePicker.tsx`

```tsx
import React, { useState, useMemo } from 'react';
import { SHAPE_CATALOG, type PaletteShape } from './shape-catalog';

export function ShapePicker(): JSX.Element {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!q.trim()) return SHAPE_CATALOG;
    const lo = q.toLowerCase();
    return SHAPE_CATALOG.filter((s) => s.id.includes(lo) || s.label.toLowerCase().includes(lo));
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
                e.dataTransfer.setData('palette-shape', JSON.stringify({ id: shape.id, src: shape.src }));
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

### 3.5 `editor/palette/Palette.tsx` extension

```tsx
import React from 'react';
import { PALETTE_ITEMS } from './palette-items';
import { ShapePicker } from './ShapePicker';

export function Palette(): JSX.Element {
  return (
    <div data-panel="palette" className="w-[200px] flex-shrink-0 flex flex-col border-r border-zinc-700 bg-zinc-900">
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

Note: `data-panel="palette"` moves from `<ul>` to the outer `<div>`; existing SP-FX-4 tests target this attr by selector — verify after change.

### 3.6 `editor/canvas-svg.ts` `upsertWidget` extension

Inside `createElementForType`, add new case BEFORE `default`:

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

Inside `updateElementForType`:

```ts
case 'shape': {
  const src = (widget.property as { src?: string }).src ?? '';
  const node = el.node as SVGImageElement;
  node.setAttribute('href', src);
  el.attr({ x: widget.x, y: widget.y, width: widget.w, height: widget.h });
  break;
}
```

### 3.7 `editor/EditorCanvas.tsx` `onDrop` extension

Current onDrop reads `palette-item`. Extend to also handle `palette-shape`:

```ts
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
      const { id, src } = JSON.parse(shapeJson) as { id: string; src: string };
      if (id && src) store.addWidget(makeShapeWidget(id, src, local, store.gridSize));
    } catch {
      // malformed JSON; silently ignore
    }
  }
}}

onDragOver={(e) => {
  if (e.dataTransfer.types.includes('palette-item') || e.dataTransfer.types.includes('palette-shape')) {
    e.preventDefault();
  }
}}
```

### 3.8 Dialogs prop shape (7)

Common base:
```ts
export interface BaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}
```

Specific:
```ts
export interface DateRangePickerDialogProps extends BaseDialogProps {
  initialValue?: { from: Date; to: Date };
  onConfirm: (value: { from: Date; to: Date }) => void;
}
export interface EditNameDialogProps extends BaseDialogProps {
  initialValue?: string;
  onConfirm: (value: string) => void;
}
export interface SelOptionsDialogProps extends BaseDialogProps {
  options: { value: string; label: string }[];
  multi?: boolean;
  initialValue?: string | string[];
  onConfirm: (value: string | string[]) => void;
}
export interface TreeTableNode { id: string; label: string; children?: TreeTableNode[] }
export interface TreeTableDialogProps extends BaseDialogProps {
  tree: TreeTableNode[];
  initialValue?: string[];
  onConfirm: (selectedIds: string[]) => void;
}
export interface BitmaskDialogProps extends BaseDialogProps {
  bits?: number;          // default 8
  initialValue?: number;  // default 0
  onConfirm: (value: number) => void;
}
export interface RangeNumberDialogProps extends BaseDialogProps {
  initialValue?: { min: number; max: number };
  onConfirm: (value: { min: number; max: number }) => void;
}
export interface IconSelectorDialogProps extends BaseDialogProps {
  initialValue?: string;
  onConfirm: (iconId: string) => void;
}
```

All dialogs:
- Render `null` when `isOpen=false`
- Render `<div role="dialog" data-dialog="<name>">` when open
- Backdrop click + Escape → `onClose()`
- "确认" button disabled when input invalid
- Tailwind classes consistent with existing `ViewPropertyDialog.tsx`

### 3.9 Widgets-extras prop shape (5)

```ts
export interface GaugeProps {
  value: number;
  min: number;
  max: number;
  thresholds?: { value: number; color: string }[];
  label?: string;
  width?: number;   // default 160
  height?: number;  // default 100
}

export interface NouiSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;   // default 1
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
}

export interface SwitchProps {
  checked: boolean;
  onChange: (b: boolean) => void;
  labelOn?: string;
  labelOff?: string;
  disabled?: boolean;
}

export interface SchedulerProps {
  cron: string;             // 5-field "min hour day month weekday"
  onChange: (cron: string) => void;
  disabled?: boolean;
}

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
```

---

## 4. Data Flow

### 4.1 Build-time catalog
```
Developer: pnpm gen:shape-catalog
  scripts/gen-shape-catalog.ts:
    readdirSync('assets/shapes/*.svg')
    sort + map to entries
    writeFileSync('editor/palette/shape-catalog.ts')
  ↓
Run again to update on SVG add/remove
```

### 4.2 Asset deployment
209 SVG copy (manual, one-time per change set):
```bash
cp packages/web-ui/src/scada-engine/assets/shapes/*.svg packages/web-ui/public/scada-shapes/
```

Document in `scada-engine/assets/README.md`. Future SP-FX-8 may automate.

### 4.3 Shape drop flow
```
ShapePicker dragstart
  e.dataTransfer.setData('palette-shape', JSON.stringify({id, src}))
  effectAllowed = 'copy'
EditorCanvas onDragOver
  types.includes('palette-shape') → preventDefault
EditorCanvas onDrop
  parse palette-shape payload
  local = clientToSvg(...)
  store.addWidget(makeShapeWidget(id, src, local, gridSize))
editor-store:
  items[id] = widget (type='shape', property={src, shapeId})
  history push; selection=[id]; isDirty=true
EditorCanvas subscriber → canvas.upsertWidget(widget)
  createElementForType case 'shape':
    create <image href={src} x y w=80 h=80 preserveAspectRatio data-widget-id>
    append to widgetLayer
TransformHandles.show(box) — SP-FX-3 handles unchanged
PropertiesPlaceholder re-render → readonly fields
```

### 4.4 Shape resize / rotate
Same as rect/ellipse/text (SP-FX-3 pointer-tools FSM unchanged):
- `applyHandleDrag` updates box
- `upsertWidget` re-render → `updateElementForType` `'shape'` case updates x/y/width/height
- `transform="rotate(deg cx cy)"` applied uniformly (SP-FX-3b.2.2)

### 4.5 Dialog open/confirm/cancel
```
Caller renders <SomeDialog isOpen onClose onConfirm initial... />
isOpen=false: render null (no DOM)
isOpen=true: render <div role="dialog" data-dialog="xxx">
  Internal local state for editable fields
  Backdrop click / Escape → onClose()
  Confirm button → onConfirm(currentValue); caller closes
  Cancel button → onClose(); caller closes
```

### 4.6 UplotChart lifecycle
```
useEffect on mount: new uplot({...opts, data: seriesToData(series)}, ref.current)
useEffect on [series, width, height]: instance.setData(seriesToData(series)) + setSize({w,h})
useEffect cleanup on unmount: instance.destroy()
```

---

## 5. Error Handling

### 5.1 Shape catalog
| Failure | Behavior |
|---------|----------|
| SRC_DIR not present | throw `Error('shape source dir missing')`, non-zero exit |
| Empty dir | write empty SHAPE_CATALOG; stderr warning |
| filenames with quotes/backslash | `JSON.stringify(id)` escapes |
| writeFileSync fail | propagate fs error |

### 5.2 Shape drop / render
| Case | Behavior |
|------|----------|
| palette-shape JSON malformed | onDrop try/catch, silently return |
| payload.src missing | makeShapeWidget creates widget with empty src; image shows broken icon (no throw) |
| 404 on `<image href>` | browser native broken icon; no retry |
| resize to w<5 / h<5 | applyHandleDrag clamps (SP-FX-3 behavior) |

### 5.3 Dialog edge cases (7)
| Case | Behavior |
|------|----------|
| `isOpen=false` initial | return null, no DOM |
| `initialValue` undefined | sensible default (empty string / 0 / today) |
| `onConfirm` callback throws | dialog does not swallow; caller boundary handles |
| Escape key | onClose() |
| Backdrop click | onClose() |
| Tab focus trap | not implemented (deferred) |

Specific:
- `EditNameDialog`: blank string disables confirm
- `DateRangePickerDialog`: `from > to` red border + disable confirm
- `BitmaskDialog`: non-integer → coerce via Math.round
- `RangeNumberDialog`: `min > max` red border + disable confirm
- `TreeTableDialog`: empty tree → "无可选项"
- `IconSelectorDialog`: independent ~50 Lucide icon list, hardcoded
- `SelOptionsDialog`: empty options → "无可选项"

### 5.4 Widgets-extras edge cases
| Component | Case | Behavior |
|-----------|------|----------|
| Gauge | value out of range | clamp to [min, max] |
| Gauge | min >= max | render "Invalid range" placeholder |
| NouiSlider | step <= 0 | fallback step=1 |
| NouiSlider | value out of range | clamp + thumb at edge |
| Switch | checked non-boolean | Boolean(checked) |
| Scheduler | invalid cron | validate fn returns error; UI red border; onChange not fired |
| Scheduler | 6-field cron (with seconds) | reject (5-field only) |
| UplotChart | empty series | render empty canvas; no throw |
| UplotChart | width/height <= 0 | return null |
| UplotChart | unmount | useEffect cleanup `instance.destroy()` |

### 5.5 TS / build
- shape-catalog.ts missing: tsc `Cannot find module`. Setup docs require `pnpm gen:shape-catalog` first run.
- uplot dep missing: pnpm install fails noisily.

### 5.6 Regression boundaries
- SP-FX-3 / 3b.* / 4 vitest 706 all green
- canvas-svg `rect`/`ellipse`/`text`/`svg-ext-value` paths unchanged
- EditorCanvas `palette-item` drop path unchanged
- Existing 4 dialogs (ConfirmDialog/FileUploadDialog/SectionMessageDialog/ViewPropertyDialog) not touched
- tsc --noEmit clean

---

## 6. Testing

### 6.1 Vitest +89

**gen-shape-catalog.test.ts (4):**
1. `genCatalog` reads SVG names + writes SHAPE_CATALOG with N entries
2. `toLabel('agitator-disc')` → 'Agitator Disc'
3. empty dir → empty array body
4. filename with special char → JSON.stringify-escaped

**palette-items.test.ts +4 (existing 7 → 11):**
1. `makeShapeWidget` defaults w=80 h=80
2. snap to gridSize
3. property has src + shapeId
4. id format matches regex

**ShapePicker.test.tsx (6):**
1. renders all 209 cells when search empty
2. search "tank" filters to tank* entries
3. empty result shows `[data-empty]` "无匹配"
4. dragstart sets `palette-shape` payload with JSON
5. each cell has draggable=true + alt text
6. clearing search restores full list

**canvas-svg.test.ts +3:**
1. type='shape' renders `<image>` with href/x/y/width/height/preserveAspectRatio
2. resize updates width/height attrs
3. src change updates href

**EditorCanvas.test.tsx +3:**
1. onDragOver with palette-shape preventDefault
2. onDrop with valid palette-shape calls addWidget(type='shape')
3. onDrop with malformed JSON no-op

**7 Dialogs (39 tests total):**

DateRangePickerDialog (6): isOpen false→null, renders dialog when open, confirm fires onConfirm with {from,to}, escape calls onClose, from>to disables confirm, backdrop click calls onClose

EditNameDialog (5): renders, confirm fires onConfirm(string), blank disables confirm, initialValue prepopulates, escape calls onClose

SelOptionsDialog (6): multi=true confirm returns string[], multi=false returns string, empty options shows "无可选项", click toggles selection, confirm only when valid, escape→onClose

TreeTableDialog (6): renders tree nodes (nested children), click toggles, confirm returns selected ids, empty tree shows message, initialValue prepopulates, escape→onClose

BitmaskDialog (5): renders N bits checkboxes, toggle updates value, confirm returns int, non-integer coerced, escape→onClose

RangeNumberDialog (5): renders min/max inputs, confirm returns {min,max}, min>max disables confirm, initialValue prepopulates, escape→onClose

IconSelectorDialog (6): renders ~50 icon grid, search filters, click selects, confirm returns iconId, initialValue highlights, escape→onClose

**5 Widgets-extras (30 tests total):**

Gauge (6): renders value text, value clamp to [min,max], threshold color applied, label rendered, min>=max shows "Invalid range", custom width/height

NouiSlider (7): renders thumb at value position, drag updates onChange, step rounding, clamp, step<=0 fallback, keyboard arrow keys, role=slider

Switch (5): unchecked/checked visual, click fires onChange(!checked), labelOn/Off render, keyboard space toggles, disabled prop blocks click

Scheduler (6): renders 5 fields from cron, edit field fires onChange, invalid cron red border, 6-field rejected, * wildcard accepted, validate returns error string

UplotChart (6): mount creates uplot instance, setData on series change, destroy on unmount, empty series no throw, width<=0 returns null, multi-series setup

### 6.2 Playwright (2 smoke) — `e2e/scada-editor-shapes.spec.ts`

1. **Shape drag + save**: Login → /scada2/edit-v2/:viewId → ShapePicker search "tank" → drag tank1 onto canvas → widget appears with `<image href="/scada-shapes/tank1.svg">` → Cmd+S → PUT 200
2. **Shape resize**: drop shape → select → drag SE handle +50px → `<image width>` increases proportionally

### 6.3 Mock strategy

- `vi.spyOn(global, 'fetch')` reuse
- HTML5 D&D: `makeDragEvent` helper (SP-FX-4 T7 pattern)
- `uplot`: real import + jsdom canvas mock (if not present, install `vitest-canvas-mock` OR inline stub `HTMLCanvasElement.prototype.getContext`)
- gen-shape-catalog test: `tmp` dir + `fs` real
- Shape catalog: tests import generated SHAPE_CATALOG; if running before generation, tests reference inline fixture

### 6.4 Coverage gates

- New modules ≥ 80% line/branch
- Existing modules: no decrease
- `tsc --noEmit` 0 errors
- web-ui 706 → ≥795 (+89), Playwright 23 → 25 (+2), server 147/147, data-service 84/84

---

## 7. Stop Conditions

Sprint done when all 12 pass:

1. `scripts/gen-shape-catalog.ts` exists; `pnpm gen:shape-catalog` writes `editor/palette/shape-catalog.ts` with 209 entries derived from `assets/shapes/`.
2. `packages/web-ui/public/scada-shapes/` contains all 209 SVG; HTTP GET `/scada-shapes/agitator-disc.svg` returns 200.
3. `ShapePicker` renders search input + 3-column grid + 209 cells; search "tank" filters to tank* entries; empty result shows "无匹配".
4. `Palette.tsx` renders basic shapes (rect/ellipse/text) on top, ShapePicker below; both regions clearly separated; existing SP-FX-4 Palette tests still pass.
5. ShapePicker dragstart sets `palette-shape` dataTransfer with JSON `{id,src}`; EditorCanvas onDragOver accepts it; onDrop calls `store.addWidget(makeShapeWidget(...))`; widget appears + selection=[id] + isDirty=true.
6. canvas-svg `upsertWidget` `'shape'` case creates `<image href="/scada-shapes/X.svg" x y width height preserveAspectRatio="xMidYMid meet" data-widget-id>`; resize/rotate work as for rect/ellipse/text.
7. 7 dialogs implemented + tested (DateRangePicker/EditName/SelOptions/TreeTable/Bitmask/RangeNumber/IconSelector); each renders only when isOpen=true; confirm/cancel callbacks fire correctly; Escape and backdrop close.
8. 5 widgets-extras implemented + tested (Gauge/NouiSlider/Switch/Scheduler/UplotChart); controlled props; UplotChart properly mounts/unmounts uplot instance.
9. `uplot@^1.6.31` dep added to `packages/web-ui/package.json`; lockfile updated; bundle adds <50KB.
10. Barrel exports updated: `editor/index.ts` (ShapePicker, makeShapeWidget, SHAPE_CATALOG, PaletteShape); `dialogs/index.ts` (+7); `widgets-extras/index.ts` (new, 5 exports).
11. Backwards compat:
    - SP-FX-3 / 3b.* / 4 vitest 706 all green
    - canvas-svg rect/ellipse/text/svg-ext-value paths unchanged
    - EditorCanvas palette-item drop unchanged
    - 4 existing dialogs untouched
    - `/scada2/edit-v2/[viewId]` page unchanged
12. Test baselines: web-ui ≥795 (+89), Playwright ≥25 (+2), tsc clean, server 147/147, data-service 84/84.

---

## 8. Open items (non-blocking)

- jsdom canvas mock: if `vitest-canvas-mock` not in tree, inline stub or add the dep.
- 209 SVG copy: manual one-time. SP-FX-8 may automate via build script.
- Shape default size 80x80 fixed for SP-FX-5. Per-shape default in SP-FX-6 widget metadata.
- IconSelectorDialog uses Lucide hardcoded ~50 icons (already in tree via lucide-react). Confirm import availability.

---

End of spec.
