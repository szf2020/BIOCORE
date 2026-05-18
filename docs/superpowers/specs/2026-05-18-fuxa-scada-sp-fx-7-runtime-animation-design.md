# SP-FX-7 — Runtime + Animation Engine Design

**Date:** 2026-05-18
**Status:** Spec — pending implementation plan
**Parent:** `2026-05-17-fuxa-scada-port-design.md` §5.2 SP-FX-7
**Depends on:** SP-FX-6 batch 1 (gauge-base + gaugeRegistry) — sequenced after SP-FX-6 batch 1 ships.

---

## 1. Scope

### 1.1 In-scope (~2 weeks)

Wire SP-FX-6 batch 1 gauges into a live read-only `/scada2/view-v2/[viewId]` route, with tag-binding bridge driving `onProcess` from `pv_realtime` WS, plus animation engine for property-driven SVG attribute changes.

**Runtime (new):**
- `runtime/RuntimeCanvas.tsx` — read-only canvas, mounts gauges via `gaugeRegistry`, subscribes to `pv_realtime`, drives `onProcess` / animation tick
- `runtime/RuntimeShell.tsx` — minimal shell (no toolbar/palette/properties) hosting `RuntimeCanvas` full-screen
- `app/scada2/view-v2/[viewId]/page.tsx` — Next.js page: fetch view via API, render `RuntimeShell`

**Animation engine (new):**
- `services/animation-engine.ts` — `evalAnimations(widget, tagValues) → AnimationPatch[]` per tick
- Extension to `FuxaActionSchema` in `models/property.ts` — add `conditionExpr?: string` + `valueExpr?: string` (backward compatible: legacy `range`/`output` still honored)

**Tag-binding bridge:**
- `services/tag-binding-bridge.ts` — adapts `useRealtimeStore` subscription → batched `gauge.onProcess(value)`, deriving signals per widget via `gaugeRegistry.getSignals`

**Set-value flow:**
- RuntimeCanvas state holds `dialogWidget` ref; gauge click triggers `setDialogWidget`; existing `<WriteIntentDialog>` (SP6) consumed as-is
- Submit path: `usePostWriteIntent.post({ tag, value, reason, view_id, widget_id })` (unchanged)

### 1.2 Out-of-scope (deferred)

| Item | Defer to |
|------|----------|
| Remaining 15 widgets — only batch 1 wired to runtime initially | SP-FX-6.2/6.3/6.4 (each batch registers new gauges; runtime picks up automatically) |
| Editor gauge preview (live values in editor) | SP-FX-8 polish |
| Cards-view multi-view dashboard | SP-FX-8 |
| Old `/scada2/[viewId]` viewer retirement | Future SP-FX-8 retro |
| Operator-side suggestion accept UI within runtime | SP-FX-8 (current `/scada2/suggestions` page works) |
| Animation history/replay | not planned |

### 1.3 Constraints

- TDD RED-first.
- All user-facing replies in 简体中文.
- AI / animation / expression-eval **never write PLC directly**. animation-engine MUST NOT import `writeTag` or `sendWsMessage`. CI-greppable invariant (§5.5).
- HMI manual set-value: gauge → RuntimeCanvas state → `<WriteIntentDialog>` → `usePostWriteIntent` → server → dispatcher → PLC. No shortcuts.
- expression-eval reuses existing SP-FX-2 `services/expression-eval.ts` (already safe — `allowMemberAccess:false`, whitelist `IF/MIN/MAX/ABS/ROUND`, AST cache, no `eval()` / `new Function()`).
- macOS BSD sed (no `\b`); literal Edit replacements.
- pnpm via `export PATH=$HOME/.hermes/node/bin:$PATH`.
- ZERO new third-party deps for SP-FX-7.

### 1.4 Test count target

| Package | Baseline (post SP-FX-6 batch 1) | Target | Delta |
|---------|----------|--------|-------|
| web-ui vitest | ~837 | **~850** | +~13 |
| server vitest | 147 | 147 | 0 |
| data-service vitest | 84 | 84 | 0 |
| scripts vitest | 7 | 7 | 0 |
| Playwright | 27 | **29** | +2 |

Vitest +13 breakdown: 5 animation-engine + 5 RuntimeCanvas + 3 tag-binding-bridge.

---

## 2. File Structure

### 2.1 New files

