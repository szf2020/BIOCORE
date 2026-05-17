# SP-FX-1 Implementation Plan: assets + models + schema + routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the foundation for the FUXA SCADA port: scaffold the `scada-engine/` directory tree, migrate the FUXA SVG/font assets, port the `Hmi` TypeScript schema, add a `fuxa_views` SQLite table (migration 033) with CRUD methods, and expose REST endpoints with optimistic-lock conflict handling.

**Architecture:** This sub-project produces no runtime UI — it builds the data spine that every subsequent SP-FX (`-2` … `-8`) will consume. The server gains a new `/api/v1/fuxa-views` API set backed by `sqlite-service` methods. The client gains a typed schema (`scada-engine/models/`), a fetch client (`scada-engine/api/fuxa-views.ts`), and the empty subdirectories that later batches will fill. SP4-7's `scada_views` schema is untouched.

**Tech Stack:** Node 20+, TypeScript 5, Next.js 14 / React 18 (web-ui), Express + better-sqlite3 (server), vitest + supertest (tests), zod 3.22 (schema validation). pnpm workspace.

---

## File Structure (what this plan creates / modifies)

**Create (client):**
- `packages/web-ui/src/scada-engine/README.md` — module overview + roadmap reference
- `packages/web-ui/src/scada-engine/ATTRIBUTION.md` — FUXA MIT attribution for ported assets
- `packages/web-ui/src/scada-engine/index.ts` — re-exports from `models/` and `api/`
- `packages/web-ui/src/scada-engine/models/hmi.ts` — `FuxaView` zod schema + TS type
- `packages/web-ui/src/scada-engine/models/widget.ts` — `FuxaWidget` zod + TS
- `packages/web-ui/src/scada-engine/models/property.ts` — `FuxaProperty`, `FuxaEvent`, `FuxaAction` zod + TS
- `packages/web-ui/src/scada-engine/models/animation.ts` — `FuxaAction` is the animation primitive; this file re-exports + adds the seven action-type discriminator helpers
- `packages/web-ui/src/scada-engine/models/view.ts` — `FuxaVariable` + view-level helpers (defaultEmptyView)
- `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts` — zod parse + roundtrip
- `packages/web-ui/src/scada-engine/api/fuxa-views.ts` — REST client (apiFetch + zod parse)
- `packages/web-ui/src/scada-engine/api/__tests__/fuxa-views.test.ts` — client unit tests
- `packages/web-ui/src/scada-engine/{assets,services,editor,gauges,runtime,dialogs,widgets-extras,cards-view,paginator}/.gitkeep` — placeholders for SP-FX-2+
- `packages/web-ui/src/scada-engine/assets/images/*.svg` — 211 SVGs copied from FUXA
- `packages/web-ui/src/scada-engine/assets/shapes/*.svg` — 154 SVGs copied from FUXA
- `packages/web-ui/src/scada-engine/assets/fonts/{roboto,quicksand}/*` — copied from FUXA

**Create (server):**
- `packages/server/migrations/033-fuxa-views.sql` — new table + 2 indexes
- `packages/server/src/__tests__/migrations/033-fuxa-views.test.ts` — schema correctness
- `packages/server/src/fuxa-views-routes.ts` — express route handlers + zod validation
- `packages/server/src/__tests__/fuxa-views-routes.test.ts` — supertest coverage

**Modify (server):**
- `packages/server/package.json` — add `"zod": "^3.22.0"` to dependencies
- `packages/data-service/src/sqlite-service.ts` — add `createFuxaView / getFuxaView / listFuxaViews / updateFuxaView / deleteFuxaView / duplicateFuxaView` methods + `FuxaViewRow` interface
- `packages/data-service/src/__tests__/sqlite-service-fuxa-views.test.ts` — unit tests for the new methods
- `packages/server/src/index.ts` — `registerFuxaViewsRoutes(apiRouter, { sqlite })` (single line near the other route registrations around line 3097)

**Test count target:**
- web-ui +30 (models ~12, api client ~18)
- server +25 (migration ~3, sqlite-service ~10, routes ~12)
- Final: web-ui 366 → ~396, server 119 → ~144.

---

## Task 1: scada-engine 目录骨架

**Files:**
- Create: `packages/web-ui/src/scada-engine/README.md`
- Create: `packages/web-ui/src/scada-engine/ATTRIBUTION.md`
- Create: `packages/web-ui/src/scada-engine/index.ts`
- Create: `packages/web-ui/src/scada-engine/{models,api,assets,services,editor,gauges,runtime,dialogs,widgets-extras,cards-view,paginator}/.gitkeep`

- [ ] **Step 1: Create the directory tree**

```bash
cd /Volumes/SSD/projects/BIOCore
mkdir -p packages/web-ui/src/scada-engine/{models,api,assets/images,assets/shapes,assets/fonts,services,editor,gauges,runtime,dialogs,widgets-extras,cards-view,paginator}
# .gitkeep so empty subdirs are tracked (SP-FX-2+ will fill them)
for d in services editor gauges runtime dialogs widgets-extras cards-view paginator; do
  touch packages/web-ui/src/scada-engine/$d/.gitkeep
done
```

Expected: no output; `ls packages/web-ui/src/scada-engine/` shows 12 subdirs.

- [ ] **Step 2: Write `README.md` explaining the module**

`packages/web-ui/src/scada-engine/README.md`:

```markdown
# scada-engine

FUXA SCADA editor + gauges + viewer ported to React (Next.js 14). Lives inside `packages/web-ui`; not a separate npm package.

See `docs/superpowers/specs/2026-05-17-fuxa-scada-port-design.md` for the parent design spec.

## Subdirectories

| Dir | Owner SP-FX | Purpose |
|---|---|---|
| `assets/` | SP-FX-1 | SVG icons + shapes + fonts copied from FUXA (MIT) |
| `models/` | SP-FX-1 | `Hmi` TypeScript types + zod schemas |
| `api/` | SP-FX-1 | REST client for `/api/v1/fuxa-views` |
| `services/` | SP-FX-2 | TagBinding, ViewStore, ExpressionEval, Selection |
| `editor/` | SP-FX-3/4 | SVG editor canvas + palette + toolbar + property panels |
| `gauges/` | SP-FX-5/6 | 20 widgets + gauge-base + shape categories |
| `runtime/` | SP-FX-7 | View runtime (viewer) + GaugeMount lifecycle |
| `dialogs/` | SP-FX-2/5 | gui-helpers rewrite (confirm, file-upload, treetable, …) |
| `widgets-extras/` | SP-FX-5 | Self-implemented replacements for ngx-* deps |
| `cards-view/` | SP-FX-8 | Multi-view dashboard grid |
| `paginator/` | SP-FX-8 | Table pagination utility |

## Tag ID convention

All tag identifiers follow `<reactor_id>/<tag_path>`, e.g. `Reactor-1/temperature`.
```

- [ ] **Step 3: Write `ATTRIBUTION.md`**

`packages/web-ui/src/scada-engine/ATTRIBUTION.md`:

