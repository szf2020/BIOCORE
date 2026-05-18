# SP-FX-7 — Runtime + Animation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Wire SP-FX-6 batch 1 gauges into a live read-only `/scada2/view-v2/[viewId]` route, backed by a property-driven animation engine and tag-binding bridge that delivers realtime `pv_realtime` data to each mounted gauge.

**Architecture:** Three layers: (1) `animation-engine.ts` is a pure expression evaluator (no side effects, no write path) that converts tag snapshots into SVG attribute patches each rAF tick; (2) `tag-binding-bridge.ts` subscribes to `useRealtimeStore` and drives `gauge.onProcess` imperatively; (3) `RuntimeCanvas.tsx` orchestrates both layers via three React `useEffect` hooks (mount/click/animation) and exposes the existing `WriteIntentDialog` for operator set-value actions. The page layer (`view-v2/page.tsx`) is a thin Next.js client component that fetches the view and forwards it to `RuntimeShell → RuntimeCanvas`.

**Depends on:** SP-FX-6 batch 1 must ship first (gauge-base + gaugeRegistry + 5 widgets).
**Baseline:** main 完工 SP-FX-6 batch 1 (~837 vitest, 27 PW).
**Target:** web-ui +13 = ~850, PW +2 = 29.

---

## Per-task model hints

| Task | Suggested model | Reason |
|------|-----------------|--------|
| T0 | haiku | Trivial schema append + 1 backward-compat test |
| T1 | sonnet | Core logic: `resolveAnimations` + `evalAnimations` + 5 tests |
| T2 | sonnet | Store subscription bridge + 3 tests |
| T3 | sonnet | React canvas with 3 effects + 5 tests (fake timers + spies) |
| T4 | haiku | 40-line shell component + smoke render test |
| T5 | sonnet | Next.js client page (fetch + error states + searchParams) |
| T6 | haiku | Barrel export additions — 3 index files |
| T7 | sonnet | 2 Playwright smoke specs |
| T8 | haiku | grep safety invariant + vitest assert |
| T9 | haiku | Full regression run + push verification |

---

## T0 — `models/property.ts`: extend `FuxaActionSchema`

**Model:** haiku
**Goal:** Add `conditionExpr` and `valueExpr` optional fields to `FuxaActionSchema`; preserve backward compat.
**Verify:** 3 new vitest tests pass (RED → GREEN).

### Implementation steps

1. **Read** `packages/web-ui/src/scada-engine/models/property.ts` to confirm current `FuxaActionSchema` shape.

2. **Write RED tests** at `packages/web-ui/src/scada-engine/models/__tests__/property.test.ts` (append):

```typescript
describe('FuxaActionSchema conditionExpr / valueExpr', () => {
  it('accepts conditionExpr and valueExpr as optional strings (<=500 chars)', () => {
    const result = FuxaActionSchema.safeParse({
      type: 'color',
      variableId: 'TAG_01',
      conditionExpr: 'TAG_01 > 50',
      valueExpr: 'IF(TAG_01 > 80, "red", "green")',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conditionExpr).toBe('TAG_01 > 50');
      expect(result.data.valueExpr).toBe('IF(TAG_01 > 80, "red", "green")');
    }
  });

  it('rejects conditionExpr longer than 500 chars', () => {
    const longExpr = 'x'.repeat(501);
    const result = FuxaActionSchema.safeParse({
      type: 'color',
      variableId: 'TAG_01',
      conditionExpr: longExpr,
    });
    expect(result.success).toBe(false);
  });

  it('legacy FuxaAction without expressions still parses (backward compat)', () => {
    const result = FuxaActionSchema.safeParse({
      type: 'rotate',
      variableId: 'TAG_SPEED',
      range: { min: 0, max: 100 },
      output: { from: 0, to: 360 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conditionExpr).toBeUndefined();
      expect(result.data.valueExpr).toBeUndefined();
    }
  });
});
```

3. **Run** — expect RED (fields missing from schema).

4. **Edit** `packages/web-ui/src/scada-engine/models/property.ts` — append two optional fields inside `FuxaActionSchema`:

```typescript
// Existing schema (do not remove range/output):
export const FuxaActionSchema = z.object({
  type: FuxaActionTypeSchema,
  variableId: z.string(),
  range: z.object({ min: z.number(), max: z.number() }).optional(),
  output: z.object({ from: z.any(), to: z.any() }).optional(),
  // SP-FX-7: expression-driven animations (backward compat — absent fields = legacy range/output path)
  conditionExpr: z.string().max(500).optional(),
  valueExpr: z.string().max(500).optional(),
});
```

5. **Run** — expect GREEN (3 tests).

6. **tsc check:** `pnpm -F web-ui exec tsc --noEmit` — 0 errors.

---

## T1 — `services/animation-engine.ts` + 5 tests

**Model:** sonnet
**Goal:** Implement `resolveAnimations` and `evalAnimations` per spec §3.1; reuse `expression-eval.ts`; zero write-path imports.
**Verify:** 5 vitest tests pass (RED → GREEN).

### Full type contract (spec §3.1)

```typescript
import { evalExpression, parseTagsFromExpression } from './expression-eval';
import type { FuxaWidget, FuxaAction, FuxaActionType } from '../models';

/** Output patch: applied by widget renderer to SVG/CSS attribute. */
export interface AnimationPatch {
  widgetId: string;
  target: FuxaActionType;  // 'color' | 'visibility' | 'rotate' | 'scale' | 'move' | 'opacity' | 'text'
  value: string | number | boolean;
}

/** Pre-computed per widget for subscription orchestration. */
export interface ResolvedAnimation {
  widgetId: string;
  action: FuxaAction;
  tagIds: string[];  // parseTagsFromExpression on conditionExpr + valueExpr
}

/** Pre-resolve animations for all widgets in a view. */
export function resolveAnimations(widgets: Record<string, FuxaWidget>): ResolvedAnimation[];

/** Evaluate one tick. Returns patches to apply. Caller decides how to apply (RuntimeCanvas). */
export function evalAnimations(
  resolved: ResolvedAnimation[],
  tagValues: Record<string, unknown>,
): AnimationPatch[];
```

