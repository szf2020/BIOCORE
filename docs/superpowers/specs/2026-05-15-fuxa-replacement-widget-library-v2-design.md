# Sub-project 2/8 — Widget Library v2 (SVG) Design

> **Parent initiative:** Replace FUXA with BIOCore-native HMI.
> Sub-project 2 of 8. Builds on sub-project 1 (SVG canvas runtime).

**Date:** 2026-05-15
**Branch:** feat/scada-data-model
**Decomposition (recap):** 1 SVG canvas runtime (DONE) · **2 widget library v2** · 3 animation engine · 4 pro editor (select/transform) · 5 pro editor (pages/templates/symbols) · 6 write controls + WriteIntentDialog · 7 FUXA UI removal · 8 (optional) FUXA shape asset port

## Goal

Add 22 SVG widget components to the registry on top of sub-project 1's runtime, giving operators a usable widget palette for designing fermentation HMI views. Combined with the 2 plumbing widgets from sub-project 1 (`svg-label`, `svg-rect`), the registry holds 24 widget types covering the most common SCADA needs.

**Out of scope (deferred to later sub-projects):**
- Animation engine — color/visible/rotate/blink/move bindings driven by tag value (sub-project 3)
- Write interactions — Slider drag, Switch click, Input typing, Select dropdown, Button onClick wiring to WriteIntentDialog (sub-project 6)
- Editor canvas / drag-from-palette (sub-project 4)
- Multi-tag binding (sub-project 3 extends `bindings` to multiple slots)

## Constraints

- **Approach A** continues: pure React + native SVG primitives. No d3, no Konva, no chart libraries.
- **Pattern reuse:** each widget follows the same destructure-and-render shape established by `SvgLabel`/`SvgRect` (sub-project 1).
- **Tag binding stays single-tag** (sub-project 3 will expand).
- **Coexistence:** legacy React widgets in `widgets/*.tsx` keep working at `/scada/[viewId]`. New SVG widgets live in `widgets/svg/` and are reachable through `/scada2/[viewId]` (the SVG runtime).
- **TDD per CLAUDE testing.md** — RED before GREEN; >=80% coverage.

---

## Architecture

Same three-layer model as sub-project 1:

```
ScadaCanvas → SvgWidgetInstance → useTag(tagName) → <SvgXxx tagValue tagStale config>
                                  └ if needed: useTagHistory(tagName, windowMs)
```

The new widgets plug into the existing dispatch path. `ScadaCanvas` is unchanged. `SvgWidgetInstance` gets one additive change (pass `tagName` prop to the dispatched component) so that `SvgTrend` and `SvgChart` can call `useTagHistory` from inside the widget.

### File layout

All 22 new widget files live flat under `packages/web-ui/src/widgets/svg/`. No subdirectories — flat is simpler to grep, import, and reason about for a 24-file library. The barrel `widgets/svg/index.ts` is extended with 22 new `registerSvg(...)` calls inside `ensureBuiltinSvgWidgetsRegistered` and 22 new named re-exports.

### Why flat instead of grouped subdirs

A `port-from-legacy/` vs `generic/` vs `fermentation/` split would reflect implementation history, not consumer usage. All widgets share the same registration mechanism, type contract, and props shape. Grouping by source confuses navigation when sub-project 7 deletes the legacy origin distinction.

---

## Components

### 22 new widget files (all under `packages/web-ui/src/widgets/svg/`)

**Group A — Ports of legacy React widgets (7):**

| File | Type id | Primitives | Tag coercion | Default config |
|------|---------|------------|--------------|----------------|
| `SvgLamp.tsx` | `svg-lamp` | `<circle>` | boolean | `onColor: '#22c55e'`, `offColor: '#9ca3af'` |
| `SvgIndicator.tsx` | `svg-indicator` | `<rect>+<text>` | string/number | `threshold: number`, `normalColor: '#22c55e'`, `alertColor: '#dc2626'` |
| `SvgPump.tsx` | `svg-pump` | `<g><circle><path>` (impeller) | boolean | `runningColor: '#22c55e'`, `idleColor: '#9ca3af'` |
| `SvgValve.tsx` | `svg-valve` | `<g><polygon>` (bowtie) | boolean/enum | `openColor: '#22c55e'`, `closedColor: '#9ca3af'` |
| `SvgTank.tsx` | `svg-tank` | `<rect>` + `<rect>` (fill overlay) | number 0-100 | `fillColor: '#3b82f6'`, `bgColor: '#e5e7eb'` |
| `SvgTrend.tsx` | `svg-trend` | `<polyline>` (uses `useTagHistory`) | history series | `windowMs: 60000`, `strokeColor: '#3b82f6'`, `strokeWidth: 2` |
| `SvgButton.tsx` | `svg-button` | `<rect>+<text>` | label | `label: string`, `action: string` (sub-project 6 uses this), `fontSize: 14` |