```markdown
# Third-Party Attribution

## FUXA

This module includes assets (SVG icons, shape libraries, fonts) and TypeScript
type definitions derived from the FUXA project (<https://github.com/frangoteam/FUXA>),
copyright (c) frangoteam, licensed under the MIT License.

- `assets/images/*.svg` — derived from FUXA `client/src/assets/images/`
- `assets/shapes/*.svg` — derived from FUXA `client/src/assets/lib/svgeditor/shapes/img/`
- `assets/fonts/{roboto,quicksand}/` — derived from FUXA `client/src/assets/fonts/`
- `models/*.ts` — type definitions ported from FUXA `client/src/app/_models/hmi.ts`

The MIT License text accompanies this notice in `LICENSE.FUXA.txt`.
```

- [ ] **Step 4: Copy FUXA's `LICENSE` into the engine for attribution**

```bash
cp /Volumes/SSD/projects/FUXA/LICENSE \
   /Volumes/SSD/projects/BIOCore/packages/web-ui/src/scada-engine/LICENSE.FUXA.txt
```

Expected: file exists; `head -1 packages/web-ui/src/scada-engine/LICENSE.FUXA.txt` prints `The MIT License (MIT)` or similar.

- [ ] **Step 5: Write the root `index.ts` re-export**

`packages/web-ui/src/scada-engine/index.ts`:

```ts
// Public surface of scada-engine. SP-FX-1 exposes only models + api;
// later SP-FX batches expand this barrel as their modules land.
export * from './models/hmi';
export * from './models/view';
export * from './models/widget';
export * from './models/property';
export * from './models/animation';
export * as fuxaViewsApi from './api/fuxa-views';
```

Note: this file will fail to compile until Task 4 and Task 14 land. Add the file now; Task 4 makes the model exports resolve; Task 14 makes the api export resolve. Step 6 confirms by running tsc *after* those tasks complete (not now).

- [ ] **Step 6: Stage + commit the skeleton (no tsc run yet)**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/
git status --short packages/web-ui/src/scada-engine/
git commit -m "feat(scada-engine): scaffold directory tree + attribution

SP-FX-1 step 1 of plan. Creates the empty scada-engine module under
packages/web-ui/src/, places .gitkeep markers in subdirectories owned
by SP-FX-2+, and records FUXA MIT attribution. index.ts will resolve
once models/ and api/ files land in later tasks of this plan."
```

Expected: commit succeeds; `git log -1 --stat` shows only files inside `scada-engine/`.

---

## Task 2: zod 加 server + migration 033 + migration 测试

**Files:**
- Modify: `packages/server/package.json` (add dependency)
- Create: `packages/server/migrations/033-fuxa-views.sql`
- Create: `packages/server/src/__tests__/migrations/033-fuxa-views.test.ts`

- [ ] **Step 1: Add zod to server dependencies**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server add zod@^3.22.0
```

Expected: `packages/server/package.json` gains `"zod": "^3.22.0"` under `dependencies`. `pnpm-lock.yaml` updates.

- [ ] **Step 2: Verify zod install**

```bash
cd /Volumes/SSD/projects/BIOCore
grep '"zod"' packages/server/package.json
```

Expected output:
```
    "zod": "^3.22.0",
```

- [ ] **Step 3: Write the failing migration test**

`packages/server/src/__tests__/migrations/033-fuxa-views.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function applyAll(): Database.Database {
  const db = new Database(':memory:');
  // 033 depends on no other tables; load standalone for a focused test.
  const sql = readFileSync(
    join(__dirname, '../../../migrations/033-fuxa-views.sql'),
    'utf8',
  );
  db.exec(sql);
  return db;
}

describe('migration 033-fuxa-views', () => {
  it('creates fuxa_views table with the expected columns', () => {
    const db = applyAll();
    const cols = db.prepare(`PRAGMA table_info(fuxa_views)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        'created_at',
        'created_by',
        'height',
        'id',
        'is_template',
        'name',
        'parent_view_id',
        'payload',
        'type',
        'updated_at',
        'updated_by',
        'version',
        'width',
      ].sort(),
    );
    // Spot-check NOT NULL constraints + defaults
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.id.notnull).toBe(1);
    expect(byName.payload.notnull).toBe(1);
    expect(byName.version.dflt_value).toBe('1');
    expect(byName.is_template.dflt_value).toBe('0');
  });

  it('creates both partial indexes on fuxa_views', () => {
    const db = applyAll();
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fuxa_views' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = idx.map((r) => r.name);
    // sqlite_autoindex_* is the PK; we expect our 2 explicit indexes.
    expect(names).toContain('idx_fuxa_views_template');
    expect(names).toContain('idx_fuxa_views_parent');
  });

  it('parent_view_id ON DELETE SET NULL cascade works', () => {
    const db = applyAll();
    db.exec(`PRAGMA foreign_keys = ON`);
    db.prepare(
      `INSERT INTO fuxa_views (id, name, type, payload, width, height) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('parent', 'Parent', 'svg', '{}', 800, 600);
    db.prepare(
      `INSERT INTO fuxa_views (id, name, type, payload, width, height, parent_view_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('child', 'Child', 'svg', '{}', 800, 600, 'parent');
    db.prepare(`DELETE FROM fuxa_views WHERE id = 'parent'`).run();
    const row = db.prepare(`SELECT parent_view_id FROM fuxa_views WHERE id = 'child'`).get() as { parent_view_id: string | null };
    expect(row.parent_view_id).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test and verify it fails because the SQL file is missing**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/migrations/033-fuxa-views.test.ts
```

Expected: ENOENT for `033-fuxa-views.sql`, three failing tests.

- [ ] **Step 5: Write migration 033**

`packages/server/migrations/033-fuxa-views.sql`:

```sql
-- ============================================================
-- 033-fuxa-views.sql — FUXA-port view storage (SP-FX-1)
-- ============================================================
-- Holds FUXA Hmi.View JSON for the React-native FUXA port. Independent
-- of scada_views (SP4-7); the two tables coexist. payload is the full
-- serialized FuxaView (see scada-engine/models/hmi.ts schemaVersion=1).
-- version is the optimistic-lock counter incremented on every UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS fuxa_views (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'svg',
  payload         TEXT NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  parent_view_id  TEXT REFERENCES fuxa_views(id) ON DELETE SET NULL,
  is_template     INTEGER NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT,
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_fuxa_views_template
  ON fuxa_views(is_template) WHERE is_template = 1;

CREATE INDEX IF NOT EXISTS idx_fuxa_views_parent
  ON fuxa_views(parent_view_id) WHERE parent_view_id IS NOT NULL;
```

- [ ] **Step 6: Re-run the migration test, all green**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/migrations/033-fuxa-views.test.ts
```

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/package.json packages/server/migrations/033-fuxa-views.sql packages/server/src/__tests__/migrations/033-fuxa-views.test.ts pnpm-lock.yaml
git commit -m "feat(server): add migration 033 fuxa_views + zod dep

Creates the fuxa_views table with optimistic-lock version column and
two partial indexes (is_template, parent_view_id). SP4-7 scada_views
schema is untouched. Adds zod to server deps for upcoming route
validation in Task 5+. 3 migration tests green."
```

---

## Task 3: sqlite-service fuxa-views CRUD methods

**Files:**
- Modify: `packages/data-service/src/sqlite-service.ts`
- Create: `packages/data-service/src/__tests__/sqlite-service-fuxa-views.test.ts`

- [ ] **Step 1: Write the failing test file**

`packages/data-service/src/__tests__/sqlite-service-fuxa-views.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeService(): SQLiteService {
  const db = new Database(':memory:');
  const sql = readFileSync(
    join(__dirname, '../../../server/migrations/033-fuxa-views.sql'),
    'utf8',
  );
  db.exec(sql);
  return new SQLiteService(db);
}

function payload(): string {
  return JSON.stringify({ schemaVersion: 1, items: {}, variables: {} });
}

describe('SQLiteService fuxa_views CRUD (SP-FX-1)', () => {
  let svc: SQLiteService;
  beforeEach(() => { svc = makeService(); });

  it('createFuxaView inserts a row with version=1', () => {
    svc.createFuxaView({
      id: 'v1', name: 'View 1', type: 'svg', payload: payload(),
      width: 800, height: 600, created_by: 'admin-001',
    });
    const row = svc.getFuxaView('v1');
    expect(row).not.toBeNull();
    expect(row!.id).toBe('v1');
    expect(row!.name).toBe('View 1');
    expect(row!.version).toBe(1);
    expect(row!.is_template).toBe(0);
  });

  it('getFuxaView returns null for missing id', () => {
    expect(svc.getFuxaView('nope')).toBeNull();
  });

  it('listFuxaViews returns rows sorted by updated_at desc, filtered by is_template', () => {
    svc.createFuxaView({ id: 'a', name: 'A', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 0 });
    svc.createFuxaView({ id: 'b', name: 'B', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 1 });
    svc.createFuxaView({ id: 'c', name: 'C', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 0 });
    expect(svc.listFuxaViews({}).map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(svc.listFuxaViews({ isTemplate: true }).map((r) => r.id)).toEqual(['b']);
    expect(svc.listFuxaViews({ isTemplate: false }).map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('updateFuxaView with matching version increments version', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600 });
    const ok = svc.updateFuxaView('v', { expectedVersion: 1, name: 'N2', payload: payload(), updated_by: 'admin-001' });
    expect(ok).toBe(true);
    expect(svc.getFuxaView('v')!.version).toBe(2);
    expect(svc.getFuxaView('v')!.name).toBe('N2');
  });

  it('updateFuxaView with stale version returns false and writes nothing', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600 });
    svc.updateFuxaView('v', { expectedVersion: 1, name: 'first', payload: payload() });   // version → 2
    const ok = svc.updateFuxaView('v', { expectedVersion: 1, name: 'stale', payload: payload() });
    expect(ok).toBe(false);
    expect(svc.getFuxaView('v')!.name).toBe('first');
    expect(svc.getFuxaView('v')!.version).toBe(2);
  });

  it('updateFuxaView with force=true overrides stale version', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600 });
    svc.updateFuxaView('v', { expectedVersion: 1, name: 'first', payload: payload() });   // → 2
    const ok = svc.updateFuxaView('v', { expectedVersion: 1, name: 'forced', payload: payload(), force: true });
    expect(ok).toBe(true);
    expect(svc.getFuxaView('v')!.name).toBe('forced');
    expect(svc.getFuxaView('v')!.version).toBe(3);
  });

  it('updateFuxaView preserves created_at + created_by', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 800, height: 600, created_by: 'creator' });
    const before = svc.getFuxaView('v')!;
    svc.updateFuxaView('v', { expectedVersion: 1, name: 'N2', payload: payload(), updated_by: 'editor' });
    const after = svc.getFuxaView('v')!;
    expect(after.created_by).toBe('creator');
    expect(after.created_at).toBe(before.created_at);
    expect(after.updated_by).toBe('editor');
  });

  it('deleteFuxaView removes the row', () => {
    svc.createFuxaView({ id: 'v', name: 'N', type: 'svg', payload: payload(), width: 100, height: 100 });
    svc.deleteFuxaView('v');
    expect(svc.getFuxaView('v')).toBeNull();
  });

  it('deleteFuxaView SET NULL cascades parent_view_id on children', () => {
    svc.createFuxaView({ id: 'parent', name: 'P', type: 'svg', payload: payload(), width: 100, height: 100 });
    svc.createFuxaView({ id: 'child',  name: 'C', type: 'svg', payload: payload(), width: 100, height: 100, parent_view_id: 'parent' });
    svc.deleteFuxaView('parent');
    const child = svc.getFuxaView('child')!;
    expect(child.parent_view_id).toBeNull();
  });

  it('duplicateFuxaView produces a new id, name+" Copy", version reset to 1', () => {
    svc.createFuxaView({ id: 'orig', name: 'Orig', type: 'svg', payload: payload(), width: 800, height: 600, created_by: 'a' });
    svc.updateFuxaView('orig', { expectedVersion: 1, name: 'Orig', payload: payload() });   // version → 2
    const newId = svc.duplicateFuxaView('orig', { newId: 'orig-copy', userId: 'a' });
    expect(newId).toBe('orig-copy');
    const copy = svc.getFuxaView('orig-copy')!;
    expect(copy.name).toBe('Orig Copy');
    expect(copy.version).toBe(1);
    expect(copy.payload).toBe(svc.getFuxaView('orig')!.payload);
  });
});
```

- [ ] **Step 2: Run the test, see ten failures (methods do not exist)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/data-service exec vitest run src/__tests__/sqlite-service-fuxa-views.test.ts
```

Expected: 10 failing tests with "createFuxaView is not a function" or compile errors.

- [ ] **Step 3: Add the `FuxaViewRow` interface near the top of sqlite-service.ts**

Find the section near other exported row interfaces (search for `export interface ScadaViewMeta` or similar — they cluster near the top). Add:

```ts
export interface FuxaViewRow {
  id: string;
  name: string;
  type: string;
  payload: string;                    // FuxaView JSON
  width: number;
  height: number;
  parent_view_id: string | null;
  is_template: number;                // 0 | 1
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
```

- [ ] **Step 4: Add the six CRUD methods inside the `SQLiteService` class**

Add the following block in `packages/data-service/src/sqlite-service.ts` immediately before the closing brace of the `SQLiteService` class. The block is self-contained and uses only `this.db` (already declared on the class).

```ts
  // ─── fuxa_views (SP-FX-1) ──────────────────────────────────
  createFuxaView(v: {
    id: string;
    name: string;
    type?: string;
    payload: string;
    width: number;
    height: number;
    parent_view_id?: string | null;
    is_template?: number;
    created_by?: string | null;
  }): void {
    this.db.prepare(
      `INSERT INTO fuxa_views
        (id, name, type, payload, width, height, parent_view_id, is_template, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      v.id,
      v.name,
      v.type ?? 'svg',
      v.payload,
      v.width,
      v.height,
      v.parent_view_id ?? null,
      v.is_template ?? 0,
      v.created_by ?? null,
      v.created_by ?? null,
    );
  }

  getFuxaView(id: string): FuxaViewRow | null {
    return (
      this.db.prepare(`SELECT * FROM fuxa_views WHERE id = ?`).get(id) as
        | FuxaViewRow
        | undefined
    ) ?? null;
  }

  listFuxaViews(opts: { isTemplate?: boolean } = {}): FuxaViewRow[] {
    if (opts.isTemplate === true) {
      return this.db
        .prepare(`SELECT * FROM fuxa_views WHERE is_template = 1 ORDER BY updated_at DESC`)
        .all() as FuxaViewRow[];
    }
    if (opts.isTemplate === false) {
      return this.db
        .prepare(`SELECT * FROM fuxa_views WHERE is_template = 0 ORDER BY updated_at DESC`)
        .all() as FuxaViewRow[];
    }
    return this.db
      .prepare(`SELECT * FROM fuxa_views ORDER BY updated_at DESC`)
      .all() as FuxaViewRow[];
  }

  /**
   * Returns true if the row was updated; false on optimistic-lock conflict
   * (no rows matched the expected version). Pass `force=true` to bypass.
   */
  updateFuxaView(
    id: string,
    patch: {
      expectedVersion: number;
      name?: string;
      type?: string;
      payload?: string;
      width?: number;
      height?: number;
      parent_view_id?: string | null;
      is_template?: number;
      updated_by?: string | null;
      force?: boolean;
    },
  ): boolean {
    const sets: string[] = [];
    const args: any[] = [];
    if (patch.name !== undefined)            { sets.push(`name = ?`); args.push(patch.name); }
    if (patch.type !== undefined)            { sets.push(`type = ?`); args.push(patch.type); }
    if (patch.payload !== undefined)         { sets.push(`payload = ?`); args.push(patch.payload); }
    if (patch.width !== undefined)           { sets.push(`width = ?`); args.push(patch.width); }
    if (patch.height !== undefined)          { sets.push(`height = ?`); args.push(patch.height); }
    if (patch.parent_view_id !== undefined)  { sets.push(`parent_view_id = ?`); args.push(patch.parent_view_id); }
    if (patch.is_template !== undefined)     { sets.push(`is_template = ?`); args.push(patch.is_template); }
    if (patch.updated_by !== undefined)      { sets.push(`updated_by = ?`); args.push(patch.updated_by); }
    sets.push(`version = version + 1`);
    sets.push(`updated_at = datetime('now')`);
    const where = patch.force
      ? `WHERE id = ?`
      : `WHERE id = ? AND version = ?`;
    args.push(id);
    if (!patch.force) args.push(patch.expectedVersion);
    const stmt = this.db.prepare(`UPDATE fuxa_views SET ${sets.join(', ')} ${where}`);
    const info = stmt.run(...args);
    return info.changes > 0;
  }

  deleteFuxaView(id: string): void {
    // SQLite enforces FK only when PRAGMA foreign_keys=ON; SQLiteService sets it
    // in initSchema(). Children's parent_view_id is SET NULL via the table FK.
    this.db.prepare(`DELETE FROM fuxa_views WHERE id = ?`).run(id);
  }

  /**
   * Copies the row with new id and " Copy" suffixed name. version resets to 1.
   * parent_view_id is preserved.
   */
  duplicateFuxaView(
    sourceId: string,
    opts: { newId: string; userId?: string | null },
  ): string {
    const src = this.getFuxaView(sourceId);
    if (!src) throw new Error(`fuxa_view ${sourceId} not found`);
    this.createFuxaView({
      id: opts.newId,
      name: `${src.name} Copy`,
      type: src.type,
      payload: src.payload,
      width: src.width,
      height: src.height,
      parent_view_id: src.parent_view_id,
      is_template: src.is_template,
      created_by: opts.userId ?? null,
    });
    return opts.newId;
  }