```
packages/web-ui/src/scada-engine/runtime/
├── RuntimeCanvas.tsx                                                ~180 lines
├── RuntimeShell.tsx                                                 ~40 lines
└── __tests__/
    └── RuntimeCanvas.test.tsx                                       5 tests

packages/web-ui/src/scada-engine/services/
├── animation-engine.ts                                              ~120 lines
├── tag-binding-bridge.ts                                            ~80 lines
└── __tests__/
    ├── animation-engine.test.ts                                     5 tests
    └── tag-binding-bridge.test.ts                                   3 tests

packages/web-ui/src/app/scada2/view-v2/[viewId]/
└── page.tsx                                                         ~50 lines

packages/web-ui/e2e/
└── scada-runtime-view.spec.ts                                       2 Playwright smoke
```

### 2.2 Modified files

```
packages/web-ui/src/scada-engine/
├── models/property.ts                                               extend FuxaActionSchema: +conditionExpr, +valueExpr
├── services/index.ts                                                +export animation-engine + tag-binding-bridge
└── index.ts                                                         +export runtime/* (RuntimeCanvas, RuntimeShell)
```

### 2.3 Not modified

- `editor/*` — editor unchanged.
- `gauges/*` — batch 1 gauges consumed AS-IS through `gaugeRegistry`.
- `gauges/gauge-base.ts` — `GaugeContext.mode = 'runtime'` passed by RuntimeCanvas; otherwise no change.
- `services/expression-eval.ts` (SP-FX-2) — reused without modification.
- `services/tag-binding.ts` — `writeTag` not called from animation-engine. RuntimeCanvas does NOT use `writeTag` either; set-value goes through `usePostWriteIntent`.
- `services/realtime-store.ts` — subscribers added by RuntimeCanvas useEffect, no store change.
- `hooks/usePostWriteIntent.ts` (SP6) — reused without modification.
- `components/scada/runtime/WriteIntentDialog.tsx` (SP6) — reused without modification.
- `app/scada2/[viewId]` (old viewer) — left intact for backward compat. Retirement decision deferred.

---

## 3. Type Contract

### 3.1 `services/animation-engine.ts`

```ts
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
  tagIds: string[];        // parseTagsFromExpression on conditionExpr + valueExpr
}

/** Pre-resolve animations for all widgets in a view. */
export function resolveAnimations(widgets: Record<string, FuxaWidget>): ResolvedAnimation[];

/** Evaluate one tick. Returns patches to apply. Caller decides how to apply (RuntimeCanvas). */
export function evalAnimations(
  resolved: ResolvedAnimation[],
  tagValues: Record<string, unknown>,
): AnimationPatch[];
```

Behavior:
- `resolveAnimations` walks `view.items[*].property.actions[]`, calls `parseTagsFromExpression` on `conditionExpr` + `valueExpr` to collect dependency tags.
- `evalAnimations` for each `ResolvedAnimation`:
  - If `action.conditionExpr` present: `evalExpression(conditionExpr, tagValues)` → truthy? then emit patch.
  - Else fall back to legacy `range`/`output` (existing FUXA behavior): if `tagValues[action.variableId]` within `range.min..max` → emit patch with `output.from/to` linear interp.
  - Patch `value` derives from `valueExpr` (eval) when present, else from `output` field.
- Errors during `evalExpression` (parse fail) → catch, log warning, omit that patch. Other animations continue.

### 3.2 `services/tag-binding-bridge.ts`

```ts
import type { GaugeBase } from '../gauges/gauge-base';

/** Subscribe to processValues changes for a reactor and drive gauge.onProcess on each tick.
 *  Returns unsubscribe function. */
export function bindGaugesToRealtime(
  reactorId: string,
  gauges: Map<string, GaugeBase>,         // widgetId → instance
  widgetSignals: Map<string, string[]>,   // widgetId → tagIds[] from gaugeRegistry.getSignals
): () => void;
```

Behavior:
- Uses `useRealtimeStore.subscribe((s) => s.reactorData[reactorId]?.processValues, callback)`.
- On callback: for each gauge, for each tagId in `widgetSignals[widgetId]`:
  - `readTagSnapshot(tagId)` → `GaugeValue`
  - `gauge.onProcess(value)`
- Returns unsubscribe function for cleanup.
- If `processValues` is null/undefined → no-op.

### 3.3 `runtime/RuntimeCanvas.tsx`

