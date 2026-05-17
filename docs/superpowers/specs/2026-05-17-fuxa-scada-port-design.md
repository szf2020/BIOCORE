# SP-FUXA-PORT — FUXA SCADA Editor + Gauges + Viewer port to BIOCore (Parent Spec)

**Date:** 2026-05-17
**Status:** Draft — pending implementation plans for SP-FX-1..8
**Author:** brainstorming session, BIOCore SP7.5-followup decision set

---

## 0. Background

BIOCore decommissioned FUXA in SP7.5 (2026-05-16, commit `c40c00e`) and replaced
the embedded SCADA editor with a React-native SP4-7 build at `/scada2`. After
shipping SP4-7, the user re-evaluated and decided the SP4-7 widget set is too
narrow vs FUXA's mature gauge library, and committed to porting FUXA's editor +
gauges + viewer back into BIOCore — this time as a React-native port instead of
the original Angular embed.

This parent spec records the architectural decisions that govern the port
(packaging, schema, services, testing, risk acceptance) and slices the work
into 8 sub-projects (SP-FX-1..8), each of which gets its own brainstorm →
spec → plan cycle before execution. **This spec does not produce
implementation tasks itself.**

---

## 1. Goal

Port the FUXA SCADA editor, gauge widgets, and runtime viewer to BIOCore's
Next.js 14 / React 18 codebase, accessible at `/scada2`. SP4-7's existing
widget set is retired and replaced. SP4-7's `scada_views` table and demo rows
are preserved for legacy access.

Excluded scope (out of FUXA): device/PLC communication, alarms, users/auth,
scripts, plugins, reports, notes, multi-language i18n (zh-CN only), onboarding
wizard, help system, header/sidenav/home/integrations/iframe/lab/maps/tester/
apikeys/logs-view shells. Retained extras: cards-view (multi-view dashboard
grid), paginator (table pagination utility).

---

## 2. Constraints (verbatim, must persist across sessions)

- 所有面向用户的回复一律使用简体中文 (技术标识符保留原文)
- AI / HMI / 外部系统 永不直写 PLC. 一律走 "建议缓冲区" → "人工确认" → "engine 下发"
- PLC 通讯: node-snap7 (S7 协议) + modbus-serial (Modbus RTU), 不用 nodes7

The PLC write constraint is the most security-critical: every FUXA
`set-value` event MUST be intercepted into the existing BIOCore
`useWriteIntent` flow (SP6) and routed through `ai_suggestions` → engine,
never via direct MQTT publish.

---

## 3. Decision Log (brainstorming outcome)

| # | Topic | Decision | Reason |
|---|---|---|---|
| D1 | Integration mode | **B. Port FUXA editor + gauges to React** | Unified codebase, no Angular runtime, no iframe split |
| D2 | SP4-7 /scada2 disposition | **Merge** — FUXA-port code under /scada2 replaces SP4-7 internals; route names preserved | Avoid user-visible URL churn; SP4-7 widget code retires |
| D3 | Exclusion scope | All FUXA features **except** editor + gauges + fuxa-view + cards-view + paginator + framework + gui-helpers + `_models/hmi` | BIOCore already has device / auth / alarms / reports |
| D4 | svgeditor strategy | **Rewrite as React + svg.js** (no jQuery, no minified lib) | Long-term maintainability; eliminates jQuery global pollution |
| D5 | Hmi schema storage | **New `fuxa_views` table** via migration 033; `scada_views` untouched | Keep SP4-7 schema frozen; clean separation |
| D6 | ngx-* dependency replacements | **Self-implement** (gauge / nouislider / switch / scheduler) using Tailwind + radix-ui primitives | Bundle size; visual consistency with BIOCore |
| D7 | Gauge tag-binding pattern | **TagBinding service** (RxJS-like pub/sub abstraction); gauges actively subscribe on mount | Stays imperative inside SVG DOM, decoupled from React render cycle |
| D8 | SP4-7 widget fate | **Retire** SP4-7's interlock-pad / write-intent-dialog widgets; rebuild equivalents inside FUXA-port gauge framework | One widget framework only |
| D9 | TDD coverage | **C. Full coverage** — every widget + dialog + tool gets unit tests; integration + E2E layered on | User mandate (priority over speed) |
| D10 | SP-FX ordering | **A. As proposed** (1→8 follows FUXA internal dependency chain) | Minimizes rework |
| D11 | Code location | **B. `packages/web-ui/src/scada-engine/`** — directory, not separate npm package | Single service per user mandate ("不拆分") |
| D12 | SP4-7 demo views | **Preserve** (`scada_views` 2 rows unchanged) | Reference / fallback |
| D13 | scada-engine subdirectory layout | **A.** `editor/ + gauges/ + runtime/ + models/ + services/ + assets/ + dialogs/ + tests/` plus `cards-view/ + paginator/ + widgets-extras/ + api/` | Clear boundaries by responsibility |
| D14 | Timeline budget | **6-9 months single dev** | Includes full TDD + svg-edit rewrite + ngx-* self-impl |