```

- [ ] **Step 5: Enable foreign keys in SQLiteService init (if not already)**

Check `packages/data-service/src/sqlite-service.ts` for `PRAGMA foreign_keys`. If absent, add to the `initSchema()` method right after the constructor's database open, before any CREATE TABLE statements:

```ts
this.db.exec(`PRAGMA foreign_keys = ON`);
```

If already present, do nothing.

- [ ] **Step 6: Re-run the test suite**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/data-service exec vitest run src/__tests__/sqlite-service-fuxa-views.test.ts
```

Expected: 10 passed.

- [ ] **Step 7: Run the full data-service suite to confirm no regressions**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/data-service exec vitest run
```

Expected: All previously passing tests + 10 new tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/data-service/src/sqlite-service.ts packages/data-service/src/__tests__/sqlite-service-fuxa-views.test.ts
git commit -m "feat(data-service): fuxa_views CRUD + optimistic lock

Six methods: create / get / list / update / delete / duplicate.
updateFuxaView returns boolean — false on stale-version conflict,
true on success; force=true bypasses for admin override.
duplicateFuxaView appends ' Copy' to name and resets version to 1.
10 vitest cases cover happy path + conflict + cascade + force."
```

---

## Task 4: scada-engine/models — zod schemas + TS types

**Files:**
- Create: `packages/web-ui/src/scada-engine/models/hmi.ts`
- Create: `packages/web-ui/src/scada-engine/models/widget.ts`
- Create: `packages/web-ui/src/scada-engine/models/property.ts`
- Create: `packages/web-ui/src/scada-engine/models/animation.ts`
- Create: `packages/web-ui/src/scada-engine/models/view.ts`
- Create: `packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts`

- [ ] **Step 1: Write `property.ts`**

```ts
// packages/web-ui/src/scada-engine/models/property.ts
import { z } from 'zod';

export const FuxaEventTypeSchema = z.enum([
  'click', 'dblclick', 'mousedown', 'mouseup', 'change',
]);
export type FuxaEventType = z.infer<typeof FuxaEventTypeSchema>;

export const FuxaEventActionSchema = z.enum([
  'open-view', 'close-view', 'set-value', 'navigate', 'run-script-skip',
]);
export type FuxaEventAction = z.infer<typeof FuxaEventActionSchema>;

export const FuxaEventSchema = z.object({
  type: FuxaEventTypeSchema,
  action: FuxaEventActionSchema,
  actparam: z.string(),
  actoptions: z.record(z.any()).optional(),
});
export type FuxaEvent = z.infer<typeof FuxaEventSchema>;

export const FuxaActionTypeSchema = z.enum([
  'visibility', 'opacity', 'rotate', 'scale', 'move', 'color', 'text',
]);
export type FuxaActionType = z.infer<typeof FuxaActionTypeSchema>;

export const FuxaActionSchema = z.object({
  type: FuxaActionTypeSchema,
  variableId: z.string(),
  range: z.object({ min: z.number(), max: z.number() }).optional(),
  output: z.object({ from: z.any(), to: z.any() }).optional(),
});
export type FuxaAction = z.infer<typeof FuxaActionSchema>;

export const FuxaPropertySchema = z.object({
  variableId: z.string().optional(),
  variableSrc: z.enum(['device', 'system']).optional(),
  permission: z.number().int().optional(),
  events: z.array(FuxaEventSchema).optional(),
  actions: z.array(FuxaActionSchema).optional(),
  options: z.record(z.any()).optional(),
});
export type FuxaProperty = z.infer<typeof FuxaPropertySchema>;
```

- [ ] **Step 2: Write `widget.ts`**

```ts
// packages/web-ui/src/scada-engine/models/widget.ts
import { z } from 'zod';
import { FuxaPropertySchema } from './property';

export const FuxaWidgetSchema = z.object({
  id: z.string(),
  type: z.string(),                          // 'svg-ext-value' / 'svg-ext-html_button' / ...
  name: z.string().optional(),
  property: FuxaPropertySchema,
});
export type FuxaWidget = z.infer<typeof FuxaWidgetSchema>;
```

- [ ] **Step 3: Write `animation.ts` (re-exports + helpers)**

