# SCADA 数据模型 + 存储 API 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 BIOCore monorepo 加 `scada_projects` + `scada_views` 两表, data-service 10 个 CRUD 方法, scada-routes.ts 11 个 endpoints, WS 4 个广播 channel, 完整鉴权 + 审计追踪 + 单测 + 集成测试, 为后续 SCADA 编辑器 / 运行时子项目奠基。

**Architecture:** 元数据列 + items JSON 混合存储, 复用 BIOCore 现有 JWT 中间件 (`requireAuth` / `requireRole`)、`writeAuditLog`、`createWsServer().broadcast()`。客户端生成 `project_id` / `view_id`, 后端校验唯一。PUT 视图带 `expected_updated_at` 触发 409 冲突检测; 无该字段则强制覆盖。

**Tech Stack:** TypeScript, Express, better-sqlite3, ws (WebSocketServer), vitest, supertest。pnpm monorepo, tsx watch 热重载。

**Spec reference:** `docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md`

---

## 文件结构

**新建**:
- `packages/server/migrations/028-scada-schema.sql` — DDL
- `packages/server/src/scada-routes.ts` — 11 个 REST endpoints + WS 广播
- `packages/data-service/src/__tests__/scada-service.test.ts` — 单测
- `packages/server/src/__tests__/scada-routes.test.ts` — 集成测试

**修改**:
- `packages/data-service/src/sqlite-service.ts` — 新增 10 个 SCADA 方法 + 类型导出
- `packages/server/src/index.ts` — 注册 `registerScadaRoutes(apiRouter, { sqlite, broadcast })`

每个文件单一职责: migration 只动 schema; data-service 只暴露纯 CRUD (不依赖 express); routes 文件负责路由、鉴权、审计、广播。

---

## Task 1: Migration 028 — schema + 索引

**Files:**
- Create: `packages/server/migrations/028-scada-schema.sql`

- [ ] **Step 1: 看现存 migration 文件格式参考**

Run: `ls packages/server/migrations/ | tail -3 && cat packages/server/migrations/027-alarm-definitions.sql | head -20`
Expected: 看到 027 SQL 风格 (CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS)

- [ ] **Step 2: 写 028-scada-schema.sql**

```sql
-- SCADA 项目 + 视图 schema (子项目 1/7)
-- spec: docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md

CREATE TABLE IF NOT EXISTS scada_projects (
  project_id  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scada_views (
  view_id       TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES scada_projects(project_id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  reactor_id    TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 1280,
  height        INTEGER NOT NULL DEFAULT 720,
  background    TEXT NOT NULL DEFAULT '#ffffff',
  items_json    TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scada_views_project ON scada_views(project_id);
CREATE INDEX IF NOT EXISTS idx_scada_views_reactor ON scada_views(reactor_id);
```

- [ ] **Step 3: 启动 server 触发 migrator, 验证表创建**

Run: `pnpm --filter @biocore/server dev > /tmp/server-boot.log 2>&1 & sleep 8 && grep -E "028-scada|migration" /tmp/server-boot.log | head -5`
Expected: 看到 `Applied migration: 028-scada-schema.sql` 类日志, 无错误

- [ ] **Step 4: 直接查 sqlite 验证 schema**

Run: `sqlite3 data/biocore.db ".schema scada_projects" && sqlite3 data/biocore.db ".schema scada_views" && sqlite3 data/biocore.db ".indexes scada_views"`
Expected: 输出两个 CREATE TABLE 和 idx_scada_views_project / idx_scada_views_reactor

- [ ] **Step 5: 停 server**

Run: `pkill -f "tsx watch.*server" || true`
Expected: 退出 0

- [ ] **Step 6: Commit**

```bash
git add packages/server/migrations/028-scada-schema.sql
git commit -m "feat(scada): add scada_projects + scada_views schema (migration 028)"
```

---

## Task 2: data-service 类型 + 项目 CRUD 5 方法

**Files:**
- Modify: `packages/data-service/src/sqlite-service.ts`
- Test: `packages/data-service/src/__tests__/scada-service.test.ts`

- [ ] **Step 1: 在 sqlite-service.ts 顶部 (export class 之前) 添加 SCADA 类型 + 常量导出**

```ts
// ─── SCADA 类型 ───────────────────────────────────────────
export interface ScadaProjectMeta {
  project_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScadaViewMeta {
  view_id: string;
  project_id: string;
  name: string;
  reactor_id: string | null;
  display_order: number;
  width: number;
  height: number;
  background: string;
  updated_at: string;
}

export interface ScadaView extends ScadaViewMeta {
  items: Record<string, any>;
}

export const SCADA_ITEMS_MAX_BYTES = 500 * 1024;
```

- [ ] **Step 2: 写单测 (RED)**

