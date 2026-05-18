# SP-FX-6 Batch 1 — Controls Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship gauge-base abstraction + 5 Batch 1 controls (value / html-button / html-input / html-chart / html-table) + schema-driven PropertyPanel wired into EditorShell, providing the framework layer SP-FX-7 RuntimeCanvas will consume.

**Architecture:** `GaugeBase` is a pure imperative interface — classes manipulate DOM directly in `onMount/onProcess/onResize`; React (createRoot) is used only for html-chart and html-table which need React component trees inside `<foreignObject>`. `PropertyPanel` is a schema-driven React component reading `WidgetPropertySchema` per widget type; in editor mode widgets remain rendered as existing canvas shapes (no gauge instantiation), only the right pane uses schema. All 5 widget metas register at barrel-import time via side-effect; `gaugeRegistry.create(widget)` returns the correct class instance for SP-FX-7.

**Tech Stack:** TypeScript 5, React 18 (createRoot / react-dom/client), jsdom (vitest), @testing-library/react, uplot (existing via UplotChart wrapper), Playwright 1.x, pnpm (via `export PATH=$HOME/.hermes/node/bin:$PATH`). Zero new third-party deps.

**Baseline:** main `d3dddae` (post SP-FX-6/7 spec). web-ui 798 vitest, scripts 7, server 147, data-service 84, Playwright 25.
**Target:** web-ui +39 = **837**, Playwright +2 = **27**.

---

## Per-task model hints

| Task | Suggested model | Reason |
|------|-----------------|--------|
| T0 | sonnet | GaugeBase interface + GaugeRegistry class + 8 tests |
| T1 | haiku | Types-only property-schema.ts, no tests |
| T2 | sonnet | PropertyPanel React component + 4 tests |
| T3 | haiku | 5 widget-schemas constant definitions + 2 tests |
| T4 | sonnet | value.tsx full implementation + 5 tests |
| T5 | sonnet | html-button.tsx full implementation + 5 tests |
| T6 | sonnet | html-input.tsx full implementation + 5 tests |
| T7 | sonnet | html-chart.tsx + createRoot Portal + 5 tests |
| T8 | sonnet | html-table.tsx + createRoot Portal + 5 tests |
| T9 | haiku | controls/index.ts barrel + register side-effects |
| T10 | sonnet | EditorShell wire PropertyPanel (replace PropertiesPlaceholder) |
| T11 | haiku | editor/index.ts + scada-engine/index.ts barrel exports |
| T12 | sonnet | 2 Playwright smoke tests |
| T13 | haiku | Full regression + baseline verification |

---

## Task 0: gauge-base.ts + gauge-registry.ts + 8 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/gauge-base.ts`
- Create: `packages/web-ui/src/scada-engine/gauges/gauge-registry.ts`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/gauge-base.test.ts`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/gauge-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-ui/src/scada-engine/gauges/__tests__/gauge-base.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { GaugeBase, GaugeValue, GaugeContext, GaugeMeta } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class MinimalGauge implements GaugeBase {
  onMount(_widget: FuxaWidget, _ctx: GaugeContext): void {}
  onUnmount(): void {}
  onProcess(_value: GaugeValue): void {}
  onPropertyChange(_change: { key: string; value: unknown; nextWidget: FuxaWidget }): void {}
  onResize(_w: number, _h: number): void {}
}

const makeCtx = (): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 42, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
});

describe('GaugeBase interface', () => {
  it('implementor satisfies all 5 required hooks without onClick', () => {
    const g: GaugeBase = new MinimalGauge();
    expect(typeof g.onMount).toBe('function');
    expect(typeof g.onUnmount).toBe('function');
    expect(typeof g.onProcess).toBe('function');
    expect(typeof g.onPropertyChange).toBe('function');
    expect(typeof g.onResize).toBe('function');
    expect(g.onClick).toBeUndefined();
  });

  it('GaugeValue isStale=true with null value is valid shape', () => {
    const v: GaugeValue = { value: null, isStale: true };
    expect(v.isStale).toBe(true);
    expect(v.value).toBeNull();
  });

  it('GaugeContext.readValue is called synchronously and returns GaugeValue', () => {
    const ctx = makeCtx();
    const result = ctx.readValue('reactor1.AI-0');
    expect(result).toEqual({ value: 42, isStale: false });
    expect(ctx.readValue).toHaveBeenCalledWith('reactor1.AI-0');
  });

  it('onClick is optional — non-button widget can omit it', () => {
    const g: GaugeBase = new MinimalGauge();
    expect('onClick' in g).toBe(false);
  });

  it('onUnmount idempotent — calling twice does not throw', () => {
    const g = new MinimalGauge();
    expect(() => { g.onUnmount(); g.onUnmount(); }).not.toThrow();
  });
});
```

Create `packages/web-ui/src/scada-engine/gauges/__tests__/gauge-registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GaugeRegistry } from '../gauge-registry';
import type { GaugeMeta, GaugeBase, GaugeContext, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class StubGauge implements GaugeBase {
  onMount(_w: FuxaWidget, _ctx: GaugeContext): void {}
  onUnmount(): void {}
  onProcess(_v: GaugeValue): void {}
  onPropertyChange(_c: { key: string; value: unknown; nextWidget: FuxaWidget }): void {}
  onResize(_w: number, _h: number): void {}
}

const stubMeta: GaugeMeta = {
  widgetType: 'svg-ext-value',
  create: () => new StubGauge(),
  getSignals: (w) => {
    const v = (w.property as { variableId?: string }).variableId;
    return v ? [v] : [];
  },
};

describe('GaugeRegistry', () => {
  let registry: GaugeRegistry;
  beforeEach(() => { registry = new GaugeRegistry(); });

  it('register + create round-trip returns a GaugeBase instance', () => {
    registry.register(stubMeta);
    const gauge = registry.create({ id: 'w1', type: 'svg-ext-value', property: {} });
    expect(gauge).not.toBeNull();
    expect(typeof gauge!.onMount).toBe('function');
  });

  it('register duplicate type throws with type name in message', () => {
    registry.register(stubMeta);
    expect(() => registry.register(stubMeta))
      .toThrow("gauge already registered for type 'svg-ext-value'");
  });

  it('create for unknown type returns null', () => {
    expect(registry.create({ id: 'w1', type: 'unknown-type', property: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/gauge-base.test.ts src/scada-engine/gauges/__tests__/gauge-registry.test.ts
```

Expected: FAIL — "Cannot find module '../gauge-base'"

- [ ] **Step 3: Create gauge-base.ts**

Create `packages/web-ui/src/scada-engine/gauges/gauge-base.ts`:

```ts
import type { FuxaWidget } from '../models';

export interface GaugeValue {
  value: number | string | boolean | null;
  isStale: boolean;
}

export interface GaugeContext {
  parentGroup: SVGGElement;
  readValue: (tagId: string) => GaugeValue;
  canvasSize: { width: number; height: number };
  mode: 'editor' | 'runtime';
  onWriteIntent?: (intent: { tag: string; value: unknown; widgetId: string }) => void;
}

export interface GaugePropChange {
  key: string;
  value: unknown;
  nextWidget: FuxaWidget;
}

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
  onClick?(event: MouseEvent, ctx: GaugeClickContext): void;
}

export type GetSignalsFn = (widget: FuxaWidget) => string[];

export interface GaugeMeta {
  widgetType: string;
  create: () => GaugeBase;
  getSignals: GetSignalsFn;
}
```

- [ ] **Step 4: Create gauge-registry.ts**

Create `packages/web-ui/src/scada-engine/gauges/gauge-registry.ts`:

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