```ts
// packages/web-ui/src/scada-engine/models/animation.ts
//
// FuxaAction is the animation primitive. This file re-exports it under a
// more discoverable name and adds typed discriminators so callers can do
// `if (isMoveAction(a)) { … }` without sprinkling string literals.
import { FuxaAction, FuxaActionType } from './property';

export { FuxaAction, FuxaActionType };

const make = <T extends FuxaActionType>(t: T) => (a: FuxaAction): a is FuxaAction & { type: T } => a.type === t;

export const isVisibilityAction = make('visibility');
export const isOpacityAction    = make('opacity');
export const isRotateAction     = make('rotate');
export const isScaleAction      = make('scale');
export const isMoveAction       = make('move');
export const isColorAction      = make('color');
export const isTextAction       = make('text');
```

- [ ] **Step 4: Write `view.ts`**

```ts
// packages/web-ui/src/scada-engine/models/view.ts
import { z } from 'zod';

export const FuxaVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['tag', 'system', 'alias']),
  source: z.string(),                        // "<reactor_id>/<tag_path>", e.g. "Reactor-1/temperature"
});
export type FuxaVariable = z.infer<typeof FuxaVariableSchema>;

export function defaultEmptyView(id: string, name: string): {
  id: string; name: string; type: 'svg'; svgcontent: string;
  width: number; height: number; items: Record<string, never>;
  variables: Record<string, never>; schemaVersion: 1;
} {
  return {
    id,
    name,
    type: 'svg',
    svgcontent: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>',
    width: 800,
    height: 600,
    items: {},
    variables: {},
    schemaVersion: 1,
  };
}
```

- [ ] **Step 5: Write `hmi.ts`**

```ts
// packages/web-ui/src/scada-engine/models/hmi.ts
import { z } from 'zod';
import { FuxaWidgetSchema } from './widget';
import { FuxaVariableSchema } from './view';

/**
 * Current FuxaView schema version. BIOCore-internal — does not track FUXA upstream.
 * Bump + add an entry to models/upgrader.ts when the on-disk shape changes.
 */
export const FUXA_SCHEMA_VERSION = 1;

export const FuxaViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['svg', 'cards', 'svg-shapes']),
  svgcontent: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background_color: z.string().optional(),
  profile: z.object({
    bkcolor: z.string().optional(),
    margin: z.number().optional(),
  }).optional(),
  items: z.record(FuxaWidgetSchema),
  variables: z.record(FuxaVariableSchema).optional(),
  parent_view_id: z.string().nullable().optional(),
  schemaVersion: z.literal(FUXA_SCHEMA_VERSION),
});
export type FuxaView = z.infer<typeof FuxaViewSchema>;

/**
 * Parse a JSON string from the server payload column into a FuxaView.
 * Throws ZodError on shape mismatch; callers decide whether to fall back
 * to a "broken view" placeholder.
 */
export function parseFuxaView(json: string): FuxaView {
  return FuxaViewSchema.parse(JSON.parse(json));
}
```

- [ ] **Step 6: Write the failing schema test**

`packages/web-ui/src/scada-engine/models/__tests__/hmi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  FuxaViewSchema,
  parseFuxaView,
  FUXA_SCHEMA_VERSION,
} from '../hmi';
import { defaultEmptyView } from '../view';
import {
  FuxaActionSchema,
  FuxaEventSchema,
  FuxaPropertySchema,
} from '../property';
import {
  isMoveAction, isOpacityAction, isColorAction,
} from '../animation';

describe('FuxaViewSchema (SP-FX-1)', () => {
  it('accepts a minimal valid view', () => {
    const v = defaultEmptyView('v1', 'My View');
    expect(() => FuxaViewSchema.parse(v)).not.toThrow();
  });

  it('rejects width <= 0', () => {
    const v = defaultEmptyView('v1', 'My View');
    expect(() => FuxaViewSchema.parse({ ...v, width: 0 })).toThrow();
    expect(() => FuxaViewSchema.parse({ ...v, width: -10 })).toThrow();
  });

  it('rejects schemaVersion other than 1', () => {
    const v = defaultEmptyView('v1', 'My View');
    expect(() => FuxaViewSchema.parse({ ...v, schemaVersion: 2 })).toThrow();
  });

  it('accepts items with FuxaWidget shape including a property block', () => {
    const v = {
      ...defaultEmptyView('v1', 'My View'),
      items: {
        w1: {
          id: 'w1',
          type: 'svg-ext-value',
          name: 'Temperature reading',
          property: {
            variableId: 'Reactor-1/temperature',
            variableSrc: 'device',
            events: [
              { type: 'click', action: 'set-value', actparam: 'Reactor-1/sp_temperature' },
            ],
            actions: [
              { type: 'text', variableId: 'Reactor-1/temperature' },
            ],
            options: { decimals: 2 },
          },
        },
      },
    };
    const parsed = FuxaViewSchema.parse(v);
    expect(parsed.items.w1.property.variableId).toBe('Reactor-1/temperature');
    expect(parsed.items.w1.property.events?.[0].action).toBe('set-value');
  });

  it('parseFuxaView round-trips a JSON string', () => {
    const v = defaultEmptyView('v1', 'My View');
    const round = parseFuxaView(JSON.stringify(v));
    expect(round).toEqual(v);
  });

  it('parseFuxaView throws on bad JSON', () => {
    expect(() => parseFuxaView('{ not json')).toThrow();
  });

  it('FUXA_SCHEMA_VERSION is 1', () => {
    expect(FUXA_SCHEMA_VERSION).toBe(1);
  });
});

describe('FuxaEventSchema + FuxaActionSchema', () => {
  it('event action accepts the 5 supported values', () => {
    for (const action of ['open-view', 'close-view', 'set-value', 'navigate', 'run-script-skip']) {
      expect(() =>
        FuxaEventSchema.parse({ type: 'click', action, actparam: 'x' }),
      ).not.toThrow();
    }
  });

  it('event action rejects unknown', () => {
    expect(() =>
      FuxaEventSchema.parse({ type: 'click', action: 'run-script', actparam: 'x' }),
    ).toThrow();
  });

  it('action requires variableId', () => {
    expect(() =>
      FuxaActionSchema.parse({ type: 'visibility' } as any),
    ).toThrow();
  });
});

describe('FuxaProperty schema', () => {
  it('permits empty property (no bindings)', () => {
    expect(() => FuxaPropertySchema.parse({})).not.toThrow();
  });

  it('rejects non-integer permission', () => {
    expect(() => FuxaPropertySchema.parse({ permission: 1.5 })).toThrow();
  });
});

describe('animation discriminators', () => {
  it('isMoveAction narrows correctly', () => {
    const a = { type: 'move' as const, variableId: 'x' };
    const o = { type: 'opacity' as const, variableId: 'x' };
    expect(isMoveAction(a)).toBe(true);
    expect(isMoveAction(o)).toBe(false);
    expect(isOpacityAction(o)).toBe(true);
    expect(isColorAction(a)).toBe(false);
  });
});
```

- [ ] **Step 7: Run the tests**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/models/__tests__/hmi.test.ts
```

Expected: 12 passed.

- [ ] **Step 8: Run tsc to verify the index.ts barrel resolves**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | tail -30
```

Expected: errors only in `scada-engine/index.ts` line referencing `./api/fuxa-views` (Task 14 creates it). All other errors zero. Note the api/ line; Task 14 will resolve it.

- [ ] **Step 9: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/models/ packages/web-ui/src/scada-engine/index.ts
git commit -m "feat(scada-engine): port FUXA Hmi schema with zod (SP-FX-1)

models/hmi.ts + view.ts + widget.ts + property.ts + animation.ts.
FUXA_SCHEMA_VERSION = 1. 12 vitest cases cover parse/roundtrip,
event action whitelist, property optionality, animation type guards.
Note: scada-engine/index.ts still imports api/fuxa-views which lands
in Task 14; that single tsc miss is expected for now."
```

---

## Task 5: fuxa-views-routes — GET endpoints

**Files:**
- Create: `packages/server/src/fuxa-views-routes.ts`
- Create: `packages/server/src/__tests__/fuxa-views-routes.test.ts`

- [ ] **Step 1: Write the test scaffolding + GET tests**

`packages/server/src/__tests__/fuxa-views-routes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { registerFuxaViewsRoutes } from '../fuxa-views-routes';

function makeApp(): { app: express.Express; sqlite: SQLiteService } {
  const db = new Database(':memory:');
  const sql = readFileSync(join(__dirname, '../../migrations/033-fuxa-views.sql'), 'utf8');
  db.exec(sql);
  db.exec(`PRAGMA foreign_keys = ON`);
  const sqlite = new SQLiteService(db);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // Tests bypass auth — production registers behind authMiddleware in index.ts.
  app.use((req, _res, next) => { (req as any).user = { user_id: 'test-user' }; next(); });
  const router = express.Router();
  registerFuxaViewsRoutes(router, { sqlite });
  app.use('/api/v1', router);
  return { app, sqlite };
}

function payload(): string {
  return JSON.stringify({
    id: 'x', name: 'X', type: 'svg', svgcontent: '<svg/>',
    width: 100, height: 100, items: {}, schemaVersion: 1,
  });
}

