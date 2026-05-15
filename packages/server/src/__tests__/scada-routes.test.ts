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

  it('PUT view with empty body → 400 empty_patch', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V' }).expect(201);
    const r = await request(app).put('/api/v1/scada/views/v1').set('X-Test-Role', 'engineer').send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('empty_patch');
  });

  it('PUT view with only expected_updated_at (no actual patch) → 400 empty_patch', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: 'v1', name: 'V' }).expect(201);
    const cur = (await request(app).get('/api/v1/scada/views/v1').expect(200)).body.updated_at;
    const r = await request(app).put('/api/v1/scada/views/v1').set('X-Test-Role', 'engineer')
      .send({ expected_updated_at: cur });
    expect(r.status).toBe(400);
  });

  it('POST project with whitespace-only name → 400', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: '   ' });
    expect(r.status).toBe(400);
  });

  it('POST view with whitespace-only view_id → 400', async () => {
    const { app } = makeApp();
    await request(app).post('/api/v1/scada/projects').set('X-Test-Role', 'engineer')
      .send({ project_id: 'p1', name: 'P' }).expect(201);
    const r = await request(app).post('/api/v1/scada/projects/p1/views').set('X-Test-Role', 'engineer')
      .send({ view_id: '  ', name: 'V' });
    expect(r.status).toBe(400);
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

describe('POST /scada/write-intents', () => {
  function setupWithAiSuggestions() {
    const ctx = makeApp();
    const db = ctx.sqlite.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        suggestion_type TEXT NOT NULL,
        source_module TEXT NOT NULL,
        target_param TEXT NOT NULL,
        current_value REAL,
        suggested_value REAL,
        confidence REAL,
        reasoning TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        decided_by TEXT,
        decided_at TEXT
      );
      CREATE TABLE IF NOT EXISTS batches (
        batch_id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL,
        recipe_version TEXT NOT NULL,
        reactor_id TEXT NOT NULL DEFAULT 'F01',
        operator_id TEXT NOT NULL,
        started_at TEXT,
        current_state TEXT NOT NULL DEFAULT 'idle',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Seed: scada project + view with reactor_id F01 (so endpoint can look up batch)
    ctx.sqlite.createScadaProject({ project_id: 'p_test', name: 'Test', description: null, created_by: 'u_test' });
    ctx.sqlite.createScadaView({
      view_id: 'v1', project_id: 'p_test', name: 'V', reactor_id: 'F01',
      width: 800, height: 480, background: '#fff', display_order: 0, items: {},
    });
    return ctx;
  }

  function seedActiveBatch(ctx: ReturnType<typeof setupWithAiSuggestions>, batchId: string, reactorId: string) {
    ctx.sqlite.getDatabase().prepare(
      `INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, operator_id, started_at, current_state)
       VALUES (?, 'r1', 'v1', ?, 'op', datetime('now'), 'running')`
    ).run(batchId, reactorId);
  }

  it('operator role: valid payload → 200, inserts ai_suggestions row with resolved batch_id, writes audit, broadcasts', async () => {
    const ctx = setupWithAiSuggestions();
    const { app, sqlite, broadcasts } = ctx;
    seedActiveBatch(ctx, 'B-001', 'F01');
    const r = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'operator')
      .send({
        tag: 'F01.SP-temp', value: 38, reason: '测试温度提升',
        view_id: 'v1', widget_id: 'b1',
      });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(typeof r.body.suggestion_id).toBe('number');

    const row: any = sqlite.getDatabase()
      .prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(r.body.suggestion_id);
    expect(row).toBeTruthy();
    expect(row.batch_id).toBe('B-001');
    expect(row.source_module).toBe('scada');
    expect(row.suggestion_type).toBe('widget_button');
    expect(row.target_param).toBe('F01.SP-temp');
    expect(row.suggested_value).toBe(38);
    expect(JSON.parse(row.reasoning).reason).toBe('测试温度提升');

    const audit: any = sqlite.getDatabase()
      .prepare("SELECT * FROM audit_logs WHERE action = 'scada_write_intent'").get();
    expect(audit).toBeTruthy();
    expect(audit.target_id).toBe(String(r.body.suggestion_id));

    expect(broadcasts.find(b => b.channel === 'ai_suggestion')).toBeTruthy();
  });

  it('missing reason → 400 missing_required_fields; short reason → 400 reason_too_short', async () => {
    const { app } = setupWithAiSuggestions();
    const r1 = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'operator')
      .send({ tag: 'F01.SP', view_id: 'v1', widget_id: 'b1' });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toBe('missing_required_fields');

    const r2 = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'operator')
      .send({ tag: 'F01.SP', reason: 'aa', view_id: 'v1', widget_id: 'b1' });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toBe('reason_too_short');
  });

  it('viewer role → 403 (operator/engineer/admin only)', async () => {
    const { app } = setupWithAiSuggestions();
    const r = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'viewer')
      .send({ tag: 'F01.SP', reason: '尝试', view_id: 'v1', widget_id: 'b1' });
    expect(r.status).toBe(403);
  });

  it('view has reactor_id but no active batch → 409 no_active_batch', async () => {
    const { app } = setupWithAiSuggestions();
    // No seedActiveBatch — F01 has no running/held/paused batch
    const r = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'operator')
      .send({ tag: 'F01.SP', reason: '尝试写入', view_id: 'v1', widget_id: 'b1' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('no_active_batch');
  });

  it('explicit batch_id in body is used (no reactor lookup needed)', async () => {
    const ctx = setupWithAiSuggestions();
    const { app, sqlite } = ctx;
    seedActiveBatch(ctx, 'B-EXPLICIT', 'F02'); // F02 ≠ view's F01
    const r = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'operator')
      .send({ tag: 'F01.SP', value: 42, reason: '指定批次', view_id: 'v1', widget_id: 'b1', batch_id: 'B-EXPLICIT' });
    expect(r.status).toBe(200);
    const row: any = sqlite.getDatabase().prepare('SELECT batch_id FROM ai_suggestions WHERE id = ?').get(r.body.suggestion_id);
    expect(row.batch_id).toBe('B-EXPLICIT');
  });

  it('unknown view_id → 404 view_not_found', async () => {
    const { app } = setupWithAiSuggestions();
    const r = await request(app)
      .post('/api/v1/scada/write-intents')
      .set('X-Test-Role', 'operator')
      .send({ tag: 'F01.SP', reason: 'x' + 'y'.repeat(3), view_id: 'nonexistent', widget_id: 'b1' });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('view_not_found');
  });
});
