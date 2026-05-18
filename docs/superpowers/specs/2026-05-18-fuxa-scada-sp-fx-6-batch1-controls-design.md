# SP-FX-6 Batch 1 — Controls Foundation Design

**Date:** 2026-05-18
**Status:** Spec — pending implementation plan
**Parent:** `2026-05-17-fuxa-scada-port-design.md` §5.2 SP-FX-6
**Predecessor:** SP-FX-5.5 shipped at `8bdecbc` (main)

---

## 1. Scope

### 1.1 In-scope (Batch 1, ~2 weeks)

First of 4 SP-FX-6 sub-sprints. Batch 1 lays the framework + ships 5 most-heterogeneous widgets (per parent R11) to validate the gauge-base abstraction before scaling to batches 2/3/4.

**Framework (new):**
- `gauges/gauge-base.ts` — class abstraction + 5 lifecycle hooks
- `gauges/gauge-registry.ts` — `Map<widget.type, GaugeFactory>` + lookup
- `editor/properties/property-schema.ts` — `WidgetPropertySchema` + entry types
- `editor/properties/PropertyPanel.tsx` — schema-driven panel + escape hatch
- `editor/properties/widget-schemas.ts` — schema definitions per widget type

**Batch 1 widgets (gauges/controls/*):**
- `value.tsx` — display-only PLC tag value (FUXA `svg-ext-value`)
- `html-button.tsx` — click → WriteIntentDialog → set-value (FUXA `svg-ext-html_button`)
- `html-input.tsx` — text/number input, Enter/blur → WriteIntentDialog (FUXA `svg-ext-html_input`)
- `html-chart.tsx` — multi-tag time series, wraps `widgets-extras/UplotChart` (FUXA `svg-ext-html_chart`)
- `html-table.tsx` — tag list display, custom React mount in `<foreignObject>` (FUXA `svg-ext-own_ctrl-table`)

**Editor integration:**
- `EditorShell` wires `<PropertyPanel>` into right pane (replaces `PropertiesPlaceholder`)
- `EditorCanvas.onDrop` palette-shape branch unchanged; palette-item branch unchanged

### 1.2 Out-of-scope (deferred)

| Item | Defer to |
|------|----------|
| Remaining 15 widgets (gauges, slider, switch, select, html-graph, etc.) | SP-FX-6.2/6.3/6.4 |
| RuntimeCanvas + view-v2 route | SP-FX-7 |
| Animation engine | SP-FX-7 |
| Per-shape default size override | Future SP-FX-8 |
| Cards-view / paginator | SP-FX-8 |
| Drag from palette of controls | SP-FX-6.2 (post-framework lockdown) |
| Property panel undo/redo integration | SP-FX-8 |

### 1.3 Constraints

- TDD RED-first.
- All user-facing replies in 简体中文.
- AI / animation / expression-eval never write PLC directly. Animation not in batch 1 scope.
- HMI manual set-value: widget → `ctx.onWriteIntent` callback → RuntimeCanvas state (SP-FX-7) → `<WriteIntentDialog>` (SP6) → `usePostWriteIntent.post` → `ai_suggestions` → dispatcher → PLC. No direct fetch from widgets.
- macOS BSD sed (no `\b`); literal Edit replacements.
- pnpm via `export PATH=$HOME/.hermes/node/bin:$PATH`.
- ZERO new third-party deps for SP-FX-6 batch 1.
- FUXA reference impl available at `/Volumes/SSD/projects/FUXA/client/src/app/gauges/controls/` for shape matching.

### 1.4 Test count target

| Package | Baseline | Target | Delta |
|---------|----------|--------|-------|
| web-ui vitest | 798 | **~837** | +~39 |
| server vitest | 147 | 147 | 0 |
| data-service vitest | 84 | 84 | 0 |
| scripts vitest | 7 | 7 | 0 |
| Playwright | 25 | **27** | +2 |

Vitest +39 breakdown:
- 5 gauge-base + 3 GaugeRegistry + 4 PropertyPanel + 2 widget-schemas = 14 framework
- 5 per widget × 5 widgets = 25 widget tests
- Total = 14 + 25 = 39

---

## 2. File Structure

### 2.1 New files

```
packages/web-ui/src/scada-engine/
├── gauges/
│   ├── gauge-base.ts                                                ~80 lines
│   ├── gauge-registry.ts                                            ~50 lines
│   ├── controls/
│   │   ├── value.tsx                                                ~90 lines
│   │   ├── html-button.tsx                                          ~130 lines
│   │   ├── html-input.tsx                                           ~150 lines
│   │   ├── html-chart.tsx                                           ~140 lines (Portal wraps UplotChart)
│   │   ├── html-table.tsx                                           ~160 lines (Portal wraps <table>)
│   │   └── index.ts                                                 barrel + register side-effect
│   └── __tests__/
│       ├── gauge-base.test.ts                                       5 tests
│       ├── gauge-registry.test.ts                                   3 tests
│       └── controls/
│           ├── value.test.tsx                                       5 tests
│           ├── html-button.test.tsx                                 5 tests
│           ├── html-input.test.tsx                                  5 tests
│           ├── html-chart.test.tsx                                  5 tests
│           └── html-table.test.tsx                                  5 tests

packages/web-ui/src/scada-engine/editor/properties/
├── property-schema.ts                                               ~70 lines
├── PropertyPanel.tsx                                                ~120 lines
├── widget-schemas.ts                                                ~150 lines (5 widget schemas)
└── __tests__/
    ├── PropertyPanel.test.tsx                                       4 tests
    └── widget-schemas.test.ts                                       2 tests

packages/web-ui/e2e/
└── scada-editor-controls.spec.ts                                    2 Playwright smoke
```

### 2.2 Modified files

```
packages/web-ui/src/scada-engine/
├── editor/EditorShell.tsx                                           replace PropertiesPlaceholder with PropertyPanel
├── editor/index.ts                                                  +exports
└── index.ts                                                         +gauges barrel re-export
```

### 2.3 Not modified

- `editor/canvas-svg.ts` (SP-FX-3a) — `CanvasController` keeps default `rect`/`ellipse`/`text`/`shape` cases.
- `editor/EditorCanvas.tsx` (SP-FX-4/5) — pointer-tools / drag-drop unchanged.
- `editor/palette/*` (SP-FX-4/5) — palette still drags rect/ellipse/text/shape only.
- `hooks/usePostWriteIntent.ts` (SP6) — used as-is.
- `components/scada/runtime/WriteIntentDialog.tsx` (SP6) — used as-is by SP-FX-7.
- `services/tag-binding.ts` (SP-FX-2) — `writeTag` not called from batch 1 widgets.
- `services/realtime-store.ts` (SP-FX-2) — subscribers added by gauge instances at mount (SP-FX-7).
- `dialogs/*` — untouched.

---

## 3. Type Contract

### 3.1 `gauges/gauge-base.ts`

```ts
import type { FuxaWidget } from '../models';

/** Value snapshot delivered to onProcess. Mirrors TagSnapshot shape. */
export interface GaugeValue {
  value: number | string | boolean | null;
  isStale: boolean;
}

/** Mount-time context. */
export interface GaugeContext {
  parentGroup: SVGGElement;
  readValue: (tagId: string) => GaugeValue;
  canvasSize: { width: number; height: number };
  /** 'editor' suppresses interactive callbacks; 'runtime' enables them. */
  mode: 'editor' | 'runtime';
  /** Runtime-only callback for set-value intents. */
  onWriteIntent?: (intent: { tag: string; value: unknown; widgetId: string }) => void;
}

/** Property change descriptor. */
export interface GaugePropChange {
  key: string;
  value: unknown;
  nextWidget: FuxaWidget;
}

/** Click context. */
export interface GaugeClickContext {
  widget: FuxaWidget;
  ctx: GaugeContext;
}

export interface GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void;
  onUnmount(): void;
  onProcess(value: GaugeValue): void;
  onPropertyChange(change: GaugePropChange): void;
  onResize(w: number, h: number): void;
  /** Optional — only button/input/slider implement. */
  onClick?(event: MouseEvent, ctx: GaugeClickContext): void;
}

