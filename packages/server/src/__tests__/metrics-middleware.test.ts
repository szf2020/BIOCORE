/**
 * T3: metrics-middleware 测试 (SP-FX-28)
 *
 * TDD RED-first: 先写测试，再实现 middlewares/metrics-middleware.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MetricsRegistry } from '../services/metrics';
import { createMetricsMiddleware } from '../middlewares/metrics-middleware';

function makeApp(registry: MetricsRegistry) {
  const app = express();
  app.use(createMetricsMiddleware(registry));

  // 注册 named routes（Express 会设置 req.route.path）
  app.get('/api/v1/batches', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/v1/reactors', (_req, res) => {
    res.status(201).json({ id: 'r1' });
  });

  return app;
}

describe('createMetricsMiddleware', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it('HTTP 请求后 http_requests_total 计数增加', async () => {
    const app = makeApp(registry);
    await request(app).get('/api/v1/batches');
    const count = registry.counter('http_requests_total').get({
      method: 'GET',
      path: '/api/v1/batches',
      status: '200',
    });
    expect(count).toBe(1);
  });

  it('不同 method/status 独立计数', async () => {
    const app = makeApp(registry);
    await request(app).get('/api/v1/batches');
    await request(app).post('/api/v1/reactors').send({});
    expect(
      registry.counter('http_requests_total').get({ method: 'GET', path: '/api/v1/batches', status: '200' })
    ).toBe(1);
    expect(
      registry.counter('http_requests_total').get({ method: 'POST', path: '/api/v1/reactors', status: '201' })
    ).toBe(1);
  });

  it('http_request_duration_seconds histogram 有 count > 0', async () => {
    const app = makeApp(registry);
    await request(app).get('/api/v1/batches');
    const snap = registry
      .histogram('http_request_duration_seconds')
      .snapshot();
    expect(snap.count).toBeGreaterThan(0);
    expect(snap.sum).toBeGreaterThan(0);
  });
});