```tsx
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
    const canvas = new CanvasController(containerRef.current, { width: view.width, height: view.height });
    canvas.loadView(view);
    canvasRef.current = canvas;
    const widgetSignals = new Map<string, string[]>();
    for (const id in view.items) {
      const w = view.items[id]!;
      const gauge = gaugeRegistry.create(w);
      if (gauge) {
        const ctx: GaugeContext = {
          parentGroup: canvas.widgetLayer.node as SVGGElement,
          readValue: readTagSnapshot,
          canvasSize: { width: view.width, height: view.height },
          mode: 'runtime',
          onWriteIntent: (intent) => setDialogWidget(view.items[intent.widgetId] ?? null),
        };
        gauge.onMount(w, ctx);
        gaugeMapRef.current.set(id, gauge);
        widgetSignals.set(id, gaugeRegistry.getSignals(w));
      }
    }
    const unbind = bindGaugesToRealtime(reactorId, gaugeMapRef.current, widgetSignals);
    return () => {
      unbind();
      for (const [, g] of gaugeMapRef.current) g.onUnmount();
      gaugeMapRef.current.clear();
      canvasRef.current = null;
    };
  }, [view.id, reactorId]);

  // Effect B: click delegation
  useEffect(() => { /* svg root addEventListener('click', delegate); cleanup remove */ }, [view.id]);

  // Effect C: animation rAF tick
  useEffect(() => {
    let rafId = 0;
    const resolved = resolveAnimations(view.items);
    const tick = () => {
      const pv = useRealtimeStore.getState().reactorData[reactorId]?.processValues ?? {};
      const patches = evalAnimations(resolved, pv as Record<string, unknown>);
      for (const p of patches) {
        const el = canvasRef.current?.root?.node?.querySelector(`[data-widget-id="${p.widgetId}"]`);
        if (el) applyPatch(el as Element, p);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [view.id, reactorId]);

  return (
    <>
      <div ref={containerRef} data-runtime-canvas-host className="w-full h-full overflow-auto bg-white" />
      {dialogWidget ? (
        <WriteIntentDialog widget={dialogWidget} viewId={viewId} onClose={() => setDialogWidget(null)} />
      ) : null}
    </>
  );
}

function applyPatch(el: Element, p: AnimationPatch): void {
  // 'color' → (el as HTMLElement).style.fill = String(p.value)
  // 'visibility' → style.display = p.value ? '' : 'none'
  // 'opacity' → style.opacity = String(p.value)
  // 'rotate' / 'scale' / 'move' → setAttribute('transform', compose(...))
  // 'text' → textContent (text-typed widgets only)
}
```

### 3.4 `runtime/RuntimeShell.tsx`

```tsx
export function RuntimeShell({ view, viewId, reactorId }: RuntimeShellProps): JSX.Element {
  return (
    <div className="w-screen h-screen bg-zinc-100">
      <RuntimeCanvas view={view} viewId={viewId} reactorId={reactorId} />
    </div>
  );
}
```

### 3.5 `app/scada2/view-v2/[viewId]/page.tsx`

```tsx
'use client';
export default function ViewV2Page({ params }: { params: { viewId: string } }): JSX.Element {
  const sp = useSearchParams();
  const reactorId = sp.get('reactor') ?? 'F01';
  const [view, setView] = useState<FuxaView | null>(null);

  useEffect(() => {
    fetch(`/api/v1/fuxa-views/${params.viewId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setView(parseFuxaView(j.data.payload)))
      .catch(() => setView(null));
  }, [params.viewId]);

  if (!view) return <div className="p-8">加载中...</div>;
  return <RuntimeShell view={view} viewId={params.viewId} reactorId={reactorId} />;
}
```

### 3.6 `models/property.ts` extension

Append to `FuxaActionSchema`:

```ts
conditionExpr: z.string().max(500).optional(),
valueExpr: z.string().max(500).optional(),
```

Existing `range` and `output` fields remain — `evalAnimations` falls back to them when expressions are absent (backward compat with SP-FX-2 stored views).

---

## 4. Data Flow

### 4.1 Page load

```
User opens /scada2/view-v2/<viewId>?reactor=F01
  → page.tsx fetch /api/v1/fuxa-views/:viewId
    → parseFuxaView(payload) → FuxaView
  → <RuntimeShell view viewId reactorId />
    → <RuntimeCanvas />
      → containerRef mounts <div>
      → Effect A: new CanvasController → loadView → instantiate gauges via gaugeRegistry
        → each gauge.onMount(widget, ctx={mode:'runtime', onWriteIntent, readValue, ...})
        → bindGaugesToRealtime → useRealtimeStore.subscribe
      → Effect B: click delegation on svg root
      → Effect C: rAF animation loop
