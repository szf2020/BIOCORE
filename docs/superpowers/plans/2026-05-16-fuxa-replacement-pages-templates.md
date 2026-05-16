# SP5 Pages/Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the multi-view dashboard, template clone-on-create, and widget click-navigate features on top of SP1-4.

**Architecture:** One small SQL migration adds `is_template` flag. Backend route layer extends with template list + clone_from POST. Frontend adds project dashboard, new-view wizard, SWR-style hooks, and editor toolbar additions. Single-instance `useEditorStore` (from SP4) is reused; multi-view state lives in URL + hook caches.

**Tech Stack:** SQLite + better-sqlite3 + Express + Next.js 14 App Router + React 18 + TypeScript + zustand 4 + vitest + jsdom + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-05-16-fuxa-replacement-pages-templates-design.md`

**Branch:** `feat/scada-data-model` (continue on existing branch; T13 pushes + FF-merges to main)

---

## File Structure

**Create (server):**
- `packages/server/migrations/031-scada-view-template-flag.sql`
- `packages/server/src/__tests__/migrations/031-scada-view-template-flag.test.ts`

**Modify (server):**
- `packages/data-service/src/sqlite-service.ts` — `getScadaView`, `listScadaViewsByProject`, `listScadaViewsByReactor`, `createScadaView`, `updateScadaView` accept/return `is_template`; new methods `listScadaTemplates`, `cloneScadaView`
- `packages/server/src/scada-routes.ts` — new `GET /scada/projects/:projectId/templates`; `POST /scada/projects/:projectId/views` accepts `clone_from` + `is_template`; `PUT /scada/views/:viewId` accepts `is_template`

**Create (data-service test):**
- `packages/data-service/src/__tests__/scada-templates.test.ts`

**Modify (route tests):**
- `packages/server/src/__tests__/scada-routes.test.ts` — add `031` migration to `makeApp()`; new `describe` block for templates

**Modify (web-ui types/widget):**
- `packages/web-ui/src/widgets/svg/types.ts` — add `link?: { viewId: string }` to `SvgWidgetItem` + Zod
- `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` — wrap output in `<a>` when `instance.link?.viewId && !editMode`

**Create (web-ui types/widget test):**
- `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.link.test.tsx`

**Create (web-ui hooks):**
- `packages/web-ui/src/hooks/useViewList.ts`
- `packages/web-ui/src/hooks/useTemplates.ts`
- `packages/web-ui/src/hooks/useViewMutations.ts`
- `packages/web-ui/src/hooks/__tests__/useViewList.test.ts`
- `packages/web-ui/src/hooks/__tests__/useTemplates.test.ts`
- `packages/web-ui/src/hooks/__tests__/useViewMutations.test.ts`

**Create (web-ui components):**
- `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`
- `packages/web-ui/src/components/scada/pages/TemplatePicker.tsx`
- `packages/web-ui/src/components/scada/pages/WidgetLinkPanel.tsx`
- `packages/web-ui/src/components/scada/pages/__tests__/ViewListPanel.test.tsx`
- `packages/web-ui/src/components/scada/pages/__tests__/TemplatePicker.test.tsx`
- `packages/web-ui/src/components/scada/pages/__tests__/WidgetLinkPanel.test.tsx`

**Create (web-ui pages):**
- `packages/web-ui/src/app/scada2/page.tsx`
- `packages/web-ui/src/app/scada2/__tests__/page.test.tsx`
- `packages/web-ui/src/app/scada2/edit/new/page.tsx`
- `packages/web-ui/src/app/scada2/edit/new/__tests__/page.test.tsx`

**Modify (web-ui editor):**
- `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx` — add toolbar button "另存为模板", sidebar containing `<WidgetLinkPanel>` (no new tests; smoke covers it)

---

## Conventions used throughout

- **Run tests from web-ui:** `cd /Volumes/SSD/BIOCORE/packages/web-ui && export PATH="/Users/mac/.hermes/node/bin:$PATH" && pnpm exec vitest run <path>`
- **Run tests from server:** `cd /Volumes/SSD/BIOCORE/packages/server && export PATH="/Users/mac/.hermes/node/bin:$PATH" && pnpm exec vitest run <path>`
- **Run tests from data-service:** `cd /Volumes/SSD/BIOCORE/packages/data-service && export PATH="/Users/mac/.hermes/node/bin:$PATH" && pnpm exec vitest run <path>`
- **All commits go on `feat/scada-data-model`. No new branches.**
- **TDD strictly:** write failing test first, verify RED, implement, verify GREEN, commit.

---

## Task 1: Migration 031 — `is_template` flag

**Files:**
- Create: `packages/server/migrations/031-scada-view-template-flag.sql`
- Create: `packages/server/src/__tests__/migrations/031-scada-view-template-flag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/migrations/031-scada-view-template-flag.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function applyAll(db: Database.Database): void {
  db.exec(readFileSync(join(__dirname, '../../../migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../migrations/031-scada-view-template-flag.sql'), 'utf8'));
}

