import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { SQLiteService } from '@biocore/data-service';

let app: express.Express;
let svc: SQLiteService;

beforeAll(() => {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(__dirname, '../../migrations/001-baseline-schema.sql'), 'utf8'));
  db.exec(readFileSync(join(__dirname, '../../migrations/027-alarm-definitions.sql'), 'utf8'));
  svc = new SQLiteService(db);

  app = express();
  app.use(express.json());
  app.use((req: any, _r, n) => { req.user = { user_id: 'admin-001', role: 'admin' }; n(); });

  app.get('/alarm-configs', (req, res) => {
    const q = req.query;
    const filter: any = {};
    if ('owner' in q) filter.owner = (q.owner as string) || null;
    if (q.severity) filter.severity = q.severity as string;
    if ('enabled' in q) filter.enabled = q.enabled === 'true' || q.enabled === '1';
    res.json({ items: svc.listAlarmDefinitions(filter) });
  });
  app.get('/alarm-configs/:id', (req, res) => {
    const row = svc.getAlarmDefinition(parseInt(req.params.id));
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  });
  app.post('/alarm-configs', (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.name || !b.severity || !b.message_template) {
      return res.status(400).json({ error: '必填: code, name, severity, message_template' });
    }
    try {
      const id = svc.createAlarmDefinition(b);
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || String(e) });
    }
  });
  app.put('/alarm-configs/:id', (req, res) => {
    const ok = svc.updateAlarmDefinition(parseInt(req.params.id), req.body || {});
    if (!ok) return res.status(404).json({ error: 'not found or no changes' });
    res.json({ success: true });
  });
  app.delete('/alarm-configs/:id', (req, res) => {
    const ok = svc.deleteAlarmDefinition(parseInt(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  });
});

describe('alarm-configs REST', () => {
  it('POST creates a definition and returns id', async () => {
    const r = await request(app)
      .post('/alarm-configs')
      .send({ code: 'TEMP_HIGH', name: '温度过高', severity: 'warning', message_template: '{channel} = {pv} > {threshold}', threshold_high: 40, owner: 'F01' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(typeof r.body.id).toBe('number');
  });

  it('POST rejects missing required fields', async () => {
    const r = await request(app).post('/alarm-configs').send({ code: 'X', name: 'X' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/必填/);
  });

  it('GET list returns items envelope; filters by owner / severity', async () => {
    await request(app).post('/alarm-configs').send({ code: 'A1', name: 'a', severity: 'critical', message_template: 'm', owner: 'F02' });
    await request(app).post('/alarm-configs').send({ code: 'A2', name: 'b', severity: 'info', message_template: 'm' });

    const all = await request(app).get('/alarm-configs');
    expect(all.status).toBe(200);
    expect(Array.isArray(all.body.items)).toBe(true);
    expect(all.body.items.length).toBeGreaterThanOrEqual(3);

    const f02 = await request(app).get('/alarm-configs?owner=F02');
    expect(f02.body.items.length).toBe(1);
    expect(f02.body.items[0].owner).toBe('F02');

    const critical = await request(app).get('/alarm-configs?severity=critical');
    expect(critical.body.items.every((it: any) => it.severity === 'critical')).toBe(true);
  });

  it('GET /:id returns 404 for unknown', async () => {
    const r = await request(app).get('/alarm-configs/99999');
    expect(r.status).toBe(404);
  });

  it('PUT updates fields; 404 for unknown id', async () => {
    const created = await request(app).post('/alarm-configs').send({ code: 'P1', name: 'orig', severity: 'info', message_template: 'm' });
    const id = created.body.id;

    const upd = await request(app).put(`/alarm-configs/${id}`).send({ name: 'patched', enabled: false });
    expect(upd.status).toBe(200);
    expect(upd.body.success).toBe(true);

    const got = await request(app).get(`/alarm-configs/${id}`);
    expect(got.body.name).toBe('patched');
    expect(got.body.enabled).toBe(0);

    const miss = await request(app).put('/alarm-configs/99999').send({ name: 'x' });
    expect(miss.status).toBe(404);
  });

  it('DELETE removes; 404 second time', async () => {
    const created = await request(app).post('/alarm-configs').send({ code: 'D1', name: 'd', severity: 'info', message_template: 'm' });
    const id = created.body.id;
    const del = await request(app).delete(`/alarm-configs/${id}`);
    expect(del.status).toBe(200);
    const again = await request(app).delete(`/alarm-configs/${id}`);
    expect(again.status).toBe(404);
  });

  it('POST returns 400 on UNIQUE code violation', async () => {
    await request(app).post('/alarm-configs').send({ code: 'U1', name: 'u', severity: 'info', message_template: 'm' });
    const dup = await request(app).post('/alarm-configs').send({ code: 'U1', name: 'u2', severity: 'info', message_template: 'm' });
    expect(dup.status).toBe(400);
  });
});