export type GetSignalsFn = (widget: FuxaWidget) => string[];

export interface GaugeMeta {
  widgetType: string;
  create: () => GaugeBase;
  getSignals: GetSignalsFn;
}
```

### 3.2 `gauges/gauge-registry.ts`

```ts
import type { GaugeMeta, GaugeBase } from './gauge-base';
import type { FuxaWidget } from '../models';

export class GaugeRegistry {
  private map = new Map<string, GaugeMeta>();

  register(meta: GaugeMeta): void {
    if (this.map.has(meta.widgetType)) {
      throw new Error(`gauge already registered for type '${meta.widgetType}'`);
    }
    this.map.set(meta.widgetType, meta);
  }

  create(widget: FuxaWidget): GaugeBase | null {
    const meta = this.map.get(widget.type);
    return meta ? meta.create() : null;
  }

  getSignals(widget: FuxaWidget): string[] {
    const meta = this.map.get(widget.type);
    return meta ? meta.getSignals(widget) : [];
  }

  has(widgetType: string): boolean {
    return this.map.has(widgetType);
  }
}

export const gaugeRegistry = new GaugeRegistry();
```

### 3.3 `editor/properties/property-schema.ts`

```ts
export type PropertySchemaEntry =
  | TextEntry | NumberEntry | ColorEntry | RangeEntry
  | TagRefEntry | SelectEntry | BooleanEntry | TextareaEntry;

