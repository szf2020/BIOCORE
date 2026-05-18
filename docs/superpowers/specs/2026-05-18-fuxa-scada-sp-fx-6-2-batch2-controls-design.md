# SP-FX-6.2 Batch 2 — Controls Design (gauge-semaphore / gauge-progress / html-switch / slider / pipe)

**Date:** 2026-05-18
**Status:** Spec — pending implementation plan
**Parent:** `2026-05-18-fuxa-scada-sp-fx-6-batch1-controls-design.md`
**Predecessor:** SP-FX-6 batch 1 shipped at `1e2de88` (main); current HEAD `f5810c0`

---

## 1. Scope

### 1.1 In-scope (Batch 2, ~1 week)

Second of 4 SP-FX-6 sub-sprints. Batch 2 validates the gauge-base abstraction with 5 additional homogeneous widgets spanning both pure-SVG and foreignObject patterns.

**Batch 2 widgets (gauges/controls/batch2/*):**

| Widget | FUXA TypeTag | Render strategy | Has onClick |
|--------|-------------|-----------------|-------------|
| `gauge-semaphore.tsx` | `svg-ext-gauge_semaphore` | Pure SVG — color first child `fill` per ranges | No |
| `gauge-progress.tsx` | `svg-ext-gauge_progress` | Pure SVG — rect height/y scaled by value/range | No |
| `html-switch.tsx` | `svg-ext-html_switch` | foreignObject + `<input type="checkbox">` | Yes |
| `slider.tsx` | `svg-ext-html_slider` | foreignObject + `<input type="range">` | Yes (change event) |
| `pipe.tsx` | `svg-ext-pipe` | Pure SVG — path stroke/fill per action ranges | No |

**Schema additions to `widget-schemas.tsx`:**
- `gaugeSemaphoreSchema`, `gaugeProgressSchema`, `htmlSwitchSchema`, `sliderSchema`, `pipeSchema`

**Barrel addition:**
- `gauges/controls/batch2/index.ts` — registers 5 new metas into `gaugeRegistry`

### 1.2 Out-of-scope

| Item | Defer to |
|------|----------|
| Remaining 10 widgets (html-graph, html-image, panel, html-bag, html-select, html-scheduler, html-video, html-iframe, etc.) | SP-FX-6.3 / 6.4 |
| Pipe SVG animation (ImageInPathAnimation) | SP-FX-8 polish |
| Slider step/tick marks UI | SP-FX-8 polish |
| Switch bitmask runtime evaluation | SP-FX-8 polish |
| RuntimeCanvas wiring for batch 2 widgets | SP-FX-7 (existing hook, no change) |

### 1.3 Constraints (verbatim from parent)

- TDD RED-first. All tests written before implementation.
- AI / animation / expression-eval never write PLC directly.
- HMI manual set-value: widget → `ctx.onWriteIntent` → RuntimeCanvas → `WriteIntentDialog` → `usePostWriteIntent`. No direct fetch.
- `writeTag` opts.confirmed===true strictly gated (not loosened).
- macOS BSD sed (no `\b`); use Edit tool, not sed.
- pnpm via `export PATH=$HOME/.hermes/node/bin:$PATH`.
- ZERO new third-party deps.
- Baseline: web-ui **856** vitest tests (confirmed 2026-05-18).
- Reuse SP-FX-6 batch 1 `gauge-base.ts` + `GaugeRegistry` + `PropertyPanel` + `widget-schemas.tsx` pattern.

### 1.4 Test count target

| Package | Baseline | Target | Delta |
|---------|----------|--------|-------|
| web-ui vitest | 856 | **≥891** | +35 |
| server vitest | 147 | 147 | 0 |
| data-service vitest | 84 | 84 | 0 |
| scripts vitest | 7 | 7 | 0 |
| Playwright | existing | existing | 0 (batch 2 reuses editor smoke) |

Vitest +35 breakdown:
- 5 widget unit tests × 5 tests each = 25
- 5 schema tests × 2 assertions each = 10 (added to widget-schemas.test.ts)
- Total = 35

---

## 2. File Structure

### 2.1 New files

```
packages/web-ui/src/scada-engine/
└── gauges/
    ├── controls/
    │   └── batch2/
    │       ├── gauge-semaphore.tsx          ~90 lines
    │       ├── gauge-progress.tsx           ~110 lines
    │       ├── html-switch.tsx              ~120 lines
    │       ├── slider.tsx                   ~130 lines
    │       ├── pipe.tsx                     ~100 lines
    │       └── index.ts                     barrel + register side-effect
    └── __tests__/
        └── controls/
            └── batch2/
                ├── gauge-semaphore.test.ts  5 tests
                ├── gauge-progress.test.ts   5 tests
                ├── html-switch.test.tsx     5 tests
                ├── slider.test.tsx          5 tests
                └── pipe.test.ts             5 tests
```

### 2.2 Modified files

```
packages/web-ui/src/scada-engine/
└── editor/properties/
    ├── widget-schemas.tsx       +5 schemas + exports
    └── __tests__/
        └── widget-schemas.test.ts   +10 tests (5 schemas × 2 assertions each)
```

### 2.3 Not modified

- `gauges/gauge-base.ts` — interface unchanged
- `gauges/gauge-registry.ts` — singleton unchanged
- `gauges/controls/index.ts` (batch 1 barrel) — unchanged
- `editor/properties/PropertyPanel.tsx` — unchanged
- `editor/properties/property-schema.ts` — unchanged
- All editor canvas / pointer-tools / runtime files

---

## 3. Type Contract

All 5 widgets implement `GaugeBase` from `../gauge-base` (unchanged).

### 3.1 `gauge-semaphore.tsx`

```ts
// FUXA: svg-ext-gauge_semaphore
// Render: colors a <circle> element's fill per ranges[]
interface SemaphoreProperty {
  variableId?: string;
  ranges?: Array<{ min: number; max: number; color: string }>;
  bitmask?: number;
}

class GaugeSemaphore implements GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void
    // create <circle> centered in widget bounds; set data-widget-id
  onUnmount(): void
  onProcess(value: GaugeValue): void   // re-color fill per ranges match
  onPropertyChange(change: GaugePropChange): void
  onResize(w: number, h: number): void
  // no onClick
}

export const gaugeSemaphoreMeta: GaugeMeta = {
  widgetType: 'svg-ext-gauge_semaphore',
  create: () => new GaugeSemaphore(),
  getSignals: (w) => {
    const v = (w.property as SemaphoreProperty).variableId;
    return v ? [v] : [];
  },
};
```

### 3.2 `gauge-progress.tsx`

```ts
// FUXA: svg-ext-gauge_progress
// Render: two SVG rects — background (full height) + bar (scaled by value)
interface ProgressProperty {
  variableId?: string;
  min?: number;       // default 0
  max?: number;       // default 100
  barColor?: string;  // default '#3F4964'
  showLabel?: boolean;
}

class GaugeProgress implements GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void
    // create background <rect> + bar <rect> + optional <text> label
  onUnmount(): void
  onProcess(value: GaugeValue): void
    // ratio = clamp(numVal-min, 0, max-min) / (max-min)
    // barEl.height = ratio * totalHeight; barEl.y = bgY + totalHeight - barEl.height
  onPropertyChange(change: GaugePropChange): void
  onResize(w: number, h: number): void
  // no onClick
}

export const gaugeProgressMeta: GaugeMeta = {
  widgetType: 'svg-ext-gauge_progress',
  create: () => new GaugeProgress(),
  getSignals: (w) => {
    const v = (w.property as ProgressProperty).variableId;
    return v ? [v] : [];
  },
};
```

### 3.3 `html-switch.tsx`

```ts
// FUXA: svg-ext-html_switch
// Render: foreignObject + <input type="checkbox"> styled as toggle
interface SwitchProperty {
  variableId?: string;
  onValue?: number | string;    // default 1
  offValue?: number | string;   // default 0
  onColor?: string;
  offColor?: string;
}

class HtmlSwitchGauge implements GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void
    // create foreignObject + input[type=checkbox]
    // 'change' listener → ctx.onWriteIntent when mode==='runtime'
  onUnmount(): void   // removeEventListener + remove fo
  onProcess(value: GaugeValue): void
    // checkbox.checked = (String(value.value) === String(property.onValue ?? 1))
  onPropertyChange(change: GaugePropChange): void
  onResize(w: number, h: number): void
  onClick(e: MouseEvent, c: GaugeClickContext): void
    // no-op; change event handles intent
}

export const htmlSwitchMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_switch',
  create: () => new HtmlSwitchGauge(),
  getSignals: (w) => {
    const v = (w.property as SwitchProperty).variableId;
    return v ? [v] : [];
  },
};
```

### 3.4 `slider.tsx`

```ts
// FUXA: svg-ext-html_slider
// Render: foreignObject + <input type="range">
interface SliderProperty {
  variableId?: string;
  min?: number;   // default 0
  max?: number;   // default 100
  step?: number;  // default 1
}

class SliderGauge implements GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void
    // create foreignObject + input[type=range] with min/max/step attrs
    // 'change' listener → ctx.onWriteIntent(parseFloat(input.value)) when mode==='runtime'
  onUnmount(): void
  onProcess(value: GaugeValue): void
    // update input.value only when input !== document.activeElement
  onPropertyChange(change: GaugePropChange): void
  onResize(w: number, h: number): void
  onClick(_e: MouseEvent, _c: GaugeClickContext): void  // no-op
}

export const sliderMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_slider',
  create: () => new SliderGauge(),
  getSignals: (w) => {
    const v = (w.property as SliderProperty).variableId;
    return v ? [v] : [];
  },
};
```

### 3.5 `pipe.tsx`

```ts
// FUXA: svg-ext-pipe
// Render: SVG rect/line placeholder with stroke color per property.options.pipe
// Actions: apply color per matching range (static, no animation)
interface PipeProperty {
  variableId?: string;
  options?: {
    pipe?: string;    // pipe stroke color, default '#E79180'
    content?: string; // content stroke color, default '#DADADA'
  };
  actions?: Array<{
    variableId: string;
    range: { min: number; max: number };
    options?: { fillA?: string; fillB?: string };
    type: string;
  }>;
}

class PipeGauge implements GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void
    // create <rect> background + <line> pipe visual; apply options.pipe as stroke
  onUnmount(): void
  onProcess(value: GaugeValue): void
    // find matching action range → update pipe stroke to fillA
  onPropertyChange(change: GaugePropChange): void
  onResize(w: number, h: number): void
  // no onClick
}

export const pipeMeta: GaugeMeta = {
  widgetType: 'svg-ext-pipe',
  create: () => new PipeGauge(),
  getSignals: (w) => {
    const p = w.property as PipeProperty;
    const ids: string[] = [];
    if (p?.variableId) ids.push(p.variableId);
    if (p?.actions) p.actions.forEach(a => { if (a.variableId) ids.push(a.variableId); });
    return [...new Set(ids)];
  },
};
```

### 3.6 `gauges/controls/batch2/index.ts`

```ts
import { gaugeRegistry } from '../../gauge-registry';
import { gaugeSemaphoreMeta } from './gauge-semaphore';
import { gaugeProgressMeta } from './gauge-progress';
import { htmlSwitchMeta } from './html-switch';
import { sliderMeta } from './slider';
import { pipeMeta } from './pipe';

gaugeRegistry.register(gaugeSemaphoreMeta);
gaugeRegistry.register(gaugeProgressMeta);
gaugeRegistry.register(htmlSwitchMeta);
gaugeRegistry.register(sliderMeta);
gaugeRegistry.register(pipeMeta);

export { gaugeSemaphoreMeta, gaugeProgressMeta, htmlSwitchMeta, sliderMeta, pipeMeta };
```

---

## 4. Property Schemas (additions to `widget-schemas.tsx`)

### 4.1 `gaugeSemaphoreSchema`

```ts
export const gaugeSemaphoreSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'bitmask', label: '位掩码', type: 'number', min: 0 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => /* ranges[] editor */,
};
```

### 4.2 `gaugeProgressSchema`

```ts
export const gaugeProgressSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'barColor', label: '进度条颜色', type: 'color' },
    { key: 'showLabel', label: '显示数值标签', type: 'boolean' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};