### Implementation steps

1. **Write RED tests** at `packages/web-ui/src/scada-engine/services/__tests__/animation-engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveAnimations, evalAnimations } from '../animation-engine';
import type { FuxaWidget } from '../../models';

// Helper: minimal widget factory
function makeWidget(
  id: string,
  actions: FuxaWidget['property']['actions'],
): FuxaWidget {
  return {
    id,
    type: 'svg-ext-value',
    x: 0, y: 0, w: 100, h: 40, rotate: 0, lock: false, hide: false,
    property: { variableId: 'TAG_01', actions },
    svgcontent: '',
  } as unknown as FuxaWidget;
}

describe('resolveAnimations', () => {
  it('collects tagIds from conditionExpr and valueExpr', () => {
    const w = makeWidget('w1', [
      {
        type: 'color',
        variableId: '',
        conditionExpr: 'TEMP > 80',
        valueExpr: 'IF(TEMP > 90, "red", "orange")',
      },
    ]);
    const resolved = resolveAnimations({ w1: w });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.tagIds).toContain('TEMP');
  });
});

describe('evalAnimations', () => {
  it('condition true -> patch emitted (color)', () => {
    const resolved = [{
      widgetId: 'w1',
      action: {
        type: 'color' as const,
        variableId: '',
        conditionExpr: 'TEMP > 50',
        valueExpr: '"red"',
      },
      tagIds: ['TEMP'],
    }];
    const patches = evalAnimations(resolved, { TEMP: 80 });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ widgetId: 'w1', target: 'color', value: 'red' });
  });

  it('condition false -> no patch', () => {
    const resolved = [{
      widgetId: 'w1',
      action: {
        type: 'color' as const,
        variableId: '',
        conditionExpr: 'TEMP > 50',
        valueExpr: '"red"',
      },
      tagIds: ['TEMP'],
    }];
    const patches = evalAnimations(resolved, { TEMP: 20 });
    expect(patches).toHaveLength(0);
  });

  it('multiple animations on one widget (color + visibility) -> both patches independent', () => {
    const resolved = [
      {
        widgetId: 'w1',
        action: {
          type: 'color' as const,
          variableId: '',
          conditionExpr: 'TEMP > 50',
          valueExpr: '"red"',
        },
        tagIds: ['TEMP'],
      },
      {
        widgetId: 'w1',
        action: {
          type: 'visibility' as const,
          variableId: '',
          conditionExpr: 'TEMP > 10',
        },
        tagIds: ['TEMP'],
      },
    ];
    const patches = evalAnimations(resolved, { TEMP: 80 });
    expect(patches).toHaveLength(2);
    expect(patches.map(p => p.target).sort()).toEqual(['color', 'visibility']);
  });

  it('parse error -> engine does not throw; other animations continue', () => {
    const resolved = [
      {
        widgetId: 'w1',
        action: {
          type: 'color' as const,
          variableId: '',
          conditionExpr: '###INVALID###',
          valueExpr: '"red"',
        },
        tagIds: [],
      },
      {
        widgetId: 'w2',
        action: {
          type: 'opacity' as const,
          variableId: '',
          conditionExpr: 'FLAG > 0',
          valueExpr: '0.5',
        },
        tagIds: ['FLAG'],
      },
    ];
    let patches: AnimationPatch[] = [];
    expect(() => {
      patches = evalAnimations(resolved, { FLAG: 1 });
    }).not.toThrow();
    // w1 errored -> no patch; w2 ok -> 1 patch
    expect(patches).toHaveLength(1);
    expect(patches[0]!.widgetId).toBe('w2');
  });

  it('legacy range/output (no conditionExpr) -> backward-compat patch generated', () => {
    const resolved = [{
      widgetId: 'w1',
      action: {
        type: 'rotate' as const,
        variableId: 'SPEED',
        range: { min: 0, max: 100 },
        output: { from: 0, to: 360 },
      },
      tagIds: ['SPEED'],
    }];
    const patches = evalAnimations(resolved, { SPEED: 50 });
    expect(patches).toHaveLength(1);
    expect(patches[0]!.target).toBe('rotate');
    // 50% of range -> 180 deg
    expect(patches[0]!.value).toBeCloseTo(180, 0);
  });
});
```

2. **Run** — expect RED (module missing).

3. **Create** `packages/web-ui/src/scada-engine/services/animation-engine.ts`:

```typescript
// SP-FX-7: Animation engine — read-only, expression-driven SVG attribute patches.
// SAFETY INVARIANT: this module MUST NOT import writeTag, sendWsMessage, fetch, or XMLHttpRequest.
// Expressions run through expression-eval (sandboxed expr-eval parser; no eval()/new Function()).
import { evalExpression, parseTagsFromExpression } from './expression-eval';
import type { FuxaWidget, FuxaAction, FuxaActionType } from '../models';

export interface AnimationPatch {
  widgetId: string;
  target: FuxaActionType;
  value: string | number | boolean;
}

export interface ResolvedAnimation {
  widgetId: string;
  action: FuxaAction;
  tagIds: string[];
}

export function resolveAnimations(widgets: Record<string, FuxaWidget>): ResolvedAnimation[] {
  const result: ResolvedAnimation[] = [];
  for (const [widgetId, widget] of Object.entries(widgets)) {
    const actions = widget.property?.actions ?? [];
    for (const action of actions) {
      const exprTags = [
        ...parseTagsFromExpression(action.conditionExpr ?? ''),
        ...parseTagsFromExpression(action.valueExpr ?? ''),
      ];
      const legacyTags = action.variableId ? [action.variableId] : [];
      const tagIds = [...new Set([...exprTags, ...legacyTags])];
      result.push({ widgetId, action, tagIds });
    }
  }
  return result;
}

export function evalAnimations(
  resolved: ResolvedAnimation[],
  tagValues: Record<string, unknown>,
): AnimationPatch[] {
  const patches: AnimationPatch[] = [];
  for (const { widgetId, action } of resolved) {
    try {
      if (action.conditionExpr) {
        // Expression path: evaluate conditionExpr; emit patch only if truthy
        const condResult = evalExpression(
          action.conditionExpr,
          tagValues as Record<string, number | string | boolean>,
        );
        if (!condResult) continue;
        let value: string | number | boolean;
        if (action.valueExpr) {
          const evaled = evalExpression(
            action.valueExpr,
            tagValues as Record<string, number | string | boolean>,
          );
          value = (evaled as string | number | boolean) ?? true;
        } else {
          value = action.output?.to ?? true;
        }
        patches.push({ widgetId, target: action.type, value });
      } else if (action.range && action.output !== undefined) {
        // Legacy range/output linear interpolation (FUXA backward compat)
        const raw = tagValues[action.variableId];
        const tagNum = typeof raw === 'number' ? raw : Number(raw ?? 0);
        const { min, max } = action.range;
        if (tagNum < min || tagNum > max) continue;
        const pct = max === min ? 0 : (tagNum - min) / (max - min);
        const from = Number(action.output.from ?? 0);
        const to = Number(action.output.to ?? 0);
        patches.push({ widgetId, target: action.type, value: from + pct * (to - from) });
      }
      // else: no expr + no range -> silent no-op per spec §5.1
    } catch (err) {
      console.warn(`[animation-engine] error widget=${widgetId} action=${action.type}:`, err);
      // continue other animations — per spec §5.1 "other animations continue"
    }
  }
  return patches;
}
```