---

## 4. Architecture

```
Next.js /scada2 routes
        │
        ▼
┌─────────────────────────────────┐
│ scada-engine/runtime  (viewer)  │  public exits
│ scada-engine/editor   (editor)  │
└──────────────┬──────────────────┘
               │
   ┌───────────┴───────────┐
   ▼                       ▼
┌──────┐               ┌─────────┐
│gauges│ (20 widget)   │services │  TagBinding, ViewStore,
│      │               │         │  ExpressionEval, Selection
└──┬───┘               └────┬────┘
   │                        │
   └────────┬───────────────┘
            ▼
      ┌──────────┐
      │  models  │  Hmi schema (TS port of FUXA _models/hmi.ts)
      └──────────┘
            ▲
      ┌─────┴──────┐
      │ realtime-  │  reactorData[].processValues → useTagBindingBridge
      │  store     │
      └────────────┘
```

**Boundaries:**

- `editor` and `runtime` are the only public entry points (used by Next.js pages).
- `gauges` depend on `services` + `models`; no inter-widget coupling.
- `services` is single-direction: callers register/subscribe; service never reaches back into React.
- `realtime-store` (BIOCore SP2 existing) is bridged into `TagBinding` via a single `useTagBindingBridge()` effect.

**Compatibility with SP4-7:** `scada_views` table preserved with its 2 demo rows. `fuxa_views` (migration 033) is independent. `/scada2/view/{id}?source=fuxa|legacy` routes to the correct renderer (default `fuxa`; if absent in fuxa_views, fallback to scada_views as `legacy`).

---

## 5. Module Decomposition

### 5.1 `scada-engine/` directory layout

```
packages/web-ui/src/scada-engine/
├── assets/               SVG (211 base + 154 shape) + fonts + img
├── models/               hmi.ts, view.ts, widget.ts, property.ts, animation.ts
├── services/
│   ├── tag-binding.ts    Pub/sub from realtime-store → gauges
│   ├── view-store.ts     zustand: views[], activeView, dirty, undo/redo (50 step)
│   ├── expression-eval.ts safe evaluator for property bindings
│   └── selection.ts      single/multi/marquee selection state
├── editor/
│   ├── canvas/           svg.js based editor core (rewrite of svg-edit)
│   │   ├── svg-canvas.tsx
│   │   ├── pointer-tools.ts (select/move/resize/rotate/pan/zoom)
│   │   ├── snap-grid.ts
│   │   ├── transform.ts
│   │   └── history.ts
│   ├── palette/          left widget library (categorized)
│   ├── properties/       right property panel router
│   │   ├── view-property.tsx
│   │   ├── layout-property.tsx
│   │   ├── chart-config.tsx
│   │   ├── graph-config.tsx
│   │   ├── card-config.tsx
│   │   └── tags-ids-config.tsx
│   ├── toolbar/          top bar: save / undo / redo / zoom / grid / play
│   └── editor-shell.tsx
├── gauges/
│   ├── gauge-base.ts     abstract base: onMount/onUnmount/onProcess/onPropertyChange/onResize
│   ├── shapes/{shapes,proc-eng,ape-shapes}.tsx
│   └── controls/         20 widgets:
│       ├── value.tsx
│       ├── html-input.tsx html-button.tsx html-switch.tsx html-select.tsx
│       ├── html-chart.tsx html-graph.tsx html-table.tsx
│       ├── html-image.tsx html-iframe.tsx html-video.tsx
│       ├── html-bag.tsx html-scheduler.tsx
│       ├── gauge-progress.tsx gauge-semaphore.tsx
│       └── panel.tsx pipe.tsx slider.tsx
├── runtime/
│   ├── view-runtime.tsx  mounts a view, wires gauges to TagBinding
│   ├── gauge-mount.tsx   single gauge lifecycle + subscribe/unsubscribe
│   └── animation-engine.ts
├── dialogs/              gui-helpers rewritten (Tailwind + radix)
│   ├── confirm.tsx daterange-picker.tsx edit-name.tsx sel-options.tsx
│   ├── treetable.tsx bitmask.tsx range-number.tsx icon-selector.tsx
│   └── file-upload.tsx touch-keyboard.tsx webcam-player.tsx
├── widgets-extras/       self-implemented replacements for ngx-*
│   └── gauge.tsx nouislider.tsx switch.tsx scheduler.tsx uplot-wrapper.tsx
├── cards-view/           multi-view dashboard grid (FUXA cards-view port)
├── paginator/            table pagination utility
├── api/                  REST client for /api/v1/fuxa-views
└── tests/                vitest unit + integration, playwright E2E
```

