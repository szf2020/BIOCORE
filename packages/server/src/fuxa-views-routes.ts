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

import { z } from 'zod';
import type { Router, Request } from 'express';
import type { SQLiteService } from '@biocore/data-service';

export interface FuxaViewsRoutesDeps {
  sqlite: SQLiteService;
}

// Server-side zod schema for POST/PUT bodies. The `payload` object must itself
// be a valid FuxaView; we duplicate the shape here to avoid an import cycle
// between server and web-ui packages.
const PayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['svg', 'cards', 'svg-shapes']),
  svgcontent: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  items: z.record(z.any()),
  variables: z.record(z.any()).optional(),
  schemaVersion: z.literal(1),
}).passthrough();

const CreateBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  payload: PayloadSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  parent_view_id: z.string().nullable().optional(),
  is_template: z.number().int().min(0).max(1).optional(),
});

function zodFail(res: import('express').Response, err: z.ZodError) {
  const first = err.issues[0];
  const path = first?.path ?? [];
  const baseMsg = first?.message ?? 'invalid body';
  const msg = path.length > 0 ? `${path.join('.')}: ${baseMsg}` : baseMsg;
  res.status(400).json({
    error: msg,
    field: path[0] as string | undefined,
  });
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

  // ─── Create ──────────────────────────────────────────────
  apiRouter.post('/fuxa-views', (req, res) => {
    const parsed = CreateBodySchema.safeParse(req.body);
    if (!parsed.success) return zodFail(res, parsed.error);
    const v = parsed.data;
    if (sqlite.getFuxaView(v.id)) {
      return res.status(409).json({ error: `fuxa_view ${v.id} already exists` });
    }
    try {
      sqlite.createFuxaView({
        id: v.id,
        name: v.name,
        type: v.type,
        payload: JSON.stringify(v.payload),
        width: v.width,
        height: v.height,
        parent_view_id: v.parent_view_id ?? null,
        is_template: v.is_template ?? 0,
        created_by: getUserId(req),
      });
      const row = sqlite.getFuxaView(v.id);
      res.status(201).json(row);
    } catch (e) {
      console.error('fuxa-views create failed:', (e as Error).message);
      res.status(500).json({ error: 'create failed' });
    }
  });
}

// getUserId is used by Tasks 6 and 9 (POST + duplicate) when they bolt on to this file.
export { getUserId };