describe('fuxa-views-routes GET (SP-FX-1)', () => {
  it('GET /fuxa-views returns empty list when table empty', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/fuxa-views');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('GET /fuxa-views lists rows', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'a', name: 'A', type: 'svg', payload: payload(), width: 800, height: 600 });
    sqlite.createFuxaView({ id: 'b', name: 'B', type: 'svg', payload: payload(), width: 800, height: 600, is_template: 1 });
    const res = await request(app).get('/api/v1/fuxa-views');
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: any) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('GET /fuxa-views?is_template=true filters', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'a', name: 'A', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 0 });
    sqlite.createFuxaView({ id: 'b', name: 'B', type: 'svg', payload: payload(), width: 100, height: 100, is_template: 1 });
    const res = await request(app).get('/api/v1/fuxa-views?is_template=true');
    expect(res.status).toBe(200);
    expect(res.body.items.map((r: any) => r.id)).toEqual(['b']);
  });

  it('GET /fuxa-views/:id returns single row', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'v1', name: 'My View', type: 'svg', payload: payload(), width: 800, height: 600 });
    const res = await request(app).get('/api/v1/fuxa-views/v1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('v1');
    expect(res.body.name).toBe('My View');
    expect(res.body.version).toBe(1);
  });

  it('GET /fuxa-views/:id returns 404 when missing', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/v1/fuxa-views/missing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and watch all 5 fail (module missing)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: `Cannot find module '../fuxa-views-routes'`, 5 failures.

- [ ] **Step 3: Create `fuxa-views-routes.ts` with the GET handlers**

`packages/server/src/fuxa-views-routes.ts`:

```ts
// ============================================================
// fuxa-views-routes.ts — SCADA-engine view storage REST API
// ============================================================
// Spec: docs/superpowers/specs/2026-05-17-fuxa-scada-port-design.md
// Routes mounted under /api/v1:
//   GET    /fuxa-views[?is_template=true|false]
//   GET    /fuxa-views/:id
//   POST   /fuxa-views                          (Task 6)
//   PUT    /fuxa-views/:id                      (Task 7)
//   DELETE /fuxa-views/:id                      (Task 8)
//   POST   /fuxa-views/:id/duplicate            (Task 9)
// ============================================================

import type { Router, Request } from 'express';
import type { SQLiteService } from '@biocore/data-service';

export interface FuxaViewsRoutesDeps {
  sqlite: SQLiteService;
}

function getUserId(req: Request): string {
  return (req as any).user?.user_id || 'unknown';
}

export function registerFuxaViewsRoutes(apiRouter: Router, deps: FuxaViewsRoutesDeps): void {
  const { sqlite } = deps;

  // ─── List ────────────────────────────────────────────────
  apiRouter.get('/fuxa-views', (req, res) => {
    const isTemplateParam = req.query.is_template;
    let isTemplate: boolean | undefined;
    if (isTemplateParam === 'true') isTemplate = true;
    else if (isTemplateParam === 'false') isTemplate = false;
    const items = sqlite.listFuxaViews({ isTemplate });
    res.json({ items });
  });

  // ─── Get by id ───────────────────────────────────────────
  apiRouter.get('/fuxa-views/:id', (req, res) => {
    const row = sqlite.getFuxaView(req.params.id);
    if (!row) return res.status(404).json({ error: '视图不存在' });
    res.json(row);
  });
}
```

Note: `getUserId` is exported-but-unused until Task 6+; this is intentional. Keep the helper now so subsequent tasks do not have to re-introduce it.

- [ ] **Step 4: Re-run the tests, all green**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/src/fuxa-views-routes.ts packages/server/src/__tests__/fuxa-views-routes.test.ts
git commit -m "feat(server): fuxa-views routes GET endpoints (SP-FX-1)

GET /fuxa-views (with optional is_template filter) + GET /:id (with
404 on missing). Test scaffolding now in place for Task 6+."
```

---

## Task 6: fuxa-views-routes — POST

**Files:**
- Modify: `packages/server/src/fuxa-views-routes.ts`
- Modify: `packages/server/src/__tests__/fuxa-views-routes.test.ts`

- [ ] **Step 1: Append POST tests**

Add to `packages/server/src/__tests__/fuxa-views-routes.test.ts` (above the closing brace of the file, at the bottom):

```ts
describe('fuxa-views-routes POST (SP-FX-1)', () => {
  const body = () => ({
    id: 'new-1',
    name: 'New View',
    type: 'svg' as const,
    payload: {
      id: 'new-1', name: 'New View', type: 'svg', svgcontent: '<svg/>',
      width: 100, height: 100, items: {}, schemaVersion: 1,
    },
    width: 100,
    height: 100,
  });

  it('POST /fuxa-views creates a row and returns it with version=1', async () => {
    const { app, sqlite } = makeApp();
    const res = await request(app).post('/api/v1/fuxa-views').send(body());
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-1');
    expect(res.body.version).toBe(1);
    expect(sqlite.getFuxaView('new-1')).not.toBeNull();
  });

  it('POST /fuxa-views records created_by from req.user.user_id', async () => {
    const { app, sqlite } = makeApp();
    await request(app).post('/api/v1/fuxa-views').send(body());
    expect(sqlite.getFuxaView('new-1')!.created_by).toBe('test-user');
  });

  it('POST /fuxa-views with conflicting id returns 409', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({
      id: 'dup', name: 'Old', type: 'svg', payload: '{}', width: 1, height: 1,
    });
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...body(), id: 'dup' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBeDefined();
  });

  it('POST /fuxa-views with missing id returns 400', async () => {
    const { app } = makeApp();
    const b = body();
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...b, id: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.field).toBe('id');
  });

  it('POST /fuxa-views with non-positive width returns 400', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/v1/fuxa-views').send({ ...body(), width: 0 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('width');
  });

  it('POST /fuxa-views with bad payload schema returns 400', async () => {
    const { app } = makeApp();
    const b = body();
    const bad = { ...b, payload: { ...b.payload, schemaVersion: 2 } };
    const res = await request(app).post('/api/v1/fuxa-views').send(bad);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/payload/i);
  });
});
```

- [ ] **Step 2: Run the test, expect 6 new failures**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 6 failures (POST returns 404 — route does not exist yet).

- [ ] **Step 3: Add POST handler with zod validation**

At the top of `packages/server/src/fuxa-views-routes.ts`, add zod imports:

```ts
import { z } from 'zod';
```

Add the request body schema near the top of the file (after the imports, before `registerFuxaViewsRoutes`):

```ts
// Server-side zod schema for POST/PUT bodies. The `payload` object must itself
// be a valid FuxaView; we duplicate the shape here to avoid an import cycle
// between server and web-ui packages.
const PayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['svg', 'cards', 'svg-shapes']),
  svgcontent: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  items: z.record(z.any()),
  variables: z.record(z.any()).optional(),
  schemaVersion: z.literal(1),
}).passthrough();

const CreateBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  payload: PayloadSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  parent_view_id: z.string().nullable().optional(),
  is_template: z.number().int().min(0).max(1).optional(),
});

function zodFail(res: import('express').Response, err: z.ZodError) {
  const first = err.issues[0];
  res.status(400).json({
    error: first?.message ?? 'invalid body',
    field: first?.path?.[0] as string | undefined,
  });
}
```

Add the POST handler inside `registerFuxaViewsRoutes`, after the GET handlers:

```ts
  // ─── Create ──────────────────────────────────────────────
  apiRouter.post('/fuxa-views', (req, res) => {
    const parsed = CreateBodySchema.safeParse(req.body);
    if (!parsed.success) return zodFail(res, parsed.error);
    const v = parsed.data;
    if (sqlite.getFuxaView(v.id)) {
      return res.status(409).json({ error: `fuxa_view ${v.id} already exists` });
    }
    try {
      sqlite.createFuxaView({
        id: v.id,
        name: v.name,
        type: v.type,
        payload: JSON.stringify(v.payload),
        width: v.width,
        height: v.height,
        parent_view_id: v.parent_view_id ?? null,
        is_template: v.is_template ?? 0,
        created_by: getUserId(req),
      });
      const row = sqlite.getFuxaView(v.id);
      res.status(201).json(row);
    } catch (e) {
      console.error('fuxa-views create failed:', (e as Error).message);
      res.status(500).json({ error: 'create failed' });
    }
  });
```

- [ ] **Step 4: Re-run tests, all 11 green**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 11 passed (5 GET + 6 POST).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/src/fuxa-views-routes.ts packages/server/src/__tests__/fuxa-views-routes.test.ts
git commit -m "feat(server): fuxa-views POST with zod validation (SP-FX-1)

201 on success returning the new row. 400 with {error, field} on zod
fail. 409 on duplicate id. created_by stamped from req.user.user_id.
6 new tests cover happy path, zod failures, conflict."
```

---

## Task 7: fuxa-views-routes — PUT with optimistic lock + force

**Files:**
- Modify: `packages/server/src/fuxa-views-routes.ts`
- Modify: `packages/server/src/__tests__/fuxa-views-routes.test.ts`

- [ ] **Step 1: Append PUT tests**

Append to `packages/server/src/__tests__/fuxa-views-routes.test.ts`:

```ts
describe('fuxa-views-routes PUT (SP-FX-1)', () => {
  function seed(sqlite: SQLiteService) {
    sqlite.createFuxaView({
      id: 'edit-1', name: 'Old', type: 'svg',
      payload: JSON.stringify({ schemaVersion: 1 }),
      width: 800, height: 600,
    });
  }

  const updateBody = () => ({
    name: 'New name',
    type: 'svg',
    payload: {
      id: 'edit-1', name: 'New name', type: 'svg', svgcontent: '<svg/>',
      width: 800, height: 600, items: {}, schemaVersion: 1,
    },
    width: 800,
    height: 600,
  });

  it('PUT /fuxa-views/:id with matching If-Match updates and bumps version', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(sqlite.getFuxaView('edit-1')!.name).toBe('New name');
  });

  it('PUT with stale If-Match returns 409 + currentVersion', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    sqlite.updateFuxaView('edit-1', { expectedVersion: 1, name: 'mid', payload: '{}' }); // → v2
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stale/i);
    expect(res.body.currentVersion).toBe(2);
    expect(sqlite.getFuxaView('edit-1')!.name).toBe('mid');
  });

  it('PUT without If-Match returns 428', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .send(updateBody());
    expect(res.status).toBe(428);
  });

  it('PUT with force=true overrides stale version', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    sqlite.updateFuxaView('edit-1', { expectedVersion: 1, name: 'mid', payload: '{}' }); // → v2
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1?force=true')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(3);
    expect(sqlite.getFuxaView('edit-1')!.name).toBe('New name');
  });

  it('PUT for missing id returns 404', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .put('/api/v1/fuxa-views/missing')
      .set('If-Match', '1')
      .send(updateBody());
    expect(res.status).toBe(404);
  });

  it('PUT with bad zod body returns 400', async () => {
    const { app, sqlite } = makeApp();
    seed(sqlite);
    const b = updateBody();
    const res = await request(app)
      .put('/api/v1/fuxa-views/edit-1')
      .set('If-Match', '1')
      .send({ ...b, width: -10 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('width');
  });
});
```