Create `packages/data-service/src/__tests__/scada-service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '../sqlite-service';

function makeDb(): SQLiteService {
  const db = new Database(':memory:');
  const sql = readFileSync(join(__dirname, '../../../server/migrations/028-scada-schema.sql'), 'utf8');
  db.exec(sql);
  return new SQLiteService(db);
}

describe('SCADA project CRUD', () => {
  let svc: SQLiteService;
  beforeEach(() => { svc = makeDb(); });

  it('createScadaProject + getScadaProject round-trip', () => {
    svc.createScadaProject({ project_id: 'proj_1', name: 'Plant A', description: 'demo', created_by: 'u1' });
    const got = svc.getScadaProject('proj_1');
    expect(got).not.toBeNull();
    expect(got!.name).toBe('Plant A');
    expect(got!.description).toBe('demo');
    expect(got!.created_by).toBe('u1');
  });

  it('listScadaProjects returns all', () => {
    svc.createScadaProject({ project_id: 'proj_a', name: 'A' });
    svc.createScadaProject({ project_id: 'proj_b', name: 'B' });
    const list = svc.listScadaProjects();
    expect(list).toHaveLength(2);
    expect(list.map(p => p.project_id).sort()).toEqual(['proj_a', 'proj_b']);
  });

  it('updateScadaProject patches name', () => {
    svc.createScadaProject({ project_id: 'proj_x', name: 'old' });
    const ok = svc.updateScadaProject('proj_x', { name: 'new' });
    expect(ok).toBe(true);
    expect(svc.getScadaProject('proj_x')!.name).toBe('new');
  });

  it('updateScadaProject returns false for missing id', () => {
    expect(svc.updateScadaProject('missing', { name: 'x' })).toBe(false);
  });

  it('deleteScadaProject cascades to views', () => {
    svc.createScadaProject({ project_id: 'p1', name: 'P' });
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'View 1' });
    svc.createScadaView({ view_id: 'v2', project_id: 'p1', name: 'View 2' });
    const r = svc.deleteScadaProject('p1');
    expect(r.deleted_views).toBe(2);
    expect(svc.getScadaProject('p1')).toBeNull();
    expect(svc.getScadaView('v1')).toBeNull();
  });

  it('duplicate project_id throws', () => {
    svc.createScadaProject({ project_id: 'dup', name: 'A' });
    expect(() => svc.createScadaProject({ project_id: 'dup', name: 'B' })).toThrow();
  });
});
```

- [ ] **Step 3: 跑测试看 RED**

Run: `pnpm --filter @biocore/data-service test scada-service`
Expected: FAIL — `svc.createScadaProject is not a function` 等

- [ ] **Step 4: 实现 5 个项目方法 (SQLiteService class 内, audit 区块之后)**

```ts
  // ─── SCADA 项目 ───────────────────────────────────────────
  listScadaProjects(): ScadaProjectMeta[] {
    return this.db.prepare(
      'SELECT project_id, name, description, created_by, created_at, updated_at FROM scada_projects ORDER BY updated_at DESC'
    ).all() as ScadaProjectMeta[];
  }

  getScadaProject(projectId: string): ScadaProjectMeta | null {
    const row = this.db.prepare(
      'SELECT project_id, name, description, created_by, created_at, updated_at FROM scada_projects WHERE project_id = ?'
    ).get(projectId) as ScadaProjectMeta | undefined;
    return row || null;
  }

  createScadaProject(p: { project_id: string; name: string; description?: string | null; created_by?: string | null }): void {
    this.db.prepare(
      'INSERT INTO scada_projects (project_id, name, description, created_by) VALUES (?, ?, ?, ?)'
    ).run(p.project_id, p.name, p.description ?? null, p.created_by ?? null);
  }

  updateScadaProject(projectId: string, patch: Partial<{ name: string; description: string | null }>): boolean {
    const sets: string[] = [];
    const vals: any[] = [];
    if (patch.name !== undefined) { sets.push('name = ?'); vals.push(patch.name); }
    if (patch.description !== undefined) { sets.push('description = ?'); vals.push(patch.description); }
    if (sets.length === 0) return false;
    sets.push("updated_at = datetime('now')");
    vals.push(projectId);
    const r = this.db.prepare(`UPDATE scada_projects SET ${sets.join(', ')} WHERE project_id = ?`).run(...vals);
    return r.changes > 0;
  }

  deleteScadaProject(projectId: string): { deleted_views: number } {
    const viewCount = (this.db.prepare('SELECT COUNT(*) AS n FROM scada_views WHERE project_id = ?').get(projectId) as { n: number }).n;
    this.db.pragma('foreign_keys = ON');
    this.db.prepare('DELETE FROM scada_projects WHERE project_id = ?').run(projectId);
    return { deleted_views: viewCount };
  }
```

- [ ] **Step 5: 再跑测试 — 前 4 个用例 GREEN; cascade 用例预计 RED 直到 Task 3 实现 view 方法**

Run: `pnpm --filter @biocore/data-service test scada-service`
Expected: 4 PASS, 1 FAIL ("createScadaView is not a function")

- [ ] **Step 6: Commit**

```bash
git add packages/data-service/src/sqlite-service.ts packages/data-service/src/__tests__/scada-service.test.ts
git commit -m "feat(scada): add ScadaProjectMeta types + 5 project CRUD methods"
```

---

## Task 3: data-service 视图 CRUD 5 方法 + 冲突检测

**Files:**
- Modify: `packages/data-service/src/sqlite-service.ts`
- Modify: `packages/data-service/src/__tests__/scada-service.test.ts`

- [ ] **Step 1: 加单测用例 (RED)**

追加到 `scada-service.test.ts` 末尾:

