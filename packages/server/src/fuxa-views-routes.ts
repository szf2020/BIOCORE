// ============================================================
// fuxa-views-routes.ts — SCADA-engine view storage REST API
// ============================================================
// Spec: docs/superpowers/specs/2026-05-17-fuxa-scada-port-design.md
// Routes mounted under /api/v1:
//   GET    /fuxa-views[?is_template=true|false]
//   GET    /fuxa-views/:id
//   POST   /fuxa-views                          (Task 6)
//   PUT    /fuxa-views/:id                      (Task 7)
//   DELETE /fuxa-views/:id                      (Task 8)
//   POST   /fuxa-views/:id/duplicate            (Task 9)
// ============================================================

import type { Router, Request } from 'express';
import type { SQLiteService } from '@biocore/data-service';

export interface FuxaViewsRoutesDeps {
  sqlite: SQLiteService;
}

function getUserId(req: Request): string {
  return (req as any).user?.user_id || 'unknown';
}

export function registerFuxaViewsRoutes(apiRouter: Router, deps: FuxaViewsRoutesDeps): void {
  const { sqlite } = deps;

  // ─── List ────────────────────────────────────────────────
  apiRouter.get('/fuxa-views', (req, res) => {
    const isTemplateParam = req.query.is_template;
    let isTemplate: boolean | undefined;
    if (isTemplateParam === 'true') isTemplate = true;
    else if (isTemplateParam === 'false') isTemplate = false;
    const items = sqlite.listFuxaViews({ isTemplate });
    res.json({ items });
  });

  // ─── Get by id ───────────────────────────────────────────
  apiRouter.get('/fuxa-views/:id', (req, res) => {
    const row = sqlite.getFuxaView(req.params.id);
    if (!row) return res.status(404).json({ error: '视图不存在' });
    res.json(row);
  });
}

// getUserId is used by Tasks 6 and 9 (POST + duplicate) when they bolt on to this file.
export { getUserId };