- [ ] **Step 2: Run tests, expect 6 new failures (404 for all)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 6 PUT failures.

- [ ] **Step 3: Add the PUT handler**

Add an `UpdateBodySchema` near `CreateBodySchema` in `fuxa-views-routes.ts`:

```ts
const UpdateBodySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  payload: PayloadSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  parent_view_id: z.string().nullable().optional(),
  is_template: z.number().int().min(0).max(1).optional(),
});
```

Append inside `registerFuxaViewsRoutes` after the POST handler:

```ts
  // ─── Update with optimistic lock ─────────────────────────
  apiRouter.put('/fuxa-views/:id', (req, res) => {
    const ifMatch = req.header('If-Match');
    if (!ifMatch) {
      return res.status(428).json({ error: 'If-Match header required' });
    }
    const expectedVersion = Number(ifMatch);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(400).json({ error: 'If-Match must be a positive integer', field: 'If-Match' });
    }
    const parsed = UpdateBodySchema.safeParse(req.body);
    if (!parsed.success) return zodFail(res, parsed.error);
    const existing = sqlite.getFuxaView(req.params.id);
    if (!existing) return res.status(404).json({ error: '视图不存在' });
    const v = parsed.data;
    const force = req.query.force === 'true';
    const ok = sqlite.updateFuxaView(req.params.id, {
      expectedVersion,
      name: v.name,
      type: v.type,
      payload: JSON.stringify(v.payload),
      width: v.width,
      height: v.height,
      parent_view_id: v.parent_view_id ?? null,
      is_template: v.is_template,
      updated_by: getUserId(req),
      force,
    });
    if (!ok) {
      const cur = sqlite.getFuxaView(req.params.id)!;
      return res.status(409).json({ error: 'stale version', currentVersion: cur.version });
    }
    res.json(sqlite.getFuxaView(req.params.id));
  });
```

- [ ] **Step 4: Re-run tests, expect 17 total green (5 GET + 6 POST + 6 PUT)**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 17 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/src/fuxa-views-routes.ts packages/server/src/__tests__/fuxa-views-routes.test.ts
git commit -m "feat(server): fuxa-views PUT with optimistic lock + force (SP-FX-1)

If-Match header required (428 when missing). 409 + currentVersion on
stale; ?force=true bypasses. 404 on missing id. 400 on zod fail. 6
new tests bring routes coverage to 17."
```

---

## Task 8: fuxa-views-routes — DELETE

**Files:**
- Modify: `packages/server/src/fuxa-views-routes.ts`
- Modify: `packages/server/src/__tests__/fuxa-views-routes.test.ts`

- [ ] **Step 1: Append DELETE tests**

```ts
describe('fuxa-views-routes DELETE (SP-FX-1)', () => {
  it('DELETE /fuxa-views/:id removes the row, returns 204', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'd1', name: 'X', type: 'svg', payload: '{}', width: 100, height: 100 });
    const res = await request(app).delete('/api/v1/fuxa-views/d1');
    expect(res.status).toBe(204);
    expect(sqlite.getFuxaView('d1')).toBeNull();
  });

  it('DELETE on missing id returns 204 (idempotent)', async () => {
    const { app } = makeApp();
    const res = await request(app).delete('/api/v1/fuxa-views/never');
    expect(res.status).toBe(204);
  });

  it('DELETE parent cascades children parent_view_id to NULL', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'p', name: 'P', type: 'svg', payload: '{}', width: 1, height: 1 });
    sqlite.createFuxaView({ id: 'c', name: 'C', type: 'svg', payload: '{}', width: 1, height: 1, parent_view_id: 'p' });
    await request(app).delete('/api/v1/fuxa-views/p');
    const child = sqlite.getFuxaView('c')!;
    expect(child.parent_view_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, expect 3 new failures**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 3 DELETE failures.

- [ ] **Step 3: Add the DELETE handler**

Append inside `registerFuxaViewsRoutes` after the PUT handler:

```ts
  // ─── Delete (idempotent) ─────────────────────────────────
  apiRouter.delete('/fuxa-views/:id', (req, res) => {
    sqlite.deleteFuxaView(req.params.id);
    res.status(204).end();
  });
```

- [ ] **Step 4: Re-run, expect 20 green**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 20 passed.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/src/fuxa-views-routes.ts packages/server/src/__tests__/fuxa-views-routes.test.ts
git commit -m "feat(server): fuxa-views DELETE idempotent + cascade (SP-FX-1)

DELETE returns 204 whether the row existed. Children's parent_view_id
SET NULL via the table FK. 3 tests added, routes coverage now 20."
```

---

## Task 9: fuxa-views-routes — POST duplicate

**Files:**
- Modify: `packages/server/src/fuxa-views-routes.ts`
- Modify: `packages/server/src/__tests__/fuxa-views-routes.test.ts`

- [ ] **Step 1: Append duplicate tests**

```ts
describe('fuxa-views-routes POST /:id/duplicate (SP-FX-1)', () => {
  it('returns 201 with the new row, version=1, name suffixed " Copy"', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'orig', name: 'Orig', type: 'svg', payload: '{}', width: 100, height: 100 });
    const res = await request(app)
      .post('/api/v1/fuxa-views/orig/duplicate')
      .send({ newId: 'copy-1' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('copy-1');
    expect(res.body.name).toBe('Orig Copy');
    expect(res.body.version).toBe(1);
  });

  it('returns 404 when source id missing', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/v1/fuxa-views/never/duplicate')
      .send({ newId: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 409 when newId already exists', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'orig', name: 'O', type: 'svg', payload: '{}', width: 1, height: 1 });
    sqlite.createFuxaView({ id: 'taken', name: 'T', type: 'svg', payload: '{}', width: 1, height: 1 });
    const res = await request(app)
      .post('/api/v1/fuxa-views/orig/duplicate')
      .send({ newId: 'taken' });
    expect(res.status).toBe(409);
  });

  it('returns 400 when newId missing', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createFuxaView({ id: 'orig', name: 'O', type: 'svg', payload: '{}', width: 1, height: 1 });
    const res = await request(app)
      .post('/api/v1/fuxa-views/orig/duplicate')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('newId');
  });
});
```

- [ ] **Step 2: Run tests, expect 4 new failures**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 4 duplicate failures.

- [ ] **Step 3: Add duplicate body schema near the other schemas**

```ts
const DuplicateBodySchema = z.object({
  newId: z.string().min(1),
});
```

- [ ] **Step 4: Add the duplicate handler**

Append inside `registerFuxaViewsRoutes` after the DELETE handler:

```ts
  // ─── Duplicate ───────────────────────────────────────────
  apiRouter.post('/fuxa-views/:id/duplicate', (req, res) => {
    const parsed = DuplicateBodySchema.safeParse(req.body);
    if (!parsed.success) return zodFail(res, parsed.error);
    if (!sqlite.getFuxaView(req.params.id)) {
      return res.status(404).json({ error: '源视图不存在' });
    }
    if (sqlite.getFuxaView(parsed.data.newId)) {
      return res.status(409).json({ error: `fuxa_view ${parsed.data.newId} already exists` });
    }
    try {
      sqlite.duplicateFuxaView(req.params.id, {
        newId: parsed.data.newId,
        userId: getUserId(req),
      });
      const row = sqlite.getFuxaView(parsed.data.newId);
      res.status(201).json(row);
    } catch (e) {
      console.error('fuxa-views duplicate failed:', (e as Error).message);
      res.status(500).json({ error: 'duplicate failed' });
    }
  });
```

- [ ] **Step 5: Re-run, expect 24 green**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run src/__tests__/fuxa-views-routes.test.ts
```

Expected: 24 passed.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/src/fuxa-views-routes.ts packages/server/src/__tests__/fuxa-views-routes.test.ts
git commit -m "feat(server): fuxa-views POST /:id/duplicate (SP-FX-1)

201 with new row, name suffixed ' Copy', version reset to 1. 404 on
missing source. 409 on newId collision. 400 on missing newId. Routes
coverage at 24 tests now."
```

---

## Task 10: Register routes in server/src/index.ts

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add the import near the other route imports**

Find the line `import { registerScadaRoutes } from './scada-routes';` (around line 64) and add a sibling import:

```ts
import { registerFuxaViewsRoutes } from './fuxa-views-routes';
```

- [ ] **Step 2: Register the routes**

Find the line `registerScadaRoutes(apiRouter, { sqlite, broadcast });` (around line 3097). Add immediately after:

```ts
registerFuxaViewsRoutes(apiRouter, { sqlite });
```

- [ ] **Step 3: Restart the dev server**

```bash
cd /Volumes/SSD/projects/BIOCore
pkill -f "tsx.*watch.*src/index" 2>/dev/null; true
sleep 1
export PATH=$HOME/.hermes/node/bin:$PATH
nohup pnpm dev:server > /tmp/biocore-server.log 2>&1 < /dev/null &
disown
sleep 6
tail -10 /tmp/biocore-server.log | grep -v MQTT
```

Expected: log shows "BIOCore Server" start; 31+ migrations applied (including 033).

- [ ] **Step 4: Smoke-test the endpoint**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
curl -s http://localhost:3001/api/v1/fuxa-views -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected output:
```json
{
    "items": []
}
```

- [ ] **Step 5: POST a sample row via curl + read it back**

```bash
curl -s -X POST http://localhost:3001/api/v1/fuxa-views \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "id":"smoke-1","name":"Smoke","type":"svg","width":800,"height":600,
    "payload":{"id":"smoke-1","name":"Smoke","type":"svg","svgcontent":"<svg/>","width":800,"height":600,"items":{},"schemaVersion":1}
  }' | python3 -m json.tool