```ts
describe('SCADA view CRUD', () => {
  let svc: SQLiteService;
  beforeEach(() => {
    svc = makeDb();
    svc.createScadaProject({ project_id: 'p1', name: 'P' });
  });

  it('createScadaView + getScadaView round-trip with items', () => {
    const items = { w1: { type: 'tank', x: 10, y: 20, w: 100, h: 200, props: { color: 'blue' } } };
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'View 1', items });
    const got = svc.getScadaView('v1');
    expect(got).not.toBeNull();
    expect(got!.name).toBe('View 1');
    expect(got!.items).toEqual(items);
  });

  it('items_json round-trip preserves nested widget tree', () => {
    const items = {
      tank1: { type: 'tank', x: 0, y: 0, w: 100, h: 100, props: { fill: '#abc' }, bindings: [{ tag: 'F01.AI-0', prop: 'value' }] },
      trend1: { type: 'trend', x: 100, y: 0, w: 400, h: 200, props: { series: ['F01.AI-0', 'F01.AI-1'], yMin: 0, yMax: 100 } },
    };
    svc.createScadaView({ view_id: 'v_nested', project_id: 'p1', name: 'Nested', items });
    expect(svc.getScadaView('v_nested')!.items).toEqual(items);
  });

  it('listScadaViewsByProject returns project views', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'A' });
    svc.createScadaView({ view_id: 'v2', project_id: 'p1', name: 'B' });
    const list = svc.listScadaViewsByProject('p1');
    expect(list).toHaveLength(2);
    expect((list[0] as any).items).toBeUndefined();
  });

  it('listScadaViewsByReactor returns reactor-specific + generic (NULL) views', () => {
    svc.createScadaView({ view_id: 'v_f01', project_id: 'p1', name: 'F01 view', reactor_id: 'F01' });
    svc.createScadaView({ view_id: 'v_f02', project_id: 'p1', name: 'F02 view', reactor_id: 'F02' });
    svc.createScadaView({ view_id: 'v_generic', project_id: 'p1', name: 'Generic' });
    const list = svc.listScadaViewsByReactor('F01');
    const ids = list.map(v => v.view_id).sort();
    expect(ids).toEqual(['v_f01', 'v_generic']);
  });

  it('updateScadaView patches metadata + items', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'old' });
    const r = svc.updateScadaView('v1', { name: 'new', items: { x: { type: 'btn', x: 0, y: 0, w: 50, h: 50, props: {} } } });
    expect(r.ok).toBe(true);
    const got = svc.getScadaView('v1')!;
    expect(got.name).toBe('new');
    expect(got.items.x.type).toBe('btn');
  });

  it('updateScadaView returns conflict when expected_updated_at mismatches', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'A' });
    const r = svc.updateScadaView('v1', { name: 'B', expected_updated_at: '1970-01-01 00:00:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect((r as any).conflict).toBe(true);
      expect((r as any).current_updated_at).toBeTruthy();
    }
  });

  it('updateScadaView accepts matching expected_updated_at', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'A' });
    const cur = svc.getScadaView('v1')!.updated_at;
    const r = svc.updateScadaView('v1', { name: 'B', expected_updated_at: cur });
    expect(r.ok).toBe(true);
  });

  it('deleteScadaView returns true and removes row', () => {
    svc.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'X' });
    expect(svc.deleteScadaView('v1')).toBe(true);
    expect(svc.getScadaView('v1')).toBeNull();
    expect(svc.deleteScadaView('v1')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试看 RED**

Run: `pnpm --filter @biocore/data-service test scada-service`
Expected: FAIL — `svc.createScadaView is not a function`

- [ ] **Step 3: 实现 5 个视图方法 (sqlite-service.ts SCADA 项目段后)**

```ts
  // ─── SCADA 视图 ───────────────────────────────────────────
  listScadaViewsByProject(projectId: string): ScadaViewMeta[] {
    return this.db.prepare(
      `SELECT view_id, project_id, name, reactor_id, display_order, width, height, background, updated_at
       FROM scada_views WHERE project_id = ? ORDER BY display_order ASC, name ASC`
    ).all(projectId) as ScadaViewMeta[];
  }

  listScadaViewsByReactor(reactorId: string): ScadaViewMeta[] {
    return this.db.prepare(
      `SELECT view_id, project_id, name, reactor_id, display_order, width, height, background, updated_at
       FROM scada_views WHERE reactor_id = ? OR reactor_id IS NULL ORDER BY display_order ASC, name ASC`
    ).all(reactorId) as ScadaViewMeta[];
  }

  getScadaView(viewId: string): ScadaView | null {
    const row = this.db.prepare(
      `SELECT view_id, project_id, name, reactor_id, display_order, width, height, background, items_json, updated_at
       FROM scada_views WHERE view_id = ?`
    ).get(viewId) as (ScadaViewMeta & { items_json: string }) | undefined;
    if (!row) return null;
    const { items_json, ...meta } = row;
    let items: Record<string, any> = {};
    try { items = JSON.parse(items_json); } catch { items = {}; }
    return { ...meta, items };
  }

  createScadaView(v: {
    view_id: string; project_id: string; name: string;
    reactor_id?: string | null;
    width?: number; height?: number; background?: string;
    display_order?: number;
    items?: Record<string, any>;
  }): void {
    this.db.prepare(
      `INSERT INTO scada_views (view_id, project_id, name, reactor_id, display_order, width, height, background, items_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      v.view_id, v.project_id, v.name,
      v.reactor_id ?? null,
      v.display_order ?? 0,
      v.width ?? 1280,
      v.height ?? 720,
      v.background ?? '#ffffff',
      JSON.stringify(v.items ?? {}),
    );
  }

  updateScadaView(viewId: string, patch: {
    name?: string;
    reactor_id?: string | null;
    display_order?: number;
    width?: number; height?: number; background?: string;
    items?: Record<string, any>;
    expected_updated_at?: string | null;
  }):
    | { ok: true; updated_at: string }
    | { ok: false; conflict: true; current_updated_at: string }
    | { ok: false; conflict: false; not_found: true }
  {
    const cur = this.db.prepare('SELECT updated_at FROM scada_views WHERE view_id = ?').get(viewId) as { updated_at: string } | undefined;
    if (!cur) return { ok: false, conflict: false, not_found: true };
    if (patch.expected_updated_at && patch.expected_updated_at !== cur.updated_at) {
      return { ok: false, conflict: true, current_updated_at: cur.updated_at };
    }
    const sets: string[] = [];
    const vals: any[] = [];
    if (patch.name !== undefined)          { sets.push('name = ?');           vals.push(patch.name); }
    if (patch.reactor_id !== undefined)    { sets.push('reactor_id = ?');     vals.push(patch.reactor_id); }
    if (patch.display_order !== undefined) { sets.push('display_order = ?');  vals.push(patch.display_order); }
    if (patch.width !== undefined)         { sets.push('width = ?');          vals.push(patch.width); }
    if (patch.height !== undefined)        { sets.push('height = ?');         vals.push(patch.height); }
    if (patch.background !== undefined)    { sets.push('background = ?');     vals.push(patch.background); }
    if (patch.items !== undefined)         { sets.push('items_json = ?');     vals.push(JSON.stringify(patch.items)); }
    sets.push("updated_at = datetime('now')");
    vals.push(viewId);
    this.db.prepare(`UPDATE scada_views SET ${sets.join(', ')} WHERE view_id = ?`).run(...vals);
    const after = this.db.prepare('SELECT updated_at FROM scada_views WHERE view_id = ?').get(viewId) as { updated_at: string };
    return { ok: true, updated_at: after.updated_at };
  }

  deleteScadaView(viewId: string): boolean {
    const r = this.db.prepare('DELETE FROM scada_views WHERE view_id = ?').run(viewId);
    return r.changes > 0;
  }
```

- [ ] **Step 4: 跑测试 — 全 GREEN (project 5 + view 8 = 13 用例)**

Run: `pnpm --filter @biocore/data-service test scada-service`
Expected: 13 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/data-service/src/sqlite-service.ts packages/data-service/src/__tests__/scada-service.test.ts
git commit -m "feat(scada): add 5 view CRUD methods with optimistic concurrency"
```

---

## Task 4: scada-routes.ts 骨架 + 项目 5 个 endpoints

**Files:**
- Create: `packages/server/src/scada-routes.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: 建 scada-routes.ts 骨架 + 5 个项目 endpoints**

```ts
// ============================================================
// scada-routes.ts — SCADA 项目 + 视图 REST API
// ============================================================
// Spec: docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md
// Routes mounted under /api/v1:
//   GET    /scada/projects
//   GET    /scada/projects/:projectId
//   POST   /scada/projects                       (admin/engineer)
//   PUT    /scada/projects/:projectId            (admin/engineer)
//   DELETE /scada/projects/:projectId            (admin/engineer)
//   GET    /scada/views/:viewId
//   POST   /scada/projects/:projectId/views      (admin/engineer)
//   PUT    /scada/views/:viewId                  (admin/engineer)
//   DELETE /scada/views/:viewId                  (admin/engineer)
//   GET    /scada/reactors/:reactorId/views
// ============================================================

import type { Router, Request } from 'express';
import type { SQLiteService } from '@biocore/data-service';
import { SCADA_ITEMS_MAX_BYTES } from '@biocore/data-service';
import { requireRole } from './middlewares/auth';

export interface ScadaRoutesDeps {
  sqlite: SQLiteService;
  broadcast: (channel: string, payload: any) => void;
}

function getUserId(req: Request): string {
  return (req as any).user?.user_id || 'unknown';
}

function getIp(req: Request): string | undefined {
  return (req.ip || req.socket.remoteAddress) ?? undefined;
}

export function registerScadaRoutes(apiRouter: Router, deps: ScadaRoutesDeps): void {
  const { sqlite, broadcast } = deps;

  // ─── 项目 ─────────────────────────────────────────────────
  apiRouter.get('/scada/projects', (_req, res) => {
    res.json({ items: sqlite.listScadaProjects() });
  });

  apiRouter.get('/scada/projects/:projectId', (req, res) => {
    const meta = sqlite.getScadaProject(req.params.projectId);
    if (!meta) return res.status(404).json({ error: 'project_not_found' });
    const views = sqlite.listScadaViewsByProject(req.params.projectId);
    res.json({ ...meta, views });
  });

  apiRouter.post('/scada/projects', requireRole('admin', 'engineer'), (req, res) => {
    const { project_id, name, description } = req.body ?? {};
    if (!project_id || !name) return res.status(400).json({ error: 'project_id_and_name_required' });
    if (sqlite.getScadaProject(project_id)) {
      return res.status(409).json({ error: 'project_id_conflict' });
    }
    const userId = getUserId(req);
    sqlite.createScadaProject({ project_id, name, description: description ?? null, created_by: userId });
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_project_create',
      target_type: 'scada_project',
      target_id: project_id,
      new_value: JSON.stringify({ name, description: description ?? null }),
      ip_address: getIp(req),
    });
    broadcast('scada:project:saved', { project_id, updated_at: sqlite.getScadaProject(project_id)!.updated_at });
    res.status(201).json({ success: true, project_id });
  });

  apiRouter.put('/scada/projects/:projectId', requireRole('admin', 'engineer'), (req, res) => {
    const { projectId } = req.params;
    const old = sqlite.getScadaProject(projectId);
    if (!old) return res.status(404).json({ error: 'project_not_found' });
    const patch: { name?: string; description?: string | null } = {};
    if (typeof req.body?.name === 'string') patch.name = req.body.name;
    if (req.body?.description !== undefined) patch.description = req.body.description ?? null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'empty_patch' });
    sqlite.updateScadaProject(projectId, patch);
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_project_update',
      target_type: 'scada_project',
      target_id: projectId,
      old_value: JSON.stringify({ name: old.name, description: old.description }),
      new_value: JSON.stringify(patch),
      ip_address: getIp(req),
    });
    const updated = sqlite.getScadaProject(projectId)!;
    broadcast('scada:project:saved', { project_id: projectId, updated_at: updated.updated_at });
    res.json({ success: true });
  });

  apiRouter.delete('/scada/projects/:projectId', requireRole('admin', 'engineer'), (req, res) => {
    const { projectId } = req.params;
    const old = sqlite.getScadaProject(projectId);
    if (!old) return res.status(404).json({ error: 'project_not_found' });
    const r = sqlite.deleteScadaProject(projectId);
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_project_delete',
      target_type: 'scada_project',
      target_id: projectId,
      old_value: JSON.stringify({ name: old.name, view_count: r.deleted_views }),
      ip_address: getIp(req),
    });
    broadcast('scada:project:deleted', { project_id: projectId });
    res.json({ success: true, deleted_views: r.deleted_views });
  });
}
```

- [ ] **Step 2: 在 index.ts 注册路由**

修改 `packages/server/src/index.ts`:

在 import 段加 (跟其它 register* 风格一致, 约 line 65 附近):

```ts
import { registerScadaRoutes } from './scada-routes';
```

在路由注册段 (`registerAuthRoutes` 调用之后, 约 line 539 后) 加:

```ts
registerScadaRoutes(apiRouter, { sqlite, broadcast });
```

- [ ] **Step 3: 起 server 验证启动无错**

Run: `pnpm --filter @biocore/server dev > /tmp/scada-boot.log 2>&1 & sleep 8 && grep -i "error\|listening" /tmp/scada-boot.log | head -5`
Expected: listening on 3001, 无 error

- [ ] **Step 4: 拿 token + curl 跑项目 endpoint smoke test**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:3001/api/v1/scada/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"project_id":"proj_smoke","name":"Smoke"}'
echo
curl -s http://localhost:3001/api/v1/scada/projects -H "Authorization: Bearer $TOKEN"
echo
curl -s http://localhost:3001/api/v1/scada/projects/proj_smoke -H "Authorization: Bearer $TOKEN"
echo
curl -s -X PUT http://localhost:3001/api/v1/scada/projects/proj_smoke -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"description":"updated"}'
echo
curl -s -X DELETE http://localhost:3001/api/v1/scada/projects/proj_smoke -H "Authorization: Bearer $TOKEN"
echo
```
Expected: success=true × 3, list 含 1 项, get 含 views:[]

- [ ] **Step 5: 验证 audit_logs**

Run: `sqlite3 data/biocore.db "SELECT action, target_type, target_id FROM audit_logs WHERE action LIKE 'scada_%' ORDER BY id DESC LIMIT 5;"`
Expected: 3 行 — scada_project_delete / scada_project_update / scada_project_create

- [ ] **Step 6: 停 server**

Run: `pkill -f "tsx watch.*server" || true`

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/scada-routes.ts packages/server/src/index.ts
git commit -m "feat(scada): add 5 project REST endpoints with auth+audit+broadcast"
```

---

## Task 5: scada-routes.ts 视图 5 个 endpoints + items 大小检查

**Files:**
- Modify: `packages/server/src/scada-routes.ts`

- [ ] **Step 1: 在 registerScadaRoutes 函数体末尾追加视图 endpoints (闭合 `}` 之前)**

```ts
  // ─── 视图 ─────────────────────────────────────────────────
  function checkItemsSize(items: any): string | null {
    const str = JSON.stringify(items);
    if (Buffer.byteLength(str, 'utf8') > SCADA_ITEMS_MAX_BYTES) {
      return 'items_too_large';
    }
    return null;
  }

  apiRouter.get('/scada/views/:viewId', (req, res) => {
    const view = sqlite.getScadaView(req.params.viewId);
    if (!view) return res.status(404).json({ error: 'view_not_found' });
    res.json(view);
  });

  apiRouter.get('/scada/reactors/:reactorId/views', (req, res) => {
    res.json({ items: sqlite.listScadaViewsByReactor(req.params.reactorId) });
  });

  apiRouter.post('/scada/projects/:projectId/views', requireRole('admin', 'engineer'), (req, res) => {
    const { projectId } = req.params;
    if (!sqlite.getScadaProject(projectId)) return res.status(404).json({ error: 'project_not_found' });
    const { view_id, name, reactor_id, width, height, background, display_order, items } = req.body ?? {};
    if (!view_id || !name) return res.status(400).json({ error: 'view_id_and_name_required' });
    if (sqlite.getScadaView(view_id)) return res.status(409).json({ error: 'view_id_conflict' });
    if (items !== undefined) {
      const err = checkItemsSize(items);
      if (err) return res.status(400).json({ error: err });
    }
    sqlite.createScadaView({
      view_id, project_id: projectId, name,
      reactor_id: reactor_id ?? null,
      width, height, background, display_order,
      items: items ?? {},
    });
    const after = sqlite.getScadaView(view_id)!;
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_view_create',
      target_type: 'scada_view',
      target_id: view_id,
      new_value: JSON.stringify({ name, reactor_id: reactor_id ?? null, project_id: projectId }),
      ip_address: getIp(req),
    });
    broadcast('scada:view:saved', {
      view_id, project_id: projectId, updated_at: after.updated_at, updated_by: userId,
    });
    res.status(201).json({ success: true, view_id });
  });

  apiRouter.put('/scada/views/:viewId', requireRole('admin', 'engineer'), (req, res) => {
    const { viewId } = req.params;
    const old = sqlite.getScadaView(viewId);
    if (!old) return res.status(404).json({ error: 'view_not_found' });
    const body = req.body ?? {};
    if (body.items !== undefined) {
      const err = checkItemsSize(body.items);
      if (err) return res.status(400).json({ error: err });
    }
    const r = sqlite.updateScadaView(viewId, {
      name: body.name,
      reactor_id: body.reactor_id,
      display_order: body.display_order,
      width: body.width,
      height: body.height,
      background: body.background,
      items: body.items,
      expected_updated_at: body.expected_updated_at ?? null,
    });
    if (!r.ok && 'conflict' in r && r.conflict) {
      return res.status(409).json({ error: 'concurrent_update', current_updated_at: (r as any).current_updated_at });
    }
    if (!r.ok) return res.status(404).json({ error: 'view_not_found' });
    const userId = getUserId(req);
    const widgetCount = body.items ? Object.keys(body.items).length : Object.keys(old.items).length;
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_view_save',
      target_type: 'scada_view',
      target_id: viewId,
      old_value: JSON.stringify({ updated_at: old.updated_at }),
      new_value: JSON.stringify({ updated_at: r.updated_at, widget_count: widgetCount }),
      ip_address: getIp(req),
    });
    broadcast('scada:view:saved', {
      view_id: viewId, project_id: old.project_id, updated_at: r.updated_at, updated_by: userId,
    });
    res.json({ success: true, updated_at: r.updated_at });
  });

  apiRouter.delete('/scada/views/:viewId', requireRole('admin', 'engineer'), (req, res) => {
    const { viewId } = req.params;
    const old = sqlite.getScadaView(viewId);
    if (!old) return res.status(404).json({ error: 'view_not_found' });
    sqlite.deleteScadaView(viewId);
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_view_delete',
      target_type: 'scada_view',
      target_id: viewId,
      old_value: JSON.stringify({ name: old.name }),
      ip_address: getIp(req),
    });
    broadcast('scada:view:deleted', { view_id: viewId, project_id: old.project_id });
    res.json({ success: true });
  });
```

- [ ] **Step 2: 起 server 验证启动**

Run: `pnpm --filter @biocore/server dev > /tmp/scada-views-boot.log 2>&1 & sleep 8 && grep -i "error\|listening" /tmp/scada-views-boot.log | head -5`
Expected: listening, 无 error

- [ ] **Step 3: curl smoke test (views)**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:3001/api/v1/scada/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"project_id":"proj_view_smoke","name":"VS"}'
echo
curl -s -X POST http://localhost:3001/api/v1/scada/projects/proj_view_smoke/views -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"view_id":"v_smoke","name":"V1","reactor_id":"F01","items":{"t1":{"type":"tank","x":0,"y":0,"w":100,"h":100,"props":{}}}}'
echo
curl -s http://localhost:3001/api/v1/scada/views/v_smoke -H "Authorization: Bearer $TOKEN"
echo
curl -s http://localhost:3001/api/v1/scada/reactors/F01/views -H "Authorization: Bearer $TOKEN"
echo
# 错误 expected_updated_at → 期望 409
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X PUT http://localhost:3001/api/v1/scada/views/v_smoke -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"V2","expected_updated_at":"1970-01-01 00:00:00"}'
# 不带 expected → 200
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X PUT http://localhost:3001/api/v1/scada/views/v_smoke -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"V2"}'
curl -s -X DELETE http://localhost:3001/api/v1/scada/views/v_smoke -H "Authorization: Bearer $TOKEN"
echo
curl -s -X DELETE http://localhost:3001/api/v1/scada/projects/proj_view_smoke -H "Authorization: Bearer $TOKEN"
echo
```
Expected: `HTTP 409` 然后 `HTTP 200`, 其它全部 success=true

- [ ] **Step 4: 停 server**

Run: `pkill -f "tsx watch.*server" || true`

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/scada-routes.ts
git commit -m "feat(scada): add 5 view REST endpoints with size limit + conflict detect"
```

