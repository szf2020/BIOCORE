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
  type: z.enum(['svg', 'cards', 'svg-shapes']),
  payload: PayloadSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  parent_view_id: z.string().nullable().optional(),
  is_template: z.number().int().min(0).max(1).optional(),
});

const DuplicateBodySchema = z.object({
  newId: z.string().min(1),
});

const UpdateBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['svg', 'cards', 'svg-shapes']),
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

// SP-FX-48.2: bridge — surface scada_views rows through fuxa-views GET/PUT so
// the editor can open + save views created via the cards-view (scada/views API).
// Two tables exist for historical reasons (SP-FX-1 created fuxa_views, SP-FX-13
// added scada_views for cards/list/paginator). IDs are disjoint; this bridge
// makes them addressable from a single endpoint.
function scadaRowToFuxaShape(scada: any) {
  const fuxaPayload = {
    id: scada.view_id,
    name: scada.name,
    type: scada.is_svg ? 'svg' : 'cards',
    svgcontent: '',
    width: scada.width ?? 1280,
    height: scada.height ?? 720,
    items: scada.items ?? {},
    schemaVersion: 1,
  };
  return {
    id: scada.view_id,
    name: scada.name,
    type: scada.is_svg ? 'svg' : 'cards',
    payload: JSON.stringify(fuxaPayload),
    width: scada.width ?? 1280,
    height: scada.height ?? 720,
    parent_view_id: null,
    is_template: scada.is_template ?? 0,
    version: 1,
    created_at: scada.updated_at,
    updated_at: scada.updated_at,
    created_by: scada.owner_id ?? 'unknown',
    updated_by: scada.owner_id ?? 'unknown',
  };
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
    if (row) return res.json(row);
    // SP-FX-48.2 bridge: fall back to scada_views table (tolerate missing table)
    try {
      const scada = sqlite.getScadaView(req.params.id);
      if (scada) return res.json(scadaRowToFuxaShape(scada));
    } catch { /* scada_views table absent in test envs — ignore */ }
    return res.status(404).json({ error: '视图不存在' });
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
  // ─── Update with optimistic lock ─────────────────────────
  apiRouter.put('/fuxa-views/:id', (req, res) => {
    const ifMatch = req.header('If-Match');
    if (!ifMatch) {
      return res.status(428).json({ error: 'If-Match header required' });
    }
    const expectedVersion = Number(ifMatch);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(400).json({ error: 'If-Match must be a positive integer', field: 'If-Match' });
    }
    const parsed = UpdateBodySchema.safeParse(req.body);
    if (!parsed.success) return zodFail(res, parsed.error);
    const existing = sqlite.getFuxaView(req.params.id);
    if (!existing) {
      // SP-FX-48.2 bridge: write through to scada_views if the ID lives there
      try {
        const scada = sqlite.getScadaView(req.params.id);
        if (scada) {
          const parsedBody = parsed.data;
          const r = sqlite.updateScadaView(req.params.id, {
            name: parsedBody.name,
            width: parsedBody.width,
            height: parsedBody.height,
            items: parsedBody.payload.items,
          });
          if ('ok' in r && r.ok) {
            const after = sqlite.getScadaView(req.params.id)!;
            return res.json(scadaRowToFuxaShape(after));
          }
          return res.status(500).json({ error: 'scada_view update failed' });
        }
      } catch { /* scada_views table absent — fall through to 404 */ }
      return res.status(404).json({ error: '视图不存在' });
    }
    const v = parsed.data;
    const force = req.query.force === 'true';
    const ok = sqlite.updateFuxaView(req.params.id, {
      expectedVersion,
      name: v.name,
      type: v.type,
      payload: JSON.stringify(v.payload),
      width: v.width,
      height: v.height,
      parent_view_id: v.parent_view_id ?? null,
      is_template: v.is_template,
      updated_by: getUserId(req),
      force,
    });
    if (!ok) {
      const cur = sqlite.getFuxaView(req.params.id)!;
      return res.status(409).json({ error: 'stale version', currentVersion: cur.version });
    }
    res.json(sqlite.getFuxaView(req.params.id));
  });

  // ─── Delete (idempotent) ─────────────────────────────────
  apiRouter.delete('/fuxa-views/:id', (req, res) => {
    sqlite.deleteFuxaView(req.params.id);
    res.status(204).end();
  });

  // ─── Duplicate ───────────────────────────────────────────
  apiRouter.post('/fuxa-views/:id/duplicate', (req, res) => {
    const parsed = DuplicateBodySchema.safeParse(req.body);
    if (!parsed.success) return zodFail(res, parsed.error);
    if (!sqlite.getFuxaView(req.params.id)) {
      return res.status(404).json({ error: '源视图不存在' });
    }
    if (sqlite.getFuxaView(parsed.data.newId)) {
      return res.status(409).json({ error: `fuxa_view ${parsed.data.newId} already exists` });
    }
    try {
      sqlite.duplicateFuxaView(req.params.id, {
        newId: parsed.data.newId,
        userId: getUserId(req),
      });
      const row = sqlite.getFuxaView(parsed.data.newId);
      res.status(201).json(row);
    } catch (e) {
      console.error('fuxa-views duplicate failed:', (e as Error).message);
      res.status(500).json({ error: 'duplicate failed' });
    }
  });
}

// getUserId is used by Tasks 6 and 9 (POST + duplicate) when they bolt on to this file.
export { getUserId };