### 5.2 SP-FX sub-projects

| SP | Scope | Estimate |
|---|---|---|
| **SP-FX-1** | Assets + models + backend schema (migration 033 `fuxa_views`) + scada-routes CRUD | 1 week |
| **SP-FX-2** | Services full set (tag-binding, view-store, expression-eval, selection) + part of dialogs | 1 week |
| **SP-FX-3** | Editor canvas — svg.js rewrite of svg-edit core (pointer-tools, history, snap-grid, transform) | 2 weeks (spike-gated) |
| **SP-FX-4** | Editor shell + palette + toolbar + integration with SP-FX-3 | 1 week |
| **SP-FX-5** | Shapes (3 categories) + remaining dialogs + widgets-extras (5) | 1-2 weeks |
| **SP-FX-6** | Controls (20 widgets in 4 batches of 5) + per-widget property panels | 6-8 weeks |
| **SP-FX-7** | Runtime (view-runtime, gauge-mount, animation-engine) + tag-binding bridge to useTag + properties router | 2 weeks |
| **SP-FX-8** | E2E + cards-view + paginator + SP4-7 hot-swap (retire SP4-7 widgets) + docs | 1-2 weeks |

**Total: 15-19 weeks ≈ 4-5 months + 25% risk buffer = 5-7 months** (within user's 6-9 month budget).

Each SP-FX is independently brainstormed and planned at execution time, not pre-planned now.

---

## 6. Data Flow

### 6.1 Hmi schema (TypeScript)

```ts
// scada-engine/models/hmi.ts
export interface FuxaView {
  id: string;
  name: string;
  type: 'svg' | 'cards' | 'svg-shapes';
  svgcontent: string;
  width: number;
  height: number;
  background_color?: string;
  profile?: { bkcolor?: string; margin?: number };
  items: Record<string, FuxaWidget>;
  variables?: Record<string, FuxaVariable>;
  parent_view_id?: string | null;
  schemaVersion: number;     // BIOCore-internal, starts at 1
}

export interface FuxaWidget {
  id: string;
  type: string;              // 'svg-ext-value' / 'svg-ext-html_button' / ...
  name?: string;
  property: FuxaProperty;
}

export interface FuxaProperty {
  variableId?: string;
  variableSrc?: 'device' | 'system';
  permission?: number;
  events?: FuxaEvent[];
  actions?: FuxaAction[];
  options?: Record<string, any>;
}

export interface FuxaEvent {
  type: 'click' | 'dblclick' | 'mousedown' | 'mouseup' | 'change';
  action: 'open-view' | 'close-view' | 'set-value' | 'navigate' | 'run-script-skip';
  actparam: string;
  actoptions?: Record<string, any>;
}

export interface FuxaAction {
  type: 'visibility' | 'opacity' | 'rotate' | 'scale' | 'move' | 'color' | 'text';
  variableId: string;
  range?: { min: number; max: number };
  output?: { from: any; to: any };
}

export interface FuxaVariable {
  id: string;
  name: string;
  type: 'tag' | 'system' | 'alias';
  source: string;            // BIOCore: "<reactor_id>/<tag_path>", e.g. "Reactor-1/temperature"
}
```

The `run-script-skip` action value is a placeholder — script execution is disabled per exclusion scope. Existing FUXA exports containing this value load as no-op events.

### 6.2 Backend schema

```sql
-- migration 033-fuxa-views.sql
CREATE TABLE fuxa_views (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'svg',
  payload         TEXT NOT NULL,                -- FuxaView JSON
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  parent_view_id  TEXT REFERENCES fuxa_views(id) ON DELETE SET NULL,
  is_template     INTEGER NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 1,   -- optimistic lock
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT,
  updated_by      TEXT
);
CREATE INDEX idx_fuxa_views_template ON fuxa_views(is_template) WHERE is_template = 1;
CREATE INDEX idx_fuxa_views_parent   ON fuxa_views(parent_view_id) WHERE parent_view_id IS NOT NULL;
```

**REST endpoints** (mounted on `apiRouter`, requires existing auth):

- `GET /api/v1/fuxa-views[?is_template=true]`
- `GET /api/v1/fuxa-views/:id`
- `POST /api/v1/fuxa-views`
- `PUT /api/v1/fuxa-views/:id` (header `If-Match: <version>`; returns 409 on stale)
- `DELETE /api/v1/fuxa-views/:id`
- `POST /api/v1/fuxa-views/:id/duplicate`

### 6.3 Edit flow

```
user drags widget from palette
  → svg-canvas.addNode(type, x, y)
  → view-store.update(view_id, items[new_id] = {type, property: default})
  → zustand subscribe → EditorCanvas re-renders
  → user clicks "save"
  → api/fuxa-views.put(view_id, view-store.getView(view_id))
  → POST /api/v1/fuxa-views/{id}
  → server upsert + version++
  → view-store.markClean(view_id)
  → toolbar toast "已保存"
```

### 6.4 Property edit flow

```
user clicks widget in canvas
  → selection.setSelected([widget_id])
  → properties/router.tsx picks panel by widget.type
  → panel renders form bound to view-store.getWidget(id).property
  → form.onChange → view-store.updateWidget(id, {property: patch})
  → toolbar "save" triggers 6.3
```

### 6.5 Runtime flow

```
user navigates /scada2/view/{id}
  → ViewRuntime fetches view JSON via api/fuxa-views.get(id)
  → parse view.svgcontent into raw <svg> mounted in DOM
  → iterate view.items: for each <g id={item.id}>, mount React portal GaugeMount
  → GaugeMount calls tagBinding.subscribe(property.variableId, this)

  (realtime-store receives ws process_values)
  → useTagBindingBridge useEffect fires
  → tagBinding.push(tagId, value) → subscribers.forEach(g => g.process({tagId: value}))
  → gauge.process updates SVG attrs imperatively (no React re-render)
```

### 6.6 TagBinding service

```ts
// scada-engine/services/tag-binding.ts
class TagBinding {
  private subscribers = new Map<string, Set<GaugeInstance>>();
  private lastValues = new Map<string, any>();

  subscribe(tagId: string, gauge: GaugeInstance) {
    if (!this.subscribers.has(tagId)) this.subscribers.set(tagId, new Set());
    this.subscribers.get(tagId)!.add(gauge);
    if (this.lastValues.has(tagId)) {
      gauge.process({ [tagId]: this.lastValues.get(tagId) });
    }
  }

  unsubscribe(tagId: string, gauge: GaugeInstance) {
    this.subscribers.get(tagId)?.delete(gauge);
  }

  push(tagId: string, value: any) {
    this.lastValues.set(tagId, value);
    this.subscribers.get(tagId)?.forEach(g => g.process({ [tagId]: value }));
  }
}

export const tagBinding = new TagBinding();

export function useTagBindingBridge() {
  const reactorData = useRealtimeStore(s => s.reactorData);
  useEffect(() => {
    for (const [rid, rd] of Object.entries(reactorData)) {
      const pv = rd.processValues;
      if (!pv) continue;
      for (const [tag, value] of Object.entries(pv)) {
        tagBinding.push(`${rid}/${tag}`, value);
      }
    }
  }, [reactorData]);
}
```

**Tag ID convention:** `<reactor_id>/<tag_path>`, e.g. `Reactor-1/temperature`.

---

## 7. Error Handling

| Boundary | Validation | Behavior |
|---|---|---|
| `POST/PUT /fuxa-views` | server zod schema | 400 `{error, field}` on failure; row not written |
| GET response on client | api/fuxa-views.get zod parse | parse fail → `FuxaSchemaError` thrown; runtime fallback "视图损坏" placeholder |
| `svgcontent` XML | `DOMParser.parseFromString` + parsererror check | viewer renders empty SVG + toast; editor blocks save |
| Expression evaluation | services/expression-eval `safeEval` | try/catch → default value (vis=true / opacity=1 / fallback color); one-time `console.warn(widget_id, expr)` |
| Tag not found | tag-binding.subscribe | silent skip + dev `console.warn`; gauge shows "--" |

**Optimistic locking:** `fuxa_views.version` integer, auto-incremented. PUT requires `If-Match: <version>`. Mismatch → `409 {error: 'stale', currentVersion}`. Client shows ConflictDialog (重载 / 强制覆盖 / 取消); 强制覆盖 calls PUT with `?force=true` and logs audit entry.

**Undo/redo (editor):** view-store maintains `history: View[]` stack + `historyIndex`. Each `mutateView` pushes a `structuredClone` snapshot (MAX_DEPTH=50). Toolbar Ctrl+Z / Ctrl+Shift+Z trigger `undo()` / `redo()`. For large `svgcontent` strings, snapshot stores a `fast-diff` patch against the previous version to bound memory growth.

**Autosave / crash recovery:** every 30s view-store autosaves dirty drafts to `localStorage.fuxa-draft-{view_id}`. On editor mount, if a draft exists and its `base_version` matches server `version`, prompt "恢复未保存草稿?". If `base_version` mismatches (others published a new version), prompt "草稿基于旧版, 强制应用 / 丢弃".

**Schema migration:** `payload.schemaVersion` (currently 1) drives in-memory upgrade via `models/upgrader.ts` when older. Newer schema than client → error "客户端版本过旧, 升级 BIOCore". Migration 034+ handles persistent ALTER TABLE.

**Widget runtime fault isolation:** gauge.process exception → catch + log + `gauge.faulted = true` + red outline + tooltip "Widget 故障 (id=...)". An ErrorBoundary wraps view-runtime; one bad widget cannot crash the canvas.

**PLC write security (highest-priority):** `FuxaEvent.action === 'set-value'` at **runtime** (viewer, not editor) is intercepted by the gauge runtime and routed through `useWriteIntent(tagId, value, reason)` (existing SP6 hook). This writes to `ai_suggestions` with `suggested_value_raw`, then the engine dispatches. **No widget may emit a direct MQTT publish at runtime.** The editor itself only edits `FuxaEvent` definitions (text fields like `actparam`) — those are config writes to `fuxa_views.payload`, not PLC writes, and follow the normal save flow. Unit test + E2E coverage enforces this invariant.

**Network / WS disconnection:** view-runtime shows a banner "实时数据已断开, 显示最后值 (Ns 前)" while `realtime-store.wsConnected === false`. Gauges show grey "stale" outline via existing `useTag` staleness flag (SP2 H1). Editor depends only on REST and is unaffected.

**Asset load failure:** failed SVG fetch → palette item grey overlay "加载失败"; editor still boots. Font failure → Tailwind default fallback.

---

## 8. Testing Strategy

User chose **full coverage TDD** (D9). Estimate ~200-260 test cases distributed:

| Layer | Tool | Target | Cases |
|---|---|---|---|
| Unit | vitest + jsdom + RTL | services, models, gauge.process, expression-eval, history, pointer-tools | ~120 |
| Integration | vitest + RTL mount | editor canvas + palette + properties linkage; runtime mount + tag-binding push | ~50 |
| Schema (server) | vitest | migration 033; fuxa-views CRUD + 409 conflict + force | ~25 |
| E2E | Playwright | 12-15 critical user flows | ~15 |

### 8.1 Per-widget required cases (× 20 widgets)

1. default render with empty `property`
2. `process(values)` updates DOM state / text / color
3. bound `variableId` subscribes via tag-binding; push updates render
4. edge cases: undefined / out-of-range / null
5. unmount cleanup: gauge.dispose calls tagBinding.unsubscribe; no leak
6. snapshot test against baseline SVG string

**20 widgets × 6 = ~120 widget unit tests.**

### 8.2 Editor canvas (SP-FX-3)

pointer-tools (select/move/resize/rotate/pan/zoom), snap-grid behavior, transform (rotation + scale + multi-select group), history (50-step bounded), path tool (click-click-double-close + bezier control points), draw rect/ellipse/line/text, paste (serialize → deserialize → new ids), delete, copy/duplicate offset. ~50 cases.

### 8.3 Services

tag-binding (subscribe/unsubscribe/push, lastValue caching, mount-time replay), view-store (zustand mutation, dirty flag, undo/redo, autosave), expression-eval (safe eval, no `Function`/`eval`, nested ternary, error fallback), selection (single/multi-shift/marquee/clear). ~40 cases.

### 8.4 Property panels

view/layout/chart/graph/card/tags-ids panels: mount with default widget, edit fields → view-store.updateWidget called, tag dropdown lists `useTags()` results, switching selection mid-edit refreshes form. ~30 cases.

### 8.5 Dialogs + widgets-extras

11 dialogs + 5 widgets-extras × 1-2 cases each: open / value / confirm / cancel. ~25 cases.

### 8.6 Server routes + migration

migration 033 schema correctness; `scada_views` unchanged; POST 400 zod fail / 200 success; PUT optimistic lock 409 path; GET filtering; DELETE cascade SET NULL; **write-intent interception test** (set-value FuxaEvent must write to `ai_suggestions`, not raw publish). ~25 cases.

### 8.7 E2E (Playwright headless)

1. login → /scada2 → new view → drag value widget → save → list refresh
2. select widget → edit variableId in property panel → save → reload, value persists
3. runtime: /scada2/view/{id} → ws push → text updates
4. write-intent: runtime click button (set-value) → dialog → fill reason → backend asserts row written to ai_suggestions
5. undo/redo: drag + del + Ctrl+Z chain, state restored
6. autosave: edit → close tab → reopen → "恢复草稿?" prompt
7. 409 conflict: two tabs same view, one saves then the other → conflict dialog
8. shape palette: proc-eng → reactor shape → drag to canvas → save
9. SP-RG-2 H-5 carryover: branch widget switch mid-debounce expression input
10. SP4-7 demo legacy: `/scada2/view/legacy/{demo_v1}` still renders via old renderer
11. cards-view: 4 views in 2×2 grid, all subscribe live tags
12. paginator: 100-row tag table, paging works

### 8.8 CI baselines

Current: web-ui 366/366, server 119/119. Targets after all SP-FX: web-ui ~600+, server ~144. Per SP-FX completion: `tsc + web-ui vitest + server vitest` must all be GREEN. E2E runs at end of SP-FX-8 (not per-batch, to avoid CI noise). Coverage thresholds: widget runtime ≥80%, services ≥90%, canvas core ≥75%.

### 8.9 Fixture / mock strategy

- `tests/fixtures/views/` — 12-15 typical FuxaView JSON samples (one per widget type minimum)
- realtime-store mock: `useRealtimeStore.setState({...})` direct injection
- TagBinding mock: tests call `tagBinding.push(tagId, value)` to simulate WS
- API mock: `vi.mock('@/scada-engine/api/fuxa-views')` returns fixtures
- DB tests: server vitest uses in-memory SQLite + runs migration 033

---

## 9. Risks

| # | Risk | Prob | Impact | Mitigation |
|---|---|---|---|---|
| R1 | svg-edit rewrite (SP-FX-3) more complex than estimated — pointer-tools / undo / bezier / group transform edge cases | High | +4-6 weeks | (a) 1-week spike before SP-FX-3 commits to implementation; (b) study original svg-edit source for algorithms; (c) stretch-goal SP-FX-3 — if not GREEN by week 2, fallback to svg.js + custom select/transform without advanced multi-path editing |
| R2 | Gauge runtime performance — 100+ widgets @ 1Hz tag push | Med | Jank/dropped frames | (a) batch push in tag-binding (requestAnimationFrame); (b) raw setAttribute, not React state; (c) E2E perf baseline: 200 widgets @ 5Hz ≥ 30fps |
| R3 | Hmi schema drift from upstream FUXA | Med | Cherry-pick gets harder | BIOCore-internal schemaVersion, no upstream-tracking; manually port critical bug fixes only |
| R4 | 200+ test cases inflate work | High | +30-50% schedule | Accepted per D9 + D14; shared widget test harness; auto-generated snapshots |
| R5 | jQuery global pollution | Low | n/a — svg-edit rewrite eliminates | Risk eliminated |
| R6 | FUXA SVG asset licensing | Low | Legal risk | FUXA is MIT; preserve attribution comments in ported SVGs |
| R7 | TagBinding service vs useTag hook double-subscription state divergence | Med | Runtime shows wrong value | (a) useTag is React-only exit, runtime never uses useTag directly; (b) TagBinding is service-only exit via useTagBindingBridge; (c) unit test asserts: setState reactorData → tagBinding.lastValues syncs |
| R8 | Autosave draft hits a newer published version | Low | Draft invalidated | Autosave key includes `view_id + base_version`; mismatch prompts "草稿基于旧版, 强制应用 / 丢弃" |
| R9 | Dev hot-reload loses view JSON / SVG DOM state | Low | DX pain | view-store autosave covers dev; HMR restores from localStorage |
| R10 | 200 tests + full widget runtime → vitest worker memory leaks | Low | CI slow / OOM | `tests/setup-leak-detector.ts` forces GC + Map clear in afterEach; CI uses `vitest --pool=forks` |
| R11 | gauge-base abstraction insufficient after some widgets ported, requires rework | Med | +1-2 weeks | SP-FX-6 batch 1 covers most heterogeneous 5 (chart, table, slider, button, value) to validate base; gauge-base hooks (`onMount/onUnmount/onProcess/onPropertyChange/onResize`) defined early; unit test base interface |
| R12 | SP4-7 demo views collide with new fuxa_views namespace | Low | User confusion | `/scada2/view/{id}?source=legacy` for old, `?source=fuxa` for new; no `source` → prefer fuxa, fallback to scada_views |
| R13 | scada_views table retirement decision deferred | Low | Tech debt | Spec defers — "6 months post-SP-FX-8 review whether to drop scada_views" |
| R14 | Total work overruns 9 months (user ceiling) | Med | User cancels project | After SP-FX-1/2/3 complete (~4 weeks elapsed), reassess actual vs budget; if +50%, raise warning and negotiate scope reduction |

### Accepted / unmitigated risks

- Upstream FUXA divergence — accepted, self-maintain
- Self-implemented ngx-* widget polish gaps — accepted, iterate later
- 200+ test maintenance cost — accepted (D9 mandate)

### Stop conditions (any one triggers project pause + reassessment)

1. SP-FX-3 (svg-edit rewrite) does not achieve minimal draw+select+save flow by end of week 2
2. SP-FX-6 batch 1 of 5 widgets takes > 6 weeks (single widget > 1.2 weeks = base abstraction failed)
3. Cumulative actual > 1.5× budget at any SP-FX boundary
4. Performance baseline (200 widgets @ 5Hz, 30fps) not met after 1 week of optimization

---

## 10. What This Spec Does Not Decide

- The eight SP-FX implementation plans (each gets its own brainstorm → spec → plan cycle at execution time)
- Final widget-by-widget UI design (per-widget property panel layouts pre-decided to mirror FUXA, but visual polish deferred to implementation)
- Migration of any existing FUXA `Hmi` JSON exports the user may have — out of scope until user provides samples and requests a converter
- Retirement of `scada_views` table — deferred to 6-month post-SP-FX-8 review

---

## 11. Next Step

User reviews this spec. On approval, transition to the `superpowers:writing-plans` skill to produce the first implementation plan: **SP-FX-1** (assets + models + migration 033 + scada-routes CRUD). Subsequent SP-FX plans are written one at a time as the prior one completes.