describe('migration 031 — scada_views.is_template', () => {
  it('adds is_template column with default 0', () => {
    const db = new Database(':memory:');
    applyAll(db);
    const cols = db.prepare("PRAGMA table_info(scada_views)").all() as Array<{ name: string; dflt_value: string | null }>;
    const col = cols.find(c => c.name === 'is_template');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe('0');
  });

  it('creates partial index idx_scada_views_template', () => {
    const db = new Database(':memory:');
    applyAll(db);
    const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND name='idx_scada_views_template'").get() as { name: string; sql: string } | undefined;
    expect(idx).toBeDefined();
    expect(idx!.sql).toMatch(/is_template/);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/server
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec vitest run src/__tests__/migrations/031-scada-view-template-flag.test.ts 2>&1 | tail -10
```

Expected: FAIL with `ENOENT: no such file or directory ... 031-scada-view-template-flag.sql`.

- [ ] **Step 3: Create the migration**

Create `packages/server/migrations/031-scada-view-template-flag.sql`:

```sql
-- 031-scada-view-template-flag.sql
-- Adds is_template flag so view-set sub-project (SP5) can mark template views.

ALTER TABLE scada_views ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_scada_views_template
  ON scada_views(project_id, is_template)
  WHERE is_template = 1;
```

- [ ] **Step 4: Run test, verify GREEN**

```bash
pnpm exec vitest run src/__tests__/migrations/031-scada-view-template-flag.test.ts 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/migrations/031-scada-view-template-flag.sql \
        packages/server/src/__tests__/migrations/031-scada-view-template-flag.test.ts
git commit -m "feat(scada): migration 031 — scada_views.is_template + partial index"
```

---

## Task 2: `sqlite-service` — `is_template` field, `listScadaTemplates`, `cloneScadaView`

**Files:**
- Modify: `packages/data-service/src/sqlite-service.ts`
- Create: `packages/data-service/src/__tests__/scada-templates.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/data-service/src/__tests__/scada-templates.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): SQLiteService {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../../server/migrations/031-scada-view-template-flag.sql'), 'utf8'));
  return new SQLiteService(db);
}

describe('SCADA templates', () => {
  let svc: SQLiteService;
  beforeEach(() => {
    svc = makeDb();
    svc.createScadaProject({ project_id: 'p1', name: 'P1' });
  });

  it('getScadaView returns is_template = 0 by default', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V1' });
    const v = svc.getScadaView('v1');
    expect(v).not.toBeNull();
    expect(v!.is_template).toBe(0);
  });

  it('createScadaView accepts is_template = 1', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'T', is_template: 1 });
    expect(svc.getScadaView('v1')!.is_template).toBe(1);
  });

  it('updateScadaView sets is_template', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V1' });
    const r = svc.updateScadaView('v1', { is_template: 1 });
    expect(r.ok).toBe(true);
    expect(svc.getScadaView('v1')!.is_template).toBe(1);
  });

  it('listScadaTemplates returns only templates of the given project', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V1', is_template: 0 });
    svc.createScadaView({ view_id: 't1', project_id: 'p1', name: 'T1', is_template: 1 });
    svc.createScadaView({ view_id: 't2', project_id: 'p1', name: 'T2', is_template: 1 });
    svc.createScadaProject({ project_id: 'p2', name: 'P2' });
    svc.createScadaView({ view_id: 'tx', project_id: 'p2', name: 'X', is_template: 1 });
    const list = svc.listScadaTemplates('p1');
    expect(list.map(t => t.view_id).sort()).toEqual(['t1', 't2']);
  });

  it('cloneScadaView copies items + width + height + background, not is_template', () => {
    svc.createScadaView({
      view_id: 'tmpl', project_id: 'p1', name: 'Template',
      width: 1600, height: 900, background: '#222',
      items: { width: 1600, height: 900, items: [{ id: 'r1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10 }] } as any,
      is_template: 1,
    });
    svc.cloneScadaView('tmpl', 'clone1', 'Clone One', 'p1');
    const clone = svc.getScadaView('clone1');
    expect(clone).not.toBeNull();
    expect(clone!.name).toBe('Clone One');
    expect(clone!.width).toBe(1600);
    expect(clone!.height).toBe(900);
    expect(clone!.background).toBe('#222');
    expect(clone!.is_template).toBe(0);
    expect((clone!.items as any).items).toHaveLength(1);
    expect((clone!.items as any).items[0].id).toBe('r1');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/data-service
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec vitest run src/__tests__/scada-templates.test.ts 2>&1 | tail -20
```

Expected: 5 fails; messages include `is_template` undefined and `cloneScadaView is not a function`.

- [ ] **Step 3: Modify `sqlite-service.ts`**

In `packages/data-service/src/sqlite-service.ts`:

**3a.** Locate the `ScadaViewMeta` type and the `ScadaView` interface. Search for `is_svg: number` to locate them; add `is_template: number` immediately after `is_svg` in both:

```typescript
export interface ScadaViewMeta {
  view_id: string;
  project_id: string;
  name: string;
  reactor_id: string | null;
  display_order: number;
  width: number;
  height: number;
  background: string;
  is_svg: number;
  is_template: number;   // ADD
  updated_at: string;
}
```

Apply the same `is_template: number` addition to the `ScadaView` interface (which extends or duplicates `ScadaViewMeta`).

**3b.** Update `getScadaView` SELECT to include `is_template`:

```typescript
getScadaView(viewId: string): ScadaView | null {
  const row = this.db.prepare(
    `SELECT view_id, project_id, name, reactor_id, display_order, width, height, background, is_svg, is_template, items_json, updated_at
     FROM scada_views WHERE view_id = ?`
  ).get(viewId) as (ScadaViewMeta & { items_json: string }) | undefined;
  if (!row) return null;
  const { items_json, ...meta } = row;
  let items: Record<string, any> = {};
  try { items = JSON.parse(items_json); } catch { items = {}; }
  return { ...meta, items };
}
```

**3c.** Update `listScadaViewsByProject` SELECT to include `is_template`. Locate the existing query (search for `FROM scada_views WHERE project_id`) and add `is_template` to the column list.

**3d.** Update `listScadaViewsByReactor` similarly — add `is_template` to its SELECT column list.

**3e.** Update `createScadaView` signature and INSERT:

```typescript
createScadaView(v: {
  view_id: string; project_id: string; name: string;
  reactor_id?: string | null;
  width?: number; height?: number; background?: string;
  display_order?: number;
  items?: Record<string, any>;
  is_template?: number;        // ADD
}): void {
  this.db.prepare(
    `INSERT INTO scada_views (view_id, project_id, name, reactor_id, display_order, width, height, background, items_json, is_template)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    v.view_id, v.project_id, v.name,
    v.reactor_id ?? null,
    v.display_order ?? 0,
    v.width ?? 1280,
    v.height ?? 720,
    v.background ?? '#ffffff',
    JSON.stringify(v.items ?? {}),
    v.is_template ?? 0,         // ADD
  );
}
```

**3f.** Update `updateScadaView` patch type and SET-clause builder:

```typescript
updateScadaView(viewId: string, patch: {
  name?: string;
  reactor_id?: string | null;
  display_order?: number;
  width?: number; height?: number; background?: string;
  items?: Record<string, any>;
  is_template?: number;          // ADD
  expected_updated_at?: string | null;
}):
  | { ok: true; updated_at: string }
  | { ok: false; conflict: true; current_updated_at: string }
  | { ok: false; conflict: false; not_found: true }
{
  // ... existing precondition checks (cur lookup, expected_updated_at compare) ...
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined)          { sets.push('name = ?');           vals.push(patch.name); }
  if (patch.reactor_id !== undefined)    { sets.push('reactor_id = ?');     vals.push(patch.reactor_id); }
  if (patch.display_order !== undefined) { sets.push('display_order = ?');  vals.push(patch.display_order); }
  if (patch.width !== undefined)         { sets.push('width = ?');          vals.push(patch.width); }
  if (patch.height !== undefined)        { sets.push('height = ?');         vals.push(patch.height); }
  if (patch.background !== undefined)    { sets.push('background = ?');     vals.push(patch.background); }
  if (patch.items !== undefined)         { sets.push('items_json = ?');     vals.push(JSON.stringify(patch.items)); }
  if (patch.is_template !== undefined)   { sets.push('is_template = ?');    vals.push(patch.is_template); }  // ADD
  sets.push("updated_at = datetime('now')");
  vals.push(viewId);
  this.db.prepare(`UPDATE scada_views SET ${sets.join(', ')} WHERE view_id = ?`).run(...vals);
  const after = this.db.prepare('SELECT updated_at FROM scada_views WHERE view_id = ?').get(viewId) as { updated_at: string };
  return { ok: true, updated_at: after.updated_at };
}
```

**3g.** Add two new methods after `updateScadaView`:

```typescript
listScadaTemplates(projectId: string): ScadaViewMeta[] {
  return this.db.prepare(
    `SELECT view_id, project_id, name, reactor_id, display_order, width, height, background, is_svg, is_template, updated_at
     FROM scada_views WHERE project_id = ? AND is_template = 1
     ORDER BY display_order ASC, name ASC`
  ).all(projectId) as ScadaViewMeta[];
}

cloneScadaView(sourceViewId: string, newViewId: string, newName: string, projectId: string): void {
  const src = this.getScadaView(sourceViewId);
  if (!src) throw new Error('clone_source_not_found');
  this.createScadaView({
    view_id: newViewId,
    project_id: projectId,
    name: newName,
    reactor_id: src.reactor_id,
    width: src.width,
    height: src.height,
    background: src.background,
    items: src.items,
    is_template: 0,
  });
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/__tests__/scada-templates.test.ts 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 5: Run the full data-service suite to confirm no regression**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/data-service/src/sqlite-service.ts \
        packages/data-service/src/__tests__/scada-templates.test.ts
git commit -m "feat(scada): sqlite-service is_template field + listScadaTemplates + cloneScadaView (+5 tests)"
```

---

## Task 3: `scada-routes` — GET templates, POST clone_from, PUT is_template

**Files:**
- Modify: `packages/server/src/scada-routes.ts`
- Modify: `packages/server/src/__tests__/scada-routes.test.ts`

- [ ] **Step 1: Add migration 031 to the route test harness**

In `packages/server/src/__tests__/scada-routes.test.ts`, locate the `makeApp` helper near the top. After the line that applies `028-scada-schema.sql`, ensure the harness also applies `030` and `031`:

```typescript
const m028 = readFileSync(join(__dirname, '../../migrations/028-scada-schema.sql'), 'utf8');
db.exec(m028);
const m030 = readFileSync(join(__dirname, '../../migrations/030-scada-view-svg-flag.sql'), 'utf8');
db.exec(m030);
const m031 = readFileSync(join(__dirname, '../../migrations/031-scada-view-template-flag.sql'), 'utf8');
db.exec(m031);
```

(If `m030` is already applied in the existing harness, only add `m031`.)

- [ ] **Step 2: Write the failing tests**

Append the following `describe` block to the end of `packages/server/src/__tests__/scada-routes.test.ts`:

```typescript
describe('SCADA REST API — templates', () => {
  async function setupProjectWithTemplate(): Promise<{ app: any; sqlite: any }> {
    const { app, sqlite } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 't1', name: 'Template 1', is_template: 1, items: { width: 1280, height: 720, items: [{ id: 'a', type: 'svg-rect', x: 5, y: 5, w: 50, h: 50 }] } })
      .expect(201);
    return { app, sqlite };
  }

  it('GET /scada/projects/:projectId/templates returns is_template=1 views', async () => {
    const { app } = await setupProjectWithTemplate();
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V1' }).expect(201);
    const r = await request(app).get('/api/v1/scada/projects/p1/templates').expect(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].view_id).toBe('t1');
  });

  it('POST view with clone_from copies items + width + height + background', async () => {
    const { app } = await setupProjectWithTemplate();
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'clone1', name: 'Clone', clone_from: 't1' });
    expect(r.status).toBe(201);
    const got = await request(app).get('/api/v1/scada/views/clone1').expect(200);
    expect((got.body.items as any).items).toHaveLength(1);
    expect((got.body.items as any).items[0].id).toBe('a');
    expect(got.body.is_template).toBe(0);
  });

  it('POST clone_from with missing template → 400 template_not_found', async () => {
    const { app } = await setupProjectWithTemplate();
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'cl2', name: 'X', clone_from: 'nope' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('template_not_found');
  });

  it('POST with both clone_from and items → 400 clone_and_items_exclusive', async () => {
    const { app } = await setupProjectWithTemplate();
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'cl3', name: 'X', clone_from: 't1', items: { width: 1, height: 1, items: [] } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('clone_and_items_exclusive');
  });

  it('POST without clone_from or items still works (back-compat)', async () => {
    const { app } = await setupProjectWithTemplate();
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v9', name: 'V9' });
    expect(r.status).toBe(201);
  });

  it('PUT /scada/views/:viewId with is_template=1 patches the flag', async () => {
    const { app } = await setupProjectWithTemplate();
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v2', name: 'V2' }).expect(201);
    await request(app).put('/api/v1/scada/views/v2').set('X-Test-Role', 'engineer')
      .send({ is_template: 1 }).expect(200);
    const got = await request(app).get('/api/v1/scada/views/v2').expect(200);
    expect(got.body.is_template).toBe(1);
  });

  it('POST clone_from as operator (no engineer role) → 403', async () => {
    const { app } = await setupProjectWithTemplate();
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'operator')
      .send({ view_id: 'cl4', name: 'X', clone_from: 't1' });
    expect(r.status).toBe(403);
  });
});
```

- [ ] **Step 3: Run tests, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/server
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec vitest run src/__tests__/scada-routes.test.ts -t 'templates' 2>&1 | tail -20
```

Expected: 7 fails; messages include `404` for unknown templates endpoint and `clone_from` not honored.

- [ ] **Step 4: Modify `scada-routes.ts`**

**4a.** Add the GET templates endpoint. Locate the existing `GET /scada/reactors/:reactorId/views` and add immediately after it:

```typescript
apiRouter.get('/scada/projects/:projectId/templates', (req, res) => {
  if (!sqlite.getScadaProject(req.params.projectId)) return res.status(404).json({ error: 'project_not_found' });
  res.json({ items: sqlite.listScadaTemplates(req.params.projectId) });
});
```

**4b.** Replace the `POST /scada/projects/:projectId/views` handler body with:

```typescript
apiRouter.post('/scada/projects/:projectId/views', requireRole('admin', 'engineer'), (req, res) => {
  const { projectId } = req.params;
  if (!sqlite.getScadaProject(projectId)) return res.status(404).json({ error: 'project_not_found' });
  const { view_id, name, reactor_id, width, height, background, display_order, items, is_template, clone_from } = req.body ?? {};
  if (isBlankString(view_id) || isBlankString(name)) return res.status(400).json({ error: 'view_id_and_name_required' });
  if (sqlite.getScadaView(view_id)) return res.status(409).json({ error: 'view_id_conflict' });
  if (clone_from !== undefined && items !== undefined) {
    return res.status(400).json({ error: 'clone_and_items_exclusive' });
  }
  if (clone_from !== undefined) {
    if (typeof clone_from !== 'string' || isBlankString(clone_from)) {
      return res.status(400).json({ error: 'clone_from_invalid' });
    }
    const src = sqlite.getScadaView(clone_from);
    if (!src) return res.status(400).json({ error: 'template_not_found' });
    try {
      sqlite.cloneScadaView(clone_from, view_id, name, projectId);
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || /UNIQUE/i.test(e?.message ?? '')) {
        return res.status(409).json({ error: 'view_id_conflict' });
      }
      throw e;
    }
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId, action: 'scada_view_clone', target_type: 'scada_view',
      target_id: view_id, new_value: JSON.stringify({ clone_from }), ip_address: getIp(req),
    });
    return res.status(201).json({ success: true, view_id });
  }
  if (items !== undefined) {
    const err = checkItemsSize(items);
    if (err) return res.status(400).json({ error: err });
  }
  try {
    sqlite.createScadaView({
      view_id, project_id: projectId, name,
      reactor_id: reactor_id ?? null,
      width, height, background, display_order,
      items: items ?? {},
      is_template: typeof is_template === 'number' ? is_template : 0,
    });
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || /UNIQUE/i.test(e?.message ?? '')) {
      return res.status(409).json({ error: 'view_id_conflict' });
    }
    throw e;
  }
  const userId = getUserId(req);
  sqlite.writeAuditLog({
    user_id: userId, action: 'scada_view_create', target_type: 'scada_view',
    target_id: view_id, new_value: JSON.stringify({ name, is_template: is_template ?? 0 }), ip_address: getIp(req),
  });
  res.status(201).json({ success: true, view_id });
});
```

**4c.** Extend `PUT /scada/views/:viewId` to allow patching `is_template`. Find the `patchKeys` array in the existing handler and add `'is_template'`. Also add `is_template` to the patch object passed to `sqlite.updateScadaView`:

```typescript
const patchKeys = ['name', 'reactor_id', 'display_order', 'width', 'height', 'background', 'items', 'is_template'];
// ...
const r = sqlite.updateScadaView(viewId, {
  name: body.name,
  reactor_id: body.reactor_id,
  display_order: body.display_order,
  width: body.width,
  height: body.height,
  background: body.background,
  items: body.items,
  is_template: typeof body.is_template === 'number' ? body.is_template : undefined,
  expected_updated_at: body.expected_updated_at ?? null,
});
```

- [ ] **Step 5: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/__tests__/scada-routes.test.ts -t 'templates' 2>&1 | tail -10
```

Expected: `7 passed`.

- [ ] **Step 6: Run the entire scada-routes test file to confirm back-compat**

```bash
pnpm exec vitest run src/__tests__/scada-routes.test.ts 2>&1 | tail -10
```

Expected: all existing route tests + 7 new = green.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/server/src/scada-routes.ts \
        packages/server/src/__tests__/scada-routes.test.ts
git commit -m "feat(scada): routes for templates + clone_from POST + is_template PUT (+7 tests)"
```

---

## Task 4: Widget `link` field + viewer `<a>` wrap

**Files:**
- Modify: `packages/web-ui/src/widgets/svg/types.ts`
- Modify: `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx`
- Create: `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.link.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.link.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';

beforeAll(() => {
  ensureBuiltinSvgWidgetsRegistered();
});

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgWidgetInstance link', () => {
  it('wraps in <a> when item.link.viewId is set', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      link: { viewId: 'next-view' },
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('/scada2/next-view');
  });

  it('does NOT wrap in <a> when item.link is undefined', () => {
    const item: SvgWidgetItem = { id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10 };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('does NOT wrap in <a> when editMode prop is true', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      link: { viewId: 'next-view' },
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" editMode />);
    expect(container.querySelector('a')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.link.test.tsx 2>&1 | tail -15
```

Expected: 3 fails (no `<a>` element; possibly type error on `editMode`).

- [ ] **Step 3: Add `link` to types**

In `packages/web-ui/src/widgets/svg/types.ts`, modify the `SvgWidgetItem` interface to add `link`:

```typescript
export interface SvgWidgetItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex?: number;
  visible?: boolean;
  bindings?: { tag?: string };
  props?: Record<string, unknown>;
  animations?: SvgAnimation[];
  link?: { viewId: string };   // ADD
}
```

And in the Zod schema literal, add the matching `link` field inside the items object schema:

```typescript
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
    animations: z.array(AnimationSchema).optional(),
    link: z.object({ viewId: z.string().min(1) }).optional(),   // ADD
  })),
});
```

- [ ] **Step 4: Modify `SvgWidgetInstance.tsx`**

Replace the contents of `packages/web-ui/src/components/scada/SvgWidgetInstance.tsx` with:

```tsx
'use client';
import React from 'react';
import { useTag } from '@/hooks/useTag';
import { getSvgWidget } from '@/widgets/svg/registry';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { applyAnimations } from '@/widgets/svg/animation/apply';
import { useAnimationTagStates } from '@/widgets/svg/animation/useAnimationTagStates';
import { useBlink } from '@/widgets/svg/animation/useBlink';
import { SvgErrorBoundary } from './SvgErrorBoundary';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
  editMode?: boolean;
}