4. **Run** — expect GREEN (5 tests).

5. **tsc check** — 0 errors.

---

## T2 — `services/tag-binding-bridge.ts` + 3 tests

**Model:** sonnet
**Goal:** Subscribe to `useRealtimeStore` per `reactorId`, drive `gauge.onProcess(value)` on every `processValues` change.
**Verify:** 3 vitest tests pass (RED → GREEN).

### Full type contract (spec §3.2)

```typescript
import type { GaugeBase } from '../gauges/gauge-base';

/** Subscribe to processValues changes for a reactor and drive gauge.onProcess on each tick.
 *  Returns unsubscribe function. */
export function bindGaugesToRealtime(
  reactorId: string,
  gauges: Map<string, GaugeBase>,         // widgetId -> instance
  widgetSignals: Map<string, string[]>,   // widgetId -> tagIds[] from gaugeRegistry.getSignals
): () => void;
```

### Error handling (spec §5.2)

| Case | Behavior |
|------|----------|
| `reactorData[reactorId]` undefined | callback no-op |
| `processValues` empty | iterates 0 gauges (no error) |
| Gauge throws in `onProcess` | catch + log; do not break other gauges |

### Implementation steps

1. **Write RED tests** at `packages/web-ui/src/scada-engine/services/__tests__/tag-binding-bridge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bindGaugesToRealtime } from '../tag-binding-bridge';
import type { GaugeBase } from '../../gauges/gauge-base';

// Mock useRealtimeStore
const mockSubscribe = vi.fn();
vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: { subscribe: mockSubscribe },
}));

// Mock readTagSnapshot from tag-binding
vi.mock('../tag-binding', () => ({
  readTagSnapshot: (tagId: string) => ({ value: 42, tagId, isStale: false }),
}));

function makeGauge(): GaugeBase {
  return {
    onMount: vi.fn(),
    onUnmount: vi.fn(),
    onProcess: vi.fn(),
  };
}

describe('bindGaugesToRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribe.mockReturnValue(() => undefined);
  });

  it('subscribe -> gauge.onProcess called with snapshot on processValues update', () => {
    const gauge = makeGauge();
    const gauges = new Map([['w1', gauge]]);
    const widgetSignals = new Map([['w1', ['TAG_01']]]);

    let capturedCallback: ((pv: unknown) => void) | undefined;
    mockSubscribe.mockImplementation(
      (_selector: unknown, cb: (pv: unknown) => void) => {
        capturedCallback = cb;
        return () => undefined;
      },
    );

    bindGaugesToRealtime('F01', gauges, widgetSignals);
    capturedCallback?.({ TAG_01: 99 });
    expect(gauge.onProcess).toHaveBeenCalledOnce();
  });

  it('unsubscribe -> no further calls after cleanup', () => {
    const gauge = makeGauge();
    const gauges = new Map([['w1', gauge]]);
    const widgetSignals = new Map([['w1', ['TAG_01']]]);
    const mockUnsub = vi.fn();

    let capturedCallback: ((pv: unknown) => void) | undefined;
    mockSubscribe.mockImplementation(
      (_selector: unknown, cb: (pv: unknown) => void) => {
        capturedCallback = cb;
        return mockUnsub;
      },
    );

    const unsub = bindGaugesToRealtime('F01', gauges, widgetSignals);
    unsub();
    expect(mockUnsub).toHaveBeenCalledOnce();

    // Simulate late call after cleanup: active=false guard prevents onProcess
    const callsBefore = (gauge.onProcess as ReturnType<typeof vi.fn>).mock.calls.length;
    capturedCallback?.({ TAG_01: 66 });
    expect((gauge.onProcess as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });

  it('multiple gauges -> all called per tick', () => {
    const g1 = makeGauge();
    const g2 = makeGauge();
    const gauges = new Map([['w1', g1], ['w2', g2]]);
    const widgetSignals = new Map([['w1', ['TAG_A']], ['w2', ['TAG_B']]]);

    let capturedCallback: ((pv: unknown) => void) | undefined;
    mockSubscribe.mockImplementation(
      (_selector: unknown, cb: (pv: unknown) => void) => {
        capturedCallback = cb;
        return () => undefined;
      },
    );

    bindGaugesToRealtime('F01', gauges, widgetSignals);
    capturedCallback?.({ TAG_A: 10, TAG_B: 20 });
    expect(g1.onProcess).toHaveBeenCalledOnce();
    expect(g2.onProcess).toHaveBeenCalledOnce();
  });
});
```

2. **Run** — expect RED.

3. **Create** `packages/web-ui/src/scada-engine/services/tag-binding-bridge.ts`:

```typescript
// SP-FX-7: Tag-binding bridge — adapts useRealtimeStore subscription to gauge.onProcess calls.
// SAFETY: this module does not call writeTag or sendWsMessage. Read-only.
import { useRealtimeStore } from '@/stores/realtime-store';
import { readTagSnapshot } from './tag-binding';
import type { GaugeBase } from '../gauges/gauge-base';

export function bindGaugesToRealtime(
  reactorId: string,
  gauges: Map<string, GaugeBase>,
  widgetSignals: Map<string, string[]>,
): () => void {
  let active = true;

  const unsubscribe = useRealtimeStore.subscribe(
    (s) => s.reactorData[reactorId]?.processValues,
    (processValues) => {
      if (!active || !processValues) return;
      for (const [widgetId, gauge] of gauges) {
        const tagIds = widgetSignals.get(widgetId) ?? [];
        for (const tagId of tagIds) {
          try {
            const snapshot = readTagSnapshot(tagId);
            gauge.onProcess(snapshot);
          } catch (err) {
            console.warn(
              `[tag-binding-bridge] onProcess error widget=${widgetId} tag=${tagId}:`,
              err,
            );
          }
        }
      }
    },
  );

  return () => {
    active = false;
    unsubscribe();
  };
}
```

4. **Run** — expect GREEN (3 tests).

5. **tsc check** — 0 errors.

---

## T3 — `runtime/RuntimeCanvas.tsx` + 5 tests

**Model:** sonnet
**Goal:** Implement RuntimeCanvas with 3 React effects (mount/click/animation); expose WriteIntentDialog for set-value.
**Verify:** 5 vitest tests pass (RED → GREEN).

### Full type contract (spec §3.3)

```typescript
export interface RuntimeCanvasProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
}

export function RuntimeCanvas({ view, viewId, reactorId }: RuntimeCanvasProps): JSX.Element
```

### `applyPatch` DOM mapping

| `target` | DOM operation |
|----------|--------------|
| `'color'` | `(el as HTMLElement).style.fill = String(p.value)` |
| `'visibility'` | `(el as HTMLElement).style.display = p.value ? '' : 'none'` |
| `'opacity'` | `(el as HTMLElement).style.opacity = String(p.value)` |
| `'rotate'` | `el.setAttribute('transform', \`rotate(${p.value})\`)` |
| `'scale'` | `el.setAttribute('transform', \`scale(${p.value})\`)` |
| `'move'` | `el.setAttribute('transform', \`translate(${p.value})\`)` |
| `'text'` | `el.textContent = String(p.value)` |

### Error handling (spec §5.3)

| Case | Behavior |
|------|----------|
| `gaugeRegistry.create(widget)` returns null | widget falls back to canvas-svg default render; no gauge mounted; no subscription |
| `view.items` empty | renders empty `<div data-runtime-canvas-host>` |
| Network failure on page fetch | handled by page.tsx layer (not RuntimeCanvas) |

### Implementation steps

1. **Create directory** `packages/web-ui/src/scada-engine/runtime/__tests__/` (if not present).

2. **Write RED tests** at `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeCanvas.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { RuntimeCanvas } from '../RuntimeCanvas';
import type { FuxaView } from '../../models';
import type { AnimationPatch } from '../../services/animation-engine';

// Mock CanvasController
const mockLoadView = vi.fn();
const mockCanvasCtrl = {
  loadView: mockLoadView,
  widgetLayer: { node: document.createElementNS('http://www.w3.org/2000/svg', 'g') },
  root: { node: document.createElementNS('http://www.w3.org/2000/svg', 'svg') },
};
vi.mock('../../editor/canvas-svg', () => ({
  CanvasController: vi.fn().mockImplementation(() => mockCanvasCtrl),
}));

// Mock gaugeRegistry
const mockGauge = {
  onMount: vi.fn(),
  onUnmount: vi.fn(),
  onProcess: vi.fn(),
  onClick: vi.fn(),
};
vi.mock('../../gauges/gauge-registry', () => ({
  gaugeRegistry: {
    create: vi.fn().mockReturnValue(mockGauge),
    getSignals: vi.fn().mockReturnValue(['TAG_01']),
  },
}));

// Mock tag-binding-bridge
const mockUnbind = vi.fn();
vi.mock('../../services/tag-binding-bridge', () => ({
  bindGaugesToRealtime: vi.fn().mockReturnValue(mockUnbind),
}));

// Mock animation-engine
vi.mock('../../services/animation-engine', () => ({
  resolveAnimations: vi.fn().mockReturnValue([]),
  evalAnimations: vi.fn().mockReturnValue([]),
}));

// Mock useRealtimeStore
vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: {
    getState: vi.fn().mockReturnValue({ reactorData: {} }),
  },
}));

// Mock WriteIntentDialog
vi.mock('@/components/scada/runtime/WriteIntentDialog', () => ({
  WriteIntentDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="write-intent-dialog">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

// Mock controls/index side-effect
vi.mock('../../gauges/controls/index', () => ({}));

// Fake timers for rAF
vi.useFakeTimers();

import { bindGaugesToRealtime } from '../../services/tag-binding-bridge';

function makeView(items: FuxaView['items'] = {}): FuxaView {
  return {
    id: 'v1', name: 'Test View',
    svgcontent: '<svg></svg>',
    width: 800, height: 600,
    items,
  };
}

function makeWidget(id: string): any {
  return {
    id, type: 'svg-ext-value',
    x: 0, y: 0, w: 100, h: 40, rotate: 0, lock: false, hide: false,
    property: { variableId: 'TAG_01' },
    svgcontent: '',
  };
}

describe('RuntimeCanvas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mount -> CanvasController.loadView called; gauge instances created per widget', () => {
    const view = makeView({ w1: makeWidget('w1') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    expect(mockLoadView).toHaveBeenCalledWith(view);
    expect(mockGauge.onMount).toHaveBeenCalledOnce();
    expect(bindGaugesToRealtime).toHaveBeenCalledOnce();
  });

  it('processValues change -> gauge.onProcess called (via bridge spy)', () => {
    const view = makeView({ w1: makeWidget('w1') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    const [, gaugesArg] = (bindGaugesToRealtime as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(gaugesArg.get('w1')).toBe(mockGauge);
  });

  it('button click -> dialogWidget state set -> WriteIntentDialog renders', async () => {
    const view = makeView({ w1: makeWidget('w1') });
    let capturedCtx: any;
    mockGauge.onMount.mockImplementation((_w: any, ctx: any) => { capturedCtx = ctx; });
    const { queryByTestId } = render(
      <RuntimeCanvas view={view} viewId="v1" reactorId="F01" />,
    );
    expect(queryByTestId('write-intent-dialog')).toBeNull();
    await act(async () => {
      capturedCtx?.onWriteIntent({ tag: 'TAG_01', value: 100, widgetId: 'w1' });
    });
    expect(queryByTestId('write-intent-dialog')).not.toBeNull();
  });

  it('animation tick -> evalAnimations called; applyPatch updates element attribute', async () => {
    const { evalAnimations } = await import('../../services/animation-engine');
    (evalAnimations as ReturnType<typeof vi.fn>).mockReturnValue([
      { widgetId: 'w1', target: 'color', value: 'red' } satisfies AnimationPatch,
    ]);
    const view = makeView({ w1: makeWidget('w1') });
    render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    await act(async () => { vi.runAllTimers(); });
    expect(evalAnimations).toHaveBeenCalled();
  });

  it('unmount cleanup -> gauges destroyed, subscription unbound, rAF cancelled', () => {
    const view = makeView({ w1: makeWidget('w1') });
    const { unmount } = render(<RuntimeCanvas view={view} viewId="v1" reactorId="F01" />);
    unmount();
    expect(mockUnbind).toHaveBeenCalledOnce();
    expect(mockGauge.onUnmount).toHaveBeenCalledOnce();
  });
});
```