---

## Task 6: 集成测试 (supertest)

**Files:**
- Test: `packages/server/src/__tests__/scada-routes.test.ts`

- [ ] **Step 1: 看现存 route-registration 测试参考搭建方式**

Run: `cat packages/server/src/__tests__/route-registration.test.ts | head -60`
Expected: 看到 express + supertest 用法

- [ ] **Step 2: 写集成测试**

```ts
// packages/server/src/__tests__/scada-routes.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { registerScadaRoutes } from '../scada-routes';

function makeApp(): {
  app: express.Express; sqlite: SQLiteService; broadcasts: Array<{ channel: string; payload: any }>;
} {
  const db = new Database(':memory:');
  const m028 = readFileSync(join(__dirname, '../../migrations/028-scada-schema.sql'), 'utf8');
  db.exec(m028);
  // 极简 audit_logs (writeAuditLog 写它即可)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      batch_id TEXT, user_id TEXT, action TEXT, target_type TEXT,
      target_id TEXT, old_value TEXT, new_value TEXT, reason TEXT,
      ip_address TEXT, trace_id TEXT, target_kind TEXT
    );
  `);
  const sqlite = new SQLiteService(db);
  const broadcasts: Array<{ channel: string; payload: any }> = [];
  const broadcast = (channel: string, payload: any) => { broadcasts.push({ channel, payload }); };
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  // 简化 auth: 由测试通过 header X-Test-Role 注入角色 (模拟 requireAuth 已通过)
  app.use((req, _res, next) => {
    const r = req.headers['x-test-role'] as string | undefined;
    if (r) (req as any).user = { user_id: `u_${r}`, role: r };
    next();
  });
  const apiRouter = express.Router();
  registerScadaRoutes(apiRouter, { sqlite, broadcast });
  app.use('/api/v1', apiRouter);
  return { app, sqlite, broadcasts };
}