**Group B — Generic FUXA-style widgets (9):**

| File | Type id | Primitives | Tag coercion | Default config |
|------|---------|------------|--------------|----------------|
| `SvgMotor.tsx` | `svg-motor` | `<g><circle>+<path>` | boolean | `runningColor`, `idleColor` |
| `SvgGauge.tsx` | `svg-gauge` | `<path d="A..."` (arc) | number 0-100 | `min: 0`, `max: 100`, `fillColor: '#3b82f6'`, `bgColor: '#e5e7eb'` |
| `SvgSlider.tsx` | `svg-slider` | `<rect>+<rect>+<circle>` (track+fill+thumb) | number | `min: 0`, `max: 100`, `fillColor: '#3b82f6'` |
| `SvgSwitch.tsx` | `svg-switch` | `<g><rect rx>+<circle>` | boolean | `onColor: '#22c55e'`, `offColor: '#9ca3af'` |
| `SvgSelect.tsx` | `svg-select` | `<rect>+<text>+<path>` (arrow) | string | `options: string[]` (display only) |
| `SvgInput.tsx` | `svg-input` | `<rect>+<text>` | string | `placeholder: string`, `fontSize: 12` |
| `SvgChart.tsx` | `svg-chart` | `<g>` with `<rect>` bars (uses `useTagHistory`) | history series | `bins: 20`, `barColor: '#3b82f6'`, `windowMs: 60000` |
| `SvgImage.tsx` | `svg-image` | `<image>` | string (URL override) | `src: string`, `preserveAspectRatio: 'xMidYMid meet'` |
| `SvgPipe.tsx` | `svg-pipe` | `<rect>+<path>` (flow arrow) | boolean/enum | `orientation: 'horizontal'\|'vertical'`, `flowingColor`, `idleColor` |

**Group C — Fermentation-specific widgets (6):**

| File | Type id | Primitives | Tag coercion | Default config |
|------|---------|------------|--------------|----------------|
| `SvgReactor.tsx` | `svg-reactor` | `<g><rect>+<ellipse>+<line>` (jacket+vessel+stirrer placeholder) | number 0-100 (fill %) | `fillColor`, `vesselStroke` |
| `SvgSparger.tsx` | `svg-sparger` | `<g><line>` (repeating gas holes) | boolean | `flowingColor: '#3b82f6'`, `idleColor: '#9ca3af'` |
| `SvgProbe.tsx` | `svg-probe` | `<g><circle>+<line>+<text>` (head+cable+value) | number | `unit: string`, `decimals: 2` |
| `SvgStirrer.tsx` | `svg-stirrer` | `<g>` impeller blades (static) | number rpm | `bladeCount: 3`, `color: '#374151'` |
| `SvgHeater.tsx` | `svg-heater` | `<rect>+<g>` (wavy heat lines) | boolean | `heatedColor: '#dc2626'`, `idleColor: '#9ca3af'` |
| `SvgSensor.tsx` | `svg-sensor` | `<g><polygon>+<text>` (diamond+value) | any | `unit: string`, `decimals: 2` |

### Modified files (3)

- `packages/web-ui/src/widgets/svg/index.ts` — extend `ensureBuiltinSvgWidgetsRegistered` with 22 `registerSvg(...)` calls; add 22 named re-exports at file bottom.
- `packages/web-ui/src/widgets/svg/types.ts` — add optional `tagName?: string` to `SvgWidgetProps` (used by `SvgTrend` and `SvgChart` to call `useTagHistory`).
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` — pass `tagName={instance.bindings?.tag}` to the dispatched widget component.

### Common widget shape (all 22 follow)

```tsx
import type { SvgWidgetComponent } from './types';

