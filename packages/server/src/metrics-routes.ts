// ============================================================
// metrics-routes.ts — GET /metrics endpoint (SP-FX-28)
//
// 安全策略: requireRole('admin')
// 输出: text/plain Prometheus exposition format v0.0.4
//
// 生产部署: reverse-proxy 可进一步限制 IP 白名单
// ============================================================

import type { Router } from 'express';
import { requireRole } from './middlewares/auth';
import type { MetricsRegistry } from './services/metrics';

export function registerMetricsRoutes(
  router: Router,
  registry: MetricsRegistry,
): void {
  /**
   * @openapi
   * /metrics:
   *   get:
   *     summary: Prometheus metrics endpoint
   *     description: 返回 Prometheus text format metrics. 需要 admin 角色.
   *     tags: [Observability]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Prometheus text format
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *       401:
   *         description: 未授权
   *       403:
   *         description: 权限不足
   */
  router.get('/metrics', requireRole('admin'), (_req, res) => {
    const body = registry.serialize();
    res
      .status(200)
      .set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  });
}