interface BaseEntry {
  key: string;
  label: string;
  geometric?: boolean;
}

interface TextEntry extends BaseEntry { type: 'text'; placeholder?: string; maxLength?: number; }
interface NumberEntry extends BaseEntry { type: 'number'; min?: number; max?: number; step?: number; decimals?: number; }
interface ColorEntry extends BaseEntry { type: 'color'; allowNone?: boolean; }
interface RangeEntry extends BaseEntry { type: 'range'; segments: Array<{ labelKey: string; colorKey: string }>; }
interface TagRefEntry extends BaseEntry { type: 'tag-ref'; filterPrefix?: string; }
interface SelectEntry extends BaseEntry { type: 'select'; options: Array<{ value: string; label: string }>; }
interface BooleanEntry extends BaseEntry { type: 'boolean'; }
interface TextareaEntry extends BaseEntry { type: 'textarea'; rows?: number; placeholder?: string; }

export interface WidgetPropertySchema {
  entries: PropertySchemaEntry[];
  renderCustomSection?: (
    property: Record<string, unknown>,
    onChange: (patch: Partial<Record<string, unknown>>) => void,
  ) => JSX.Element;
}
```

### 3.4 `editor/properties/PropertyPanel.tsx`

```tsx
export interface PropertyPanelProps {
  widget: FuxaWidget | null;
  schema: WidgetPropertySchema | null;
  onChange: (patch: Partial<FuxaWidget>) => void;
}
```

Render rules:
- widget=null → render empty state "未选中"
- schema=null → render empty state "无属性面板"
- entries by type — text/number → `<input>`, color → `<input type="color">`, tag-ref → `<select>` populated per §4.5, select → `<select>`, boolean → checkbox, textarea → `<textarea>`, range → composite multi-input
- geometric entries write to widget top-level (`{ x, y, w, h, rotate }`); non-geometric to `widget.property`
- custom section (if present) rendered after entries with separator

### 3.5 `editor/properties/widget-schemas.ts`

5 schemas: `valueSchema`, `htmlButtonSchema`, `htmlInputSchema`, `htmlChartSchema`, `htmlTableSchema`. Each follows §3.3 shape.

`valueSchema` (12 entries):
```ts
export const valueSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'label', label: '标签文字', type: 'text', placeholder: '可留空' },
    { key: 'format', label: '格式字符串', type: 'text', placeholder: '{value} °C' },
    { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 6, step: 1 },
    { key: 'color', label: '文字颜色', type: 'color', allowNone: true },
    { key: 'bgColor', label: '背景色', type: 'color', allowNone: true },
    { key: 'unit', label: '单位', type: 'text', placeholder: '°C / rpm / %' },
    { key: 'tooltip', label: '提示文本', type: 'textarea', rows: 2 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};