```

### 4.3 `htmlSwitchSchema`

```ts
export const htmlSwitchSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'onValue', label: 'ON 值', type: 'text', placeholder: '1' },
    { key: 'offValue', label: 'OFF 值', type: 'text', placeholder: '0' },
    { key: 'onColor', label: 'ON 颜色', type: 'color' },
    { key: 'offColor', label: 'OFF 颜色', type: 'color' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};
```

### 4.4 `sliderSchema`

```ts
export const sliderSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'step', label: '步进值', type: 'number', min: 0 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};
```

### 4.5 `pipeSchema`

```ts
export const pipeSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'pipeColor', label: '管道颜色', type: 'color' },
    { key: 'contentColor', label: '内容颜色', type: 'color' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};
```

---

## 5. Data Flow

### 5.1 Gauge-semaphore value processing

```
onProcess(value):
  numVal = parseFloat(value.value) or Number(value.value)
  if bitmask: numVal = numVal & bitmask
  matchedRange = ranges.find(r => r.min <= numVal && r.max >= numVal)
  circleEl.setAttribute('fill', matchedRange?.color ?? '#9ca3af')
```

### 5.2 Gauge-progress value processing

```
onProcess(value):
  numVal = clamp(parseFloat(value.value), min, max)
  ratio = (numVal - min) / (max - min)
  barEl.setAttribute('height', String(ratio * totalHeight))
  barEl.setAttribute('y', String(bgY + totalHeight * (1 - ratio)))
  if showLabel: labelEl.textContent = String(numVal)