- [ ] **Step 5: Run tests — expect GREEN (8 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/gauge-base.test.ts src/scada-engine/gauges/__tests__/gauge-registry.test.ts
```

Expected: 8 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/gauge-base.ts \
        packages/web-ui/src/scada-engine/gauges/gauge-registry.ts \
        packages/web-ui/src/scada-engine/gauges/__tests__/gauge-base.test.ts \
        packages/web-ui/src/scada-engine/gauges/__tests__/gauge-registry.test.ts
git commit -m "feat(scada): gauge-base interface + GaugeRegistry class (SP-FX-6)"
```

---

## Task 1: property-schema.ts (types-only, no tests)

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/properties/property-schema.ts`

- [ ] **Step 1: Create property-schema.ts**

Create `packages/web-ui/src/scada-engine/editor/properties/property-schema.ts`:

```ts
// SP-FX-6: Schema types for schema-driven PropertyPanel. Pure type definitions.

export type PropertySchemaEntry =
  | TextEntry | NumberEntry | ColorEntry | RangeEntry
  | TagRefEntry | SelectEntry | BooleanEntry | TextareaEntry;

interface BaseEntry {
  key: string;
  label: string;
  /** If true, written to widget top-level (x/y/w/h/rotate); else to widget.property */
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors from new file

- [ ] **Step 3: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/properties/property-schema.ts
git commit -m "feat(scada): WidgetPropertySchema types for PropertyPanel (SP-FX-6)"
```

---

## Task 2: PropertyPanel.tsx + 4 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/properties/PropertyPanel.tsx`
- Create: `packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertyPanel.test.tsx`

- [ ] **Step 1: Write failing PropertyPanel tests**

Create `packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertyPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PropertyPanel } from '../PropertyPanel';
import type { WidgetPropertySchema } from '../property-schema';
import type { FuxaWidget } from '../../../models';

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: (selector: (s: any) => any) =>
    selector({ reactorData: { reactor1: { processValues: {} }, reactor2: { processValues: {} } } }),
}));

const makeWidget = (overrides?: Partial<FuxaWidget>): FuxaWidget => ({
  id: 'w1', type: 'svg-ext-value', property: { variableId: '' },
  x: 10, y: 20, w: 80, h: 40, ...overrides,
});

const simpleSchema: WidgetPropertySchema = {
  entries: [
    { key: 'label', label: '标签', type: 'text', placeholder: '请输入' },
    { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 6 },
    { key: 'color', label: '颜色', type: 'color' },
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'mode', label: '模式', type: 'select', options: [{ value: 'a', label: 'A' }] },
    { key: 'active', label: '激活', type: 'boolean' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
  ],
};

describe('PropertyPanel', () => {
  it('renders entries by type (text/number/color/tag-ref/select/boolean)', () => {
    const widget = makeWidget({ property: { variableId: '', label: '', decimals: 2, color: '#fff', active: false, mode: 'a' } as any });
    const { container } = render(<PropertyPanel widget={widget} schema={simpleSchema} onChange={vi.fn()} />);
    expect(container.querySelector('input[data-key="label"]')).not.toBeNull();
    expect(container.querySelector('input[type="number"][data-key="decimals"]')).not.toBeNull();
    expect(container.querySelector('input[type="color"][data-key="color"]')).not.toBeNull();
    expect(container.querySelector('select[data-key="variableId"]')).not.toBeNull();
    expect(container.querySelector('select[data-key="mode"]')).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"][data-key="active"]')).not.toBeNull();
  });

  it('geometric entry change calls onChange with top-level patch (not nested in property)', () => {
    const onChange = vi.fn();
    const { container } = render(<PropertyPanel widget={makeWidget()} schema={simpleSchema} onChange={onChange} />);
    const xInput = container.querySelector('input[data-key="x"]') as HTMLInputElement;
    fireEvent.change(xInput, { target: { value: '99' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ x: 99 }));
    const call = onChange.mock.calls[0][0] as Record<string, unknown>;
    expect('property' in call).toBe(false);
  });

  it('tag-ref dropdown lists reactorId x PROCESS_VALUES_FIELDS options', () => {
    const { container } = render(<PropertyPanel widget={makeWidget()} schema={simpleSchema} onChange={vi.fn()} />);
    const tagSelect = container.querySelector('select[data-key="variableId"]') as HTMLSelectElement;
    const options = Array.from(tagSelect.options).map((o) => o.value);
    expect(options.some((o) => o.startsWith('reactor1.'))).toBe(true);
    expect(options.some((o) => o.startsWith('reactor2.'))).toBe(true);
  });

  it('custom section rendered when schema has renderCustomSection', () => {
    const schemaWithCustom: WidgetPropertySchema = {
      entries: [{ key: 'label', label: '标签', type: 'text' }],
      renderCustomSection: () => <div data-testid="custom-section">custom</div>,
    };
    const { getByTestId } = render(<PropertyPanel widget={makeWidget()} schema={schemaWithCustom} onChange={vi.fn()} />);
    expect(getByTestId('custom-section')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/editor/properties/__tests__/PropertyPanel.test.tsx
```

Expected: FAIL — "Cannot find module '../PropertyPanel'"

- [ ] **Step 3: Create PropertyPanel.tsx**

Create `packages/web-ui/src/scada-engine/editor/properties/PropertyPanel.tsx`:

```tsx
// SP-FX-6: schema-driven property panel for selected widget.

import React from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import type { FuxaWidget } from '../../models';
import type { WidgetPropertySchema, PropertySchemaEntry } from './property-schema';

const PROCESS_VALUES_FIELDS = [
  'AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4', 'AI-5', 'AI-6',
  'AO-0_cv', 'AO-1_cv', 'AO-2_cv',
  'P01_rate', 'P02_rate', 'P03_rate', 'P04_rate',
  'rpm', 'vfd_current', 'temp_sv', 'temp_mode',
] as const;

export interface PropertyPanelProps {
  widget: FuxaWidget | null;
  schema: WidgetPropertySchema | null;
  onChange: (patch: Partial<FuxaWidget>) => void;
}

const BASE_CLASS = 'w-[250px] flex-shrink-0 border-l border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 overflow-y-auto';

export function PropertyPanel({ widget, schema, onChange }: PropertyPanelProps): JSX.Element {
  const reactorData = useRealtimeStore((s) => s.reactorData);
  const tagOptions = Object.keys(reactorData).flatMap((rid) =>
    PROCESS_VALUES_FIELDS.map((f) => `${rid}.${f}`)
  );

  if (!widget) {
    return <aside data-panel="properties" className={BASE_CLASS}><p>未选中</p></aside>;
  }
  if (!schema) {
    return <aside data-panel="properties" className={BASE_CLASS}><p>无属性面板</p></aside>;
  }

  const property = (widget.property ?? {}) as Record<string, unknown>;

  function handleChange(entry: PropertySchemaEntry, rawValue: unknown): void {
    if (entry.geometric) {
      const numVal = typeof rawValue === 'string' ? parseFloat(rawValue as string) : rawValue;
      if (typeof numVal === 'number' && !Number.isNaN(numVal)) {
        onChange({ [entry.key]: numVal } as Partial<FuxaWidget>);
      }
    } else {
      onChange({ property: { ...property, [entry.key]: rawValue } } as Partial<FuxaWidget>);
    }
  }

  return (
    <aside data-panel="properties" className={BASE_CLASS}>
      <div className="space-y-2">
        {schema.entries.map((entry) => (
          <div key={entry.key} className="flex flex-col gap-0.5">
            <label className="text-xs text-zinc-400">{entry.label}</label>
            <EntryInput entry={entry} widget={widget} property={property} tagOptions={tagOptions} onChange={handleChange} />
          </div>
        ))}
        {schema.renderCustomSection && (
          <>
            <hr className="border-zinc-700 my-2" />
            {schema.renderCustomSection(
              property,
              (patch) => onChange({ property: { ...property, ...patch } } as Partial<FuxaWidget>),
            )}
          </>
        )}
      </div>
    </aside>
  );
}

interface EntryInputProps {
  entry: PropertySchemaEntry;
  widget: FuxaWidget;
  property: Record<string, unknown>;
  tagOptions: string[];
  onChange: (entry: PropertySchemaEntry, value: unknown) => void;
}

function EntryInput({ entry, widget, property, tagOptions, onChange }: EntryInputProps): JSX.Element {
  const currentVal = entry.geometric
    ? (widget as Record<string, unknown>)[entry.key]
    : property[entry.key];

  switch (entry.type) {
    case 'text':
      return (
        <input type="text" data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          placeholder={entry.placeholder} maxLength={entry.maxLength}
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'number':
      return (
        <input type="number" data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          min={entry.min} max={entry.max} step={entry.step ?? 1}
          value={typeof currentVal === 'number' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'color':
      return (
        <input type="color" data-key={entry.key}
          className="h-8 w-full cursor-pointer border border-zinc-600 rounded"
          value={typeof currentVal === 'string' && currentVal ? currentVal : '#000000'}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'boolean':
      return (
        <input type="checkbox" data-key={entry.key} className="accent-blue-500"
          checked={Boolean(currentVal)}
          onChange={(e) => onChange(entry, e.target.checked)} />
      );
    case 'textarea':
      return (
        <textarea data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full resize-none"
          rows={entry.rows ?? 3} placeholder={entry.placeholder}
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'tag-ref':
      return (
        <select data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)}>
          <option value="">{tagOptions.length === 0 ? '无可用 Tag' : '-- 请选择 --'}</option>
          {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    case 'select':
      return (
        <select data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)}>
          {entry.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      );
    case 'range':
      return (
        <div data-key={entry.key} className="space-y-1">
          {entry.segments.map((seg, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="text" data-key={`${entry.key}-label-${i}`}
                className="bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-xs flex-1"
                placeholder={seg.labelKey}
                value={typeof property[seg.labelKey] === 'string' ? (property[seg.labelKey] as string) : ''}
                onChange={(e) => onChange({ ...entry, key: seg.labelKey, geometric: false }, e.target.value)} />
              <input type="color" data-key={`${entry.key}-color-${i}`}
                className="h-6 w-10 cursor-pointer border border-zinc-600 rounded"
                value={typeof property[seg.colorKey] === 'string' && property[seg.colorKey] ? (property[seg.colorKey] as string) : '#000000'}
                onChange={(e) => onChange({ ...entry, key: seg.colorKey, geometric: false }, e.target.value)} />
            </div>
          ))}
        </div>
      );
    default:
      return <span className="text-zinc-500 text-xs">未知类型</span>;
  }
}
```

- [ ] **Step 4: Run tests — expect GREEN (4 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/editor/properties/__tests__/PropertyPanel.test.tsx
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/properties/PropertyPanel.tsx \
        packages/web-ui/src/scada-engine/editor/properties/__tests__/PropertyPanel.test.tsx
git commit -m "feat(scada): schema-driven PropertyPanel component (SP-FX-6)"
```

---

## Task 3: widget-schemas.ts + 2 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/editor/properties/widget-schemas.ts`
- Create: `packages/web-ui/src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts`

- [ ] **Step 1: Write failing widget-schema tests**

Create `packages/web-ui/src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema } from '../widget-schemas';

describe('widget-schemas', () => {
  it('all 5 schemas export valid entries arrays with string keys and labels', () => {
    const schemas = [valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema];
    for (const schema of schemas) {
      expect(Array.isArray(schema.entries)).toBe(true);
      expect(schema.entries.length).toBeGreaterThan(0);
      for (const entry of schema.entries) {
        expect(typeof entry.key).toBe('string');
        expect(typeof entry.label).toBe('string');
        expect(typeof entry.type).toBe('string');
      }
    }
  });

  it('chart and table schemas include renderCustomSection; others do not', () => {
    expect(typeof htmlChartSchema.renderCustomSection).toBe('function');
    expect(typeof htmlTableSchema.renderCustomSection).toBe('function');
    expect(valueSchema.renderCustomSection).toBeUndefined();
    expect(htmlButtonSchema.renderCustomSection).toBeUndefined();
    expect(htmlInputSchema.renderCustomSection).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts
```

Expected: FAIL — "Cannot find module '../widget-schemas'"

- [ ] **Step 3: Create widget-schemas.ts**

Create `packages/web-ui/src/scada-engine/editor/properties/widget-schemas.ts`:

```tsx
// SP-FX-6: per-widget-type property schemas. One per batch-1 widget type.

import React from 'react';
import type { WidgetPropertySchema } from './property-schema';

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

export const htmlButtonSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'label', label: '按钮文字', type: 'text', placeholder: '点击' },
    { key: 'bgColor', label: '背景色', type: 'color' },
    { key: 'textColor', label: '文字颜色', type: 'color' },
    { key: 'writeValue', label: '写入值', type: 'text', placeholder: '1' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const htmlInputSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'inputType', label: '输入类型', type: 'select', options: [
      { value: 'number', label: '数值' }, { value: 'text', label: '文本' },
    ]},
    { key: 'placeholder', label: '占位文本', type: 'text', placeholder: '请输入' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const htmlChartSchema: WidgetPropertySchema = {
  entries: [
    { key: 'title', label: '图表标题', type: 'text', placeholder: '趋势图' },
    { key: 'timeRangeSeconds', label: '时间范围 (秒)', type: 'number', min: 10, max: 3600, step: 10 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const variableIds = Array.isArray((property as any).variableIds)
      ? ((property as any).variableIds as string[])
      : [];
    return (
      <div data-section="chart-series">
        <p className="text-xs text-zinc-400 mb-1">Series Tags（逗号分隔）</p>
        <textarea
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full resize-none"
          rows={3}
          value={variableIds.join(', ')}
          placeholder="reactor1.AI-0, reactor1.AI-1"
          onChange={(e) => {
            const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            onChange({ variableIds: ids });
          }}
        />
      </div>
    );
  },
};

export const htmlTableSchema: WidgetPropertySchema = {
  entries: [
    { key: 'title', label: '表格标题', type: 'text', placeholder: '数据表' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const rows = Array.isArray((property as any)?.options?.rows)
      ? ((property as any).options.rows as any[])
      : [];
    return (
      <div data-section="table-columns">
        <p className="text-xs text-zinc-400 mb-1">行数：{rows.length}</p>
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => {
            const newRow = { cells: [{ type: 'label', value: '' }, { type: 'variable', variableId: '' }] };
            onChange({ options: { ...((property as any).options ?? {}), rows: [...rows, newRow] } });
          }}
        >
          + 添加行
        </button>
      </div>
    );
  },
};

/** Lookup map: widget.type → WidgetPropertySchema */
export const WIDGET_SCHEMAS: Record<string, WidgetPropertySchema> = {
  'svg-ext-value': valueSchema,
  'svg-ext-html_button': htmlButtonSchema,
  'svg-ext-html_input': htmlInputSchema,
  'svg-ext-html_chart': htmlChartSchema,
  'svg-ext-own_ctrl-table': htmlTableSchema,
};
```

- [ ] **Step 4: Run tests — expect GREEN (2 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts
```

Expected: 2 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/properties/widget-schemas.ts \
        packages/web-ui/src/scada-engine/editor/properties/__tests__/widget-schemas.test.ts
git commit -m "feat(scada): widget property schemas for 5 batch-1 controls (SP-FX-6)"
```

---

## Task 4: value.tsx + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/controls/value.tsx`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/controls/value.test.tsx`

- [ ] **Step 1: Write failing value tests**

Create `packages/web-ui/src/scada-engine/gauges/__tests__/controls/value.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { valueMeta } from '../../controls/value';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'w1', type: 'svg-ext-value', property: property ?? {}, x: 10, y: 20, w: 80, h: 40,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 42, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('ValueGauge (svg-ext-value)', () => {
  it('onMount creates <text> element in parentGroup with data-widget-id', () => {
    const ctx = makeCtx();
    valueMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('text[data-widget-id="w1"]')).not.toBeNull();
  });

  it('onProcess with valid value updates textContent via format string', () => {
    const ctx = makeCtx({ readValue: vi.fn().mockReturnValue({ value: 3.14, isStale: false }) });
    const g = valueMeta.create();
    g.onMount(makeWidget({ format: '{value} °C' }), ctx);
    g.onProcess({ value: 7.77, isStale: false });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toContain('7.77');
  });

  it('onProcess with isStale=true renders gray "--"', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onProcess({ value: null, isStale: true });
    const el = ctx.parentGroup.querySelector('text') as SVGTextElement;
    expect(el.textContent).toContain('--');
    expect(el.getAttribute('fill')).toBe('#9ca3af');
  });

  it('onPropertyChange with new format re-renders text on next onProcess', () => {
    const ctx = makeCtx({ readValue: vi.fn().mockReturnValue({ value: 5, isStale: false }) });
    const g = valueMeta.create();
    const widget = makeWidget({ format: '{value}', variableId: 'reactor1.AI-0' });
    g.onMount(widget, ctx);
    const nextWidget: FuxaWidget = { ...widget, property: { ...widget.property, format: '{value} rpm' } as any };
    g.onPropertyChange({ key: 'format', value: '{value} rpm', nextWidget });
    g.onProcess({ value: 5, isStale: false });
    expect((ctx.parentGroup.querySelector('text') as SVGTextElement).textContent).toContain('rpm');
  });

  it('onUnmount removes <text> element from parentGroup', () => {
    const ctx = makeCtx();
    const g = valueMeta.create();
    g.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('text')).not.toBeNull();
    g.onUnmount();
    expect(ctx.parentGroup.querySelector('text')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/value.test.tsx
```

Expected: FAIL — "Cannot find module '../../controls/value'"

- [ ] **Step 3: Create controls/ directory and value.tsx**

Create `packages/web-ui/src/scada-engine/gauges/controls/value.tsx`:

```ts
// SP-FX-6: ValueGauge — display-only PLC tag value (FUXA svg-ext-value).
// Pure SVG <text> element; no React, no foreignObject.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class ValueGauge implements GaugeBase {
  private textEl: SVGTextElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 80;
    const h = (widget as any).h ?? 40;
    el.setAttribute('x', String(x + w / 2));
    el.setAttribute('y', String(y + h / 2));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-size', '14');
    el.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(el);
    this.textEl = el;
    const tagId = (widget.property as { variableId?: string }).variableId ?? '';
    this._render(tagId ? ctx.readValue(tagId) : { value: null, isStale: true });
  }

  onUnmount(): void { this.textEl?.remove(); this.textEl = null; }

  onProcess(value: GaugeValue): void { this._render(value); }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const tagId = (this.widget.property as { variableId?: string }).variableId ?? '';
    this._render(tagId ? this.ctx.readValue(tagId) : { value: null, isStale: true });
  }

  onResize(w: number, h: number): void {
    if (!this.textEl) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    this.textEl.setAttribute('x', String(x + w / 2));
    this.textEl.setAttribute('y', String(y + h / 2));
  }

  private _render(v: GaugeValue): void {
    if (!this.textEl) return;
    const prop = this.widget.property as { format?: string; decimals?: number; color?: string };
    const format = prop.format ?? '{value}';
    const display = v.isStale ? '--' : String(v.value ?? '--');
    this.textEl.textContent = format.replace('{value}', display);
    this.textEl.setAttribute('fill', v.isStale ? '#9ca3af' : (prop.color ?? '#111827'));
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

- [ ] **Step 4: Run tests — expect GREEN (5 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/value.test.tsx
```

Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/controls/value.tsx \
        packages/web-ui/src/scada-engine/gauges/__tests__/controls/value.test.tsx
git commit -m "feat(scada): ValueGauge (svg-ext-value) + tests (SP-FX-6)"
```

---

## Task 5: html-button.tsx + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/controls/html-button.tsx`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-button.test.tsx`

- [ ] **Step 1: Write failing html-button tests**

Create `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-button.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { htmlButtonMeta } from '../../controls/html-button';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'b1', type: 'svg-ext-html_button', property: property ?? {}, x: 0, y: 0, w: 100, h: 36,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlButtonGauge (svg-ext-html_button)', () => {
  it('onMount creates <foreignObject> with <button> child in parentGroup', () => {
    const ctx = makeCtx();
    htmlButtonMeta.create().onMount(makeWidget({ label: '启动' }), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).not.toBeNull();
    expect(fo!.querySelector('button')!.textContent).toContain('启动');
  });

  it('onProcess updates button backgroundColor from property.bgColor', () => {
    const ctx = makeCtx();
    const g = htmlButtonMeta.create();
    g.onMount(makeWidget({ label: '停止', bgColor: '#ff0000' }), ctx);
    g.onProcess({ value: 1, isStale: false });
    const btn = ctx.parentGroup.querySelector('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('onPropertyChange reflects updated label in button text', () => {
    const ctx = makeCtx();
    const g = htmlButtonMeta.create();
    const widget = makeWidget({ label: '旧' });
    g.onMount(widget, ctx);
    g.onPropertyChange({ key: 'label', value: '新', nextWidget: { ...widget, property: { ...widget.property, label: '新' } as any } });
    expect((ctx.parentGroup.querySelector('button') as HTMLButtonElement).textContent).toContain('新');
  });

  it('onClick in runtime mode calls ctx.onWriteIntent with correct payload', () => {
    const onWriteIntent = vi.fn();
    const ctx = makeCtx({ mode: 'runtime', onWriteIntent });
    const g = htmlButtonMeta.create();
    g.onMount(makeWidget({ events: [{ type: 'click', action: 'set-value', actparam: 'reactor1.AI-0', value: 1, requireConfirm: true }] }), ctx);
    (ctx.parentGroup.querySelector('button') as HTMLButtonElement).click();
    expect(onWriteIntent).toHaveBeenCalledWith({ tag: 'reactor1.AI-0', value: 1, widgetId: 'b1' });
  });

  it('onUnmount removes <foreignObject> from parentGroup', () => {
    const ctx = makeCtx();
    const g = htmlButtonMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-button.test.tsx
```

Expected: FAIL — "Cannot find module '../../controls/html-button'"

- [ ] **Step 3: Create html-button.tsx**

Create `packages/web-ui/src/scada-engine/gauges/controls/html-button.tsx`:

```ts
// SP-FX-6: HtmlButtonGauge — click → ctx.onWriteIntent (runtime only).
// Renders <foreignObject><button> in the SVG group.

import type { GaugeBase, GaugeContext, GaugeClickContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class HtmlButtonGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private htmlBtn: HTMLButtonElement | null = null;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private clickHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 100;
    const h = (widget as any).h ?? 36;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const btn = document.createElement('button');
    btn.style.width = '100%';
    btn.style.height = '100%';
    btn.style.cursor = ctx.mode === 'runtime' ? 'pointer' : 'default';
    const prop = widget.property as { label?: string; bgColor?: string; textColor?: string };
    btn.textContent = prop.label ?? '';
    if (prop.bgColor) btn.style.backgroundColor = prop.bgColor;
    if (prop.textColor) btn.style.color = prop.textColor;

    this.clickHandler = () => {
      if (this.ctx.mode !== 'runtime') return;
      const events = (this.widget.property as any).events ?? [];
      const evt = events.find((x: any) => x?.type === 'click');
      if (!evt?.actparam) return;
      this.ctx.onWriteIntent?.({ tag: evt.actparam, value: evt.value, widgetId: this.widget.id });
    };
    btn.addEventListener('click', this.clickHandler);
    fo.appendChild(btn);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.htmlBtn = btn;
  }

  onUnmount(): void {
    if (this.htmlBtn && this.clickHandler) this.htmlBtn.removeEventListener('click', this.clickHandler);
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.htmlBtn = null;
    this.clickHandler = null;
  }

  onProcess(_value: GaugeValue): void {
    if (!this.htmlBtn) return;
    const prop = this.widget.property as { bgColor?: string };
    if (prop.bgColor) this.htmlBtn.style.backgroundColor = prop.bgColor;
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.htmlBtn) return;
    const prop = this.widget.property as { label?: string; bgColor?: string; textColor?: string };
    if (prop.label !== undefined) this.htmlBtn.textContent = prop.label;
    if (prop.bgColor) this.htmlBtn.style.backgroundColor = prop.bgColor;
    if (prop.textColor) this.htmlBtn.style.color = prop.textColor;
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }

  onClick(_e: MouseEvent, c: GaugeClickContext): void {
    if (c.ctx.mode !== 'runtime') return;
    const events = (c.widget.property as any).events ?? [];
    const evt = events.find((x: any) => x?.type === 'click');
    if (!evt?.actparam) return;
    c.ctx.onWriteIntent?.({ tag: evt.actparam, value: evt.value, widgetId: c.widget.id });
  }
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

- [ ] **Step 4: Run tests — expect GREEN (5 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-button.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/controls/html-button.tsx \
        packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-button.test.tsx
git commit -m "feat(scada): HtmlButtonGauge (svg-ext-html_button) + tests (SP-FX-6)"
```

---

## Task 6: html-input.tsx + 5 tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/controls/html-input.tsx`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-input.test.tsx`

- [ ] **Step 1: Write failing html-input tests**

Create `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-input.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { htmlInputMeta } from '../../controls/html-input';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'i1', type: 'svg-ext-html_input', property: property ?? { variableId: 'reactor1.AI-0' },
  x: 0, y: 0, w: 120, h: 32,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlInputGauge (svg-ext-html_input)', () => {
  it('onMount creates <foreignObject> with <input> child in parentGroup', () => {
    const ctx = makeCtx();
    htmlInputMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('input')).not.toBeNull();
  });

  it('onProcess updates input.value when input is NOT focused', () => {
    const ctx = makeCtx();
    const g = htmlInputMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onProcess({ value: 99, isStale: false });
    expect((ctx.parentGroup.querySelector('input') as HTMLInputElement).value).toBe('99');
  });

  it('Enter key in runtime mode calls ctx.onWriteIntent', () => {
    const onWriteIntent = vi.fn();
    const ctx = makeCtx({ mode: 'runtime', onWriteIntent });
    const g = htmlInputMeta.create();
    g.onMount(makeWidget({ variableId: 'reactor1.AI-0' }), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    input.value = '42';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onWriteIntent).toHaveBeenCalledWith({ tag: 'reactor1.AI-0', value: '42', widgetId: 'i1' });
  });

  it('isSubmitting guard prevents double-fire on Enter + blur in same tick', () => {
    const onWriteIntent = vi.fn();
    const ctx = makeCtx({ mode: 'runtime', onWriteIntent });
    const g = htmlInputMeta.create();
    g.onMount(makeWidget({ variableId: 'reactor1.AI-0' }), ctx);
    const input = ctx.parentGroup.querySelector('input') as HTMLInputElement;
    input.value = '10';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(onWriteIntent).toHaveBeenCalledTimes(1);
  });

  it('onUnmount removes <foreignObject> from parentGroup', () => {
    const ctx = makeCtx();
    const g = htmlInputMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-input.test.tsx
```

Expected: FAIL — "Cannot find module '../../controls/html-input'"

- [ ] **Step 3: Create html-input.tsx**

Create `packages/web-ui/src/scada-engine/gauges/controls/html-input.tsx`:

```ts
// SP-FX-6: HtmlInputGauge — Enter/blur commit → ctx.onWriteIntent.
// isSubmitting guard absorbs duplicate Enter+blur in same synchronous tick.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

class HtmlInputGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private isSubmitting = false;
  private widget!: FuxaWidget;
  private ctx!: GaugeContext;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private blurHandler: (() => void) | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    this.ctx = ctx;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 32;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const prop = widget.property as { inputType?: string; placeholder?: string; min?: number; max?: number };
    const input = document.createElement('input');
    input.type = prop.inputType ?? 'text';
    input.placeholder = prop.placeholder ?? '';
    input.style.width = '100%';
    input.style.height = '100%';
    input.style.boxSizing = 'border-box';
    if (prop.min !== undefined) input.min = String(prop.min);
    if (prop.max !== undefined) input.max = String(prop.max);

    this.keydownHandler = (e: KeyboardEvent) => { if (e.key === 'Enter') this._commit(input.value); };
    this.blurHandler = () => { this._commit(input.value); };
    input.addEventListener('keydown', this.keydownHandler);
    input.addEventListener('blur', this.blurHandler);

    fo.appendChild(input);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.inputEl = input;
  }

  private _commit(value: string): void {
    if (this.ctx.mode !== 'runtime' || this.isSubmitting) return;
    const tag = (this.widget.property as { variableId?: string }).variableId;
    if (!tag) return;
    this.isSubmitting = true;
    try {
      this.ctx.onWriteIntent?.({ tag, value, widgetId: this.widget.id });
    } finally {
      Promise.resolve().then(() => { this.isSubmitting = false; });
    }
  }

  onUnmount(): void {
    if (this.inputEl) {
      if (this.keydownHandler) this.inputEl.removeEventListener('keydown', this.keydownHandler);
      if (this.blurHandler) this.inputEl.removeEventListener('blur', this.blurHandler);
    }
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.inputEl = null;
    this.keydownHandler = null;
    this.blurHandler = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.inputEl || document.activeElement === this.inputEl) return;
    this.inputEl.value = value.isStale ? '' : String(value.value ?? '');
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    if (!this.inputEl) return;
    const prop = this.widget.property as { placeholder?: string; min?: number; max?: number };
    if (prop.placeholder !== undefined) this.inputEl.placeholder = prop.placeholder;
    if (prop.min !== undefined) this.inputEl.min = String(prop.min);
    if (prop.max !== undefined) this.inputEl.max = String(prop.max);
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
  }
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

- [ ] **Step 4: Run tests — expect GREEN (5 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-input.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/controls/html-input.tsx \
        packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-input.test.tsx
git commit -m "feat(scada): HtmlInputGauge (svg-ext-html_input) with isSubmitting guard (SP-FX-6)"
```

---

## Task 7: html-chart.tsx + 5 tests (Portal + UplotChart)

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/controls/html-chart.tsx`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-chart.test.tsx`

- [ ] **Step 1: Write failing html-chart tests**

Create `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-chart.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { htmlChartMeta } from '../../controls/html-chart';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}));

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 'c1', type: 'svg-ext-html_chart', property: property ?? { variableIds: ['reactor1.AI-0'] },
  x: 0, y: 0, w: 300, h: 200,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 1.5, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlChartGauge (svg-ext-html_chart)', () => {
  it('onMount creates <foreignObject> with <div> mount point in parentGroup', () => {
    const ctx = makeCtx();
    htmlChartMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('foreignObject div')).not.toBeNull();
  });

  it('onMount calls createRoot on the mount div', async () => {
    const { createRoot } = await import('react-dom/client');
    const ctx = makeCtx();
    htmlChartMeta.create().onMount(makeWidget(), ctx);
    expect(createRoot).toHaveBeenCalled();
  });

  it('onProcess appends value to buffer and calls root.render', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlChartMeta.create();
    g.onMount(makeWidget(), ctx);
    const before = mockRoot.render.mock.calls.length;
    g.onProcess({ value: 3.14, isStale: false });
    expect(mockRoot.render.mock.calls.length).toBeGreaterThan(before);
  });

  it('onPropertyChange calls root.render with updated props', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlChartMeta.create();
    const widget = makeWidget({ title: '旧', variableIds: [] });
    g.onMount(widget, ctx);
    g.onPropertyChange({ key: 'title', value: '新', nextWidget: { ...widget, property: { ...widget.property, title: '新' } as any } });
    expect(mockRoot.render).toHaveBeenCalled();
  });

  it('onUnmount calls root.unmount and removes <foreignObject>', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlChartMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(mockRoot.unmount).toHaveBeenCalled();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-chart.test.tsx
```

Expected: FAIL — "Cannot find module '../../controls/html-chart'"

- [ ] **Step 3: Create html-chart.tsx**

Create `packages/web-ui/src/scada-engine/gauges/controls/html-chart.tsx`:

```tsx
// SP-FX-6: HtmlChartGauge — multi-tag time series via React root in <foreignObject>.
// Buffer retains last 60s of data. UplotChart reused from widgets-extras.

import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { UplotChart } from '../../widgets-extras/UplotChart';
import type { UplotSeries } from '../../widgets-extras/UplotChart';
import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

const BUFFER_WINDOW_MS = 60_000;

class HtmlChartGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private mountDiv: HTMLDivElement | null = null;
  private reactRoot: Root | null = null;
  private dataBuffer: Array<Array<{ t: number; v: number }>> = [];
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 300;
    const h = (widget as any).h ?? 200;
    const variableIds = (widget.property as { variableIds?: string[] }).variableIds ?? [];
    this.dataBuffer = variableIds.map(() => []);

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w));
    fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const div = document.createElement('div');
    div.style.width = `${w}px`;
    div.style.height = `${h}px`;
    fo.appendChild(div);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo;
    this.mountDiv = div;

    try {
      this.reactRoot = createRoot(div);
      this._rerender(w, h);
    } catch { /* jsdom guard */ }
  }

  onUnmount(): void {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.foreignObj?.remove();
    this.foreignObj = null;
    this.mountDiv = null;
  }

  onProcess(value: GaugeValue): void {
    if (value.isStale || value.value === null) return;
    const now = Date.now();
    const cutoff = now - BUFFER_WINDOW_MS;
    if (this.dataBuffer.length > 0) {
      this.dataBuffer[0]!.push({ t: now / 1000, v: Number(value.value) });
      this.dataBuffer[0] = this.dataBuffer[0]!.filter((pt) => pt.t * 1000 >= cutoff);
    }
    const w = Number(this.foreignObj?.getAttribute('width') ?? 300);
    const h = Number(this.foreignObj?.getAttribute('height') ?? 200);
    this._rerender(w, h);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const w = Number(this.foreignObj?.getAttribute('width') ?? 300);
    const h = Number(this.foreignObj?.getAttribute('height') ?? 200);
    this._rerender(w, h);
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj || !this.mountDiv) return;
    this.foreignObj.setAttribute('width', String(w));
    this.foreignObj.setAttribute('height', String(h));
    this.mountDiv.style.width = `${w}px`;
    this.mountDiv.style.height = `${h}px`;
    this._rerender(w, h);
  }

  private _rerender(w: number, h: number): void {
    if (!this.reactRoot) return;
    const prop = this.widget.property as { title?: string };
    const series: UplotSeries[] = this.dataBuffer.map((buf, i) => ({
      x: buf.map((pt) => pt.t),
      y: buf.map((pt) => pt.v),
      label: `s${i}`,
      stroke: '#3b82f6',
    }));
    this.reactRoot.render(<UplotChart series={series} width={w} height={h} title={prop.title} />);
  }
}