```

`htmlChartSchema` uses `renderCustomSection` for axes/series defs.
`htmlTableSchema` uses `renderCustomSection` for column defs (data-mode rows[].cells[]).

### 3.6 Widget skeletons

#### `value.tsx`

```ts
class ValueGauge implements GaugeBase {
  private textEl: SVGTextElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;

  onMount(widget: FuxaWidget, ctx: GaugeContext) {
    this.widget = widget;
    this.ctx = ctx;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const cx = ((widget as any).x ?? 0) + ((widget as any).w ?? 80) / 2;
    const cy = ((widget as any).y ?? 0) + ((widget as any).h ?? 40) / 2;
    el.setAttribute('x', String(cx));
    el.setAttribute('y', String(cy));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-size', '14');
    el.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(el);
    this.textEl = el;
    const tagId = (widget.property as { variableId?: string }).variableId ?? '';
    if (tagId) this._render(ctx.readValue(tagId));
  }

  onUnmount() { this.textEl?.remove(); this.textEl = null; }
  onProcess(value: GaugeValue) { this._render(value); }
  onPropertyChange(change: GaugePropChange) { /* re-render with new format/color */ }
  onResize(w: number, h: number) { /* re-center */ }

  private _render(v: GaugeValue) {
    if (!this.textEl) return;
    const format = (this.widget.property as { format?: string }).format ?? '{value}';
    const decimals = (this.widget.property as { decimals?: number }).decimals ?? 0;
    const display = v.isStale ? '--' : String(v.value ?? '--');
    this.textEl.textContent = format.replace('{value}', display);
    this.textEl.setAttribute('fill', v.isStale ? '#9ca3af' : '#111827');
  }
}

export const valueMeta: GaugeMeta = {
  widgetType: 'svg-ext-value',
  create: () => new ValueGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};
```

#### `html-button.tsx`

```ts
class HtmlButtonGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private htmlBtn: HTMLButtonElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;

  onMount(widget: FuxaWidget, ctx: GaugeContext) {
    // create <foreignObject> + <button> child
    // attach click handler that calls ctx.onWriteIntent (when mode === 'runtime')
  }

  onClick(e: MouseEvent, c: GaugeClickContext) {
    if (this.ctx.mode !== 'runtime') return;
    const events = (this.widget.property as any).events ?? [];
    const evt = events.find((x: any) => x?.type === 'click');
    if (!evt?.actparam) return;
    this.ctx.onWriteIntent?.({
      tag: evt.actparam,
      value: evt.value,
      widgetId: this.widget.id,
    });
  }

  onProcess(value: GaugeValue) { /* update button color per ranges[] */ }
  onUnmount() { this.foreignObj?.remove(); }
  onPropertyChange(c: GaugePropChange) { /* update text/icon/image */ }
  onResize(w: number, h: number) { /* update fO width/height */ }
}

export const htmlButtonMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_button',
  create: () => new HtmlButtonGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};
```

#### `html-input.tsx`

```ts
class HtmlInputGauge implements GaugeBase {
  private inputEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  private isSubmitting = false;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;

  onMount(widget: FuxaWidget, ctx: GaugeContext) {
    // create <foreignObject> + <input> or <textarea> per property.options.type
    // attach keydown (Enter) + blur listeners → commit
  }

  private commit(value: string) {
    if (this.ctx.mode !== 'runtime' || this.isSubmitting) return;
    const tag = (this.widget.property as { variableId?: string }).variableId;
    if (!tag) return;
    this.isSubmitting = true;
    try {
      this.ctx.onWriteIntent?.({ tag, value, widgetId: this.widget.id });
    } finally {
      // Release guard after microtask so duplicate Enter+blur within same tick are absorbed.
      Promise.resolve().then(() => { this.isSubmitting = false; });
    }
  }

  onProcess(value: GaugeValue) {
    // Only update inputEl.value when document.activeElement !== inputEl
    if (!this.inputEl || document.activeElement === this.inputEl) return;
    this.inputEl.value = value.isStale ? '' : String(value.value ?? '');
  }

