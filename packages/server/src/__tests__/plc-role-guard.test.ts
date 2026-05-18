// ============================================================
// plc-role-guard.test.ts — SP-FX-47 Part 2 (HIGH)
// TDD: 验证 PLC connections/variables 写操作 requireRole('admin')
// GET 只读端点不受影响。
// ============================================================

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireRole } from '../middlewares/auth';

function makeApp(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { user_id: `u_${role}`, role };
    next();
  });

  const router = express.Router();

  // GET 只读端点 — 无 requireRole，任意已认证用户可访问
  router.get('/plc/connections', (_req, res) => res.json([]));
  router.get('/plc/variables', (_req, res) => res.json([]));

  // SP-FX-47 F-04 (HIGH): PLC 写操作 admin only
  router.post('/plc/connections', requireRole('admin'), (req, res) => {
    res.status(201).json({ id: 'new-conn', ...req.body });
  });
  router.put('/plc/connections/:id', requireRole('admin'), (req, res) => {
    res.json({ success: true });
  });
  router.delete('/plc/connections/:id', requireRole('admin'), (req, res) => {
    res.status(204).end();
  });

  router.post('/plc/variables', requireRole('admin'), (req, res) => {
    res.status(201).json({ id: 'new-var', ...req.body });
  });
  router.put('/plc/variables/:id', requireRole('admin'), (req, res) => {
    res.json({ success: true });
  });
  router.delete('/plc/variables/:id', requireRole('admin'), (req, res) => {
    res.status(204).end();
  });

  app.use('/api/v1', router);
  return app;
}

// ─── GET 只读端点 — 不受角色限制 ─────────────────────────────

describe('GET /plc/* — 任意已认证用户可访问', () => {
  it('operator 可 GET connections', async () => {
    const app = makeApp('operator');
    const res = await request(app).get('/api/v1/plc/connections');
    expect(res.status).toBe(200);
  });

  it('viewer 可 GET variables', async () => {
    const app = makeApp('viewer');
    const res = await request(app).get('/api/v1/plc/variables');
    expect(res.status).toBe(200);
  });
});

// ─── POST /plc/connections — admin only ──────────────────────

describe('POST /plc/connections — admin only (F-04 HIGH)', () => {
  it('operator → 403', async () => {
    const app = makeApp('operator');
    const res = await request(app).post('/api/v1/plc/connections').send({ name: 'S7-200' });
    expect(res.status).toBe(403);
  });

  it('viewer → 403', async () => {
    const app = makeApp('viewer');
    const res = await request(app).post('/api/v1/plc/connections').send({ name: 'S7-200' });
    expect(res.status).toBe(403);
  });

  it('admin → 201', async () => {
    const app = makeApp('admin');
    const res = await request(app).post('/api/v1/plc/connections').send({ name: 'S7-200' });
    expect(res.status).toBe(201);
  });
});

// ─── PUT /plc/connections/:id — admin only ────────────────────

describe('PUT /plc/connections/:id — admin only (F-04 HIGH)', () => {
  it('operator → 403', async () => {
    const app = makeApp('operator');
    const res = await request(app).put('/api/v1/plc/connections/conn-1').send({});
    expect(res.status).toBe(403);
  });

  it('admin → 200', async () => {
    const app = makeApp('admin');
    const res = await request(app).put('/api/v1/plc/connections/conn-1').send({});
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /plc/connections/:id — admin only ────────────────

describe('DELETE /plc/connections/:id — admin only (F-04 HIGH)', () => {
  it('operator → 403', async () => {
    const app = makeApp('operator');
    const res = await request(app).delete('/api/v1/plc/connections/conn-1');
    expect(res.status).toBe(403);
  });

  it('admin → 204', async () => {
    const app = makeApp('admin');
    const res = await request(app).delete('/api/v1/plc/connections/conn-1');
    expect(res.status).toBe(204);
  });
});

// ─── POST /plc/variables — admin only ────────────────────────

describe('POST /plc/variables — admin only (F-04 HIGH)', () => {
  it('operator → 403', async () => {
    const app = makeApp('operator');
    const res = await request(app).post('/api/v1/plc/variables').send({ tag_name: 'PH' });
    expect(res.status).toBe(403);
  });

  it('admin → 201', async () => {
    const app = makeApp('admin');
    const res = await request(app).post('/api/v1/plc/variables').send({ tag_name: 'PH' });
    expect(res.status).toBe(201);
  });
});

// ─── PUT/DELETE /plc/variables/:id — admin only ──────────────

describe('PUT/DELETE /plc/variables/:id — admin only (F-04 HIGH)', () => {
  it('PUT: viewer → 403', async () => {
    const app = makeApp('viewer');
    const res = await request(app).put('/api/v1/plc/variables/var-1').send({});
    expect(res.status).toBe(403);
  });

  it('PUT: admin → 200', async () => {
    const app = makeApp('admin');
    const res = await request(app).put('/api/v1/plc/variables/var-1').send({});
    expect(res.status).toBe(200);
  });

  it('DELETE: operator → 403', async () => {
    const app = makeApp('operator');
    const res = await request(app).delete('/api/v1/plc/variables/var-1');
    expect(res.status).toBe(403);
  });

  it('DELETE: admin → 204', async () => {
    const app = makeApp('admin');
    const res = await request(app).delete('/api/v1/plc/variables/var-1');
    expect(res.status).toBe(204);
  });
});
