// ============================================================
// audit-log-routes.ts — 审计日志 (audit_logs) REST API
// ============================================================
// Extracted from index.ts (route-handler-split, post v1.12.0).
// Behavior preserving — same routes, same payloads.
//
// Routes (mounted under /api/v1):
//   GET  /audit-logs   — 列表 (可选 batch_id 过滤)
//   POST /audit-logs   — 追加 (业务系统直写, 走 sqlite.writeAuditLog)
//
// Helpers writeRecipeAudit / getAuditQueue 等仍在 index.ts 或各自模块,
// 这里只是把 REST 接口的薄层路由迁出来。
// ============================================================

import type { Router } from 'express';
import type Database from 'better-sqlite3';
import type { SQLiteService } from '@biocore/data-service';

export function registerAuditLogRoutes(
  apiRouter: Router,
  sqlite: SQLiteService,
): void {
  apiRouter.get('/audit-logs', (req, res) => {
    res.json(sqlite.getAuditLogs(req.query.batch_id as string | undefined));
  });

  // SP-FX-19: 管理员操作审计日志 (audit_log 表)
  apiRouter.get('/audit-log', (req: any, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: '仅管理员可访问' });
    const db = sqlite.getDatabase() as unknown as Database;
    const { userId, resourceType, limit = '20', offset = '0' } = req.query as Record<string, string>;
    try {
      const conditions: string[] = [];
      const params: Record<string, string | number> = {
        limit: Math.min(Number(limit) || 20, 100),
        offset: Number(offset) || 0,
      };
      if (userId) { conditions.push('user_id = @userId'); params.userId = userId; }
      if (resourceType) { conditions.push('resource_type = @resourceType'); params.resourceType = resourceType; }
      const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
      const sql = 'SELECT id, user_id, action, resource_type, resource_id, payload, ip, timestamp FROM audit_log ' + where + ' ORDER BY timestamp DESC LIMIT @limit OFFSET @offset';
      const rows = db.prepare(sql).all(params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  apiRouter.post('/audit-logs', (req: any, res) => {
    const { batch_id, user_id, action, target_type, target_id, old_value, new_value, reason } = req.body;
    if (!user_id || !action) return res.status(400).json({ error: '缺少user_id或action' });
    try {
      sqlite.writeAuditLog({
        batch_id: batch_id || undefined,
        user_id,
        action,
        target_type: target_type || 'parameter',
        target_id: target_id || '',
        old_value: old_value ? String(old_value) : undefined,
        new_value: new_value ? String(new_value) : undefined,
        reason: reason || '',
        ip_address: req.ip || req.socket?.remoteAddress || undefined,
        trace_id: req.trace_id,
      });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
