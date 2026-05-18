// ============================================================
// analytics-routes.test.ts — TDD RED → GREEN (SP-FX-43)
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAnalyticsRoutes } from '../analytics-routes';

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(MIGRATIONS_DIR, '001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '033-fuxa-views.sql'), 'utf8'));
  db.exec(readFileSync(join(MIGRATIONS_DIR, '034-audit-log.sql'), 'utf8'));
  return db;
}

function makeApp(db: Database.Database, userRole: string = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { sub: 'u1', role: userRole };
    next();
  });
  const apiRouter = express.Router();
  registerAnalyticsRoutes(apiRouter, db);
  app.use('/api/v1', apiRouter);
  return app;
}

// ── admin-only guard ────────────────────────────────────────

describe('admin-only guard', () => {
  let db: Database.Database;

  beforeEach(() => { db = makeDb(); });

  it('T1: 非 admin 用户访问 view-usage → 403', async () => {
    const app = makeApp(db, 'operator');
    const res = await request(app).get('/api/v1/analytics/view-usage');
    expect(res.status).toBe(403);
  });

  it('T2: 非 admin 用户访问 widget-types → 403', async () => {
    const app = makeApp(db, 'operator');
    const res = await request(app).get('/api/v1/analytics/widget-types');
    expect(res.status).toBe(403);
  });
});

// ── GET /analytics/view-usage ───────────────────────────────

describe('GET /api/v1/analytics/view-usage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    db.prepare(`
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload, ip)
      VALUES ('alice', 'GET', 'scada', 'v1', NULL, NULL)
    `).run();
    db.prepare(`
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload, ip)
      VALUES ('bob', 'GET', 'scada', 'v1', NULL, NULL)
    `).run();
  });

  it('T3: 返回 200 + data 数组', async () => {
    const app = makeApp(db);
    const res = await request(app).get('/api/v1/analytics/view-usage?range=7d');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('range', '7d');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('T4: data[0] 含 view_id + access_count', async () => {
    const app = makeApp(db);
    const res = await request(app).get('/api/v1/analytics/view-usage?range=7d');
    expect(res.body.data[0]).toMatchObject({ view_id: 'v1', access_count: 2 });
  });
});

// ── GET /analytics/widget-types ─────────────────────────────

describe('GET /api/v1/analytics/widget-types', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    db.prepare(`INSERT INTO scada_projects (project_id, name) VALUES ('p1', 'Test')`).run();
    db.prepare(`
      INSERT INTO scada_views (view_id, project_id, name, items_json, updated_at)
      VALUES ('sv1', 'p1', 'V1', '{"w1":{"type":"gauge"},"w2":{"type":"label"}}', datetime('now'))
    `).run();
  });

  it('T5: 返回 200 + data 数组', async () => {
    const app = makeApp(db);
    const res = await request(app).get('/api/v1/analytics/widget-types?range=30d');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('range', '30d');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /analytics/user-activity ────────────────────────────

describe('GET /api/v1/analytics/user-activity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    db.prepare(`
      INSERT INTO audit_log (user_id, action, resource_type, resource_id, payload, ip)
      VALUES ('alice', 'GET', 'batches', NULL, NULL, NULL)
    `).run();
  });

  it('T6: 返回 200 + dau/wau 数组', async () => {
    const app = makeApp(db);
    const res = await request(app).get('/api/v1/analytics/user-activity?range=7d');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('range', '7d');
    expect(Array.isArray(res.body.dau)).toBe(true);
    expect(Array.isArray(res.body.wau)).toBe(true);
  });
});

// ── GET /analytics/write-intent-stats ───────────────────────

describe('GET /api/v1/analytics/write-intent-stats', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
    db.prepare('PRAGMA foreign_keys = OFF').run();
    db.prepare(`
      INSERT INTO ai_suggestions (batch_id, suggestion_type, source_module, target_param, status, reasoning)
      VALUES ('b1', 'param', 'test', 'temp', 'accepted', NULL)
    `).run();
    db.prepare(`
      INSERT INTO ai_suggestions (batch_id, suggestion_type, source_module, target_param, status, reasoning)
      VALUES ('b1', 'param', 'test', 'temp', 'rejected', '参数超限')
    `).run();
    db.prepare('PRAGMA foreign_keys = ON').run();
  });

  it('T7: 返回 200 + accept_count / reject_count / accept_rate', async () => {
    const app = makeApp(db);
    const res = await request(app).get('/api/v1/analytics/write-intent-stats?range=7d');
    expect(res.status).toBe(200);
    expect(res.body.accept_count).toBe(1);
    expect(res.body.reject_count).toBe(1);
    expect(res.body.accept_rate).toBeCloseTo(0.5, 3);
  });

  it('T8: 返回 reject_reasons 数组', async () => {
    const app = makeApp(db);
    const res = await request(app).get('/api/v1/analytics/write-intent-stats?range=7d');
    expect(Array.isArray(res.body.reject_reasons)).toBe(true);
    expect(res.body.reject_reasons[0]).toMatchObject({ reason: '参数超限', count: 1 });
  });
});