```

### 4.2 Tag tick

```
WS pv_realtime message arrives
  → realtime-store updates reactorData[F01].processValues
  → useRealtimeStore.subscribe callback fires
    → for each gauge in gaugeMap:
      → for each tagId in widgetSignals[widgetId]:
        → readTagSnapshot(tagId) → GaugeValue
        → gauge.onProcess(value)
          → gauge updates SVG attribute imperatively (e.g. text content, fill color)

Concurrently, rAF tick evaluates animations and applies patches.
```

### 4.3 Button click → write intent

```
User clicks <button> inside widget's <foreignObject>
  → SVG click delegation (Effect B) catches event
    → closest('[data-widget-id]') → widgetId
    → gauge.onClick(event, { widget, ctx })
      → htmlButtonGauge.onClick: extract events[0].actparam + value
        → ctx.onWriteIntent({ tag, value, widgetId })
          → setDialogWidget(widget)
            → <WriteIntentDialog open widget=... viewId=... onClose />
              → operator fills reason → submit
                → usePostWriteIntent.post({ tag, value, reason, view_id, widget_id })
                  → POST /api/v1/scada/write-intents
                    → server scada-routes.ts:309 → ai_suggestions insert + broadcast
              → dialog onClose → setDialogWidget(null)
```

### 4.4 Slider release / Input commit

Same as 4.3 except:
- Slider: `pointerup` event handler on `<input type="range">` inside `<foreignObject>` → commit current value
- Input: Enter keydown OR blur event → commit current text/number value

Both routed through `ctx.onWriteIntent`, no shortcuts.

### 4.5 Animation tick

```
Effect C rAF tick (≤60Hz, evalAnimations is O(N actions))
  → useRealtimeStore.getState().reactorData[F01].processValues → tagValues
  → evalAnimations(resolvedAnimations, tagValues)
    → for each ResolvedAnimation:
      → if conditionExpr present: evalExpression(condExpr, tagValues)
        → if truthy: derive value (from valueExpr or output.to)
        → push patch
      → else legacy range/output check
    → catch eval errors per-animation; continue others
  → for each patch: querySelector data-widget-id → applyPatch