export function SvgWidgetInstance({ instance, reactorId: _reactorId, editMode = false }: Props) {
  const tagName = instance.bindings?.tag ?? '';
  const tagState = useTag(tagName);
  const hasBinding = !!instance.bindings?.tag;

  const animTagStates = useAnimationTagStates(instance.animations);
  const blinkPhase = useBlink(instance.animations);
  const animResult = applyAnimations(
    instance.animations,
    animTagStates.map((s) => s.value),
    blinkPhase,
    instance.w,
    instance.h,
  );

  if (instance.visible === false) return null;
  if (!animResult.visible) return null;

  const transform = buildTransform(instance, animResult.transform);
  const reg = getSvgWidget(instance.type);

  const inner = (() => {
    if (!reg) {
      console.warn(`Unknown SVG widget type: ${instance.type}`);
      return (
        <g transform={transform}>
          <rect width={instance.w} height={instance.h} fill="#fee" stroke="#c33" />
          <text x={4} y={14} fontSize={10} fill="#c33">?{instance.type}</text>
        </g>
      );
    }
    const Component = reg.component;
    const mergedConfig = { ...(instance.props ?? {}), ...animResult.configOverrides };
    return (
      <g transform={transform} opacity={animResult.opacity}>
        <SvgErrorBoundary widgetId={instance.id} w={instance.w} h={instance.h}>
          <Component
            width={instance.w}
            height={instance.h}
            tagValue={hasBinding ? tagState.value : undefined}
            tagStale={hasBinding ? tagState.isStale : undefined}
            tagName={instance.bindings?.tag}
            config={mergedConfig}
          />
        </SvgErrorBoundary>
      </g>
    );
  })();

  if (!editMode && instance.link?.viewId) {
    return <a href={`/scada2/${instance.link.viewId}`}>{inner}</a>;
  }
  return inner;
}