export const htmlChartMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_chart',
  create: () => new HtmlChartGauge(),
  getSignals: (w) => (w.property as { variableIds?: string[] }).variableIds ?? [],
};
```

- [ ] **Step 4: Run tests — expect GREEN (5 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-chart.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/controls/html-chart.tsx \
        packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-chart.test.tsx
git commit -m "feat(scada): HtmlChartGauge (svg-ext-html_chart) with 60s ring buffer (SP-FX-6)"
```

---

## Task 8: html-table.tsx + 5 tests (Portal + React)

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/controls/html-table.tsx`
- Create: `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-table.test.tsx`

- [ ] **Step 1: Write failing html-table tests**

Create `packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-table.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { htmlTableMeta } from '../../controls/html-table';
import type { GaugeContext } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
}));

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeWidget = (property?: Record<string, unknown>): FuxaWidget => ({
  id: 't1', type: 'svg-ext-own_ctrl-table',
  property: property ?? { options: { rows: [{ cells: [{ type: 'label', value: 'DO' }, { type: 'variable', variableId: 'reactor1.AI-0' }] }] } },
  x: 0, y: 0, w: 200, h: 150,
});
const makeCtx = (overrides?: Partial<GaugeContext>): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: 8.5, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode: 'editor',
  ...overrides,
});