```

---

## 5. Error Handling

### 5.1 animation-engine

| Case | Behavior |
|------|----------|
| `conditionExpr` parse error | catch, log warn, omit patch; other animations continue |
| `valueExpr` parse error | same |
| `actions[]` missing/empty | resolveAnimations returns empty list |
| Tag missing in tagValues | `evalExpression` returns undefined → no patch |
| Both expressions absent + no range/output | no patch (silent) |
| Expression > 500 chars | rejected at zod parse stage (schema constraint) |

### 5.2 tag-binding-bridge

| Case | Behavior |
|------|----------|
| `reactorData[reactorId]` undefined | callback no-op |
| `processValues` empty | callback iterates 0 gauges (no error) |
| Gauge throws in `onProcess` | catch + log; do not break other gauges |

### 5.3 RuntimeCanvas

| Case | Behavior |
|------|----------|
| `gaugeRegistry.create(widget)` returns null | widget falls back to canvas-svg default render (rect/ellipse/text/shape); no gauge mounted; no subscription |
| `WriteIntentDialog` submit fails (500) | dialog shows error inline (SP6 existing behavior) |
| `view.items` empty | RuntimeCanvas renders empty `<div>` with `data-runtime-canvas-host` |
| Network failure on page fetch | page shows "加载失败"; `view=null` does not mount RuntimeCanvas |

### 5.4 Regression boundaries

- SP-FX-3/4/5/5.5/6.batch1 vitest unchanged (~837).
- Editor canvas `/scada2/edit-v2/[viewId]` unchanged.
- Old viewer `/scada2/[viewId]` unchanged.
- `useWriteIntent` / `WriteIntentDialog` / `tag-binding` / `realtime-store` / `expression-eval` untouched.

### 5.5 Animation safety invariants (CI-greppable)

1. `services/animation-engine.ts` MUST NOT contain `writeTag` or `sendWsMessage` string.
2. `services/animation-engine.ts` MUST NOT call `eval()` or `new Function()`.
3. `services/animation-engine.ts` MUST NOT call `fetch(` or `XMLHttpRequest`.
4. All expressions parsed by `evalExpression` (sandboxed `expr-eval` parser, SP-FX-2 vetted).

CI assertion (manual or future hook):
```
grep -E "writeTag|sendWsMessage|eval\(|new Function|fetch\(|XMLHttpRequest" \
  packages/web-ui/src/scada-engine/services/animation-engine.ts
```
Expected: 0 matches.

---

## 6. Testing

### 6.1 Vitest +13 breakdown

**animation-engine.test.ts (5)**:
1. condition true → patch emitted (color)
2. condition false → no patch
3. multiple animations on one widget (color + visibility) → both patches independent
4. parse error → engine does not throw; other animations continue
5. legacy range/output (no conditionExpr) → backward-compat patch generated

**tag-binding-bridge.test.ts (3)**:
1. subscribe → gauge.onProcess called with snapshot on processValues update
2. unsubscribe → no further calls after cleanup
3. multiple gauges → all called per tick

**RuntimeCanvas.test.tsx (5)**:
1. mount → CanvasController.loadView called; gauge instances created per widget type
2. processValues change → gauge.onProcess called (use spy)
3. button click → dialogWidget state set; WriteIntentDialog renders
4. animation tick → applyPatch updates SVG attribute
5. unmount cleanup → gauges destroyed, subscription unbound, rAF cancelled

### 6.2 Playwright (2 smoke) — `e2e/scada-runtime-view.spec.ts`

1. **view-v2 page load**: Login → /scada2/view-v2/:viewId → page renders; widgets visible; no console errors
2. **button click → WriteIntentDialog → save**: seed view with `svg-ext-html_button` widget → click button → dialog appears → fill reason → submit → fetch mock returns 200 → dialog closes

### 6.3 Mock strategy

- `useRealtimeStore.getState()` mocked at module level
- `usePostWriteIntent` mocked
- `gaugeRegistry` populated via real `controls/index.ts` import (SP-FX-6 batch 1 widgets registered)
- `requestAnimationFrame` shimmed with `vi.useFakeTimers()` for animation tick tests
- jsdom: same patterns as SP-FX-5 (canvas mock for uplot, foreignObject as plain SVG child)

### 6.4 Coverage gates

- New modules ≥ 80% line/branch
- Existing modules: no decrease
- `tsc --noEmit` 0 errors
- web-ui ~837 → ≥850 (+13), Playwright 27 → 29 (+2)

---

## 7. Stop Conditions

Sprint done when all 11 pass:

1. `services/animation-engine.ts` exports `evalAnimations` + `resolveAnimations` per §3.1; reuses `evalExpression` from SP-FX-2.
2. `services/tag-binding-bridge.ts` exports `bindGaugesToRealtime` returning unsubscribe; integrates with `useRealtimeStore.subscribe`.
3. `models/property.ts` `FuxaActionSchema` extended with `conditionExpr?: z.string().max(500)` + `valueExpr?: z.string().max(500)`; existing range/output preserved.
4. `runtime/RuntimeCanvas.tsx` mounts gauges via `gaugeRegistry`, subscribes pv_realtime, click delegation, rAF animation tick; on unmount cleans all subscriptions + gauges.
5. `runtime/RuntimeShell.tsx` minimal full-screen shell.
6. `app/scada2/view-v2/[viewId]/page.tsx` fetches view + renders RuntimeShell with reactorId from query.
7. Button click in runtime triggers WriteIntentDialog; submit POSTs to `/api/v1/scada/write-intents` via `usePostWriteIntent`.
8. Animation safety invariants (§5.5) — grep returns 0 matches for `writeTag`/`eval(`/`new Function`/`fetch(` in animation-engine.ts.
9. Backwards compat: SP-FX-3/4/5/5.5/6.batch1 vitest unchanged; old `/scada2/[viewId]` viewer unchanged.
10. Test baselines: web-ui ≥850 (+13), Playwright ≥29 (+2), tsc clean, server 147, data-service 84, scripts 7.
11. `gaugeRegistry` consumed AS-IS from SP-FX-6 batch 1 (no registry API change in SP-FX-7).

---

## 8. Open items (non-blocking)

- Animation tick currently rAF (~60Hz) which is overkill for 1Hz tag updates — future polish: subscribe-driven (only eval on subscribed tag change).
- Old viewer `/scada2/[viewId]` and new `/scada2/view-v2/[viewId]` coexist. SP-FX-8 retro decides migration.
- RuntimeCanvas does not listen for view edits while open — pages must reload. Defer.
- `CanvasController` lacks explicit `destroy()`; cleanup relies on container unmount. SP-FX-3 may need small follow-up if leaks observed.
- Operator-side acceptance UI (`/scada2/suggestions`) separate page; SP-FX-7 does not embed accept controls in runtime.

---

End of spec.
