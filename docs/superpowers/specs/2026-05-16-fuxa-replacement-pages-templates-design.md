# SP5 Pages/Templates — Design Spec

**Date:** 2026-05-16
**Sub-project:** 5/8 of FUXA replacement
**Branch:** `feat/scada-data-model`
**Prerequisites:** SP1 (data model + API), SP2 (tag hooks), SP3 (SVG widgets + viewer), SP4 (editor select/transform) — all merged at `09278d6`

---

## Goal

Add the "view-set" layer on top of SP1–4: manage multiple SCADA views inside a project, support **clone-on-create from a template view**, support **widget click → navigate to another view**, and provide a **project dashboard** that lists views with drag-reorder.

**Explicitly out of scope (deferred):**
- Master views / shared header/footer composition → defer; SP5.5 if needed
- Multi-action widgets (write-tag / open-dialog / script) → SP6 (`WriteIntentDialog`) owns the write side
- Per-view permission ACLs → reuse existing project-level `requireRole`

---

## Architecture

```
packages/web-ui/src/app/scada2/
  page.tsx                  NEW — project + view-list dashboard
  [viewId]/page.tsx         MODIFY — viewer wraps link widgets in <a>
  edit/[viewId]/page.tsx    MODIFY — toolbar adds "另存为模板", widget link panel
  edit/new/page.tsx         NEW — new-view wizard (blank / from template)

packages/web-ui/src/components/scada/pages/
  ViewListPanel.tsx         NEW — list + drag-reorder + CRUD
  TemplatePicker.tsx        NEW — modal: list templates for cloning
  WidgetLinkPanel.tsx       NEW — editor sidebar: set widget.link.viewId

packages/web-ui/src/widgets/svg/
  types.ts                  MODIFY — add `link?: { viewId: string }` to SvgWidgetItem
  SvgWidgetInstance.tsx     MODIFY — wrap in <a> when in viewer mode and link present

packages/web-ui/src/hooks/
  useViewList.ts            NEW — SWR-style fetch of project's views
  useTemplates.ts           NEW — fetch is_template=1 views
  useViewMutations.ts       NEW — create / delete / rename / reorder / clone

packages/server/migrations/
  031-scada-view-template-flag.sql  NEW — ALTER TABLE + index

packages/server/src/scada-routes.ts             MODIFY
packages/data-service/src/sqlite-service.ts     MODIFY
```

---

## Data Contract

### Migration 031

```sql
-- 031-scada-view-template-flag.sql
ALTER TABLE scada_views ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_scada_views_template
  ON scada_views(project_id, is_template)
  WHERE is_template = 1;
```

### `SvgWidgetItem.link`

```ts
export interface SvgWidgetItem {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number;
  rotation?: number;
  props?: Record<string, unknown>;
  animations?: WidgetAnimations;
  link?: { viewId: string };  // NEW
}
```

Zod schema in `widgets/svg/types.ts` must be updated to allow `link` optional with `viewId: string`.

### API additions / changes

| Method | Path | Change |
|---|---|---|
| GET | `/scada/views/:viewId` | response includes `is_template: 0\|1` |
| GET | `/scada/projects/:projectId` | each view in `views[]` includes `is_template` |
| GET | `/scada/projects/:projectId/templates` | NEW — returns `{ items: ScadaViewMeta[] }` filtered to `is_template = 1` |
| POST | `/scada/projects/:projectId/views` | body accepts optional `is_template: 0\|1` and `clone_from?: string`. If `clone_from` set, server fetches that view, copies `items_json` + `width` + `height` + `background` into the new view. If template not found → 400 `template_not_found`. `clone_from` and `items` are mutually exclusive. |
| PUT | `/scada/views/:viewId` | body accepts `is_template: 0\|1` patch field |

All write endpoints keep existing `requireRole('admin', 'engineer')`.

### sqlite-service.ts changes