curl -s http://localhost:3001/api/v1/fuxa-views/smoke-1 -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: first call returns the created row with `version: 1`; second call returns the same row.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/server/src/index.ts
git commit -m "feat(server): register fuxa-views routes (SP-FX-1)

Mounts /api/v1/fuxa-views CRUD under the existing authMiddleware +
apiRouter. Smoke-tested via curl: GET empty list + POST sample row +
re-GET returns the persisted row."
```

---

## Task 11: Assets port — images (211 SVG)

**Files:**
- Create: `packages/web-ui/src/scada-engine/assets/images/*.svg` (bulk copy)

- [ ] **Step 1: Verify the source files exist and count them**

```bash
cd /Volumes/SSD/projects/FUXA
ls client/src/assets/images/*.svg | wc -l | tr -d ' '
```

Expected output: `211` (or close — value used in the spec; minor drift is acceptable).

- [ ] **Step 2: Copy with a flat manifest, preserving filenames**

```bash
cd /Volumes/SSD/projects/BIOCore
cp /Volumes/SSD/projects/FUXA/client/src/assets/images/*.svg \
   packages/web-ui/src/scada-engine/assets/images/
ls packages/web-ui/src/scada-engine/assets/images/ | wc -l | tr -d ' '
```

Expected: the count matches Step 1 output.

- [ ] **Step 3: Spot-check a few files for SVG validity**

```bash
cd /Volumes/SSD/projects/BIOCore
for f in rect.svg circle.svg ellipse.svg led-circle.svg semaphore.svg; do
  echo "--- $f ---"
  head -2 packages/web-ui/src/scada-engine/assets/images/$f 2>/dev/null
done
```

Expected: each starts with `<?xml` or `<svg` (file is well-formed SVG).

- [ ] **Step 4: Commit the bulk asset copy as one commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/assets/images/
git commit -m "feat(scada-engine): port FUXA UI images (SP-FX-1)

Bulk copy of 211 SVG icons from FUXA client/src/assets/images/ for
later use by editor toolbar + palette. MIT-licensed; attribution is
already recorded in scada-engine/ATTRIBUTION.md (Task 1)."
```

---

## Task 12: Assets port — shapes (154 SVG)

**Files:**
- Create: `packages/web-ui/src/scada-engine/assets/shapes/*.svg`

- [ ] **Step 1: Verify source count**

```bash
cd /Volumes/SSD/projects/FUXA
find client/src/assets/lib/svgeditor/shapes/img -name "*.svg" | wc -l | tr -d ' '
```

Expected: `154` (or close).

- [ ] **Step 2: Bulk copy**

```bash
cd /Volumes/SSD/projects/BIOCore
cp /Volumes/SSD/projects/FUXA/client/src/assets/lib/svgeditor/shapes/img/*.svg \
   packages/web-ui/src/scada-engine/assets/shapes/
ls packages/web-ui/src/scada-engine/assets/shapes/ | wc -l | tr -d ' '
```

Expected: match Step 1.

- [ ] **Step 3: Spot-check shape categories (proc-eng style names)**

```bash
cd /Volumes/SSD/projects/BIOCore
ls packages/web-ui/src/scada-engine/assets/shapes/ | head -8
ls packages/web-ui/src/scada-engine/assets/shapes/ | grep -E "agitator|centrifuge|valve|pump|tank" | head -10
```

Expected: filenames include `agitator-*.svg`, `centrifuge*.svg`, etc.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/assets/shapes/
git commit -m "feat(scada-engine): port FUXA proc-eng + shape SVG library (SP-FX-1)

Bulk copy of 154 shape SVGs (agitator, centrifuge, valve, tank,
pump, pipe sections, etc.) from FUXA client/src/assets/lib/svgeditor/
shapes/img/. SP-FX-5 wires these into the editor's shape palette."
```

---

## Task 13: Assets port — fonts (Roboto + Quicksand)

**Files:**
- Create: `packages/web-ui/src/scada-engine/assets/fonts/roboto/*`
- Create: `packages/web-ui/src/scada-engine/assets/fonts/quicksand/*`

- [ ] **Step 1: Verify FUXA font directories**

```bash
ls /Volumes/SSD/projects/FUXA/client/src/assets/fonts/
```

Expected: directories `roboto-{thin,light,regular,medium,bold}` and `quicksand-{regular,medium,bold}` (FUXA's actual breakdown).

- [ ] **Step 2: Flatten and copy into two grouped dirs**

```bash
cd /Volumes/SSD/projects/BIOCore
mkdir -p packages/web-ui/src/scada-engine/assets/fonts/roboto
mkdir -p packages/web-ui/src/scada-engine/assets/fonts/quicksand

for d in /Volumes/SSD/projects/FUXA/client/src/assets/fonts/roboto-*; do
  cp "$d"/* packages/web-ui/src/scada-engine/assets/fonts/roboto/ 2>/dev/null || true
done
for d in /Volumes/SSD/projects/FUXA/client/src/assets/fonts/quicksand-*; do
  cp "$d"/* packages/web-ui/src/scada-engine/assets/fonts/quicksand/ 2>/dev/null || true
done
ls packages/web-ui/src/scada-engine/assets/fonts/roboto | wc -l | tr -d ' '
ls packages/web-ui/src/scada-engine/assets/fonts/quicksand | wc -l | tr -d ' '
```

Expected: both counts > 0 (typically 3-9 files per family).

- [ ] **Step 3: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/assets/fonts/
git commit -m "feat(scada-engine): port FUXA Roboto + Quicksand fonts (SP-FX-1)

Flattens FUXA's 5+3 per-weight subdirs into two grouped dirs (roboto/
and quicksand/) for simpler @font-face declarations later. Files are
the same .woff / .woff2 / .ttf payloads, MIT/Apache-2.0 (per upstream
license metadata)."
```

---

## Task 14: api/fuxa-views.ts client + tests

**Files:**
- Create: `packages/web-ui/src/scada-engine/api/fuxa-views.ts`
- Create: `packages/web-ui/src/scada-engine/api/__tests__/fuxa-views.test.ts`

- [ ] **Step 1: Write the failing client tests**

`packages/web-ui/src/scada-engine/api/__tests__/fuxa-views.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listFuxaViews, getFuxaView, createFuxaView, updateFuxaView, deleteFuxaView, duplicateFuxaView } from '../fuxa-views';

vi.mock('@/lib/auth', () => ({
  apiFetch: vi.fn(),
}));
import { apiFetch } from '@/lib/auth';

function jsonResponse(body: any, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as any;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const sampleRow = () => ({
  id: 'v1', name: 'V', type: 'svg', payload: JSON.stringify({
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 100, height: 100, items: {}, schemaVersion: 1,
  }),
  width: 100, height: 100, parent_view_id: null, is_template: 0, version: 1,
  created_at: '2026-05-17 12:00:00', updated_at: '2026-05-17 12:00:00',
  created_by: 'admin', updated_by: null,
});

describe('fuxa-views api client (SP-FX-1)', () => {
  it('listFuxaViews calls GET /api/v1/fuxa-views and returns items array', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ items: [sampleRow()] }));
    const items = await listFuxaViews();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('v1');
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/\/api\/v1\/fuxa-views$/);
  });

  it('listFuxaViews({isTemplate:true}) appends query param', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ items: [] }));
    await listFuxaViews({ isTemplate: true });
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/is_template=true/);
  });

  it('getFuxaView returns the row and parses payload to FuxaView', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(sampleRow()));
    const { row, view } = await getFuxaView('v1');
    expect(row.id).toBe('v1');
    expect(view.id).toBe('v1');
    expect(view.schemaVersion).toBe(1);
  });

  it('getFuxaView throws ApiError on 404', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ error: '视图不存在' }, 404));
    await expect(getFuxaView('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('createFuxaView sends POST + returns the created row', async () => {
    const row = sampleRow();
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(row, 201));
    const v = {
      id: 'v1', name: 'V', type: 'svg' as const,
      payload: JSON.parse(row.payload),
      width: 100, height: 100,
    };
    const created = await createFuxaView(v);
    expect(created.id).toBe('v1');
    expect((apiFetch as any).mock.calls[0][1].method).toBe('POST');
  });

  it('updateFuxaView sends PUT with If-Match header', async () => {
    const row = { ...sampleRow(), version: 2 };
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(row));
    await updateFuxaView('v1', {
      expectedVersion: 1,
      name: 'V', type: 'svg', width: 100, height: 100,
      payload: JSON.parse(sampleRow().payload),
    });
    const init = (apiFetch as any).mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect(init.headers['If-Match']).toBe('1');
  });

  it('updateFuxaView with force=true appends ?force=true', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(sampleRow()));
    await updateFuxaView('v1', {
      expectedVersion: 1, force: true,
      name: 'V', type: 'svg', width: 100, height: 100,
      payload: JSON.parse(sampleRow().payload),
    });
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/\?force=true/);
  });

  it('updateFuxaView throws ApiError with currentVersion on 409', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ error: 'stale', currentVersion: 5 }, 409));
    await expect(
      updateFuxaView('v1', {
        expectedVersion: 1,
        name: 'V', type: 'svg', width: 100, height: 100,
        payload: JSON.parse(sampleRow().payload),
      }),
    ).rejects.toMatchObject({ status: 409, body: { currentVersion: 5 } });
  });

  it('deleteFuxaView sends DELETE and returns void on 204', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(null, 204));
    await expect(deleteFuxaView('v1')).resolves.toBeUndefined();
    expect((apiFetch as any).mock.calls[0][1].method).toBe('DELETE');
  });

  it('duplicateFuxaView POSTs to /:id/duplicate with newId body, returns new row', async () => {
    const row = { ...sampleRow(), id: 'v1-copy', name: 'V Copy', version: 1 };
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(row, 201));
    const created = await duplicateFuxaView('v1', 'v1-copy');
    expect(created.id).toBe('v1-copy');
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/\/fuxa-views\/v1\/duplicate$/);
    expect(JSON.parse((apiFetch as any).mock.calls[0][1].body)).toEqual({ newId: 'v1-copy' });
  });

  it('all non-2xx responses surface as ApiError with status + body', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(listFuxaViews()).rejects.toMatchObject({ status: 500, body: { error: 'boom' } });
  });
});
```

- [ ] **Step 2: Write `api/fuxa-views.ts`**

`packages/web-ui/src/scada-engine/api/fuxa-views.ts`:

```ts
// REST client for /api/v1/fuxa-views (SP-FX-1).
// Mirrors the server's CRUD surface defined in packages/server/src/fuxa-views-routes.ts.

import { apiFetch } from '@/lib/auth';
import { FuxaView, FuxaViewSchema, parseFuxaView } from '../models/hmi';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1/fuxa-views';

export interface FuxaViewRow {
  id: string;
  name: string;
  type: string;
  payload: string;
  width: number;
  height: number;
  parent_view_id: string | null;
  is_template: number;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
  }
}

async function unwrap<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* no body */ }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as any;
  return (await res.json()) as T;
}