  onUnmount() { /* remove fO + listeners */ }
  onPropertyChange(c: GaugePropChange) { /* recreate input if type changed */ }
  onResize(w: number, h: number) { /* update fO geometry */ }
}

export const htmlInputMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_input',
  create: () => new HtmlInputGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};
```

#### `html-chart.tsx`

```ts
class HtmlChartGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private mountDiv: HTMLDivElement | null = null;
  private reactRoot: ReturnType<typeof createRoot> | null = null;
  private dataBuffer: Array<Array<{ t: number; v: number }>> = [];
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;

  onMount(widget: FuxaWidget, ctx: GaugeContext) {
    // create <foreignObject> + <div>; mount React root via createRoot
    // initial render <UplotChart series={[]} width={w} height={h} />
  }

  onProcess(value: GaugeValue) {
    // Append (now, value) to buffer[0]; drop entries older than 60s
    // Re-render via root.render with updated series prop
  }

  onUnmount() {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.foreignObj?.remove();
  }

  onPropertyChange(c: GaugePropChange) { /* re-render with new title/axes */ }
  onResize(w: number, h: number) { /* update fO + re-render UplotChart width/height */ }
}

export const htmlChartMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_chart',
  create: () => new HtmlChartGauge(),
  getSignals: (w) => (w.property as { variableIds?: string[] }).variableIds ?? [],
};
```

#### `html-table.tsx`

```ts
class HtmlTableGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private reactRoot: ReturnType<typeof createRoot> | null = null;
  private cellValues = new Map<string, GaugeValue>();

  onMount(widget: FuxaWidget, ctx: GaugeContext) {
    // create <foreignObject> + <div>; mount React root
    // render <table> with rows from widget.property.options.rows
  }

  onProcess(value: GaugeValue) {
    // Identify which cell this value belongs to via signal tagId
    // Update cellValues map; re-render
  }

  onUnmount() { this.reactRoot?.unmount(); this.foreignObj?.remove(); }
  onPropertyChange(c: GaugePropChange) { /* re-render with new rows/cols */ }
  onResize(w: number, h: number) { /* update fO geometry */ }
}

export const htmlTableMeta: GaugeMeta = {
  widgetType: 'svg-ext-own_ctrl-table',
  create: () => new HtmlTableGauge(),
  getSignals: (w) => {
    const p = w.property as any;
    const ids: string[] = [];
    if (p?.options?.rows) {
      for (const row of p.options.rows) {
        for (const cell of (row.cells ?? [])) {
          if (cell?.type === 'variable' && cell?.variableId) ids.push(cell.variableId);
        }
      }
    }
    return ids;
  },
};
```

### 3.7 `gauges/controls/index.ts`

```ts
import { gaugeRegistry } from '../gauge-registry';
import { valueMeta } from './value';
import { htmlButtonMeta } from './html-button';
import { htmlInputMeta } from './html-input';
import { htmlChartMeta } from './html-chart';
import { htmlTableMeta } from './html-table';

gaugeRegistry.register(valueMeta);
gaugeRegistry.register(htmlButtonMeta);
gaugeRegistry.register(htmlInputMeta);
gaugeRegistry.register(htmlChartMeta);
gaugeRegistry.register(htmlTableMeta);

export { valueMeta, htmlButtonMeta, htmlInputMeta, htmlChartMeta, htmlTableMeta };
```

---

## 4. Data Flow

### 4.1 Editor mount

```
User opens /scada2/edit-v2/<viewId>
  → EditorShell loads view via API
  → editorStore.openView(view)
  → EditorCanvas → CanvasController.loadView(view)
    → Rect/ellipse/text/shape rendered via existing createElementForType
    → No gauge instantiation in editor (batch 1: only property panel uses schema)