```

### 5.3 Html-switch change → write intent

```
changeHandler(checked):
  if ctx.mode !== 'runtime': return
  val = checked ? (property.onValue ?? 1) : (property.offValue ?? 0)
  ctx.onWriteIntent({ tag: property.variableId, value: val, widgetId: widget.id })
```

### 5.4 Slider change → write intent

```
changeHandler(inputValue):
  if ctx.mode !== 'runtime': return
  ctx.onWriteIntent({ tag: property.variableId, value: parseFloat(inputValue), widgetId: widget.id })
```

### 5.5 Pipe action range coloring

```
onProcess(value):
  numVal = parseFloat(value.value)
  for action in property.actions:
    if action.variableId === tagId && action.range.min <= numVal <= action.range.max:
      apply action.options?.fillA to pipe line stroke
```

---

## 6. Error Handling

| Case | Behavior |
|------|----------|
| Missing variableId | Render placeholder; no throw |
| isStale value | Semaphore: gray `#9ca3af`; Progress: bar height=0; Switch: unchecked; Slider: no update; Pipe: default color |
| ranges[] empty (semaphore) | Falls back to gray `#9ca3af` |
| min >= max (progress) | ratio clamped to 0, no throw |
| Switch onWriteIntent without variableId | silent no-op |
| Slider change before mount | guarded by null check on foreignObj |
| Pipe actions[] empty or undefined | render default options.pipe color, no throw |