describe('SCADA REST API — auth gates', () => {
  it('POST project without role → 403', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/v1/scada/projects').send({ project_id: 'p1', name: 'P' });
    expect(r.status).toBe(403);
  });

  it('POST project as operator → 403', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'operator')
      .send({ project_id: 'p1', name: 'P' });
    expect(r.status).toBe(403);
  });

  it('POST project as engineer → 201', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'Plant' });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
  });

  it('GET projects works without role (path not guarded by requireRole)', async () => {
    const { app } = makeApp();
    const r = await request(app).get('/api/v1/scada/projects');
    expect(r.status).toBe(200);
  });
});

describe('SCADA REST API — project CRUD', () => {
  it('create → get → update → delete', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p_rt', name: 'RT' }).expect(201);
    const g = await request(app).get('/api/v1/scada/projects/p_rt').expect(200);
    expect(g.body.name).toBe('RT');
    expect(g.body.views).toEqual([]);
    await request(app).put('/api/v1/scada/projects/p_rt').set('X-Test-Role', 'engineer')
      .send({ name: 'RT2' }).expect(200);
    const g2 = await request(app).get('/api/v1/scada/projects/p_rt').expect(200);
    expect(g2.body.name).toBe('RT2');
    await request(app).delete('/api/v1/scada/projects/p_rt').set('X-Test-Role', 'engineer').expect(200);
    await request(app).get('/api/v1/scada/projects/p_rt').expect(404);
  });

  it('duplicate project_id → 409', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'dup', name: 'A' }).expect(201);
    const r = await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'dup', name: 'B' });
    expect(r.status).toBe(409);
  });

  it('missing project_id → 400', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ name: 'no_id' });
    expect(r.status).toBe(400);
  });
});

