# Sub-project 1/8 — SVG Canvas Runtime Design

> **Parent initiative:** Replace FUXA with BIOCore-native HMI.
> Sub-project 1 of 8. Decomposition agreed 2026-05-15.

**Date:** 2026-05-15
**Branch:** feat/scada-data-model (continuing)
**Decomposition:** 1 SVG canvas runtime · 2 widget library v2 · 3 animation engine · 4 pro editor (select/transform) · 5 pro editor (pages/templates/symbols) · 6 write controls + WriteIntentDialog · 7 FUXA UI removal · 8 (optional) FUXA shape asset port

## Goal

Provide a read-only SVG renderer that, given a `scada_views.widgets` JSON document, mounts an `<svg>` element, renders each widget as SVG, and re-renders affected widgets when bound PLC tag values change. This is the foundation every later sub-project builds on.

**Out of scope (deferred to later sub-projects):**
- Editor interactions (4, 5)
- Animation engine — color/visible/rotate/blink/move on tag value change (3)
- Write controls — slider/switch/input/dropdown emit WriteIntentDialog (6)
- Full widget set — sub-project 1 ships 2 plumbing widgets only (2 ships 25)
- Multi-page navigation (5)
- View templates / nested Symbols (5)

## Constraints

- **Approach A** chosen: pure React + native SVG, no external editor libs (no d3, no interact.js, no Konva).
- **SVG-only** chosen for rendering: every widget is SVG primitives. HTML controls and charts in later sub-projects use `<foreignObject>` if needed.
- **Coexistence**: legacy React-DOM widget views at `/scada/[viewId]` keep working; new SVG runtime mounts at parallel route `/scada2/[viewId]`. Sub-project 7 deletes legacy.
- **No new third-party deps** for sub-project 1. zod and zustand already in web-ui.
- **TDD per CLAUDE testing.md** — RED before GREEN; >=80% coverage.

---

## Architecture

Three layers:

```
<ScadaCanvas view={viewJson} reactorId="F01">
  <svg viewBox="0 0 W H" preserveAspectRatio="xMidYMid meet">
    <rect fill={background}/>                    <- optional bg
    {items.sort(zIndex).map(item =>
      <SvgWidgetInstance instance={item} reactorId="F01">
        <g transform="translate(x,y) rotate(r,cx,cy)">
          <SvgWidget tagValue={...} width={w} height={h} config={item.props}/>
        </g>
      </SvgWidgetInstance>
    )}
  </svg>
</ScadaCanvas>
```

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Outer | `ScadaCanvas` | Read viewJson, validate via zod, mount `<svg>` root, sort items, map to instances |
| Middle | `SvgWidgetInstance` | Per-item `<g>` wrapper (translate/rotate), subscribe to bound tag via `useTag`, dispatch to widget registry, wrap in ErrorBoundary |
| Inner | `SvgWidget` (each type) | Pure SVG primitives that consume `tagValue`/`config`, render `<rect>`/`<text>`/etc |

### Coexistence with legacy widgets

`packages/web-ui/src/widgets/registry.ts` (already exists from sub-project 3/7) is extended with a `kind: 'svg' | 'react'` discriminator. Legacy widgets default to `'react'`. New SVG widgets live in `widgets/svg/` and self-register with `kind: 'svg'`.

A new column `is_svg INTEGER NOT NULL DEFAULT 0` on `scada_views` (migration `030-scada-view-svg-flag.sql`) tells the routes which renderer to use. Page `/scada2/[viewId]/page.tsx` fetches the view and renders `ScadaCanvas` only when `is_svg = 1`; otherwise shows a "legacy view — use `/scada/[viewId]`" notice.

### Why parallel routes instead of overloading `/scada/[viewId]`

The legacy widget view component (`WidgetView.tsx`) renders React/HTML elements. Mixing both renderers in one page would conditional-branch through unrelated logic. Parallel routes keep the implementations isolated until sub-project 7 deletes the legacy path entirely.

---

## Components

### New files (7)

| Path | Responsibility |
|------|----------------|
| `packages/web-ui/src/widgets/svg/types.ts` | `SvgViewJson`, `SvgWidgetItem`, `SvgWidgetProps`, `SvgWidgetComponent`, zod schemas |
| `packages/web-ui/src/widgets/svg/registry.ts` | `registerSvg`, `getSvgWidget`, `listSvgWidgets` |
| `packages/web-ui/src/widgets/svg/SvgLabel.tsx` | Plumbing widget — `<text>` displays `tagValue` (or `'—'`) |
| `packages/web-ui/src/widgets/svg/SvgRect.tsx` | Plumbing widget — `<rect>` with `config.fill` |
| `packages/web-ui/src/widgets/svg/index.ts` | Re-exports + side-effect self-registration of SvgLabel/SvgRect |
| `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` | `<g>` wrapper + tag subscription + dispatch + ErrorBoundary |
| `packages/web-ui/src/components/scada/ScadaCanvas.tsx` | `<svg viewBox>` root + zod validation + item iteration |