- `getScadaView` returns `is_template: number` field
- `listScadaViewsByProject` selects `is_template`
- `createScadaView` accepts optional `is_template` (default 0)
- `updateScadaView` patch accepts `is_template`
- NEW: `listScadaTemplates(projectId): ScadaViewMeta[]` — `WHERE project_id = ? AND is_template = 1`
- NEW: `cloneScadaView(sourceViewId, newViewId, newName, projectId): void` — INSERT with items_json/width/height/background copied from source

---

## Frontend store

Reuse SP4 `useEditorStore` for the editor; single-instance store keyed by current `viewId` from URL. Switching views = navigate away from `/scada2/edit/[viewId]` → unmount → mount new page → `__resetForTests(newView)`. No global multi-view state.

New SWR-style hooks (lightweight: `useState` + `useEffect` + manual fetch, no SWR library):

```ts
useViewList(projectId): { views: ScadaViewMeta[]; loading; error; refetch }
useTemplates(projectId): { templates: ScadaViewMeta[]; loading; error }
useViewMutations(projectId): {
  create: (name, opts: { cloneFrom?: string; isTemplate?: boolean }) => Promise<string>;
  rename: (viewId, name) => Promise<void>;
  delete: (viewId) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;  // sequential PUTs
  setTemplate: (viewId, isTemplate) => Promise<void>;
}
```

---

## Key flows

### Flow A — Create new view from template

1. User on `/scada2` clicks "新建画面" → `/scada2/edit/new?project=<pid>`
2. `edit/new/page.tsx` shows `TemplatePicker`: list "空白" + each `is_template = 1` view
3. User picks template "T1" + types name "Reactor 3 dashboard"
4. POST `/scada/projects/:pid/views { view_id: <generated>, name: "...", clone_from: "T1" }`
5. Server: 200 with new `view_id` → client `router.replace('/scada2/edit/<new-viewId>')`

### Flow B — Reorder views

1. ViewListPanel renders views ordered by `display_order ASC, name ASC`
2. User drags row N to position M (HTML5 drag/drop)
3. On drop, compute new array order → fire `useViewMutations.reorder(orderedIds)` which PUTs each view with new `display_order` (0, 1, 2, ...)
4. On success, refetch view list

### Flow C — Widget link → navigate

1. In editor, user selects widget → sidebar shows `WidgetLinkPanel` → user picks target view from dropdown → store updates `selected.link = { viewId }` → save
2. In viewer, `SvgWidgetInstance` checks `item.link`. If present and not in edit mode, wrap rendered `<g>` in `<a href={\`/scada2/${item.link.viewId}\`}>` (SVG-namespaced anchor)

### Flow D — Mark current view as template

