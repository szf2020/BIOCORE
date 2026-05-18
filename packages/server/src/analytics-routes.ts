// ============================================================
// analytics-routes.ts — Analytics Dashboard REST API (SP-FX-43)
// ============================================================
// 全部 admin only. 不新建 table, 直接 query 现有表.
//
// Routes (mounted under /api/v1):
//   GET /analytics/view-usage?range=7d|30d|90d
//   GET /analytics/widget-types?range=7d|30d|90d
//   GET /analytics/user-activity?range=7d|30d|90d
//   GET /analytics/write-intent-stats?range=7d|30d|90d
// ============================================================

import type { Router, Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import {
  parseRangeToDays,
  queryViewUsage,
  queryWidgetTypes,
  queryUserActivity,
  queryWriteIntentStats,
} from '@biocore/data-service';

function requireAdmin(req: any, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: '仅管理员可访问' });
    return;
  }
  next();
}

export function registerAnalyticsRoutes(
  apiRouter: Router,
  db: Database.Database,
): void {
  // GET /analytics/view-usage
  apiRouter.get('/analytics/view-usage', requireAdmin, (req: Request, res: Response) => {
    try {
      const range = (req.query['range'] as string) || '7d';
      const sqlRange = parseRangeToDays(range);
      const data = queryViewUsage(db, sqlRange);
      res.json({ range, data });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /analytics/widget-types
  apiRouter.get('/analytics/widget-types', requireAdmin, (req: Request, res: Response) => {
    try {
      const range = (req.query['range'] as string) || '30d';
      const sqlRange = parseRangeToDays(range);
      const data = queryWidgetTypes(db, sqlRange);
      res.json({ range, data });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /analytics/user-activity
  apiRouter.get('/analytics/user-activity', requireAdmin, (req: Request, res: Response) => {
    try {
      const range = (req.query['range'] as string) || '7d';
      const sqlRange = parseRangeToDays(range);
      const { dau, wau } = queryUserActivity(db, sqlRange);
      res.json({ range, dau, wau });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // GET /analytics/write-intent-stats
  apiRouter.get('/analytics/write-intent-stats', requireAdmin, (req: Request, res: Response) => {
    try {
      const range = (req.query['range'] as string) || '7d';
      const sqlRange = parseRangeToDays(range);
      const stats = queryWriteIntentStats(db, sqlRange);
      res.json({ range, ...stats });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