```

Batch 1 deliberately leaves widgets RENDERED AS SHAPES in editor — placeholder until SP-FX-7 runtime activates gauges. EditorShell uses gauges INDIRECTLY via the property panel (which reads schema by widget.type).

### 4.2 Property panel update

```
User selects widget on canvas (existing pointer-tools click-select)
  → editorStore.selection = [widgetId]
  → EditorShell right pane re-renders
    → PropertyPanel(widget, schema = widgetSchemas[widget.type])
      → entries rendered as text/number/color/etc. inputs
      → tag-ref entries: dropdown from PROCESS_VALUES_FIELDS × reactor list
      → custom section (chart/table)
  → User edits a field
    → onChange(patch) → editorStore.updateWidget(widgetId, patch)
      → history push (existing SP-FX-3)
      → re-render canvas (canvas-svg upsertWidget) with new property
```

### 4.3 Tag value subscription (runtime — DEFERRED to SP-FX-7)

Runtime widget mounting (`gauge.onMount`, `gauge.onProcess` on pv_realtime) is SP-FX-7 scope. Batch 1 ships registry + widget metas but does NOT wire RuntimeCanvas. SP-FX-7 plan consumes `gaugeRegistry` as-is.

### 4.4 Set-value (runtime — DEFERRED to SP-FX-7)

Same as 4.3. Widget click → `onWriteIntent` callback → `WriteIntentDialog` flow happens in RuntimeCanvas (SP-FX-7). Batch 1 widgets define `onClick` method but `ctx.onWriteIntent` is supplied only by RuntimeCanvas, not EditorCanvas.

### 4.5 tag-ref lookup (PropertyPanel)

```
PropertyPanel renders <tag-ref> entry
  → reactorIds = Object.keys(useRealtimeStore.getState().reactorData)
  → tagOptions = reactorIds.flatMap(rid => PROCESS_VALUES_FIELDS.map(f => `${rid}.${f}`))
  → <select> shows tagOptions
  → onChange(selected) → onChange({ property: { ...current, variableId: selected } })