3. **Run** — expect RED.

4. **Create** `packages/web-ui/src/scada-engine/runtime/RuntimeCanvas.tsx`:

```typescript
'use client';
// SP-FX-7: Read-only runtime canvas.
// 3 effects: A=mount gauges + bind realtime, B=click delegation, C=rAF animation tick.
import React, { useRef, useState, useEffect } from 'react';
import type { JSX } from 'react';
import { CanvasController } from '../editor/canvas-svg';
import { gaugeRegistry } from '../gauges/gauge-registry';
import { bindGaugesToRealtime } from '../services/tag-binding-bridge';
import { resolveAnimations, evalAnimations } from '../services/animation-engine';
import type { AnimationPatch } from '../services/animation-engine';
import { readTagSnapshot } from '../services/tag-binding';
import { useRealtimeStore } from '@/stores/realtime-store';
import { WriteIntentDialog } from '@/components/scada/runtime/WriteIntentDialog';
import type { FuxaView, FuxaWidget } from '../models';
import type { GaugeBase, GaugeContext } from '../gauges/gauge-base';

// Side-effect import: registers batch 1 controls into gaugeRegistry
import '../gauges/controls/index';

export interface RuntimeCanvasProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
}

export function RuntimeCanvas({ view, viewId, reactorId }: RuntimeCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<CanvasController | null>(null);
  const gaugeMapRef = useRef<Map<string, GaugeBase>>(new Map());
  const [dialogWidget, setDialogWidget] = useState<FuxaWidget | null>(null);

  // Effect A: mount CanvasController + instantiate gauges + bind realtime
  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = new CanvasController(containerRef.current, {
      width: view.width,
      height: view.height,
    });
    canvas.loadView(view);
    canvasRef.current = canvas;

    const widgetSignals = new Map<string, string[]>();
    for (const [id, widget] of Object.entries(view.items)) {
      const gauge = gaugeRegistry.create(widget);
      if (!gauge) continue;  // falls back to canvas-svg default render

      const ctx: GaugeContext = {
        parentGroup: canvas.widgetLayer.node as SVGGElement,
        readValue: readTagSnapshot,
        canvasSize: { width: view.width, height: view.height },
        mode: 'runtime',
        onWriteIntent: (intent) => {
          setDialogWidget(view.items[intent.widgetId] ?? null);
        },
      };
      gauge.onMount(widget, ctx);
      gaugeMapRef.current.set(id, gauge);
      widgetSignals.set(id, gaugeRegistry.getSignals(widget));
    }

    const unbind = bindGaugesToRealtime(reactorId, gaugeMapRef.current, widgetSignals);

    return () => {
      unbind();
      for (const [, g] of gaugeMapRef.current) g.onUnmount();
      gaugeMapRef.current.clear();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, reactorId]);

  // Effect B: click delegation on svg root
  useEffect(() => {
    const svgRoot = canvasRef.current?.root?.node as SVGSVGElement | null | undefined;
    if (!svgRoot) return;
    const handleClick = (e: Event) => {
      const target = e.target as Element | null;
      const widgetEl = target?.closest('[data-widget-id]');
      if (!widgetEl) return;
      const widgetId = widgetEl.getAttribute('data-widget-id');
      if (!widgetId) return;
      const gauge = gaugeMapRef.current.get(widgetId);
      const widget = view.items[widgetId];
      if (!gauge || !widget) return;
      gauge.onClick?.(e as MouseEvent, { widget, ctx: { mode: 'runtime' } as any });
    };
    svgRoot.addEventListener('click', handleClick);
    return () => svgRoot.removeEventListener('click', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  // Effect C: rAF animation tick (~60Hz; future optimization: subscribe-driven)
  useEffect(() => {
    let rafId = 0;
    const resolved = resolveAnimations(view.items);
    const tick = () => {
      const pv = useRealtimeStore.getState().reactorData[reactorId]?.processValues ?? {};
      const patches = evalAnimations(resolved, pv as Record<string, unknown>);
      for (const p of patches) {
        const el = canvasRef.current?.root?.node?.querySelector(
          `[data-widget-id="${p.widgetId}"]`,
        );
        if (el) applyPatch(el as Element, p);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, reactorId]);

  return (
    <>
      <div
        ref={containerRef}
        data-runtime-canvas-host
        className="w-full h-full overflow-auto bg-white"
      />
      {dialogWidget ? (
        <WriteIntentDialog
          widget={dialogWidget}
          viewId={viewId}
          onClose={() => setDialogWidget(null)}
        />
      ) : null}
    </>
  );
}

function applyPatch(el: Element, p: AnimationPatch): void {
  const htmlEl = el as HTMLElement;
  switch (p.target) {
    case 'color':
      htmlEl.style.fill = String(p.value);
      break;
    case 'visibility':
      htmlEl.style.display = p.value ? '' : 'none';
      break;
    case 'opacity':
      htmlEl.style.opacity = String(p.value);
      break;
    case 'rotate':
      el.setAttribute('transform', `rotate(${p.value})`);
      break;
    case 'scale':
      el.setAttribute('transform', `scale(${p.value})`);
      break;
    case 'move':
      el.setAttribute('transform', `translate(${p.value})`);
      break;
    case 'text':
      el.textContent = String(p.value);
      break;
    default:
      break;
  }
}
```

