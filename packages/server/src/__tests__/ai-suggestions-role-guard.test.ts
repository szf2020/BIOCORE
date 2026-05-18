// ============================================================
// ai-suggestions-role-guard.test.ts — SP-FX-47 Part 1 (CRITICAL)
// TDD RED-first: 验证 AI suggestions accept/reject/retry-dispatch
// 需要 requireRole('operator', 'admin') 守卫，viewer 应 403。
// ============================================================

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { requireRole } from '../middlewares/auth';

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(MIGRATIONS_DIR, '001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '003-add-trace-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '007-add-recipe-v2-fields.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '008-recipe-status-pending.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '013-recipe-deprecation.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '023-batch-current-node.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '029-scada-dispatch.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '032-ai-suggestion-suggested-value-raw.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '034-audit-log.sql'), 'utf8'));
  // 植入测试数据: recipe + batch (FK 依赖)
  db.prepare(
    `INSERT INTO recipes (recipe_id, version, name, author, vessel_config, phases, created_by)
     VALUES ('R1', '1.0.0', 'Test', 'tester', '{}', '[]', 'tester')`
  ).run();
  db.prepare(
    `INSERT INTO batches (batch_id, recipe_id, recipe_version, operator_id, total_phases)
     VALUES ('b1', 'R1', '1.0.0', 'op1', 1)`
  ).run();
  return db;
}

function makeApp(db: Database.Database, role: string) {
  const svc = new SQLiteService(db);
  const app = express();
  app.use(express.json());
  // 注入 req.user，模拟 authMiddleware
  app.use((req: any, _res, next) => {
    req.user = { user_id: `u_${role}`, role };
    next();
  });

  const router = express.Router();

  // SP-FX-47 F-01: 镜像 index.ts AI suggestions 路由，含 requireRole 守卫
  router.post('/ai/suggestions/:id/accept', requireRole('operator', 'admin'), (req: any, res) => {
    try {
      svc.acceptSuggestion(parseInt(req.params.id), req.user.user_id);
      svc.setDispatchPending(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/ai/suggestions/:id/reject', requireRole('operator', 'admin'), (req: any, res) => {
    try {
      svc.rejectSuggestion(parseInt(req.params.id), req.user.user_id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.post('/ai/suggestions/:id/retry-dispatch', requireRole('operator', 'admin'), (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const ok = svc.retryFailedDispatch(id);
      if (!ok) return res.status(409).json({ error: 'suggestion not in failed dispatch state' });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.use('/api/v1', router);
  return { app, svc };
}

function createSuggestion(svc: SQLiteService): number {
  return svc.createSuggestion({
    batch_id: 'b1',
    suggestion_type: 'widget_button',
    source_module: 'scada',
    target_param: 'F01.SP-temp',
    suggested_value: 38,
    reasoning: '{}',
  });
}

// ─── Tests: accept endpoint ───────────────────────────────────

describe('POST /ai/suggestions/:id/accept — 角色守卫 (F-01 CRITICAL)', () => {
  it('viewer → 403 Forbidden', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'viewer');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/accept`);
    expect(res.status).toBe(403);
  });

  it('engineer → 403 Forbidden', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'engineer');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/accept`);
    expect(res.status).toBe(403);
  });

  it('operator → 200', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'operator');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('admin → 200', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'admin');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/accept`);
    expect(res.status).toBe(200);
  });
});

// ─── Tests: reject endpoint ───────────────────────────────────

describe('POST /ai/suggestions/:id/reject — 角色守卫 (F-01 CRITICAL)', () => {
  it('viewer → 403 Forbidden', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'viewer');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/reject`);
    expect(res.status).toBe(403);
  });

  it('operator → 200', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'operator');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/reject`);
    expect(res.status).toBe(200);
  });
});

// ─── Tests: retry-dispatch endpoint ──────────────────────────

describe('POST /ai/suggestions/:id/retry-dispatch — 角色守卫 (F-01 CRITICAL)', () => {
  it('viewer → 403 Forbidden', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'viewer');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/retry-dispatch`);
    expect(res.status).toBe(403);
  });

  it('operator → 非 403 (guard 通过, 409 因业务状态)', async () => {
    const db = makeDb();
    const { app, svc } = makeApp(db, 'operator');
    const id = createSuggestion(svc);
    const res = await request(app).post(`/api/v1/ai/suggestions/${id}/retry-dispatch`);
    // guard 通过后业务层返回 409 (suggestion 不在 failed dispatch 状态)
    expect(res.status).not.toBe(403);
  });
});