describe('SCADA REST API — view CRUD + conflict', () => {
  it('POST view → GET returns items', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    const items = { t1: { type: 'tank', x: 0, y: 0, w: 100, h: 100, props: {} } };
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V', items }).expect(201);
    const g = await request(app).get('/api/v1/scada/views/v1').expect(200);
    expect(g.body.items).toEqual(items);
  });

  it('PUT with stale expected_updated_at → 409', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V' }).expect(201);
    const r = await request(app).put('/api/v1/scada/views/v1').set('X-Test-Role', 'engineer')
      .send({ name: 'V2', expected_updated_at: '1970-01-01 00:00:00' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('concurrent_update');
    expect(r.body.current_updated_at).toBeTruthy();
  });

  it('PUT without expected_updated_at always wins', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V' }).expect(201);
    await request(app).put('/api/v1/scada/views/v1').set('X-Test-Role', 'engineer')
      .send({ name: 'V2' }).expect(200);
  });

  it('items_json over 500KB → 400', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    const huge: Record<string, any> = {};
    huge.bloat = { type: 'note', x: 0, y: 0, w: 10, h: 10, props: { text: 'x'.repeat(600 * 1024) } };
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v_huge', name: 'H', items: huge });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('items_too_large');
  });

  it('GET reactor views returns reactor-specific + NULL', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v_f01', name: 'F01', reactor_id: 'F01' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v_gen', name: 'Generic' }).expect(201);
    const r = await request(app).get('/api/v1/scada/reactors/F01/views').expect(200);
    const ids = r.body.items.map((v: any) => v.view_id).sort();
    expect(ids).toEqual(['v_f01', 'v_gen']);
  });

  it('DELETE project cascades to views', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V' }).expect(201);
    const d = await request(app).delete('/api/v1/scada/projects/p1').set('X-Test-Role', 'engineer').expect(200);
    expect(d.body.deleted_views).toBe(1);
    await request(app).get('/api/v1/scada/views/v1').expect(404);
  });

  it('missing view → 404', async () => {
    const { app } = makeApp();
    await request(app).get('/api/v1/scada/views/missing').expect(404);
  });
});