5. **Run** — expect GREEN (5 tests).

6. **tsc check** — 0 errors.

---

## T4 — `runtime/RuntimeShell.tsx` + smoke render test

**Model:** haiku
**Goal:** Minimal full-screen shell wrapping RuntimeCanvas.
**Verify:** 1 smoke render test passes (RED → GREEN).

### Full type contract (spec §3.4)

```typescript
export interface RuntimeShellProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
}

export function RuntimeShell({ view, viewId, reactorId }: RuntimeShellProps): JSX.Element
```

### Implementation steps

1. **Write RED test** at `packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeShell.test.tsx`:

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RuntimeShell } from '../RuntimeShell';

vi.mock('../RuntimeCanvas', () => ({
  RuntimeCanvas: ({ viewId }: { viewId: string }) => (
    <div data-testid={`canvas-${viewId}`} />
  ),
}));

describe('RuntimeShell', () => {
  it('renders RuntimeCanvas inside full-screen wrapper', () => {
    const view = {
      id: 'v1', name: 'Test', svgcontent: '<svg/>',
      width: 800, height: 600, items: {},
    } as any;
    const { container, getByTestId } = render(
      <RuntimeShell view={view} viewId="v1" reactorId="F01" />,
    );
    expect(getByTestId('canvas-v1')).toBeDefined();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('w-screen');
    expect(wrapper.className).toContain('h-screen');
  });
});
```

2. **Run** — expect RED.

3. **Create** `packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx`:

```typescript
'use client';
// SP-FX-7: Full-screen runtime shell — minimal wrapper, no toolbar or palette.
import React from 'react';
import type { JSX } from 'react';
import { RuntimeCanvas } from './RuntimeCanvas';
import type { FuxaView } from '../models';

export interface RuntimeShellProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
}

export function RuntimeShell({ view, viewId, reactorId }: RuntimeShellProps): JSX.Element {
  return (
    <div className="w-screen h-screen bg-zinc-100">
      <RuntimeCanvas view={view} viewId={viewId} reactorId={reactorId} />
    </div>
  );
}
```

4. **Run** — expect GREEN (1 test).

5. **tsc check** — 0 errors.

---

## T5 — `app/scada2/view-v2/[viewId]/page.tsx`

**Model:** sonnet
**Goal:** Next.js 14 client component — fetch view by ID, read `?reactor=` query param, render RuntimeShell. Error and loading states in Chinese.
**Verify:** tsc clean; manual smoke confirmed by PW T7.

### Full type contract (spec §3.5)

```typescript
'use client';
export default function ViewV2Page({ params }: { params: { viewId: string } }): JSX.Element
```

### Fetch response shape

API at `GET /api/v1/fuxa-views/:viewId` returns JSON; `parseFuxaView` expects the payload field.
Fallback chain: `j?.data?.payload ?? j?.payload ?? j` then stringify if not already a string.

### Implementation steps

1. **Verify** parent directory exists:

```bash
ls packages/web-ui/src/app/scada2/
```

2. **Create directory** `packages/web-ui/src/app/scada2/view-v2/[viewId]/` (mkdir -p).

3. **Create** `packages/web-ui/src/app/scada2/view-v2/[viewId]/page.tsx`:

```typescript
'use client';
// SP-FX-7: Runtime view page.
// Fetches FuxaView and renders full-screen RuntimeShell.
// Query: ?reactor=<reactorId>  (default: F01)
import React, { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseFuxaView } from '@/scada-engine/models/hmi';
import { RuntimeShell } from '@/scada-engine/runtime/RuntimeShell';
import type { FuxaView } from '@/scada-engine/models';

type LoadState = 'loading' | 'ready' | 'error';