### New page (1)

| Path | Responsibility |
|------|----------------|
| `packages/web-ui/src/app/scada2/[viewId]/page.tsx` | Fetch `/api/scada/views/<viewId>`, branch on `is_svg`, render `<ScadaCanvas>` or legacy notice |

### Modified (2)

| Path | Change |
|------|--------|
| `packages/web-ui/src/widgets/registry.ts` | Add `kind: 'svg' \| 'react'` discriminator field on registration shape (legacy entries default `'react'`) |
| `packages/server/migrations/030-scada-view-svg-flag.sql` | `ALTER TABLE scada_views ADD COLUMN is_svg INTEGER NOT NULL DEFAULT 0` |

### Helpers (2)

| Path | Responsibility |
|------|----------------|
| `packages/web-ui/src/components/scada/SvgErrorBoundary.tsx` | React ErrorBoundary that renders a red `<rect>` + `<text>` fallback for SVG context |
| `packages/web-ui/src/components/scada/ViewErrorDisplay.tsx` | Renders zod validation issues as a list (used when `SvgViewJsonSchema.safeParse` fails) |

### Key interfaces

```ts
// widgets/svg/types.ts
export interface SvgViewJson {
  width: number;                          // SVG viewBox width (logical units)
  height: number;
  background?: string;                    // CSS color for backing rect
  items: SvgWidgetItem[];
}

export interface SvgWidgetItem {
  id: string;
  type: string;                           // matches registry key
  x: number;                              // top-left X in SVG units
  y: number;
  w: number;                              // width / height in SVG units
  h: number;
  rotation?: number;                      // degrees, around bbox center
  zIndex?: number;                        // render order; equal -> array order
  visible?: boolean;                      // default true
  bindings?: { tag?: string };            // single-tag for sub-project 1; sub-project 3 expands
  props?: Record<string, unknown>;        // widget-specific config (pass-through)
}

export interface SvgWidgetProps {
  width: number;
  height: number;
  tagValue?: unknown;                     // from useTag; undefined when no binding
  tagStale?: boolean;
  config?: Record<string, unknown>;
}

export type SvgWidgetComponent = React.FC<SvgWidgetProps>;

export const SvgViewJsonSchema = z.object({
  width: z.number().positive().int(),
  height: z.number().positive().int(),
  background: z.string().optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    rotation: z.number().optional(),
    zIndex: z.number().int().optional(),
    visible: z.boolean().optional(),
    bindings: z.object({ tag: z.string().optional() }).optional(),
    props: z.record(z.unknown()).optional(),
  })),
});
```

```ts
// widgets/svg/registry.ts
export interface SvgWidgetRegistration {
  type: string;
  label: string;
  component: SvgWidgetComponent;
  defaults?: { w: number; h: number };
}
export function registerSvg(reg: SvgWidgetRegistration): void;   // throws on duplicate
export function getSvgWidget(type: string): SvgWidgetRegistration | undefined;
export function listSvgWidgets(): SvgWidgetRegistration[];       // sorted by type
```

```tsx
// components/scada/SvgWidgetInstance.tsx
interface SvgWidgetInstanceProps {
  instance: SvgWidgetItem;
  reactorId: string;
}
// Behaviour:
// - instance.visible === false -> return null
// - missing bindings.tag -> skip useTag call, tagValue=undefined
// - unknown type -> red placeholder + console.warn (does NOT throw)
// - widget render error -> ErrorBoundary fallback (red rect inside <g>)
// - wraps in <g transform="translate(x,y) rotate(r,w/2,h/2)">
```

```tsx
// components/scada/ScadaCanvas.tsx
interface ScadaCanvasProps {
  view: SvgViewJson;
  reactorId: string;
}
// Behaviour:
// - SvgViewJsonSchema.safeParse(view); if fail -> <ViewErrorDisplay/>
// - <svg viewBox="0 0 view.width view.height" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
// - if view.background -> <rect width={view.width} height={view.height} fill={background}/>
// - items.toSorted((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)) -> stable; equal zIndex preserves array order
// - map -> <SvgWidgetInstance/>
```

---

## Data flow

### A. View load (once, on page mount)

```
URL /scada2/<viewId>?reactor=F01
  v
page.tsx — useEffect fetches GET /api/scada/views/<viewId>
  v
response: { id, name, is_svg, widgets: SvgWidgetItem[], width, height, background, ... }
  v
if is_svg === 1: <ScadaCanvas view={...} reactorId={query.reactor || 'F01'} />
else:            <p>Legacy view — open via /scada/[viewId]</p>
```