describe('SCADA REST API — audit + broadcast', () => {
  it('POST view writes audit + broadcasts scada:view:saved', async () => {
    const { app, sqlite, broadcasts } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V' }).expect(201);
    const logs = sqlite.getAuditLogs(undefined, 10);
    const actions = logs.map(l => l.action);
    expect(actions).toContain('scada_project_create');
    expect(actions).toContain('scada_view_create');
    const channels = broadcasts.map(b => b.channel);
    expect(channels).toContain('scada:project:saved');
    expect(channels).toContain('scada:view:saved');
    const viewSaved = broadcasts.find(b => b.channel === 'scada:view:saved')!;
    expect(viewSaved.payload.view_id).toBe('v1');
    expect(viewSaved.payload.updated_by).toBe('u_engineer');
  });

  it('DELETE project broadcasts scada:project:deleted', async () => {
    const { app, broadcasts } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).delete('/api/v1/scada/projects/p1').set('X-Test-Role', 'engineer').expect(200);
    expect(broadcasts.map(b => b.channel)).toContain('scada:project:deleted');
  });
});
```

- [ ] **Step 3: 跑测试 — 全 GREEN**

Run: `pnpm --filter @biocore/server test scada-routes`
Expected: 全部 PASS (auth 4 + project 3 + view 7 + audit 2 = 16 用例)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/__tests__/scada-routes.test.ts
git commit -m "test(scada): integration tests covering auth, CRUD, conflict, audit, broadcast"
```

---

## Task 7: 手工 DoD 验证

**Files:** 无新文件, 跑命令验证

- [ ] **Step 1: 全测试套件跑过**

Run: `pnpm test 2>&1 | tail -30`
Expected: 全部 PASS, 无新失败

- [ ] **Step 2: 起 server**

Run: `pnpm --filter @biocore/server dev > /tmp/dod.log 2>&1 & sleep 8 && grep -i "listening\|error" /tmp/dod.log | head -5`
Expected: listening on 3001, 无 error