export async function listFuxaViews(opts: { isTemplate?: boolean } = {}): Promise<FuxaViewRow[]> {
  const qs = opts.isTemplate === true ? '?is_template=true'
    : opts.isTemplate === false ? '?is_template=false'
    : '';
  const data = await unwrap<{ items: FuxaViewRow[] }>(apiFetch(`${BASE}${qs}`));
  return data.items;
}

export async function getFuxaView(id: string): Promise<{ row: FuxaViewRow; view: FuxaView }> {
  const row = await unwrap<FuxaViewRow>(apiFetch(`${BASE}/${encodeURIComponent(id)}`));
  const view = parseFuxaView(row.payload);
  return { row, view };
}

export interface CreateFuxaViewBody {
  id: string;
  name: string;
  type: string;
  payload: FuxaView;
  width: number;
  height: number;
  parent_view_id?: string | null;
  is_template?: number;
}

export async function createFuxaView(body: CreateFuxaViewBody): Promise<FuxaViewRow> {
  // Validate the embedded FuxaView client-side before sending.
  FuxaViewSchema.parse(body.payload);
  return unwrap<FuxaViewRow>(
    apiFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export interface UpdateFuxaViewBody {
  expectedVersion: number;
  force?: boolean;
  name: string;
  type: string;
  payload: FuxaView;
  width: number;
  height: number;
  parent_view_id?: string | null;
  is_template?: number;
}

export async function updateFuxaView(id: string, body: UpdateFuxaViewBody): Promise<FuxaViewRow> {
  FuxaViewSchema.parse(body.payload);
  const qs = body.force ? '?force=true' : '';
  const { expectedVersion, force, ...rest } = body;
  return unwrap<FuxaViewRow>(
    apiFetch(`${BASE}/${encodeURIComponent(id)}${qs}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(expectedVersion),
      },
      body: JSON.stringify(rest),
    }),
  );
}

export async function deleteFuxaView(id: string): Promise<void> {
  await unwrap<void>(apiFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function duplicateFuxaView(id: string, newId: string): Promise<FuxaViewRow> {
  return unwrap<FuxaViewRow>(
    apiFetch(`${BASE}/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newId }),
    }),
  );
}
```

- [ ] **Step 3: Run the tests, expect all 11 green**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run src/scada-engine/api/__tests__/fuxa-views.test.ts
```

Expected: 11 passed.

- [ ] **Step 4: Run tsc to confirm `scada-engine/index.ts` now resolves**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | tail -10
```

Expected: empty output (no tsc errors).

- [ ] **Step 5: Commit**

```bash
cd /Volumes/SSD/projects/BIOCore
git add packages/web-ui/src/scada-engine/api/
git commit -m "feat(scada-engine): typed REST client for /api/v1/fuxa-views (SP-FX-1)

11 vitest cases via mocked apiFetch covering list/get/create/update/
delete/duplicate + If-Match header + force=true query + ApiError for
non-2xx with the parsed body attached (so callers can read
currentVersion on 409). Closes the scada-engine/index.ts barrel."
```

---

## Task 15: Full-suite regression + tsc + push

**Files:**
- None (verification only)

- [ ] **Step 1: web-ui vitest full suite**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec vitest run 2>&1 | tail -6
```

Expected: previously 366 passed + 23 new (12 hmi + 11 api) ≈ 389-396 passing. Zero failures.

- [ ] **Step 2: server vitest full suite**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/server exec vitest run 2>&1 | tail -6
```

Expected: previously 119 + 27 new (3 migration + 10 sqlite-service + 24 routes - some overlap by file split) ≈ 140-149 passing. Zero failures.

- [ ] **Step 3: data-service vitest full suite**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/data-service exec vitest run 2>&1 | tail -6
```

Expected: previous count + 10 new = up by 10. Zero failures.

- [ ] **Step 4: tsc across web-ui + server**

```bash
cd /Volumes/SSD/projects/BIOCore
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui exec tsc --noEmit 2>&1 | tail -3
pnpm --filter @biocore/server exec tsc --noEmit 2>&1 | tail -3
```

Expected: both clean (no output or "Found 0 errors").

- [ ] **Step 5: Restart the running dev server so it picks up registerFuxaViewsRoutes**

```bash
cd /Volumes/SSD/projects/BIOCore
pkill -f "tsx.*watch.*src/index" 2>/dev/null; true
sleep 1
export PATH=$HOME/.hermes/node/bin:$PATH
nohup pnpm dev:server > /tmp/biocore-server.log 2>&1 < /dev/null &
disown
sleep 6
grep -E "Migrator|listening|Server" /tmp/biocore-server.log | tail -10
```

Expected: log shows "31 个 migration 执行成功" with `033-fuxa-views` in the migration list and "BIOCore Server" banner.

- [ ] **Step 6: Push to origin**

```bash
cd /Volumes/SSD/projects/BIOCore
git push origin main 2>&1 | tail -5
```

Expected: push succeeds. SP-FX-1 ships as a sequence of small focused commits.

---

## Self-Review (writing-plans skill)

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `scada-engine/` directory layout per §5.1 | Task 1 |
| `assets/` (211 SVG + 154 shape + fonts) per §5.1 | Tasks 11-13 |
| `models/` TS port (Hmi/View/Widget/Property/Animation) per §6.1 + D9 zod | Task 4 |
| Migration 033 `fuxa_views` table per §6.2 | Task 2 |
| `sqlite-service` CRUD + optimistic lock per §6.6 + §7 | Task 3 |
| `/api/v1/fuxa-views` REST endpoints (GET list/single, POST, PUT, DELETE, duplicate) per §6.2 | Tasks 5-10 |
| 409 + `currentVersion` on stale PUT per §7 | Task 7 |
| `?force=true` bypass + 428 If-Match missing per §7 | Task 7 |
| `api/fuxa-views.ts` client per §5.1 + §6.2 | Task 14 |
| Test coverage targets (web-ui +30, server +25) per plan brief | Task 15 |
| BIOCore PLC write security constraint (set-value goes through useWriteIntent) | Out of scope for SP-FX-1 — runtime lands in SP-FX-7; `set-value` action is only validated as a string value in the schema this round. Noted. |

No spec requirements are missing.

**Placeholder scan:** No TBD / TODO / "implement later" present. Every code block is concrete.

**Type consistency:**

- `FuxaViewRow` is defined in `sqlite-service.ts` (server) and re-defined identically in `api/fuxa-views.ts` (client). Intentional — the two packages have no shared type module yet (would require a new package; out of scope for SP-FX-1). Drift risk noted; consolidate in SP-FX-2 alongside services.
- `expectedVersion` is the keyword used in `updateFuxaView` across sqlite-service (`{expectedVersion, force, ...}`), routes (parsed from `If-Match` header), and api client (`UpdateFuxaViewBody.expectedVersion`).
- `force` flag: same boolean key everywhere.
- `parent_view_id`: snake_case in DB rows and in client `CreateFuxaViewBody` (matches DB column).
- `is_template`: number 0/1 in DB, in `CreateFuxaViewBody`, in zod schemas. Consistent.
- `FUXA_SCHEMA_VERSION`: exported constant in `models/hmi.ts`; zod uses `z.literal(FUXA_SCHEMA_VERSION)`; server PUT/POST body schemas use `z.literal(1)` (literal duplicated because server has no import path to client constants — a known small dup, acceptable).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-fuxa-scada-sp-fx-1-assets-models-schema.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with the task's full text + the parent spec link, review between tasks (spec-compliance + code quality), fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