function buildTransform(instance: SvgWidgetItem, animationTransform: string): string {
  const parts: string[] = [`translate(${instance.x},${instance.y})`];
  if (instance.rotation != null && instance.rotation !== 0) {
    parts.push(`rotate(${instance.rotation},${instance.w / 2},${instance.h / 2})`);
  }
  if (animationTransform) {
    parts.push(animationTransform);
  }
  return parts.join(' ');
}
```

- [ ] **Step 5: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/__tests__/SvgWidgetInstance.link.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 6: Run all SvgWidgetInstance-related tests to confirm no regression**

```bash
pnpm exec vitest run src/components/scada/__tests__/ 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/widgets/svg/types.ts \
        packages/web-ui/src/components/scada/SvgWidgetInstance.tsx \
        packages/web-ui/src/components/scada/__tests__/SvgWidgetInstance.link.test.tsx
git commit -m "feat(scada): widget link field + viewer <a> wrap (+3 tests)"
```

---

## Task 5: `useViewList` + `useTemplates` hooks

**Files:**
- Create: `packages/web-ui/src/hooks/useViewList.ts`
- Create: `packages/web-ui/src/hooks/useTemplates.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useViewList.test.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useTemplates.test.ts`

- [ ] **Step 1: Write the failing tests for `useViewList`**

Create `packages/web-ui/src/hooks/__tests__/useViewList.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useViewList } from '../useViewList';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useViewList', () => {
  it('fetches the project + views on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [{ view_id: 'v1', name: 'V1', is_template: 0, display_order: 0 }] }),
    });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].view_id).toBe('v1');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/scada/projects/p1', expect.objectContaining({ credentials: 'include' }));
  });

  it('refetch reloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [] }),
    });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'p1', name: 'P', views: [{ view_id: 'v2', name: 'V2', is_template: 0, display_order: 0 }] }),
    });
    await act(async () => { await result.current.refetch(); });
    expect(result.current.views).toHaveLength(1);
  });

  it('sets error on non-OK', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useViewList('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.views).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing tests for `useTemplates`**

Create `packages/web-ui/src/hooks/__tests__/useTemplates.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTemplates } from '../useTemplates';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTemplates', () => {
  it('fetches the templates list on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ view_id: 't1', name: 'T1', is_template: 1, display_order: 0 }] }),
    });
    const { result } = renderHook(() => useTemplates('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].view_id).toBe('t1');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/scada/projects/p1/templates', expect.objectContaining({ credentials: 'include' }));
  });

  it('handles empty templates list', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    const { result } = renderHook(() => useTemplates('p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.templates).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests, verify RED**

```bash
pnpm exec vitest run src/hooks/__tests__/useViewList.test.ts src/hooks/__tests__/useTemplates.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module '../useViewList'` and `'../useTemplates'`.

- [ ] **Step 4: Create `useViewList`**

Create `packages/web-ui/src/hooks/useViewList.ts`:

```typescript
'use client';
import { useCallback, useEffect, useState } from 'react';

export interface ViewMeta {
  view_id: string;
  project_id?: string;
  name: string;
  reactor_id?: string | null;
  display_order: number;
  is_template: number;
  is_svg?: number;
  updated_at?: string;
}

export interface UseViewListResult {
  views: ViewMeta[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useViewList(projectId: string): UseViewListResult {
  const [views, setViews] = useState<ViewMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setViews((body.views ?? []) as ViewMeta[]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setViews([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { views, loading, error, refetch };
}
```

- [ ] **Step 5: Create `useTemplates`**

Create `packages/web-ui/src/hooks/useTemplates.ts`:

```typescript
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ViewMeta } from './useViewList';

export interface UseTemplatesResult {
  templates: ViewMeta[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTemplates(projectId: string): UseTemplatesResult {
  const [templates, setTemplates] = useState<ViewMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}/templates`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setTemplates((body.items ?? []) as ViewMeta[]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { templates, loading, error, refetch };
}
```

- [ ] **Step 6: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/hooks/__tests__/useViewList.test.ts src/hooks/__tests__/useTemplates.test.ts 2>&1 | tail -10
```

Expected: `5 passed`.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/useViewList.ts \
        packages/web-ui/src/hooks/useTemplates.ts \
        packages/web-ui/src/hooks/__tests__/useViewList.test.ts \
        packages/web-ui/src/hooks/__tests__/useTemplates.test.ts
git commit -m "feat(scada-pages): useViewList + useTemplates hooks (+5 tests)"
```

---

## Task 6: `useViewMutations` hook

**Files:**
- Create: `packages/web-ui/src/hooks/useViewMutations.ts`
- Create: `packages/web-ui/src/hooks/__tests__/useViewMutations.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/hooks/__tests__/useViewMutations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewMutations } from '../useViewMutations';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as any).fetch = fetchMock;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useViewMutations', () => {
  it('create POSTs to /scada/projects/:projectId/views with body shape', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ view_id: 'new-id', success: true }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => {
      await result.current.create('My View', { cloneFrom: 't1' });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/projects/p1/views',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.name).toBe('My View');
    expect(body.clone_from).toBe('t1');
    expect(typeof body.view_id).toBe('string');
    expect(body.view_id.length).toBeGreaterThan(0);
  });

  it('rename PUTs name to /scada/views/:viewId', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ updated_at: 'now' }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => { await result.current.rename('v1', 'New Name'); });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/views/v1',
      expect.objectContaining({ method: 'PUT' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as any).body);
    expect(body.name).toBe('New Name');
  });

  it('delete DELETEs /scada/views/:viewId', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => { await result.current.delete('v1'); });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/scada/views/v1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('reorder PUTs display_order for each view sequentially', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated_at: 'now' }) });
    const { result } = renderHook(() => useViewMutations('p1'));
    await act(async () => { await result.current.reorder(['v3', 'v1', 'v2']); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map((c: any) => JSON.parse(c[1].body));
    expect(bodies[0]).toEqual({ display_order: 0 });
    expect(bodies[1]).toEqual({ display_order: 1 });
    expect(bodies[2]).toEqual({ display_order: 2 });
    expect((fetchMock.mock.calls[0]![0] as string)).toContain('/scada/views/v3');
    expect((fetchMock.mock.calls[1]![0] as string)).toContain('/scada/views/v1');
    expect((fetchMock.mock.calls[2]![0] as string)).toContain('/scada/views/v2');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/hooks/__tests__/useViewMutations.test.ts 2>&1 | tail -15
```

Expected: `Cannot find module '../useViewMutations'`.

- [ ] **Step 3: Create `useViewMutations`**

Create `packages/web-ui/src/hooks/useViewMutations.ts`:

```typescript
'use client';
import { useMemo } from 'react';

export interface UseViewMutationsResult {
  create: (name: string, opts?: { cloneFrom?: string; isTemplate?: boolean }) => Promise<string>;
  rename: (viewId: string, name: string) => Promise<void>;
  delete: (viewId: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  setTemplate: (viewId: string, isTemplate: boolean) => Promise<void>;
}

function generateViewId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `view_${Date.now()}_${rand}`;
}

async function jsonFetch(input: string, init: RequestInit): Promise<Response> {
  const r = await fetch(input, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = j.error ?? ''; } catch { /* ignore */ }
    throw new Error(`HTTP ${r.status}${detail ? ` (${detail})` : ''}`);
  }
  return r;
}

export function useViewMutations(projectId: string): UseViewMutationsResult {
  return useMemo<UseViewMutationsResult>(() => ({
    async create(name, opts = {}) {
      const view_id = generateViewId();
      const body: Record<string, unknown> = { view_id, name };
      if (opts.cloneFrom) body.clone_from = opts.cloneFrom;
      if (opts.isTemplate) body.is_template = 1;
      await jsonFetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}/views`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return view_id;
    },
    async rename(viewId, name) {
      await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
    },
    async delete(viewId) {
      await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, { method: 'DELETE' });
    },
    async reorder(orderedIds) {
      for (let i = 0; i < orderedIds.length; i++) {
        await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(orderedIds[i])}`, {
          method: 'PUT',
          body: JSON.stringify({ display_order: i }),
        });
      }
    },
    async setTemplate(viewId, isTemplate) {
      await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_template: isTemplate ? 1 : 0 }),
      });
    },
  }), [projectId]);
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/hooks/__tests__/useViewMutations.test.ts 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/hooks/useViewMutations.ts \
        packages/web-ui/src/hooks/__tests__/useViewMutations.test.ts
git commit -m "feat(scada-pages): useViewMutations hook (create/rename/delete/reorder/setTemplate) (+4 tests)"
```

---

## Task 7: `ViewListPanel` component

**Files:**
- Create: `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`
- Create: `packages/web-ui/src/components/scada/pages/__tests__/ViewListPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/pages/__tests__/ViewListPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ViewListPanel } from '../ViewListPanel';

const mockViews = [
  { view_id: 'v1', name: 'Plant Overview', is_template: 0, display_order: 0 },
  { view_id: 'v2', name: 'Reactor 3', is_template: 0, display_order: 1 },
];
const mockTemplates = [{ view_id: 't1', name: 'Template 1', is_template: 1, display_order: 0 }];

const mocks = {
  views: mockViews,
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(async () => {}),
  create: vi.fn(async (_name: string, _opts?: any) => 'new-id'),
  rename: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
  reorder: vi.fn(async () => {}),
  setTemplate: vi.fn(async () => {}),
  templates: mockTemplates,
};

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({ views: mocks.views, loading: mocks.loading, error: mocks.error, refetch: mocks.refetch }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: mocks.templates, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    create: mocks.create, rename: mocks.rename, delete: mocks.delete,
    reorder: mocks.reorder, setTemplate: mocks.setTemplate,
  }),
}));

beforeEach(() => {
  mocks.views = [...mockViews];
  mocks.loading = false;
  mocks.error = null;
  mocks.refetch.mockClear();
  mocks.create.mockClear();
  mocks.rename.mockClear();
  mocks.delete.mockClear();
  mocks.reorder.mockClear();
});

describe('ViewListPanel', () => {
  it('renders view rows', () => {
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText('Plant Overview')).toBeTruthy();
    expect(screen.getByText('Reactor 3')).toBeTruthy();
  });

  it('shows empty state when no views', () => {
    mocks.views = [];
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText(/没有画面/)).toBeTruthy();
  });

  it('rename button triggers inline rename', async () => {
    render(<ViewListPanel projectId="p1" />);
    const row = screen.getByText('Plant Overview').closest('[data-testid="view-row"]')!;
    const renameBtn = row.querySelector('[data-testid="rename-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(renameBtn); });
    const input = row.querySelector('input[data-testid="rename-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Renamed' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(mocks.rename).toHaveBeenCalledWith('v1', 'Renamed');
  });

  it('delete confirmation calls mutations.delete', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ViewListPanel projectId="p1" />);
    const row = screen.getByText('Reactor 3').closest('[data-testid="view-row"]')!;
    const delBtn = row.querySelector('[data-testid="delete-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(delBtn); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith('v2');
    confirmSpy.mockRestore();
  });

  it('move-up button reorders adjacent rows', async () => {
    render(<ViewListPanel projectId="p1" />);
    const row = screen.getByText('Reactor 3').closest('[data-testid="view-row"]')!;
    const upBtn = row.querySelector('[data-testid="move-up-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(upBtn); });
    expect(mocks.reorder).toHaveBeenCalledWith(['v2', 'v1']);
  });

  it('loading state renders skeleton', () => {
    mocks.loading = true;
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText(/加载中/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/ViewListPanel.test.tsx 2>&1 | tail -15
```

Expected: `Cannot find module '../ViewListPanel'`.

- [ ] **Step 3: Create `ViewListPanel`**

Create `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { useViewList } from '@/hooks/useViewList';
import { useViewMutations } from '@/hooks/useViewMutations';
import type { ViewMeta } from '@/hooks/useViewList';

interface Props {
  projectId: string;
}

export function ViewListPanel({ projectId }: Props) {
  const { views, loading, error, refetch } = useViewList(projectId);
  const mut = useViewMutations(projectId);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  if (loading) return <div style={{ padding: 8 }}>加载中…</div>;
  if (error) return <div style={{ padding: 8, color: '#dc2626' }}>错误: {error.message}</div>;
  if (views.length === 0) return <div style={{ padding: 8, color: '#666' }}>没有画面</div>;

  const sorted = [...views].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  async function handleRename(viewId: string, newName: string) {
    if (newName.trim().length === 0) { setRenamingId(null); return; }
    await mut.rename(viewId, newName.trim());
    setRenamingId(null);
    await refetch();
  }

  async function handleDelete(view: ViewMeta) {
    if (!window.confirm(`确认删除画面 "${view.name}"?`)) return;
    await mut.delete(view.view_id);
    await refetch();
  }

  async function handleMove(viewId: string, direction: -1 | 1) {
    const idx = sorted.findIndex(v => v.view_id === viewId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const swapped = [...sorted];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    await mut.reorder(swapped.map(v => v.view_id));
    await refetch();
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sorted.map((v, i) => (
        <li key={v.view_id} data-testid="view-row"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #eee' }}>
          {renamingId === v.view_id ? (
            <RenameInput initial={v.name} onSubmit={(name) => handleRename(v.view_id, name)} onCancel={() => setRenamingId(null)} />
          ) : (
            <span style={{ flex: 1 }}>
              {v.name}
              {v.is_template ? <span style={{ marginLeft: 6, fontSize: 10, color: '#3b82f6' }}>[模板]</span> : null}
            </span>
          )}
          <button data-testid="move-up-btn" onClick={() => handleMove(v.view_id, -1)} disabled={i === 0}>↑</button>
          <button data-testid="move-down-btn" onClick={() => handleMove(v.view_id, 1)} disabled={i === sorted.length - 1}>↓</button>
          <button data-testid="rename-btn" onClick={() => setRenamingId(v.view_id)}>重命名</button>
          <button data-testid="delete-btn" onClick={() => handleDelete(v)}>删除</button>
          <a href={`/scada2/${v.view_id}`}>查看</a>
          <a href={`/scada2/edit/${v.view_id}`}>编辑</a>
        </li>
      ))}
    </ul>
  );
}

function RenameInput({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initial);
  return (
    <input
      data-testid="rename-input"
      value={val}
      autoFocus
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit(val);
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onSubmit(val)}
      style={{ flex: 1 }}
    />
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/ViewListPanel.test.tsx 2>&1 | tail -10
```

Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/pages/ViewListPanel.tsx \
        packages/web-ui/src/components/scada/pages/__tests__/ViewListPanel.test.tsx
git commit -m "feat(scada-pages): ViewListPanel (list + rename + delete + reorder) (+6 tests)"
```

---

## Task 8: `TemplatePicker` modal

**Files:**
- Create: `packages/web-ui/src/components/scada/pages/TemplatePicker.tsx`
- Create: `packages/web-ui/src/components/scada/pages/__tests__/TemplatePicker.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/pages/__tests__/TemplatePicker.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TemplatePicker } from '../TemplatePicker';

const mocks = {
  templates: [
    { view_id: 't1', name: 'Plant Template', is_template: 1, display_order: 0 },
    { view_id: 't2', name: 'Reactor Template', is_template: 1, display_order: 1 },
  ] as Array<{ view_id: string; name: string; is_template: number; display_order: number }>,
  loading: false,
};

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: mocks.templates, loading: mocks.loading, error: null, refetch: vi.fn() }),
}));

beforeEach(() => {
  mocks.templates = [
    { view_id: 't1', name: 'Plant Template', is_template: 1, display_order: 0 },
    { view_id: 't2', name: 'Reactor Template', is_template: 1, display_order: 1 },
  ];
  mocks.loading = false;
});

describe('TemplatePicker', () => {
  it('renders "空白" + each template option', () => {
    const onPick = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
    expect(screen.getByText('空白')).toBeTruthy();
    expect(screen.getByText('Plant Template')).toBeTruthy();
    expect(screen.getByText('Reactor Template')).toBeTruthy();
  });

  it('picking a template calls onPick with its view_id', async () => {
    const onPick = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Plant Template')); });
    expect(onPick).toHaveBeenCalledWith('t1');
  });

  it('picking "空白" calls onPick with null', async () => {
    const onPick = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('空白')); });
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={() => {}} onCancel={onCancel} />);
    await act(async () => { fireEvent.click(screen.getByText('取消')); });
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/TemplatePicker.test.tsx 2>&1 | tail -10
```

Expected: `Cannot find module '../TemplatePicker'`.

- [ ] **Step 3: Create `TemplatePicker`**

Create `packages/web-ui/src/components/scada/pages/TemplatePicker.tsx`:

```tsx
'use client';
import React from 'react';
import { useTemplates } from '@/hooks/useTemplates';

interface Props {
  projectId: string;
  onPick: (templateViewId: string | null) => void;
  onCancel: () => void;
}

export function TemplatePicker({ projectId, onPick, onCancel }: Props) {
  const { templates, loading } = useTemplates(projectId);

  return (
    <div data-testid="template-picker" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', padding: 16, minWidth: 320, borderRadius: 4 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>选择模板</h3>
        {loading ? (
          <div>加载中…</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li>
              <button
                onClick={() => onPick(null)}
                style={{ width: '100%', textAlign: 'left', padding: 8, border: '1px solid #ddd', marginBottom: 4, background: '#fff', cursor: 'pointer' }}
              >空白</button>
            </li>
            {templates.map(t => (
              <li key={t.view_id}>
                <button
                  onClick={() => onPick(t.view_id)}
                  style={{ width: '100%', textAlign: 'left', padding: 8, border: '1px solid #ddd', marginBottom: 4, background: '#fff', cursor: 'pointer' }}
                >{t.name}</button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <button onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/TemplatePicker.test.tsx 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/pages/TemplatePicker.tsx \
        packages/web-ui/src/components/scada/pages/__tests__/TemplatePicker.test.tsx
git commit -m "feat(scada-pages): TemplatePicker modal (+4 tests)"
```

---

## Task 9: `WidgetLinkPanel` sidebar

**Files:**
- Create: `packages/web-ui/src/components/scada/pages/WidgetLinkPanel.tsx`
- Create: `packages/web-ui/src/components/scada/pages/__tests__/WidgetLinkPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/web-ui/src/components/scada/pages/__tests__/WidgetLinkPanel.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { WidgetLinkPanel } from '../WidgetLinkPanel';

const mockViews = [
  { view_id: 'v1', name: 'Main', is_template: 0, display_order: 0 },
  { view_id: 'v2', name: 'Secondary', is_template: 0, display_order: 1 },
];

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({ views: mockViews, loading: false, error: null, refetch: vi.fn() }),
}));

beforeEach(() => {
  useEditorStore.getState().__resetForTests({
    width: 800, height: 600,
    items: [{ id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50 }],
  });
});

describe('WidgetLinkPanel', () => {
  it('renders nothing when no widget is selected', () => {
    const { container } = render(<WidgetLinkPanel projectId="p1" />);
    expect(container.querySelector('[data-testid="widget-link-panel"]')).toBeNull();
  });

  it('dropdown lists views; selecting one writes link to the selected widget', async () => {
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetLinkPanel projectId="p1" />);
    const select = screen.getByTestId('widget-link-select') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: 'v2' } }); });
    const item = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect(item.link).toEqual({ viewId: 'v2' });
  });

  it('clearing the link writes link = undefined', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50, link: { viewId: 'v2' } }],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetLinkPanel projectId="p1" />);
    const select = screen.getByTestId('widget-link-select') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: '' } }); });
    const item = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect(item.link).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/WidgetLinkPanel.test.tsx 2>&1 | tail -10