### B. Initial render

```
<ScadaCanvas view reactorId>
  -> zod validate; sort items by zIndex
  -> map each item to <SvgWidgetInstance instance={item} reactorId={reactorId}/>
<SvgWidgetInstance>
  -> if !instance.visible -> null
  -> const { value, stale } = useTag(reactorId, instance.bindings?.tag)
  -> wrap <g transform>
  -> dispatch via registry -> <SvgWidget tagValue width height config/>
<SvgWidget>
  -> render SVG primitives
```

### C. Tag update propagation

```
WS pv_realtime tick (~1Hz, server-driven)
  -> realtime-store dispatch sets state[reactorId].tags[tagName]
  -> useTag selector detects value change (zustand shallow compare on single key)
  -> only SvgWidgetInstance subscribed to that tag re-renders
  -> React diffs SVG attrs -> DOM updated
```

### D. Staleness

`useTag` already returns `{ value, stale }` (sub-project 2/7). When `lastUpdate > STALE_THRESHOLD_MS` ago, `stale = true`. Sub-project 1 simply forwards the flag to the widget; visual treatment (e.g. desaturation) is sub-project 3.

### E. Error isolation

- Single widget render throws -> SvgErrorBoundary renders red `<rect>` fallback for that instance. Other widgets continue.
- Invalid view JSON -> ScadaCanvas renders ViewErrorDisplay with zod issues list. Nothing else renders.

### Guarantees

- **O(1) subscription**: each `useTag` reads a single store key via `useSyncExternalStore`. Unchanged values -> no re-render.
- **No global animation loop**. React reconciler diffs SVG attrs on tag updates.
- **SSR-safe**: page.tsx uses `'use client'`; runtime never reads `window` at module scope.

---

## Error handling

### View load (`page.tsx`)

| Scenario | Behaviour |
|----------|-----------|
| Network failure | "无法加载画面" + retry button + HTTP error in details |
| 404 | "画面不存在" + link back to `/scada` |
| 401/403 | Redirect `/login` via `window.location.assign` |
| 5xx | "服务器错误" + retry button |

### View JSON validation (`ScadaCanvas`)

```ts
const result = SvgViewJsonSchema.safeParse(view);
if (!result.success) return <ViewErrorDisplay issues={result.error.issues}/>;
```

Validation failure -> entire view rejected. Half-rendered views are worse than an explicit error.

### Unknown widget type (`SvgWidgetInstance`)

```ts
const reg = getSvgWidget(instance.type);
if (!reg) {
  console.warn(`Unknown SVG widget type: ${instance.type}`);
  return (
    <g transform={`translate(${instance.x},${instance.y})`}>
      <rect width={instance.w} height={instance.h} fill="#fee" stroke="#c33"/>
      <text x={4} y={14} fontSize={10} fill="#c33">?{instance.type}</text>
    </g>
  );
}
```

No throw — a single bad type should not blank the whole canvas. Red placeholder makes editing-time mistakes visible.

### Widget render exception (`SvgErrorBoundary`)

Each `SvgWidgetInstance` is wrapped in `SvgErrorBoundary`. On error: fallback red `<rect>` + `<text>error</text>` + `console.error` containing widget id. No upload to server (deferred).

### Missing or undefined tag

- `useTag(reactorId, tag)` returns `{ value: undefined, stale: true }` when the tag is unknown or not yet received.
- Widget renders its own fallback (SvgLabel -> `'—'`).
- No warning logged — unbound widgets are common during editing.

### Out of scope

WebSocket disconnect indicator is the existing global status bar — ScadaCanvas does not duplicate it. Edit-conflict handling (sub-project 5), animation frame drops (3), write failures (6) are deferred.

---

## Testing

**Framework:** vitest 1.6 + @testing-library/react 14 + jsdom (existing web-ui infra)
**Coverage target:** >=80%
**Discipline:** RED-first per CLAUDE testing.md

### Unit (3 files)

`widgets/svg/__tests__/registry.test.ts`
- registerSvg then getSvgWidget(type) returns the registration
- getSvgWidget('unknown') returns undefined
- listSvgWidgets returns all registered, sorted by type
- registerSvg with duplicate type throws "duplicate widget type"

`widgets/svg/__tests__/SvgLabel.test.tsx`
- renders `<text>` containing tagValue string when tagValue is a string
- renders '42' when tagValue is the number 42
- renders '—' when tagValue is undefined
- adds 'opacity-50' class when tagStale is true (visual placeholder hook for sub-project 3)

`widgets/svg/__tests__/SvgRect.test.tsx`
- renders `<rect>` with width/height from props and fill from config (default '#999')
- config.fill='#0f0' produces fill='#0f0'