```

---

## 5. Error Handling

### 5.1 GaugeRegistry

| Case | Behavior |
|------|----------|
| Register twice for same type | throw `gauge already registered for type '<type>'` |
| `create` for unregistered type | return null (caller handles fallback) |
| `getSignals` for unregistered | return [] |

### 5.2 PropertyPanel

| Case | Behavior |
|------|----------|
| widget=null | render empty state "未选中" |
| schema=null | render empty state "无属性面板" |
| tag-ref with empty options | show "无可用 Tag" |
| Invalid number input | display red border (no commit) |

### 5.3 Widget gauges

| Case | Behavior |
|------|----------|
| Missing widget.property.variableId | gauge renders placeholder ("--" / blank); does not throw |
| Tag value `null` / isStale | render gray "--" |
| `<foreignObject>` unsupported in jsdom | catch and log; skip render (tests use stub) |
| html-chart: empty series buffer | render empty uplot canvas (SP-FX-5 covered) |
| html-table: missing rows[] | render `<table>` with single "无数据" row |

### 5.4 Set-value path (batch 1 stubs)

In editor mode (`ctx.mode === 'editor'`), `onClick` is a no-op. Runtime wiring SP-FX-7.

For batch 1 testing, widget unit tests mock `ctx.onWriteIntent` and assert it's called with correct payload.

### 5.5 Regression boundaries

- SP-FX-3/4/5/5.5 vitest 798 unchanged.
- canvas-svg `rect`/`ellipse`/`text`/`shape` paths unchanged.
- EditorCanvas onDrop / pointer-tools unchanged.
- Existing 11 dialogs (incl. WriteIntentDialog) unchanged.
- `/scada2/edit-v2/[viewId]` page unchanged except EditorShell right pane.

---

## 6. Testing

### 6.1 Vitest +39 breakdown

**gauge-base.test.ts (5)**:
1. interface shape — implementor satisfies all 5 required hooks
2. GaugeValue type narrowing — value null+isStale combos
3. GaugeContext.readValue called returns synchronous value
4. onClick optional — non-button widgets omit it
5. unmount idempotent — calling onUnmount twice does not throw

**gauge-registry.test.ts (3)**:
1. register + create — round-trip
2. register duplicate throws
3. create for unknown type returns null

**PropertyPanel.test.tsx (4)**:
1. renders entries by type (text/number/color/tag-ref/select/boolean)
2. geometric entries write to widget top-level; non-geometric to widget.property
3. tag-ref dropdown shows reactorIds × PROCESS_VALUES_FIELDS
4. custom section rendered when schema has renderCustomSection

**widget-schemas.test.ts (2)**:
1. all 5 schemas export valid `entries` arrays + correct widget types
2. chart and table schemas include `renderCustomSection`

**5 widget unit tests × 5 tests each (25)**:

Per widget:
1. `onMount` creates SVG/foreignObject element in parentGroup
2. `onProcess(value)` updates rendered output (text content / fill / data buffer)
3. `onPropertyChange({key,value,nextWidget})` reflects on rendered output
4. `onResize(w,h)` updates geometry
5. `onClick` (button/input) calls ctx.onWriteIntent; OR `onUnmount` removes element (value/chart/table)

### 6.2 Playwright (2 smoke) — `e2e/scada-editor-controls.spec.ts`

1. **Property panel update**: Login → /scada2/edit-v2/:viewId → seed view with `svg-ext-value` widget → click widget on canvas → property panel shows entries → change label → PUT save → reload → label persisted
2. **Schema rendering for chart**: seed `svg-ext-html_chart` widget → click → property panel renders custom section (axes/series editor placeholder visible)

### 6.3 Mock strategy

- `useRealtimeStore.getState()` mocked: returns synthetic `reactorData`
- `useWriteIntent` mocked at hook level: returns `{ post: vi.fn() }`
- `createRoot` for chart/table tested with stub Portal (real uplot covered by SP-FX-5)
- jsdom: `<foreignObject>` rendered via `createElementNS`; tests assert on attribute presence rather than visual

### 6.4 Coverage gates

- New modules ≥ 80% line/branch
- Existing modules: no decrease
- `tsc --noEmit` 0 errors
- web-ui 798 → ≥837 (+39), Playwright 25 → 27 (+2)

---

## 7. Stop Conditions

Sprint done when all 12 pass:

1. `gauges/gauge-base.ts` exports `GaugeBase`/`GaugeValue`/`GaugeContext`/`GaugeMeta` per §3.1.
2. `gauges/gauge-registry.ts` exports `GaugeRegistry` class + `gaugeRegistry` singleton.
3. `editor/properties/property-schema.ts` exports `WidgetPropertySchema` + 8 entry types per §3.3.
4. `editor/properties/PropertyPanel.tsx` renders entries by type; geometric writes widget top-level; tag-ref derives from reactorData × PROCESS_VALUES_FIELDS; custom section escape hatch works.
5. 5 widget metas registered at `controls/index.ts` import; `gaugeRegistry.create(widget)` returns correct instance for each.
6. Each widget implements 5 required hooks; button/input additionally `onClick`.
7. `value` widget renders `<text>` with format + decimals + stale gray.
8. `html-button` renders `<foreignObject><button>` with text/color from property; click calls `ctx.onWriteIntent` when present.
9. `html-input` renders `<foreignObject><input|textarea>`; Enter/blur commit calls `ctx.onWriteIntent`; isSubmitting guard prevents double-fire.
10. `html-chart` renders Portal-mounted UplotChart; series buffer keeps last 60s; setData on onProcess.
11. `html-table` renders Portal-mounted `<table>` with rows from `widget.property.options.rows`; data mode only.
12. Test baselines: web-ui ≥837 (+39), Playwright ≥27 (+2), tsc clean, server 147, data-service 84, scripts 7.

---

## 8. Open items (non-blocking)

- R11 risk: chart/table Portal mount may need refinement after batch 1 ships. Lessons feed SP-FX-6.2 retrospective.
- Tag-ref dropdown flattens reactorIds × PROCESS_VALUES_FIELDS — OK for ≤100 tags; virtualize if scaled.
- Schema-driven validation (per-field zod) deferred — entries declare min/max but PropertyPanel does not enforce. SP-FX-6.4 polish.
- Color picker UI is browser-native `<input type="color">`; richer picker deferred.
- ARIA labels on PropertyPanel inputs match dialog patterns from SP-FX-5; full a11y audit deferred.

---

End of spec.