1. In editor toolbar, button "另存为模板" toggles `is_template`
2. PUT `/scada/views/:viewId { is_template: 1 }` (no items patch, doesn't disturb edit state)
3. Toolbar button label flips to "取消模板"

---

## Behavior on edge cases

- **Template deleted while clone exists**: nothing breaks — clone already has its own items_json. Editor's WidgetLinkPanel dropdown filters out deleted view_ids; widgets with stale `link.viewId` render normally but clicking navigates to a 404 `/scada2/<missing>` page (viewer already handles 404).
- **Cyclic links**: A→B→A is allowed — each click is a fresh navigation, no infinite loop.
- **Link target deleted**: viewer shows existing 404 page; widget still renders as `<a>` (acceptable; no link-validity check at render time to avoid N+1 fetches).
- **Reorder partial failure**: each PUT is independent. If view 3 fails, views 0, 1, 2 already updated; refetch shows partial state. UI shows error toast; user retries. No client-side rollback.
- **`clone_from` template was deleted between picker render and POST**: server returns 400 `template_not_found`; UI alerts and reopens picker.
- **`is_template` toggle race**: standard last-write-wins via existing `expected_updated_at` mechanism.

---

## Performance

- `GET /scada/projects/:projectId` already returns all views in one query. 50 views < 50 KB JSON, < 100 ms server-side.
- `ViewListPanel` lazy-renders rows but a 50-item list is fine without virtualization.
- Drag-reorder issues N PUTs in parallel via `Promise.all`. For 50 views, that's ≤ 50 concurrent requests — server is SQLite single-writer so they serialize anyway. Acceptable.
- No N+1: WidgetLinkPanel dropdown uses the same `useViewList` data already in cache.

---

## Testing

**Total ~40 new tests.** All TDD RED-first.

| Layer | File | # Tests | Notes |
|---|---|---|---|
| Migration | `__tests__/migrations/031-scada-view-template-flag.test.ts` | 2 | Column added; index created |
| sqlite-service | `__tests__/sqlite-service.scada-templates.test.ts` | 5 | listScadaTemplates filters; cloneScadaView copies items/width/height; updateScadaView accepts is_template; getScadaView returns is_template; index used (EXPLAIN) |
| scada-routes | `__tests__/scada-routes.templates.test.ts` | 7 | GET templates filters; POST with clone_from copies items; POST clone_from missing → 400; PUT is_template patches; POST without clone_from/items still works; clone_from + items both set → 400; non-engineer role → 403 |
| Hooks | `__tests__/hooks.useViewList.test.ts` | 3 | fetches on mount, refetch, error |
| Hooks | `__tests__/hooks.useTemplates.test.ts` | 2 | fetches, empty |
| Hooks | `__tests__/hooks.useViewMutations.test.ts` | 4 | create/rename/delete/reorder POST/PUT/DELETE shapes |
| Component | `ViewListPanel.test.tsx` | 6 | renders rows; create button → modal; rename inline; delete confirm; drag-reorder updates `display_order`; empty state |
| Component | `TemplatePicker.test.tsx` | 4 | lists templates + "空白"; pick template; cancel; no templates |
| Component | `WidgetLinkPanel.test.tsx` | 3 | dropdown lists views; set link writes to store; clear link |
| Component | `SvgWidgetInstance.link.test.tsx` | 3 | viewer wraps in `<a>` with correct href; no link → no `<a>`; edit mode → no `<a>` |
| Page | `app/scada2/__tests__/page.test.tsx` | 2 | renders project + view list; new button navigates |
| Page | `app/scada2/edit/new/__tests__/page.test.tsx` | 3 | blank create; template clone create; failure path |

---

## File structure summary

**New (11 source + matching test files)**:
- `packages/server/migrations/031-scada-view-template-flag.sql`
- `packages/web-ui/src/app/scada2/page.tsx`
- `packages/web-ui/src/app/scada2/edit/new/page.tsx`
- `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`
- `packages/web-ui/src/components/scada/pages/TemplatePicker.tsx`
- `packages/web-ui/src/components/scada/pages/WidgetLinkPanel.tsx`
- `packages/web-ui/src/hooks/useViewList.ts`
- `packages/web-ui/src/hooks/useTemplates.ts`
- `packages/web-ui/src/hooks/useViewMutations.ts`

**Modify (5)**:
- `packages/server/src/scada-routes.ts` — templates GET, clone_from POST, is_template PUT
- `packages/data-service/src/sqlite-service.ts` — is_template field, listScadaTemplates, cloneScadaView
- `packages/web-ui/src/widgets/svg/types.ts` — add `link` to SvgWidgetItem + Zod schema
- `packages/web-ui/src/widgets/svg/SvgWidgetInstance.tsx` — wrap in `<a>` when link present and not editMode
- `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx` — add toolbar buttons "另存为模板" + WidgetLinkPanel sidebar

---

## Done criteria

- ~40 new tests green; existing 294 still green → 334 total
- `pnpm exec tsc --noEmit` clean for new files
- `/scada2` lists views, supports CRUD + drag-reorder
- `/scada2/edit/new` supports blank + clone-from-template
- Editor toolbar has "另存为模板" toggle
- Widget link in viewer wraps in `<a>` and navigates correctly
- Migration 031 is idempotent (re-running it is a no-op via `IF NOT EXISTS`)
- All commits on `feat/scada-data-model`; FF-merged to `main`

---

## Deferred to SP5.5 (if needed)

- Master views / shared header/footer composition
- View-level role ACLs (per-view read/write permission)
- Template versioning / "update clones when template changes"

## Deferred to SP6

- Widget `actions` beyond navigate: write-tag, open-dialog, script
- WriteIntentDialog
