/**
 * SP-FX-37 health-routes 测试
 *
 * TDD RED-first: 先写测试，再实现 health-routes.ts
 *
 * T1: GET /api/v1/health/live → 200 always
 * T2: GET /api/v1/health/ready → 200 当 DB 正常
 * T3: GET /api/v1/health/ready → 503 当 DB 失败
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerHealthRoutes } from '../health-routes';

type DbDep = { ping: () => boolean };

function makeApp(db: DbDep) {
  const app = express();
  const apiRouter = express.Router();
  registerHealthRoutes(apiRouter, { db });
  app.use('/api/v1', apiRouter);
  return app;
}

describe('GET /api/v1/health/live', () => {
  it('T1: 始终返回 200 ok', async () => {
    const app = makeApp({ ping: () => true });
    const res = await request(app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('GET /api/v1/health/ready', () => {
  it('T2: DB 正常时返回 200 ready', async () => {
    const app = makeApp({ ping: () => true });
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready' });
  });

  it('T3: DB 失败时返回 503 not ready', async () => {
    const app = makeApp({ ping: () => { throw new Error('DB 断开'); } });
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'not_ready' });
  });
});