```

Expected: `Cannot find module '../WidgetLinkPanel'`.

- [ ] **Step 3: Create `WidgetLinkPanel`**

Create `packages/web-ui/src/components/scada/pages/WidgetLinkPanel.tsx`:

```tsx
'use client';
import React from 'react';
import { useViewList } from '@/hooks/useViewList';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';

interface Props {
  projectId: string;
}

export function WidgetLinkPanel({ projectId }: Props) {
  const { views } = useViewList(projectId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const items = useEditorStore((s) => s.view.items);
  const setWidget = useEditorStore((s) => s.setWidget);

  if (selectedIds.size !== 1) return null;
  const [selectedId] = Array.from(selectedIds);
  const widget = items.find(it => it.id === selectedId);
  if (!widget) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (!widget) return;
    if (v === '') {
      const { link: _drop, ...rest } = widget;
      setWidget(widget.id, rest);
    } else {
      setWidget(widget.id, { ...widget, link: { viewId: v } });
    }
  }

  return (
    <div data-testid="widget-link-panel" style={{ padding: 8, borderTop: '1px solid #eee' }}>
      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>点击跳转到画面</label>
      <select
        data-testid="widget-link-select"
        value={widget.link?.viewId ?? ''}
        onChange={onChange}
        style={{ width: '100%' }}
      >
        <option value="">(无)</option>
        {views.filter(v => v.view_id !== widget.id).map(v => (
          <option key={v.view_id} value={v.view_id}>{v.name}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/components/scada/pages/__tests__/WidgetLinkPanel.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/components/scada/pages/WidgetLinkPanel.tsx \
        packages/web-ui/src/components/scada/pages/__tests__/WidgetLinkPanel.test.tsx
git commit -m "feat(scada-pages): WidgetLinkPanel sidebar (+3 tests)"
```

---

## Task 10: `/scada2` dashboard page

**Files:**
- Create: `packages/web-ui/src/app/scada2/page.tsx`
- Create: `packages/web-ui/src/app/scada2/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web-ui/src/app/scada2/__tests__/page.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from '../page';

const navMock = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => navMock,
  useSearchParams: () => ({ get: (k: string) => (k === 'project' ? 'p1' : null) }),
}));

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({
    views: [{ view_id: 'v1', name: 'Plant', is_template: 0, display_order: 0 }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: [], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    create: vi.fn(), rename: vi.fn(), delete: vi.fn(), reorder: vi.fn(), setTemplate: vi.fn(),
  }),
}));

