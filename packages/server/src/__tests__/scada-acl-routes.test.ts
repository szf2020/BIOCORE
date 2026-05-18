// ============================================================
// scada-acl-routes.test.ts — SCADA 视图 ACL 路由集成测试 (SP-FX-24)
// ============================================================
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SQLiteService } from '@biocore/data-service';
import { registerScadaRoutes } from '../scada-routes';

function makeApp(): {
  app: express.Express;
  sqlite: SQLiteService;
  broadcasts: Array<{ channel: string; payload: any }>;
} {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../migrations/028-scada-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/030-scada-view-svg-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/031-scada-view-template-flag.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/035-view-acl.sql'), 'utf8'));
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
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'] as string | undefined;
    const uid = req.headers['x-test-uid'] as string | undefined;
    if (role) {
      (req as any).user = { user_id: uid ?? `u_${role}`, role };
    }
    next();
  });
  const apiRouter = express.Router();
  registerScadaRoutes(apiRouter, { sqlite, broadcast });
  app.use('/api/v1', apiRouter);
  return { app, sqlite, broadcasts };
}

async function seedViewWithAcl(ctx: ReturnType<typeof makeApp>, opts?: {
  viewId?: string;
  ownerId?: string | null;
  aclUsers?: string[];
  aclRoles?: string[];
}): Promise<void> {
  const { app, sqlite } = ctx;
  const vid = opts?.viewId ?? 'v1';
  await request(app).post('/api/v1/scada/projects').set('x-test-role', 'engineer').send({ project_id: 'p1', name: 'P' });
  await request(app).post('/api/v1/scada/projects/p1/views').set('x-test-role', 'engineer').send({ view_id: vid, name: 'V' });
  if (opts?.ownerId) sqlite.updateScadaViewOwner(vid, opts.ownerId);
  if (opts?.aclUsers !== undefined || opts?.aclRoles !== undefined) {
    sqlite.updateScadaViewAcl(vid, {
      users: opts?.aclUsers ?? [],
      roles: opts?.aclRoles ?? ['admin', 'operator'],
    });
  }
}

describe('SCADA ACL — view endpoint access control', () => {
  it('GET view — admin 可访问任意视图', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { aclRoles: ['admin'] });
    const r = await request(ctx.app).get('/api/v1/scada/views/v1')
      .set('x-test-role', 'admin').set('x-test-uid', 'u_admin');
    expect(r.status).toBe(200);
  });

  it('GET view — operator 在 acl.roles 中可访问', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { aclRoles: ['admin', 'operator'] });
    const r = await request(ctx.app).get('/api/v1/scada/views/v1')
      .set('x-test-role', 'operator').set('x-test-uid', 'u_op');
    expect(r.status).toBe(200);
  });

  it('GET view — viewer 不在 acl 中 → 403', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { aclRoles: ['admin', 'operator'] });
    const r = await request(ctx.app).get('/api/v1/scada/views/v1')
      .set('x-test-role', 'viewer').set('x-test-uid', 'u_viewer');
    expect(r.status).toBe(403);
  });

  it('PUT view — owner 可编辑', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { ownerId: 'u_owner', aclRoles: ['admin'] });
    const r = await request(ctx.app).put('/api/v1/scada/views/v1')
      .set('x-test-role', 'engineer').set('x-test-uid', 'u_owner')
      .send({ name: 'Updated' });
    expect(r.status).toBe(200);
  });

  it('DELETE view — 非 admin 非 owner 非 acl → 403', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { aclRoles: ['admin'] });
    const r = await request(ctx.app).delete('/api/v1/scada/views/v1')
      .set('x-test-role', 'engineer').set('x-test-uid', 'u_stranger');
    expect(r.status).toBe(403);
  });
});

describe('SCADA ACL — PATCH /scada/views/:viewId/acl', () => {
  it('owner 可更新 ACL', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { ownerId: 'u_owner', aclRoles: ['admin'] });
    const r = await request(ctx.app)
      .patch('/api/v1/scada/views/v1/acl')
      .set('x-test-role', 'engineer').set('x-test-uid', 'u_owner')
      .send({ users: ['u_alice'], roles: ['admin', 'operator'] });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const view = ctx.sqlite.getScadaView('v1');
    const acl = JSON.parse(view!.acl);
    expect(acl.users).toContain('u_alice');
  });

  it('admin 可更新任意视图 ACL', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { ownerId: 'u_someone' });
    const r = await request(ctx.app)
      .patch('/api/v1/scada/views/v1/acl')
      .set('x-test-role', 'admin').set('x-test-uid', 'u_admin')
      .send({ users: [], roles: ['admin'] });
    expect(r.status).toBe(200);
  });

  it('非 owner 非 admin → 403', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { ownerId: 'u_owner', aclRoles: ['admin', 'operator'] });
    const r = await request(ctx.app)
      .patch('/api/v1/scada/views/v1/acl')
      .set('x-test-role', 'operator').set('x-test-uid', 'u_stranger')
      .send({ users: [], roles: ['admin'] });
    expect(r.status).toBe(403);
  });

  it('无效 body (users 非数组) → 400', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx);
    const r = await request(ctx.app)
      .patch('/api/v1/scada/views/v1/acl')
      .set('x-test-role', 'admin').set('x-test-uid', 'u_admin')
      .send({ users: 'not-array' });
    expect(r.status).toBe(400);
  });
});

describe('SCADA ACL — PATCH /scada/views/:viewId/owner', () => {
  it('admin 可转让 owner', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { ownerId: 'u_old' });
    const r = await request(ctx.app)
      .patch('/api/v1/scada/views/v1/owner')
      .set('x-test-role', 'admin').set('x-test-uid', 'u_admin')
      .send({ new_owner_id: 'u_new' });
    expect(r.status).toBe(200);
    const view = ctx.sqlite.getScadaView('v1');
    expect(view!.owner_id).toBe('u_new');
  });

  it('非 admin → 403', async () => {
    const ctx = makeApp();
    await seedViewWithAcl(ctx, { ownerId: 'u_owner' });
    const r = await request(ctx.app)
      .patch('/api/v1/scada/views/v1/owner')
      .set('x-test-role', 'engineer').set('x-test-uid', 'u_owner')
      .send({ new_owner_id: 'u_new' });
    expect(r.status).toBe(403);
  });
});