### Component (3 files)

`components/scada/__tests__/SvgWidgetInstance.test.tsx`
- instance.visible === false -> returns null
- renders `<g>` with transform containing `translate(x,y)`
- instance.rotation=90 -> transform includes `rotate(90,w/2,h/2)`
- instance.type='svg-label' dispatches via registry to SvgLabel
- instance.type='unknown' -> renders red placeholder rect + console.warn called
- bindings.tag='F01.TEMP' -> useTag('F01','F01.TEMP') called, value forwarded to widget
- bindings missing -> useTag not called, tagValue=undefined passed through
- widget throws -> ErrorBoundary fallback rendered; sibling widget in same canvas unaffected

`components/scada/__tests__/ScadaCanvas.test.tsx`
- renders `<svg viewBox="0 0 W H">`
- with background -> emits backing `<rect>` with fill
- items sorted by zIndex (z=2 rendered after z=1)
- equal zIndex preserves array order
- empty items -> `<svg>` renders with no widget children
- view.width=0 -> zod fails -> ViewErrorDisplay rendered (no `<svg>`)

`components/scada/__tests__/SvgErrorBoundary.test.tsx`
- child throws -> fallback rendered + console.error called with widget id in message
- child renders normally -> children passed through
- child unmounts then remounts -> error state reset

### Integration (1 file)

`app/scada2/[viewId]/__tests__/page.test.tsx`
- fetch returns is_svg=1 view -> ScadaCanvas rendered
- fetch returns is_svg=0 view -> "legacy view" notice rendered
- fetch 404 -> "画面不存在" + link to /scada
- fetch 500 -> retry button rendered; click triggers refetch
- fetch 401 -> window.location.assign('/login') called
- loading state shows spinner

### Out of scope

Editor interactions (sub-project 4), animation timing (3), multi-page navigation (5), browser E2E (deferred), performance benchmarks (deferred).

### Mock strategy

| Dependency | Strategy |
|------------|----------|
| `useTag` | `vi.mock('@/hooks/useTag')` — per-test `mockReturnValue({value, stale})` |
| `fetch` | `vi.spyOn(global, 'fetch')` returning constructed `Response` |
| `next/navigation` (useRouter, useParams) | existing web-ui setup mock |
| WebSocket / realtime-store | not mocked directly; useTag mock covers it |

### Fixtures

`widgets/svg/__tests__/fixtures.ts` exports four minimal view JSONs:
- `EMPTY_VIEW` — width/height, items=[]
- `SINGLE_RECT_VIEW` — one SvgRect, no binding
- `SINGLE_LABEL_VIEW` — one SvgLabel bound to 'F01.TEMP'
- `MULTI_ZINDEX_VIEW` — three items with different zIndex values, verifies sort

### Estimated test count

Unit 10 (registry 4 + SvgLabel 4 + SvgRect 2) · Component 17 (SvgWidgetInstance 8 + ScadaCanvas 6 + SvgErrorBoundary 3) · Integration 6 = **33 tests total**.

---

## Migration & rollout

- Migration `030-scada-view-svg-flag.sql` adds `is_svg` column with default `0`. All existing views remain rendered by the legacy `/scada/[viewId]` route.
- After sub-project 1 lands: new SVG views are created by inserting `is_svg = 1` rows manually (no editor yet — sub-project 4 ships the SVG editor).
- Legacy `/scada/[viewId]` (BIOCore React widget views) and `/dashboard/hmi` (FUXA iframe) both remain operational throughout sub-projects 1–6.
- Sub-project 7 removes BOTH the FUXA UI (`/dashboard/hmi` + the FUXA fork `packages/fuxa/` + nginx `/fuxa/` proxy + `FUXA_READONLY` env) AND the legacy BIOCore React widget renderer (`/scada/[viewId]` + `WidgetView.tsx` + the 9 legacy widgets in `widgets/*.tsx`). Only the new SVG runtime at `/scada2/[viewId]` survives (sub-project 7 also renames `/scada2` back to `/scada` at the end).

## Done criteria

- All 31 tests green.
- Manual smoke: insert SQL `INSERT INTO scada_views (id, name, is_svg, widgets, ...) VALUES ('test-svg', 'Test', 1, '<json>', ...)`. Navigate `/scada2/test-svg`, verify SvgLabel reflects live F01.TEMP value, SvgRect renders with expected fill.
- Server `pnpm test` green.
- `pnpm --filter @biocore/web-ui test` green.
- No regression: existing `/scada/[viewId]` legacy views still render.
- Branch ready for sub-project 2 (widget library v2 — rewrite 9 + add 16 widgets in `widgets/svg/`).