beforeEach(() => { navMock.push.mockClear(); navMock.replace.mockClear(); });

describe('/scada2 dashboard page', () => {
  it('renders the project view list', () => {
    render(<Page />);
    expect(screen.getByText('Plant')).toBeTruthy();
  });

  it('has a "新建画面" link to /scada2/edit/new?project=p1', () => {
    render(<Page />);
    const link = screen.getByText('新建画面').closest('a') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/scada2/edit/new?project=p1');
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/app/scada2/__tests__/page.test.tsx 2>&1 | tail -10
```

Expected: `Cannot find module '../page'`.

- [ ] **Step 3: Create the dashboard page**

Create `packages/web-ui/src/app/scada2/page.tsx`:

```tsx
'use client';
import React from 'react';
import { useSearchParams } from 'next/navigation';
import { ViewListPanel } from '@/components/scada/pages/ViewListPanel';

export default function Page() {
  const search = useSearchParams();
  const projectId = search?.get('project') ?? 'default';

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>SCADA 画面集 — 项目 {projectId}</h2>
        <a
          href={`/scada2/edit/new?project=${encodeURIComponent(projectId)}`}
          style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', textDecoration: 'none', borderRadius: 4 }}
        >新建画面</a>
      </div>
      <ViewListPanel projectId={projectId} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/app/scada2/__tests__/page.test.tsx 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/app/scada2/page.tsx \
        packages/web-ui/src/app/scada2/__tests__/page.test.tsx
git commit -m "feat(scada-pages): /scada2 dashboard (project view list + new button) (+2 tests)"
```

---

## Task 11: `/scada2/edit/new` new-view wizard

**Files:**
- Create: `packages/web-ui/src/app/scada2/edit/new/page.tsx`
- Create: `packages/web-ui/src/app/scada2/edit/new/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/web-ui/src/app/scada2/edit/new/__tests__/page.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Page from '../page';

const navMock = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => navMock,
  useSearchParams: () => ({ get: (k: string) => (k === 'project' ? 'p1' : null) }),
}));

const createMock = vi.fn();
vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    create: createMock, rename: vi.fn(), delete: vi.fn(), reorder: vi.fn(), setTemplate: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [{ view_id: 't1', name: 'T1', is_template: 1, display_order: 0 }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  navMock.push.mockClear();
  navMock.replace.mockClear();
  createMock.mockReset();
});

describe('/scada2/edit/new', () => {
  it('blank create: user types name, picks 空白, submits → POST with no clone_from', async () => {
    createMock.mockResolvedValueOnce('new-view-1');
    render(<Page />);
    const input = screen.getByTestId('new-view-name') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'New View' } }); });
    await act(async () => { fireEvent.click(screen.getByText('空白')); });
    await act(async () => { fireEvent.click(screen.getByText('创建')); });
    expect(createMock).toHaveBeenCalledWith('New View', { cloneFrom: undefined });
    expect(navMock.replace).toHaveBeenCalledWith('/scada2/edit/new-view-1');
  });

  it('clone create: user picks template, submits → POST with clone_from', async () => {
    createMock.mockResolvedValueOnce('new-view-2');
    render(<Page />);
    const input = screen.getByTestId('new-view-name') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Clone View' } }); });
    await act(async () => { fireEvent.click(screen.getByText('T1')); });
    await act(async () => { fireEvent.click(screen.getByText('创建')); });
    expect(createMock).toHaveBeenCalledWith('Clone View', { cloneFrom: 't1' });
  });

  it('create failure shows error and does not navigate', async () => {
    createMock.mockRejectedValueOnce(new Error('boom'));
    render(<Page />);
    const input = screen.getByTestId('new-view-name') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Bad' } }); });
    await act(async () => { fireEvent.click(screen.getByText('空白')); });
    await act(async () => { fireEvent.click(screen.getByText('创建')); });
    expect(navMock.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-view-error').textContent).toMatch(/boom/);
  });
});
```

- [ ] **Step 2: Run test, verify RED**

```bash
pnpm exec vitest run src/app/scada2/edit/new/__tests__/page.test.tsx 2>&1 | tail -10
```

Expected: `Cannot find module '../page'`.

- [ ] **Step 3: Create the new-view wizard**

Create `packages/web-ui/src/app/scada2/edit/new/page.tsx`:

```tsx
'use client';
import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TemplatePicker } from '@/components/scada/pages/TemplatePicker';
import { useViewMutations } from '@/hooks/useViewMutations';

