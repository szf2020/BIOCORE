/**
 * SP-FX-37 — 健康检查端点
 *
 * GET /health/live  → 200 {"status":"ok"}         (liveness, PUBLIC)
 * GET /health/ready → 200 {"status":"ready"}       (readiness, PUBLIC, DB ping)
 *                   → 503 {"status":"not_ready"}   (DB 不可用)
 *
 * 注册方式: registerHealthRoutes(apiRouter, { db })
 * PUBLIC_PATHS 更新: auth.ts 中加 '/health/live' + '/health/ready'
 */

import type { Router, Request, Response } from 'express';

export interface HealthDeps {
  /** DB 连通性检测: 返回 true 或抛异常 */
  db: { ping: () => boolean };
}

export function registerHealthRoutes(router: Router, deps: HealthDeps): void {
  // liveness: 只要进程存活就 200
  router.get('/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // readiness: 检查 DB 可用性
  router.get('/health/ready', (_req: Request, res: Response) => {
    try {
      deps.db.ping();
      res.json({ status: 'ready', ts: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({
        status: 'not_ready',
        reason: err instanceof Error ? err.message : 'unknown',
        ts: new Date().toISOString(),
      });
    }
  });
}