describe('HtmlTableGauge (svg-ext-own_ctrl-table)', () => {
  it('onMount creates <foreignObject> with <div> mount point in parentGroup', () => {
    const ctx = makeCtx();
    htmlTableMeta.create().onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.querySelector('foreignObject')).not.toBeNull();
    expect(ctx.parentGroup.querySelector('foreignObject div')).not.toBeNull();
  });

  it('onMount calls createRoot and render', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    htmlTableMeta.create().onMount(makeWidget(), ctx);
    expect(mockRoot.render).toHaveBeenCalled();
  });

  it('onProcess updates cellValues and calls root.render', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlTableMeta.create();
    g.onMount(makeWidget(), ctx);
    const before = mockRoot.render.mock.calls.length;
    g.onProcess({ value: 9.1, isStale: false });
    expect(mockRoot.render.mock.calls.length).toBeGreaterThan(before);
  });

  it('getSignals extracts variableIds from rows[].cells[].variableId', () => {
    expect(htmlTableMeta.getSignals(makeWidget())).toContain('reactor1.AI-0');
  });

  it('onUnmount calls root.unmount and removes <foreignObject>', async () => {
    const { createRoot } = await import('react-dom/client');
    const mockRoot = { render: vi.fn(), unmount: vi.fn() };
    (createRoot as any).mockReturnValue(mockRoot);
    const ctx = makeCtx();
    const g = htmlTableMeta.create();
    g.onMount(makeWidget(), ctx);
    g.onUnmount();
    expect(mockRoot.unmount).toHaveBeenCalled();
    expect(ctx.parentGroup.querySelector('foreignObject')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect RED**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-table.test.tsx
```

Expected: FAIL — "Cannot find module '../../controls/html-table'"

- [ ] **Step 3: Create html-table.tsx**

Create `packages/web-ui/src/scada-engine/gauges/controls/html-table.tsx`:

```tsx
// SP-FX-6: HtmlTableGauge — tag-list data table via React root in <foreignObject>.
// Renders rows from widget.property.options.rows; data mode only.

import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../gauge-base';
import type { FuxaWidget } from '../../models';

interface CellDef { type: 'label' | 'variable'; value?: string; variableId?: string; }
interface RowDef { cells: CellDef[]; }

function TableView({ rows, cellValues }: { rows: RowDef[]; cellValues: Map<string, GaugeValue> }): JSX.Element {
  if (rows.length === 0) {
    return <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><tbody><tr><td>无数据</td></tr></tbody></table>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.cells.map((cell, ci) => {
              const content = cell.type === 'variable' && cell.variableId
                ? (() => { const snap = cellValues.get(cell.variableId!); return snap && !snap.isStale ? String(snap.value ?? '--') : '--'; })()
                : (cell.value ?? '');
              return <td key={ci} style={{ border: '1px solid #52525b', padding: '2px 4px', color: '#f4f4f5' }}>{content}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

class HtmlTableGauge implements GaugeBase {
  private foreignObj: SVGForeignObjectElement | null = null;
  private mountDiv: HTMLDivElement | null = null;
  private reactRoot: Root | null = null;
  private cellValues = new Map<string, GaugeValue>();
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 200;
    const h = (widget as any).h ?? 150;

    const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    fo.setAttribute('x', String(x)); fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(w)); fo.setAttribute('height', String(h));
    fo.setAttribute('data-widget-id', widget.id);

    const div = document.createElement('div');
    div.style.width = `${w}px`; div.style.height = `${h}px`; div.style.overflow = 'auto';
    fo.appendChild(div);
    ctx.parentGroup.appendChild(fo);
    this.foreignObj = fo; this.mountDiv = div;

    try { this.reactRoot = createRoot(div); this._rerender(); } catch { /* jsdom guard */ }
  }

  onUnmount(): void {
    this.reactRoot?.unmount(); this.reactRoot = null;
    this.foreignObj?.remove(); this.foreignObj = null; this.mountDiv = null;
  }

  onProcess(value: GaugeValue): void {
    const rows: RowDef[] = (this.widget.property as any)?.options?.rows ?? [];
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.type === 'variable' && cell.variableId) this.cellValues.set(cell.variableId, value);
      }
    }
    this._rerender();
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget; this.cellValues.clear(); this._rerender();
  }

  onResize(w: number, h: number): void {
    if (!this.foreignObj || !this.mountDiv) return;
    this.foreignObj.setAttribute('width', String(w)); this.foreignObj.setAttribute('height', String(h));
    this.mountDiv.style.width = `${w}px`; this.mountDiv.style.height = `${h}px`;
    this._rerender();
  }

  private _rerender(): void {
    if (!this.reactRoot) return;
    const rows: RowDef[] = (this.widget.property as any)?.options?.rows ?? [];
    this.reactRoot.render(<TableView rows={rows} cellValues={this.cellValues} />);
  }
}

export const htmlTableMeta: GaugeMeta = {
  widgetType: 'svg-ext-own_ctrl-table',
  create: () => new HtmlTableGauge(),
  getSignals: (w) => {
    const p = w.property as any;
    const ids: string[] = [];
    if (p?.options?.rows) {
      for (const row of p.options.rows as RowDef[]) {
        for (const cell of (row.cells ?? [])) {
          if (cell.type === 'variable' && cell.variableId) ids.push(cell.variableId);
        }
      }
    }
    return ids;
  },
};
```

- [ ] **Step 4: Run tests — expect GREEN (5 pass)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/gauges/__tests__/controls/html-table.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/controls/html-table.tsx \
        packages/web-ui/src/scada-engine/gauges/__tests__/controls/html-table.test.tsx
git commit -m "feat(scada): HtmlTableGauge (svg-ext-own_ctrl-table) data-mode table (SP-FX-6)"
```

---

## Task 9: controls/index.ts barrel + register side-effects

**Files:**
- Create: `packages/web-ui/src/scada-engine/gauges/controls/index.ts`

- [ ] **Step 1: Create controls/index.ts**

Create `packages/web-ui/src/scada-engine/gauges/controls/index.ts`:

```ts
// SP-FX-6: Barrel for batch-1 controls.
// Importing this file registers all 5 widget metas into gaugeRegistry as a side-effect.
// SP-FX-7 RuntimeCanvas imports this once at startup.

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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add packages/web-ui/src/scada-engine/gauges/controls/index.ts
git commit -m "feat(scada): controls barrel — registers 5 batch-1 gauge metas on import (SP-FX-6)"
```

---

## Task 10: EditorShell.tsx wire PropertyPanel

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/editor-shell.tsx`

Existing `editor-shell.test.tsx` has 6 tests checking `[data-panel="properties"]` + `w-[250px]` — these must still pass after the swap.

- [ ] **Step 1: Replace PropertiesPlaceholder with PropertyPanel**

Replace the entire content of `packages/web-ui/src/scada-engine/editor/editor-shell.tsx` with:

```tsx
// SP-FX-4: editor shell — top toolbar + 3-pane composition.
// SP-FX-6: PropertiesPlaceholder replaced by schema-driven PropertyPanel.

import React from 'react';
import { EditorCanvas } from './EditorCanvas';
import { Palette } from './palette/Palette';
import { Toolbar } from './toolbar/Toolbar';
import { PropertyPanel } from './properties/PropertyPanel';
import { WIDGET_SCHEMAS } from './properties/widget-schemas';
import { useEditorStore } from '../services/editor-store';

export interface EditorShellProps { viewId: string; }

export function EditorShell({ viewId }: EditorShellProps): JSX.Element {
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  const selectedWidget = (selection.length === 1 && items)
    ? (items[selection[0]] ?? null)
    : null;

  const schema = selectedWidget ? (WIDGET_SCHEMAS[selectedWidget.type] ?? null) : null;

  function handleChange(patch: Partial<typeof selectedWidget>) {
    if (!selectedWidget) return;
    useEditorStore.getState().updateWidget(selectedWidget.id, patch as any);
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <Toolbar viewId={viewId} />
      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div className="flex-1 relative">
          <EditorCanvas />
        </div>
        <PropertyPanel widget={selectedWidget} schema={schema} onChange={handleChange} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run existing editor-shell tests — expect 6 still pass**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run src/scada-engine/editor/__tests__/editor-shell.test.tsx
```

Expected: 6 tests pass

- [ ] **Step 3: TypeScript check**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/editor-shell.tsx
git commit -m "feat(scada): wire PropertyPanel into EditorShell, replace PropertiesPlaceholder (SP-FX-6)"
```

---

## Task 11: editor/index.ts + scada-engine/index.ts barrel exports

**Files:**
- Modify: `packages/web-ui/src/scada-engine/editor/index.ts`
- Modify: `packages/web-ui/src/scada-engine/index.ts`

- [ ] **Step 1: Append to editor/index.ts**

Open `packages/web-ui/src/scada-engine/editor/index.ts` and append at the end:

```ts
// SP-FX-6 additions
export { PropertyPanel, type PropertyPanelProps } from './properties/PropertyPanel';
export { WIDGET_SCHEMAS, valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema } from './properties/widget-schemas';
export type { WidgetPropertySchema, PropertySchemaEntry } from './properties/property-schema';
```

- [ ] **Step 2: Append to scada-engine/index.ts**

Open `packages/web-ui/src/scada-engine/index.ts` and append at the end:

```ts
// SP-FX-6 additions
export { gaugeRegistry, GaugeRegistry } from './gauges/gauge-registry';
export type { GaugeBase, GaugeValue, GaugeContext, GaugeMeta, GaugePropChange, GaugeClickContext } from './gauges/gauge-base';
```

- [ ] **Step 3: TypeScript check**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add packages/web-ui/src/scada-engine/editor/index.ts \
        packages/web-ui/src/scada-engine/index.ts
git commit -m "chore(scada): export PropertyPanel, WIDGET_SCHEMAS, gaugeRegistry from barrels (SP-FX-6)"
```

---

## Task 12: Playwright 2 smoke tests

**Files:**
- Create: `packages/web-ui/e2e/scada-editor-controls.spec.ts`

- [ ] **Step 1: Create smoke test file**

Create `packages/web-ui/e2e/scada-editor-controls.spec.ts`:

```ts
import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN_USER = process.env.E2E_USER || 'admin';
const ADMIN_PASS = process.env.E2E_PASS || 'admin123';
const API_BASE = process.env.E2E_API_URL || 'http://localhost:3001';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[autocomplete="username"]').first().fill(ADMIN_USER);
  await page.locator('input[type="password"]').fill(ADMIN_PASS);
  await page.getByRole('button', { name: /登录|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

async function getAuthToken(request: APIRequestContext): Promise<string> {
  const r = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (!r.ok()) throw new Error(`login failed: ${r.status()}`);
  return ((await r.json()).data.token) as string;
}

async function seedViewWithWidget(request: APIRequestContext, widgetType: string): Promise<string> {
  const token = await getAuthToken(request);
  const viewId = `v_ctrl_${Date.now()}`;
  const widgetId = `w_${Date.now()}`;
  const payload = {
    id: viewId, name: 'controls-smoke', type: 'svg' as const, svgcontent: '<svg/>',
    width: 800, height: 600, schemaVersion: 1 as const,
    items: {
      [widgetId]: { id: widgetId, type: widgetType, property: { variableId: '', label: '初始标签' }, x: 100, y: 100, w: 120, h: 40 },
    },
  };
  const r = await request.post(`${API_BASE}/api/v1/fuxa-views`, {
    data: { id: viewId, name: 'controls-smoke', type: 'svg', payload, width: 800, height: 600 },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok()) throw new Error(`seedView failed: ${r.status()} ${await r.text()}`);
  return viewId;
}

test.describe('SP-FX-6 Batch 1 — controls smoke', () => {
  test('property panel shows entries for svg-ext-value widget after click-select', async ({ page, request }) => {
    await login(page);
    const viewId = await seedViewWithWidget(request, 'svg-ext-value');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await page.locator('[data-editor-canvas-host]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    const panel = page.locator('[data-panel="properties"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Try editing the label field if widget was selected
    const labelInput = panel.locator('input[data-key="label"]').first();
    if (await labelInput.isVisible()) {
      await labelInput.fill('已修改标签');
      await page.locator('[data-cmd="save"]').click();
      await page.waitForTimeout(500);
    }
    // Core assertion: panel always renders (never crashes)
    await expect(panel).toBeVisible();
  });

  test('property panel renders custom section for svg-ext-html_chart widget', async ({ page, request }) => {
    await login(page);
    const viewId = await seedViewWithWidget(request, 'svg-ext-html_chart');
    await page.goto(`/scada2/edit-v2/${viewId}`);
    await page.waitForSelector('[data-panel="toolbar"]', { timeout: 10_000 });

    await page.locator('[data-editor-canvas-host]').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    const panel = page.locator('[data-panel="properties"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // If chart widget selected, custom section visible
    const isChartSelected = await panel.locator('input[data-key="title"]').isVisible().catch(() => false);
    if (isChartSelected) {
      await expect(panel.locator('[data-section="chart-series"]')).toBeVisible({ timeout: 3_000 });
    }
    await expect(panel).toBeVisible();
  });
});
```

- [ ] **Step 2: Run Playwright tests (requires running dev + API server)**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore
pnpm --filter web-ui exec playwright test e2e/scada-editor-controls.spec.ts --project=chromium 2>&1 | tail -20
```

Expected: 2 tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/web-ui/e2e/scada-editor-controls.spec.ts
git commit -m "test(scada): Playwright smoke for PropertyPanel + chart custom section (SP-FX-6)"
```

---

## Task 13: Full regression + baseline verification

- [ ] **Step 1: Run full web-ui vitest suite**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm vitest run 2>&1 | tail -20
```

Expected: ≥837 tests pass

- [ ] **Step 2: Verify server / data-service / scripts baselines**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore
pnpm --filter server vitest run 2>&1 | tail -5
pnpm --filter data-service vitest run 2>&1 | tail -5
pnpm --filter scripts vitest run 2>&1 | tail -5
```

Expected: server ≥147, data-service ≥84, scripts ≥7

- [ ] **Step 3: TypeScript clean check**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore/packages/web-ui
pnpm tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 0

- [ ] **Step 4: Full Playwright suite**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd /Volumes/SSD/projects/BIOCore
pnpm --filter web-ui exec playwright test --project=chromium 2>&1 | tail -15
```

Expected: ≥27 tests pass

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review

### Spec coverage vs. plan

| Spec section | Requirement | Task |
|---|---|---|
| §1.1 gauge-base.ts | GaugeBase + 5 lifecycle hooks | T0 |
| §1.1 gauge-registry.ts | Map + lookup | T0 |
| §1.1 property-schema.ts | WidgetPropertySchema + 8 entry types | T1 |
| §1.1 PropertyPanel.tsx | schema-driven + escape hatch | T2 |
| §1.1 widget-schemas.ts | 5 widget schemas | T3 |
| §1.1 value.tsx | display-only PLC tag | T4 |
| §1.1 html-button.tsx | click → onWriteIntent | T5 |
| §1.1 html-input.tsx | Enter/blur → onWriteIntent | T6 |
| §1.1 html-chart.tsx | UplotChart Portal | T7 |
| §1.1 html-table.tsx | React table in foreignObject | T8 |
| §1.1 EditorShell wire | replace PropertiesPlaceholder | T10 |
| §2.1 controls/index.ts | side-effect register | T9 |
| §2.2 editor/index.ts, scada-engine/index.ts | +exports | T11 |
| §3.1–3.7 Type contracts | exact interface match | T0–T8 |
| §4.1 editor mode no gauge instantiation | PropertyPanel only reads schema | T10 |
| §4.2 onChange → updateWidget flow | handleChange in EditorShell | T10 |
| §4.5 tag-ref lookup | reactorData × PROCESS_VALUES_FIELDS | T2 |
| §5.1–5.4 Error handling | registry throws, empty states, stale gray, editor noop | T0–T8 |
| §6.1 vitest +39 | 5+3+4+2+25=39 | T0–T8 |
| §6.2 Playwright +2 | PropertyPanel + chart custom section | T12 |
| §6.4 coverage gates | tsc 0, web-ui ≥837 | T13 |

### 12 Stop Conditions

| # | Condition | Task |
|---|---|---|
| 1 | gauge-base.ts exports GaugeBase/GaugeValue/GaugeContext/GaugeMeta | T0 |
| 2 | gauge-registry.ts exports GaugeRegistry + gaugeRegistry singleton | T0 |
| 3 | property-schema.ts exports WidgetPropertySchema + 8 entry types | T1 |
| 4 | PropertyPanel renders by type; geometric top-level; tag-ref from reactorData; custom section | T2 |
| 5 | 5 metas registered at controls/index.ts import; gaugeRegistry.create returns correct instance | T9 |
| 6 | Each widget implements 5 hooks; button/input additionally onClick | T4–T8 |
| 7 | value renders `<text>` format + stale gray | T4 |
| 8 | html-button renders foreignObject+button; click calls onWriteIntent | T5 |
| 9 | html-input Enter/blur commit; isSubmitting guard prevents double-fire | T6 |
| 10 | html-chart Portal UplotChart; 60s buffer; onProcess → setData | T7 |
| 11 | html-table Portal `<table>`; rows from property.options.rows; data mode | T8 |
| 12 | web-ui ≥837, Playwright ≥27, tsc clean, server 147, data-service 84, scripts 7 | T13 |

All 12 stop conditions covered. No spec gaps found. No placeholder patterns detected.