export default function Page() {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search?.get('project') ?? 'default';

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { create } = useViewMutations(projectId);

  async function handleCreate() {
    if (!name.trim() || templateId === undefined) return;
    setCreating(true);
    setError(null);
    try {
      const newId = await create(name.trim(), { cloneFrom: templateId ?? undefined });
      router.replace(`/scada2/edit/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <h2>新建画面</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>
        名称
        <input
          data-testid="new-view-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%' }}
          autoFocus
        />
      </label>
      {templateId === undefined ? (
        <TemplatePicker
          projectId={projectId}
          onPick={(t) => setTemplateId(t)}
          onCancel={() => router.replace(`/scada2?project=${encodeURIComponent(projectId)}`)}
        />
      ) : (
        <div style={{ marginBottom: 8 }}>
          模板: {templateId === null ? '空白' : templateId}
          <button onClick={() => setTemplateId(undefined)} style={{ marginLeft: 8 }}>更改</button>
        </div>
      )}
      <button onClick={handleCreate} disabled={creating || templateId === undefined || !name.trim()}>
        {creating ? '创建中…' : '创建'}
      </button>
      {error && <div data-testid="new-view-error" style={{ color: '#dc2626', marginTop: 8 }}>错误: {error}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify GREEN**

```bash
pnpm exec vitest run src/app/scada2/edit/new/__tests__/page.test.tsx 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/app/scada2/edit/new/page.tsx \
        packages/web-ui/src/app/scada2/edit/new/__tests__/page.test.tsx
git commit -m "feat(scada-pages): /scada2/edit/new wizard (blank + clone) (+3 tests)"
```

---

## Task 12: Editor toolbar — "另存为模板" + sidebar `WidgetLinkPanel`

**Files:**
- Modify: `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx`

- [ ] **Step 1: Modify the editor page**

Replace the contents of `packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx` with:

```tsx
'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgEditorCanvas } from '@/components/scada/svg-editor/SvgEditorCanvas';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { useKeyboardShortcuts } from '@/components/scada/svg-editor/useKeyboardShortcuts';
import { WidgetLinkPanel } from '@/components/scada/pages/WidgetLinkPanel';
import type { SvgViewJson } from '@/widgets/svg/types';

ensureBuiltinSvgWidgetsRegistered();

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'ready'; updatedAt: string; projectId: string; isTemplate: number };

export default function Page() {
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const reactorId = search?.get('reactor') ?? 'F01';
  const viewId = params?.viewId ?? '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const setView = useEditorStore((s) => s.__resetForTests);
  const view = useEditorStore((s) => s.view);
  useKeyboardShortcuts();

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) { window.location.assign('/login'); return; }
      if (r.status === 404) { setState({ kind: 'error', status: 404, message: '画面不存在' }); return; }
      if (!r.ok) { setState({ kind: 'error', status: r.status, message: '服务器错误' }); return; }
      const body = (await r.json()) as { is_svg?: number; items?: unknown; updated_at?: string; project_id?: string; is_template?: number };
      if (body.is_svg !== 1) {
        setState({ kind: 'error', status: 400, message: '此画面不是 SVG 格式,不能在此编辑器编辑' });
        return;
      }
      setView(body.items as SvgViewJson);
      setState({
        kind: 'ready',
        updatedAt: body.updated_at ?? '',
        projectId: body.project_id ?? 'default',
        isTemplate: body.is_template ?? 0,
      });
    } catch {
      setState({ kind: 'error', status: 0, message: '无法加载画面' });
    }
  }, [viewId, setView]);

  useEffect(() => { void load(); }, [load]);

  const onSave = useCallback(async () => {
    if (state.kind !== 'ready') return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: view, expected_updated_at: state.updatedAt || null }),
      });
      if (r.status === 409) { alert('画面已被他人修改,请刷新后重试'); await load(); return; }
      if (!r.ok) { alert('保存失败'); return; }
      const body = (await r.json()) as { updated_at: string };
      setState({ ...state, updatedAt: body.updated_at });
    } finally {
      setSaving(false);
    }
  }, [state, viewId, view, load]);

  const toggleTemplate = useCallback(async () => {
    if (state.kind !== 'ready') return;
    const next = state.isTemplate ? 0 : 1;
    const r = await fetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_template: next, expected_updated_at: state.updatedAt || null }),
    });
    if (r.status === 409) { alert('画面已被他人修改,请刷新后重试'); await load(); return; }
    if (!r.ok) { alert('操作失败'); return; }
    const body = (await r.json()) as { updated_at: string };
    setState({ ...state, isTemplate: next, updatedAt: body.updated_at });
  }, [state, viewId, load]);

  if (state.kind === 'loading') return <div style={{ padding: 16 }}>加载中…</div>;
  if (state.kind === 'error') return <div style={{ padding: 16, color: '#dc2626' }}>错误 ({state.status}): {state.message}</div>;

  return (
    <div style={{ padding: 16, display: 'flex', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
          <button onClick={() => useEditorStore.getState().undo()}>撤销</button>
          <button onClick={() => useEditorStore.getState().redo()}>重做</button>
          <button onClick={() => useEditorStore.getState().setGridSnap(!useEditorStore.getState().gridSnap)}>
            网格吸附
          </button>
          <button onClick={toggleTemplate}>{state.isTemplate ? '取消模板' : '另存为模板'}</button>
        </div>
        <SvgEditorCanvas reactorId={reactorId} />
      </div>
      <aside style={{ width: 260, borderLeft: '1px solid #eee', paddingLeft: 12 }}>
        <h4 style={{ margin: '0 0 8px 0' }}>选中的组件</h4>
        <WidgetLinkPanel projectId={state.projectId} />
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `app/scada2/edit/[viewId]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/BIOCORE
git add packages/web-ui/src/app/scada2/edit/[viewId]/page.tsx
git commit -m "feat(scada-edit): editor toolbar adds 另存为模板 + WidgetLinkPanel sidebar"
```

---

## Task 13: Full regression + smoke + push

**Files:** none modified.

- [ ] **Step 1: Run the web-ui suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -20
```

Expected: all green. SP1-4 contributed ~294 tests; SP5 web-ui tests add ~30. Adjust as needed. Report actual counts.

- [ ] **Step 2: Run the server suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/server
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -20
```

Expected: all server tests + 2 migration tests + 7 route tests (new in T3) green.

- [ ] **Step 3: Run the data-service suite**

```bash
cd /Volumes/SSD/BIOCORE/packages/data-service
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm test 2>&1 | tail -20
```

Expected: existing tests + 5 new template tests green.

If any test fails in any of the three packages, STOP and report — do not push.

- [ ] **Step 4: tsc clean across web-ui**

```bash
cd /Volumes/SSD/BIOCORE/packages/web-ui
export PATH="/Users/mac/.hermes/node/bin:$PATH"
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -10
```

Expected: no NEW errors mentioning `app/scada2/`, `components/scada/pages/`, or `hooks/useView*`. Pre-existing errors elsewhere are OK.

- [ ] **Step 5: Manual smoke (best-effort only)**

```bash
lsof -i :3000 -sTCP:LISTEN -n -P 2>&1 | head -2
lsof -i :3001 -sTCP:LISTEN -n -P 2>&1 | head -2
```

If both ports listening:
```bash
curl -sI http://localhost:3000/scada2?project=demo 2>&1 | head -5
```

If not running, report "servers not running, smoke skipped" — this is NOT a blocker.

- [ ] **Step 6: Push + FF-merge to main**

```bash
cd /Volumes/SSD/BIOCORE
git push origin feat/scada-data-model 2>&1 | tail -5
git checkout main
git fetch origin main 2>&1 | tail -3
git merge --ff-only feat/scada-data-model 2>&1 | tail -3
git push origin main 2>&1 | tail -3
git checkout feat/scada-data-model
```

If FF fails (origin/main diverged), STOP and report — do not force-push.

---

## Done criteria

- ~44 new tests green (2 server migration + 5 data-service + 7 server routes + ~30 web-ui), existing 294 still green
- `pnpm exec tsc --noEmit` clean for new files
- `/scada2` dashboard lists views, supports rename + delete + reorder
- `/scada2/edit/new` supports blank + clone-from-template creation
- Editor toolbar has "另存为模板" toggle
- Editor sidebar shows `WidgetLinkPanel` when one widget is selected; setting link writes to widget
- Viewer wraps linked widgets in `<a href="/scada2/<targetId>">`
- Migration 031 is idempotent via `IF NOT EXISTS`
- All 13 commits pushed to `feat/scada-data-model` and FF-merged to `main`
- Branch ready for SP6 (write controls + WriteIntentDialog)

---

## Spec coverage self-check

| Spec section | Tasks |
|---|---|
| Migration 031 (is_template + index) | T1 |
| sqlite-service is_template / listScadaTemplates / cloneScadaView | T2 |
| API: GET templates, POST clone_from, PUT is_template, GET view returns is_template | T3 |
| SvgWidgetItem.link + Zod | T4 |
| SvgWidgetInstance viewer `<a>` wrap | T4 |
| useViewList | T5 |
| useTemplates | T5 |
| useViewMutations (create/rename/delete/reorder/setTemplate) | T6 |
| ViewListPanel (list + CRUD + reorder) | T7 |
| TemplatePicker modal | T8 |
| WidgetLinkPanel sidebar | T9 |
| /scada2 dashboard page | T10 |
| /scada2/edit/new wizard | T11 |
| /scada2/edit/[viewId] toolbar 另存为模板 + sidebar | T12 |
| Performance: 50 views < 200ms | Met by single-query `GET /scada/projects/:projectId` (existing) |
| Error: clone source missing → 400 | T3 (test "POST clone_from with missing template → 400") |
| Error: cyclic links allowed | No code change needed; browser nav handles |
| Auth: requireRole('admin','engineer') reused | T3 (test "POST clone_from as operator → 403") |
| Deferred: master views | Out of scope (documented in spec) |
| Deferred: multi-action widgets | Out of scope (documented in spec) |
