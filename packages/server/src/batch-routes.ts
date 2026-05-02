// ============================================================
// batch-routes.ts — 批次 (batches) 只读 REST API
// ============================================================
// Extracted from index.ts (route-handler-split, post v1.12.0).
// Behavior preserving — same routes, same payloads.
//
// 仅放只读 / 元数据查询路由。批次状态变更 (start/stop/hold/skip/restart)
// 走反应器路由 (reactor-routes), 因为它们都是 reactor-scoped。
// 取样 / 报告 / 导出 / 摘要等已在各自 *-routes.ts 中。
//
// Routes (mounted under /api/v1):
//   GET /batches                 — 列表 (limit/offset/reactor_id 过滤)
//   GET /batches/:id             — 单个
//   GET /batches/:id/transitions — 状态变迁日志
//   GET /batches/:id/phases      — phase logs
//   GET /batches/:id/steps       — step logs
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '@biocore/data-service';

export function registerBatchRoutes(
  apiRouter: Router,
  sqlite: SQLiteService,
): void {
  /**
   * @openapi
   * /batches:
   *   get:
   *     summary: 列出批次
   *     tags: [Batches]
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: 批次列表
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/UnifiedResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           batch_id: { type: string }
   *                           recipe_id: { type: string }
   *                           recipe_version: { type: string }
   *                           reactor_id: { type: string }
   *                           organism: { type: string, nullable: true }
   *                           current_state: { type: string, enum: [idle, running, held, paused, stopped, complete] }
   *                           started_at: { type: string, format: date-time, nullable: true }
   *                           ended_at: { type: string, format: date-time, nullable: true }
   */
  apiRouter.get('/batches', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    // M2.3: 可选 reactor_id 过滤 (正则消毒)
    const reactorIdRaw = String(req.query.reactor_id || '').replace(/[^A-Za-z0-9_-]/g, '');
    const reactorId = reactorIdRaw || undefined;
    res.json(sqlite.listBatches(limit, offset, reactorId));
  });

  apiRouter.get('/batches/:id', (req, res) => {
    const batch = sqlite.getBatch(req.params.id);
    if (!batch) return res.status(404).json({ error: '批次不存在' });
    res.json(batch);
  });

  apiRouter.get('/batches/:id/transitions', (req, res) => {
    res.json(sqlite.getStateTransitions(req.params.id));
  });

  apiRouter.get('/batches/:id/phases', (req, res) => {
    res.json(sqlite.getPhaseLogs(req.params.id));
  });

  apiRouter.get('/batches/:id/steps', (req, res) => {
    res.json(sqlite.getStepLogs(req.params.id));
  });
}