- [ ] **Step 3: WS broadcast 验证 (单 WS 客户端监听 SCADA 通道)**

```bash
cat > /tmp/scada-ws-watch.mjs <<'EOF'
import WebSocket from 'ws';
const url = process.env.WS_URL || 'ws://localhost:3001/ws';
const ws = new WebSocket(url);
ws.on('open', () => console.log('connected'));
ws.on('message', (m) => {
  try {
    const msg = JSON.parse(m.toString());
    if (msg.channel && String(msg.channel).startsWith('scada:')) {
      console.log('SCADA event:', msg.channel, JSON.stringify(msg.payload));
    }
  } catch {}
});
setTimeout(() => process.exit(0), 15000);
EOF
node /tmp/scada-ws-watch.mjs > /tmp/ws-watcher.log 2>&1 &
WATCHER=$!
sleep 1

TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:3001/api/v1/scada/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"project_id":"proj_dod","name":"DoD"}'
curl -s -X POST http://localhost:3001/api/v1/scada/projects/proj_dod/views -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"view_id":"v_dod","name":"V"}'
curl -s -X PUT http://localhost:3001/api/v1/scada/views/v_dod -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"V2"}'
curl -s -X DELETE http://localhost:3001/api/v1/scada/projects/proj_dod -H "Authorization: Bearer $TOKEN"
wait $WATCHER
cat /tmp/ws-watcher.log
```
Expected: 4 行 SCADA event — project:saved / view:saved / view:saved / project:deleted

- [ ] **Step 4: audit_logs 持久化验证**

Run: `sqlite3 data/biocore.db "SELECT action, target_id, COALESCE(SUBSTR(new_value,1,40),'') FROM audit_logs WHERE action LIKE 'scada_%' ORDER BY id DESC LIMIT 10;"`
Expected: 看到 scada_project_delete / scada_view_save / scada_view_create / scada_project_create

- [ ] **Step 5: 重启后持久化验证**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s -X POST http://localhost:3001/api/v1/scada/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"project_id":"proj_persist","name":"P"}'
curl -s -X POST http://localhost:3001/api/v1/scada/projects/proj_persist/views -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"view_id":"v_persist","name":"V","items":{"t":{"type":"tank","x":1,"y":2,"w":3,"h":4,"props":{"k":"v"}}}}'
pkill -f "tsx watch.*server" || true
sleep 2
pnpm --filter @biocore/server dev > /tmp/dod2.log 2>&1 &
sleep 8
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
curl -s http://localhost:3001/api/v1/scada/views/v_persist -H "Authorization: Bearer $TOKEN"
echo
curl -s -X DELETE http://localhost:3001/api/v1/scada/projects/proj_persist -H "Authorization: Bearer $TOKEN"
```
Expected: 重启后 GET 看到 items.t.props.k === 'v'

- [ ] **Step 6: 错误码核验**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
# 不存在 view → 404
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3001/api/v1/scada/views/nope -H "Authorization: Bearer $TOKEN"
# malformed body → 400
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST http://localhost:3001/api/v1/scada/projects -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"name":"missing_id"}'
```
Expected: `HTTP 404`, `HTTP 400`

- [ ] **Step 7: 停 server**

Run: `pkill -f "tsx watch.*server" || true`

---

## 自检 (Self-Review)

**1. Spec coverage check**:
- §1 数据模型 (scada_projects + scada_views + 2 索引) → Task 1 ✓
- §2 REST API 11 endpoints (5 项目 + 5 视图 + 1 按罐) → Task 4 + Task 5 ✓
- §3 WS 4 channel (project:saved / project:deleted / view:saved / view:deleted) → Task 4 + Task 5 ✓
- §4 鉴权 (requireAuth + requireRole) + 6 个审计 action → Task 4 + Task 5 ✓
- §5 data-service 10 方法 → Task 2 (5) + Task 3 (5) ✓
- §6 单测 + 集成 + DoD → Task 2/3 (单测) + Task 6 (集成) + Task 7 (DoD) ✓

**Spec gap 注释**: spec §4 错误码表把 reactor_id 不存在于 reactor_configs 列为 400, 但 §1 schema 故意不加该 FK (避免 SCADA schema 与 reactor schema 强耦合)。本计划遵循 schema 决策, 不在后端做 reactor_configs 存在性校验 (前端选择控件保证)。如执行期需严格匹配 spec 文字, 在 Task 5 POST/PUT view 处加一行 `sqlite.getReactorConfig?.(reactor_id)` 校验即可。

**2. Placeholder scan**: 无 TBD / TODO / "implement later" / "similar to Task N"。每个 step 都有具体代码或具体命令。

**3. Type consistency**:
- `ScadaProjectMeta` / `ScadaViewMeta` / `ScadaView` 在 Task 2/3/4/5/6 引用一致
- `SCADA_ITEMS_MAX_BYTES` 在 Task 2 export, Task 5 import 使用 ✓
- `updateScadaView` union 返回类型 — Task 3 实现, Task 5 路由处理 ok / conflict / not_found 三分支 ✓
- `broadcast(channel, payload)` 签名 — Task 4/5 路由调用, Task 4 step 2 在 index.ts 注入 ✓
- `requireRole(...roles)` spread — `requireRole('admin', 'engineer')` 与 middlewares/auth.ts:170 一致 ✓
- Task 6 测试通过 `X-Test-Role` header 模拟 `requireAuth` 已设 `req.user.role`, 与生产路径一致 ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-scada-data-model-api.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 task 派 fresh 子代理执行 + task 间审查, 迭代快, 主上下文不被实施细节淹没。

**2. Inline Execution** — 在当前会话用 executing-plans 跑, 批量执行 + checkpoint 审查。

哪个?
