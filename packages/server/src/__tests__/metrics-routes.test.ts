/**
 * T2: metrics-routes 测试 (SP-FX-28)
 *
 * TDD RED-first: 先写测试，再实现 metrics-routes.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MetricsRegistry } from '../services/metrics';
import { registerMetricsRoutes } from '../metrics-routes';

function makeApp(registry: MetricsRegistry) {
  const app = express();
  app.use(express.json());

  // 模拟 authMiddleware: 从 X-Test-Role header 注入 user
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'] as string | undefined;
    if (role) {
      (req as any).user = { user_id: `u_${role}`, role };
    }
    next();
  });

  const apiRouter = express.Router();
  registerMetricsRoutes(apiRouter, registry);
  app.use('/api/v1', apiRouter);
  return app;
}

describe('GET /api/v1/metrics', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it('无 auth (无 user) → 401', async () => {
    const app = makeApp(registry);
    const res = await request(app).get('/api/v1/metrics');
    expect(res.status).toBe(401);
  });

  it('非 admin role → 403', async () => {
    const app = makeApp(registry);
    const res = await request(app)
      .get('/api/v1/metrics')
      .set('X-Test-Role', 'operator');
    expect(res.status).toBe(403);
  });

  it('admin → 200 text/plain Prometheus format', async () => {
    registry.counter('test_metric', 'A test').inc();
    const app = makeApp(registry);
    const res = await request(app)
      .get('/api/v1/metrics')
      .set('X-Test-Role', 'admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('# TYPE test_metric counter');
    expect(res.text).toContain('test_metric');
  });
});
