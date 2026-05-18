// ============================================================
// view-acl.test.ts — enforceViewAccess middleware 单元测试 (SP-FX-24)
// ============================================================
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { enforceViewAccess } from '../middlewares/view-acl';

function makeApp(): { app: express.Express; sqlite: SQLiteService } {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/031-scada-view-template-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/035-view-acl.sql'), 'utf8'));
  const sqlite = new SQLiteService(db);
  const app = express();
  app.use(express.json());

  // 测试用 role 注入
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'] as string | undefined;
    const uid = req.headers['x-test-uid'] as string | undefined;
    if (role && uid) (req as any).user = { user_id: uid, role };
    next();
  });

  const router = express.Router();

  // 测试路由：GET /views/:viewId
  router.get('/views/:viewId', enforceViewAccess(sqlite), (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', router);
  return { app, sqlite };
}

describe('enforceViewAccess middleware', () => {
  it('无 user (未登录) → 401', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createScadaProject({ project_id: 'p1', name: 'P' });
    sqlite.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V' });
    const r = await request(app).get('/api/views/v1');
    expect(r.status).toBe(401);
  });

  it('admin 永远可访问', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createScadaProject({ project_id: 'p1', name: 'P' });
    sqlite.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V' });
    const r = await request(app).get('/api/views/v1')
      .set('x-test-role', 'admin')
      .set('x-test-uid', 'u_admin');
    expect(r.status).toBe(200);
  });

  it('owner 可访问（即使 acl 未列出该 user）', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createScadaProject({ project_id: 'p1', name: 'P' });
    sqlite.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V' });
    sqlite.updateScadaViewOwner('v1', 'u_owner');
    sqlite.updateScadaViewAcl('v1', { users: [], roles: ['admin'] });
    const r = await request(app).get('/api/views/v1')
      .set('x-test-role', 'engineer')
      .set('x-test-uid', 'u_owner');
    expect(r.status).toBe(200);
  });

  it('user 在 acl.users 中可访问', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createScadaProject({ project_id: 'p1', name: 'P' });
    sqlite.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V' });
    sqlite.updateScadaViewAcl('v1', { users: ['u_alice'], roles: [] });
    const r = await request(app).get('/api/views/v1')
      .set('x-test-role', 'operator')
      .set('x-test-uid', 'u_alice');
    expect(r.status).toBe(200);
  });

  it('role 在 acl.roles 中可访问', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createScadaProject({ project_id: 'p1', name: 'P' });
    sqlite.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V' });
    // 默认 acl 包含 operator
    const r = await request(app).get('/api/views/v1')
      .set('x-test-role', 'operator')
      .set('x-test-uid', 'u_op');
    expect(r.status).toBe(200);
  });

  it('非 owner 非 acl user 非 acl role → 403', async () => {
    const { app, sqlite } = makeApp();
    sqlite.createScadaProject({ project_id: 'p1', name: 'P' });
    sqlite.createScadaView({ view_id: 'v1', project_id: 'p1', name: 'V' });
    sqlite.updateScadaViewAcl('v1', { users: [], roles: ['admin'] });
    const r = await request(app).get('/api/views/v1')
      .set('x-test-role', 'operator')
      .set('x-test-uid', 'u_stranger');
    expect(r.status).toBe(403);
  });

  it('view 不存在 → 404', async () => {
    const { app } = makeApp();
    const r = await request(app).get('/api/views/nonexistent')
      .set('x-test-role', 'admin')
      .set('x-test-uid', 'u_admin');
    expect(r.status).toBe(404);
  });
});