export const SvgXxx: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  // 1. Coerce tagValue to the type this widget needs.
  // 2. Extract config keys with default fallbacks via typeof checks.
  // 3. Apply opacity-50 className when tagStale is true.
  // 4. Render pure SVG primitives (no useState, no useEffect except Trend/Chart's useTagHistory).
  return <g>{/* ... */}</g>;
};
```

Conventions:
- Default colors via `typeof config?.X === 'string' ? config.X : DEFAULT`
- `tagValue === undefined` → render fallback state (off / 0% / empty / placeholder text)
- `tagStale === true` → root element gets `className="opacity-50"`
- No throws — every input maps to a renderable state
- Clamp out-of-range numbers (Gauge value > max → max, Slider value < min → min)

### Tests

Per widget: `widgets/svg/__tests__/<WidgetName>.test.tsx` with 2-4 cases:
1. Default render with no `tagValue` (off / empty state)
2. Active render with `tagValue` set
3. Config override (custom color or threshold or unit)
4. (Where relevant) `tagStale=true` → `opacity-50` class applied

Plus one cross-cutting test: `widgets/svg/__tests__/registry-builtins.test.ts` — after `ensureBuiltinSvgWidgetsRegistered()`, asserts `listSvgWidgets().length === 24` and each expected `type` id is present.

Estimated total: **~63 new tests** (Group A ~24, Group B ~22, Group C ~16, plus 1 registry-builtins).

---

## Data flow

Unchanged from sub-project 1 for 20 of the 22 widgets. Two widgets (`SvgTrend`, `SvgChart`) additionally call `useTagHistory(tagName, windowMs)` from inside the widget to fetch a ring buffer of recent values; their host `SvgWidgetInstance` still passes them `tagValue` (current value), but they primarily render from the history series.

`useTagHistory` is the hook delivered by sub-project 2/7 (already in `packages/web-ui/src/hooks/useTagHistory.ts`). Its signature: `useTagHistory(tag: string, windowMs: number): Array<{t, v}>` (verify in implementation — if signature differs, adapt the widgets accordingly).

The widget needs the tag name to call `useTagHistory`. `SvgWidgetInstance` currently does not pass the tag name to widgets. **Decision:** extend `SvgWidgetProps` with an optional `tagName?: string` and have `SvgWidgetInstance` pass `instance.bindings?.tag`. This is an additive change to the type; existing widgets (`SvgLabel`, `SvgRect`) ignore it.

---

## Error handling

Reuses sub-project 1's `SvgErrorBoundary` (no change). Every widget render path is wrapped by `SvgWidgetInstance`, so a single bad render does not blank the canvas.

Per-widget tolerances:
- Type-mismatched `tagValue` → coerce via documented rule (`!!tagValue` for boolean widgets, `Number(tagValue)` clamped for numeric widgets, `String(tagValue)` for text widgets).
- `useTagHistory` returns empty array → render empty `<polyline points="">` or empty `<g>` (no throw).
- `SvgImage.config.src` missing → render placeholder `<rect fill="#eee">` + `<text>?image</text>`.
- `SvgPipe.config.orientation` not in {horizontal, vertical} → default to horizontal.
- Numeric out of range → clamp to `[min, max]`.

---

## Testing

**Framework:** unchanged (vitest 1.6 + @testing-library/react 14 + jsdom).
**Discipline:** RED-first per widget.

**Mock strategy:**
- `useTag` and `useTagHistory` both `vi.mock`-ed at the test file top.
- For Trend/Chart: `useTagHistory` mock returns a deterministic series (e.g. `[{t:0,v:1},{t:1,v:2},{t:2,v:3}]`); tests assert the rendered `<polyline points>` or `<rect>` count matches the series length.

**Coverage target:** >=80% for new widgets.

**Out of scope tests:**
- End-to-end browser smoke (deferred to sub-project 4 editor sprint or end-of-line E2E)
- Visual regression screenshots
- Performance benchmarks for 24 widget instances on one canvas

---

## Migration & rollout

- No DB migration in this sub-project. `is_svg` flag and `scada_views.items` JSON schema already accommodate the widget types (`type: 'svg-lamp'` etc.).
- After this sub-project lands, users can author views referencing any of the 24 widget types via direct SQL INSERT (editor in sub-project 4).
- Legacy widgets in `widgets/*.tsx` untouched.

## Done criteria

- All ~63 new tests green.
- `pnpm --filter @biocore/web-ui test` green (no regression).
- `tsc --noEmit` clean for new files.
- `listSvgWidgets().length === 24` after `ensureBuiltinSvgWidgetsRegistered()`.
- Manual smoke: insert a view referencing 5-6 different new widgets, navigate `/scada2/<viewId>?reactor=F01`, confirm each widget renders the live tag value with no console errors.
- Branch ready for sub-project 3 (animation engine — color/visible/rotate bindings on top of these 24 widgets).