---

## 7. Testing

### 7.1 Widget unit tests (25 total, 5 per widget)

Per widget:
1. `onMount` creates SVG / foreignObject element in parentGroup with `data-widget-id`
2. `onProcess(value)` updates rendered output correctly
3. `onPropertyChange(change)` reflects property update on rendered element
4. `onResize(w, h)` updates element geometry
5. For switch/slider: `ctx.onWriteIntent` called with correct payload when `mode==='runtime'`; for semaphore/progress/pipe: `onUnmount` removes element without throw

### 7.2 Schema tests (10 tests added to widget-schemas.test.ts)

For each of the 5 new schemas (2 assertions each):
- Schema exports valid `entries` array with at least one `tag-ref` entry
- Schema includes `x/y/w/h` geometric entries
- (gaugeSemaphore only) schema includes `renderCustomSection`

### 7.3 Mock strategy

- `vi.fn()` for `ctx.onWriteIntent`, `ctx.readValue`
- `document.createElementNS` works in jsdom; tests assert attribute presence
- No `createRoot` needed (batch 2 widgets do not use React portals)

### 7.4 Coverage gates

- New modules ≥ 80% line/branch
- web-ui vitest 856 → ≥891 (+35)
- `tsc --noEmit` 0 errors
- server 147 / data-service 84 / scripts 7 unchanged

---

## 8. Stop Conditions

Sprint done when all 13 pass:

1. `batch2/index.ts` barrel registers all 5 metas via `gaugeRegistry.register(...)`.
2. `gaugeRegistry.create({ type: 'svg-ext-gauge_semaphore', ... })` returns `GaugeSemaphore` instance.
3. `gaugeRegistry.create({ type: 'svg-ext-gauge_progress', ... })` returns `GaugeProgress` instance.
4. `gaugeRegistry.create({ type: 'svg-ext-html_switch', ... })` returns `HtmlSwitchGauge` instance.
5. `gaugeRegistry.create({ type: 'svg-ext-html_slider', ... })` returns `SliderGauge` instance.
6. `gaugeRegistry.create({ type: 'svg-ext-pipe', ... })` returns `PipeGauge` instance.
7. `GaugeSemaphore.onProcess` colors circle fill per matching range; stale → gray `#9ca3af`.
8. `GaugeProgress.onProcess` scales bar rect height proportionally between min/max.
9. `HtmlSwitchGauge` change event calls `ctx.onWriteIntent` with onValue/offValue; editor mode suppressed.
10. `SliderGauge` change event calls `ctx.onWriteIntent` with numeric value; editor mode suppressed.
11. `PipeGauge.onProcess` applies matching action range `fillA` to pipe line stroke.
12. `widget-schemas.tsx` exports 5 new schemas with correct entry types.
13. web-ui vitest ≥891, tsc clean, server/data-service/scripts baselines unchanged.

---

## 9. Open items (non-blocking)

- Pipe SVG animation (clockwise/anticlockwise `setInterval` flow from FUXA) deferred to SP-FX-8.
- Switch bitmask evaluation (`checkBitmaskAndValue`) deferred to SP-FX-8.
- Semaphore `blink` / `hide` / `show` action types deferred to SP-FX-8.
- Slider step tick marks visual enhancement deferred to SP-FX-8.
- Color picker remains browser-native `<input type="color">`.

---

End of spec.