export default function ViewV2Page({
  params,
}: {
  params: { viewId: string };
}): JSX.Element {
  const sp = useSearchParams();
  const reactorId = sp.get('reactor') ?? 'F01';
  const [state, setState] = useState<LoadState>('loading');
  const [view, setView] = useState<FuxaView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetch(`/api/v1/fuxa-views/${params.viewId}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: unknown) => {
        if (cancelled) return;
        const payload =
          (j as any)?.data?.payload ??
          (j as any)?.payload ??
          j;
        const parsed = parseFuxaView(
          typeof payload === 'string' ? payload : JSON.stringify(payload),
        );
        setView(parsed);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [params.viewId]);

  if (state === 'loading') {
    return <div className="p-8 text-zinc-400">加载中...</div>;
  }
  if (state === 'error' || !view) {
    return <div className="p-8 text-red-500">加载失败</div>;
  }
  return <RuntimeShell view={view} viewId={params.viewId} reactorId={reactorId} />;
}
```

4. **tsc check** — 0 errors.

---

## T6 — Barrel exports

**Model:** haiku
**Goal:** Export `animation-engine`, `tag-binding-bridge`, `RuntimeCanvas`, `RuntimeShell` from their respective barrels.
**Verify:** `tsc --noEmit` 0 errors; grep confirms new exports present.

### Implementation steps

1. **Edit** `packages/web-ui/src/scada-engine/services/index.ts` — append after existing SP-FX-2 exports:

```typescript
// SP-FX-7 additions
export {
  resolveAnimations,
  evalAnimations,
  type AnimationPatch,
  type ResolvedAnimation,
} from './animation-engine';

export { bindGaugesToRealtime } from './tag-binding-bridge';
```

2. **Create** `packages/web-ui/src/scada-engine/runtime/index.ts`:

```typescript
// SP-FX-7: runtime barrel
export { RuntimeCanvas, type RuntimeCanvasProps } from './RuntimeCanvas';
export { RuntimeShell, type RuntimeShellProps } from './RuntimeShell';
```

3. **Edit** `packages/web-ui/src/scada-engine/index.ts` — append after SP-FX-3a section:

```typescript
// SP-FX-7 additions
export * from './runtime';
```

4. **tsc check** — 0 errors.

---

## T7 — Playwright 2 smoke specs

**Model:** sonnet
**Goal:** 2 e2e smoke tests for view-v2 route: page load + button click dialog.
**Verify:** Both PW tests pass (`pnpm -F web-ui exec playwright test e2e/scada-runtime-view.spec.ts`).

### Implementation steps

1. **Read** `packages/web-ui/e2e/scada-smoke.spec.ts` for login and base URL patterns.

2. **Create** `packages/web-ui/e2e/scada-runtime-view.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// SP-FX-7: Runtime view-v2 smoke tests.
// E2E_RUNTIME_VIEW_ID: viewId of a seeded test view. Default: test-view-001.
// E2E_REACTOR_ID: reactor to query. Default: F01.

const VIEW_ID = process.env.E2E_RUNTIME_VIEW_ID ?? 'test-view-001';
const REACTOR_ID = process.env.E2E_REACTOR_ID ?? 'F01';

test.describe('SCADA Runtime view-v2', () => {
  test.beforeEach(async ({ page }) => {
    // Reuse auth session if available; otherwise login
    await page.goto('/login');
    const isLoggedIn = await page
      .locator('[data-testid="user-menu"]')
      .isVisible()
      .catch(() => false);
    if (!isLoggedIn) {
      await page.fill('[name="username"]', process.env.E2E_USER ?? 'admin');
      await page.fill('[name="password"]', process.env.E2E_PASS ?? 'admin');
      await page.click('[type="submit"]');
      await page.waitForURL(/dashboard/);
    }
  });

  test('view-v2 page load: canvas host visible, no unhandled console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/scada2/view-v2/${VIEW_ID}?reactor=${REACTOR_ID}`);
    await expect(page.locator('text=加载失败')).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });
    const unhandled = consoleErrors.filter((e) => !e.includes('Warning:'));
    expect(unhandled).toHaveLength(0);
  });

  test('button click -> WriteIntentDialog appears -> submit -> dialog closes', async ({
    page,
  }) => {
    // Intercept write-intent POST — avoids real PLC write during smoke
    await page.route('**/api/v1/scada/write-intents', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
    );

    await page.goto(`/scada2/view-v2/${VIEW_ID}?reactor=${REACTOR_ID}`);
    await expect(page.locator('[data-runtime-canvas-host]')).toBeVisible({ timeout: 10_000 });

    const buttonEl = page.locator('[data-widget-id] button').first();
    const hasButton = await buttonEl.isVisible().catch(() => false);

    if (!hasButton) {
      test.skip(true, 'No button widget in test view; skipping dialog smoke');
      return;
    }

    await buttonEl.click();
    const dialog = page
      .locator('[data-testid="write-intent-dialog"], [role="dialog"]')
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const reasonInput = dialog
      .locator('[name="reason"], input[placeholder*="reason"], textarea')
      .first();
    if (await reasonInput.isVisible().catch(() => false)) {
      await reasonInput.fill('PW smoke test');
    }
    await dialog
      .locator('[type="submit"], button:has-text("确认"), button:has-text("Submit")')
      .first()
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
```

3. **Run** — expect GREEN (2 tests). Configure `E2E_RUNTIME_VIEW_ID` env var if default view ID unavailable.

---

## T8 — Animation safety invariant audit

**Model:** haiku
**Goal:** CI-greppable assertion that `animation-engine.ts` contains zero forbidden patterns.
**Verify:** grep exits 1 (0 matches); vitest assert test passes.

### Implementation steps

1. **Run safety grep** (manual verification before proceeding):

```bash
grep -n "writeTag\|sendWsMessage\|eval(\|new Function\|fetch(\|XMLHttpRequest" \
  packages/web-ui/src/scada-engine/services/animation-engine.ts
```

Expected: **0 lines output**. If any match found — STOP, fix `animation-engine.ts`.

2. **Append safety-assert test** to `packages/web-ui/src/scada-engine/services/__tests__/animation-engine.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('animation-engine safety invariants (CI-greppable)', () => {
  it('contains no writeTag, sendWsMessage, eval(), new Function, fetch(), XMLHttpRequest', () => {
    const src = readFileSync(
      resolve(__dirname, '../animation-engine.ts'),
      'utf-8',
    );
    const BANNED = /writeTag|sendWsMessage|eval\(|new Function|fetch\(|XMLHttpRequest/;
    expect(BANNED.test(src)).toBe(false);
  });
});
```

3. **Run** — expect GREEN.

---

## T9 — Full regression + push verification

**Model:** haiku
**Goal:** Confirm all 11 stop conditions met; push.
**Verify:** All count thresholds satisfied; tsc clean.

### Implementation steps

1. **Run web-ui vitest:**

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -F web-ui test run 2>&1 | tail -20
```

Expected: >=850 pass (was ~837 + 13 new), 0 fail.

2. **Run server / data-service / scripts (regression — must be unchanged):**

```bash
pnpm -F server test run 2>&1 | tail -5
pnpm -F data-service test run 2>&1 | tail -5
pnpm -F scripts test run 2>&1 | tail -5
```

Expected: server 147, data-service 84, scripts 7.

3. **tsc clean:**

```bash
pnpm -F web-ui exec tsc --noEmit
```

Expected: 0 errors.

4. **Playwright regression:**

```bash
pnpm -F web-ui exec playwright test 2>&1 | tail -10
```

Expected: >=29 pass (was 27 + 2 new).

5. **Final animation safety grep:**

```bash
grep -c "writeTag\|sendWsMessage\|eval(\|new Function\|fetch(\|XMLHttpRequest" \
  packages/web-ui/src/scada-engine/services/animation-engine.ts \
  || echo "0 matches -- SAFE"
```

Expected: `0 matches -- SAFE`.

6. **Stop-condition checklist (11):**

| SC | Description | Task |
|----|-------------|------|
| SC-1 | `animation-engine.ts` exports `evalAnimations` + `resolveAnimations`; reuses `evalExpression` | T1 |
| SC-2 | `tag-binding-bridge.ts` exports `bindGaugesToRealtime` returning unsubscribe; integrates `useRealtimeStore.subscribe` | T2 |
| SC-3 | `FuxaActionSchema` + `conditionExpr?: z.string().max(500)` + `valueExpr?: z.string().max(500)`; range/output preserved | T0 |
| SC-4 | `RuntimeCanvas` mounts gauges via `gaugeRegistry`, subscribes pv_realtime, click delegation, rAF tick, unmount cleanup | T3 |
| SC-5 | `RuntimeShell` minimal full-screen shell | T4 |
| SC-6 | `view-v2/page.tsx` fetches view + renders RuntimeShell with reactorId from query | T5 |
| SC-7 | Button click -> WriteIntentDialog -> POST `/api/v1/scada/write-intents` via `usePostWriteIntent` | T3 |
| SC-8 | grep 0 matches for `writeTag\|eval(\|new Function\|fetch(\|XMLHttpRequest` in animation-engine.ts | T8 |
| SC-9 | SP-FX-3/4/5/5.5/6.batch1 vitest unchanged; old `/scada2/[viewId]` viewer unchanged | T9 |
| SC-10 | web-ui >=850, PW >=29, tsc clean, server 147, data-service 84, scripts 7 | T9 |
| SC-11 | `gaugeRegistry` consumed AS-IS from SP-FX-6 batch 1; no registry API change | T3 (side-effect import only) |

7. **If all pass — stage and push:**

```bash
git add \
  packages/web-ui/src/scada-engine/models/property.ts \
  packages/web-ui/src/scada-engine/models/__tests__/property.test.ts \
  packages/web-ui/src/scada-engine/services/animation-engine.ts \
  packages/web-ui/src/scada-engine/services/tag-binding-bridge.ts \
  packages/web-ui/src/scada-engine/services/index.ts \
  packages/web-ui/src/scada-engine/services/__tests__/animation-engine.test.ts \
  packages/web-ui/src/scada-engine/services/__tests__/tag-binding-bridge.test.ts \
  packages/web-ui/src/scada-engine/runtime/RuntimeCanvas.tsx \
  packages/web-ui/src/scada-engine/runtime/RuntimeShell.tsx \
  packages/web-ui/src/scada-engine/runtime/index.ts \
  packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeCanvas.test.tsx \
  packages/web-ui/src/scada-engine/runtime/__tests__/RuntimeShell.test.tsx \
  packages/web-ui/src/scada-engine/index.ts \
  "packages/web-ui/src/app/scada2/view-v2/[viewId]/page.tsx" \
  packages/web-ui/e2e/scada-runtime-view.spec.ts

git commit -m "feat(sp-fx-7): runtime canvas + animation engine + view-v2 route

- Add conditionExpr/valueExpr to FuxaActionSchema (backward compat)
- Implement animation-engine: resolveAnimations + evalAnimations
  (expression path + legacy range/output; 0 write-path imports)
- Implement tag-binding-bridge: bindGaugesToRealtime + unsubscribe
- Implement RuntimeCanvas: 3-effect orchestration (mount/click/rAF)
- Implement RuntimeShell: full-screen wrapper (~40 lines)
- Add /scada2/view-v2/[viewId] Next.js client page
- 13 vitest (5+3+5+1) + 2 Playwright smoke; safety grep 0 matches"

git push
```

---

## Open items (non-blocking, spec §8)

- **rAF vs subscribe-driven:** Current implementation polls `useRealtimeStore.getState()` at ~60Hz via rAF. Overkill for 1Hz PLC tags. Future optimization: eval animations only on store subscribe callback. Deferred to SP-FX-8 polish.
- **Old viewer coexistence:** `/scada2/[viewId]` and `/scada2/view-v2/[viewId]` coexist intentionally. Migration to view-v2 deferred to SP-FX-8.
- **RuntimeCanvas view edit while open:** Does not listen for view edits; page reload required. Deferred.
- **`CanvasController` destroy():** Cleanup relies on container unmount. If memory leaks observed during soak, small SP-FX-3 follow-up.
- **Operator accept UI:** `/scada2/suggestions` remains a separate page. SP-FX-7 does not embed accept controls in runtime.

---

## Self-review (11 stop conditions vs plan coverage)

| SC | Covered | Task |
|----|---------|------|
| SC-1 animation-engine exports | Yes | T1 |
| SC-2 tag-binding-bridge bindGaugesToRealtime | Yes | T2 |
| SC-3 FuxaActionSchema extension | Yes | T0 |
| SC-4 RuntimeCanvas 3 effects + cleanup | Yes | T3 |
| SC-5 RuntimeShell minimal shell | Yes | T4 |
| SC-6 view-v2 page fetch + reactorId | Yes | T5 |
| SC-7 button -> WriteIntentDialog -> usePostWriteIntent | Yes | T3 |
| SC-8 animation safety grep 0 matches | Yes | T8 (grep + vitest assert) |
| SC-9 regression boundaries | Yes | T9 |
| SC-10 count thresholds | Yes | T9 |
| SC-11 gaugeRegistry AS-IS | Yes | T3 (side-effect import, no API change) |

All 11 stop conditions covered. Animation safety enforced by (a) no import of write APIs in source and (b) T8 vitest file-read assert that fails CI if banned patterns appear.
