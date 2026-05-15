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
  it('POST project without role → 401', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/v1/scada/projects').send({ project_id: 'p1', name: 'P' });
    expect(r.status).toBe(401);
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
