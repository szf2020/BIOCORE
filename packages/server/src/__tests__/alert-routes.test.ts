// ============================================================
// alert-routes.test.ts — SP-FX-42 TDD RED-first
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAlertRoutes } from '../alert-routes';

function makeApp(role: 'admin' | 'engineer' | 'operator' | null = 'admin') {
  const db = new Database(':memory:');
  const sql037 = readFileSync(join(__dirname, '../../migrations/037-alert-tables.sql'), 'utf8');
  db.exec(sql037);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (role) (req as any).user = { user_id: `u_${role}`, role };
    next();
  });
  const router = express.Router();
  registerAlertRoutes(router, { db });
  app.use('/api/v1', router);
  return { app, db };
}

// ─── 渠道 CRUD ────────────────────────────────────────────────

describe('GET /alerts/channels', () => {
  it('admin 可列渠道 (空)', async () => {
    const { app } = makeApp('admin');
    const res = await request(app).get('/api/v1/alerts/channels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('非 admin → 403', async () => {
    const { app } = makeApp('operator');
    const res = await request(app).get('/api/v1/alerts/channels');
    expect(res.status).toBe(403);
  });

  it('未认证 → 401', async () => {
    const { app } = makeApp(null);
    const res = await request(app).get('/api/v1/alerts/channels');
    expect(res.status).toBe(401);
  });
});

describe('POST /alerts/channels', () => {
  it('admin 新建 slack 渠道', async () => {
    const { app } = makeApp('admin');
    const res = await request(app)
      .post('/api/v1/alerts/channels')
      .send({ type: 'slack', name: 'Slack Ops', config: { url: 'https://hooks.slack.com/abc' } });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.name).toBe('Slack Ops');
    expect(res.body.type).toBe('slack');
  });

  it('缺 type → 400', async () => {
    const { app } = makeApp('admin');
    const res = await request(app)
      .post('/api/v1/alerts/channels')
      .send({ name: 'Bad', config: {} });
    expect(res.status).toBe(400);
  });

  it('type 非法 → 400', async () => {
    const { app } = makeApp('admin');
    const res = await request(app)
      .post('/api/v1/alerts/channels')
      .send({ type: 'sms', name: 'SMS', config: {} });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /alerts/channels/:id', () => {
  it('admin 删除渠道', async () => {
    const { app, db } = makeApp('admin');
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('webhook','W','{}') `).run();
    const id = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    const res = await request(app).delete(`/api/v1/alerts/channels/${id}`);
    expect(res.status).toBe(204);
  });
});

// ─── 规则 CRUD ────────────────────────────────────────────────

describe('GET /alerts/rules', () => {
  it('admin 可列规则 (空)', async () => {
    const { app } = makeApp('admin');
    const res = await request(app).get('/api/v1/alerts/rules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /alerts/rules', () => {
  it('admin 新建规则', async () => {
    const { app, db } = makeApp('admin');
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('slack','C','{}') `).run();
    const channelId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    const res = await request(app)
      .post('/api/v1/alerts/rules')
      .send({
        name: 'High Temp',
        trigger_type: 'threshold',
        condition_expr: 'value > 80',
        channel_id: channelId,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.name).toBe('High Temp');
  });

  it('trigger_type 非法 → 400', async () => {
    const { app } = makeApp('admin');
    const res = await request(app)
      .post('/api/v1/alerts/rules')
      .send({ name: 'X', trigger_type: 'unknown', condition_expr: 'true', channel_id: 1 });
    expect(res.status).toBe(400);
  });
});

// ─── 历史 ─────────────────────────────────────────────────────

describe('GET /alerts/history', () => {
  it('admin 列历史 (空)', async () => {
    const { app } = makeApp('admin');
    const res = await request(app).get('/api/v1/alerts/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('limit 参数生效', async () => {
    const { app, db } = makeApp('admin');
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('webhook','W','{}') `).run();
    const chId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    db.prepare(`INSERT INTO alert_rules (name, trigger_type, condition_expr, channel_id) VALUES ('R','threshold','true',?) `).run(chId);
    const ruleId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    for (let i = 0; i < 5; i++) {
      db.prepare(`INSERT INTO alert_history (rule_id, payload) VALUES (?, '{}') `).run(ruleId);
    }
    const res = await request(app).get('/api/v1/alerts/history?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(3);
  });
});

// ─── 测试发送 ─────────────────────────────────────────────────

describe('POST /alerts/test/:channelId', () => {
  it('admin 测试不存在渠道 → 404', async () => {
    const { app } = makeApp('admin');
    const res = await request(app).post('/api/v1/alerts/test/9999');
    expect(res.status).toBe(404);
  });

  it('admin 测试渠道返回 ok (stub)', async () => {
    const { app, db } = makeApp('admin');
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('email','Email Ops','{"recipients":["ops@example.com"]}') `).run();
    const id = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    const res = await request(app).post(`/api/v1/alerts/test/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
