// ============================================================
// scada-routes.ts — SCADA 项目 + 视图 REST API
// ============================================================
// Spec: docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md
// Routes mounted under /api/v1:
//   GET    /scada/projects
//   GET    /scada/projects/:projectId
//   POST   /scada/projects                       (admin/engineer)
//   PUT    /scada/projects/:projectId            (admin/engineer)
//   DELETE /scada/projects/:projectId            (admin/engineer)
//   GET    /scada/views/:viewId
//   POST   /scada/projects/:projectId/views      (admin/engineer)
//   PUT    /scada/views/:viewId                  (admin/engineer)
//   DELETE /scada/views/:viewId                  (admin/engineer)
//   GET    /scada/reactors/:reactorId/views
// ============================================================

import type { Router, Request } from 'express';
import type { SQLiteService } from '@biocore/data-service';
import { SCADA_ITEMS_MAX_BYTES } from '@biocore/data-service';
import { requireRole } from './middlewares/auth';

export interface ScadaRoutesDeps {
  sqlite: SQLiteService;
  broadcast: (channel: string, payload: any) => void;
}

// Fallback to 'unknown' is defensive; requireAuth middleware ensures req.user is set in production.
// Only fires in misconfigured tests.
function getUserId(req: Request): string {
  return (req as any).user?.user_id || 'unknown';
}

function getIp(req: Request): string | undefined {
  return (req.ip || req.socket.remoteAddress) ?? undefined;
}

function isBlankString(v: unknown): boolean {
  return typeof v !== 'string' || v.trim().length === 0;
}

export function registerScadaRoutes(apiRouter: Router, deps: ScadaRoutesDeps): void {
  const { sqlite, broadcast } = deps;

  // ─── 项目 ─────────────────────────────────────────────────
  apiRouter.get('/scada/projects', (_req, res) => {
    res.json({ items: sqlite.listScadaProjects() });
  });

  apiRouter.get('/scada/projects/:projectId', (req, res) => {
    const meta = sqlite.getScadaProject(req.params.projectId);
    if (!meta) return res.status(404).json({ error: 'project_not_found' });
    const views = sqlite.listScadaViewsByProject(req.params.projectId);
    res.json({ ...meta, views });
  });

  apiRouter.post('/scada/projects', requireRole('admin', 'engineer'), (req, res) => {
    const { project_id, name, description } = req.body ?? {};
    if (isBlankString(project_id) || isBlankString(name)) return res.status(400).json({ error: 'project_id_and_name_required' });
    if (sqlite.getScadaProject(project_id)) {
      return res.status(409).json({ error: 'project_id_conflict' });
    }
    const userId = getUserId(req);
    try {
      sqlite.createScadaProject({ project_id, name, description: description ?? null, created_by: userId });
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || /UNIQUE/i.test(e?.message ?? '')) {
        return res.status(409).json({ error: 'project_id_conflict' });
      }
      throw e;
    }
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_project_create',
      target_type: 'scada_project',
      target_id: project_id,
      new_value: JSON.stringify({ name, description: description ?? null }),
      ip_address: getIp(req),
    });
    broadcast('scada:project:saved', { project_id, updated_at: sqlite.getScadaProject(project_id)!.updated_at });
    res.status(201).json({ success: true, project_id });
  });

  apiRouter.put('/scada/projects/:projectId', requireRole('admin', 'engineer'), (req, res) => {
    const { projectId } = req.params;
    const old = sqlite.getScadaProject(projectId);
    if (!old) return res.status(404).json({ error: 'project_not_found' });
    const patch: { name?: string; description?: string | null } = {};
    if (typeof req.body?.name === 'string' && !isBlankString(req.body.name)) patch.name = req.body.name;
    if (req.body?.description !== undefined) patch.description = req.body.description ?? null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'empty_patch' });
    sqlite.updateScadaProject(projectId, patch);
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_project_update',
      target_type: 'scada_project',
      target_id: projectId,
      old_value: JSON.stringify({ name: old.name, description: old.description }),
      new_value: JSON.stringify(patch),
      ip_address: getIp(req),
    });
    const updated = sqlite.getScadaProject(projectId)!;
    broadcast('scada:project:saved', { project_id: projectId, updated_at: updated.updated_at });
    res.json({ success: true });
  });

  apiRouter.delete('/scada/projects/:projectId', requireRole('admin', 'engineer'), (req, res) => {
    const { projectId } = req.params;
    const old = sqlite.getScadaProject(projectId);
    if (!old) return res.status(404).json({ error: 'project_not_found' });
    const r = sqlite.deleteScadaProject(projectId);
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_project_delete',
      target_type: 'scada_project',
      target_id: projectId,
      old_value: JSON.stringify({ name: old.name, view_count: r.deleted_views }),
      ip_address: getIp(req),
    });
    broadcast('scada:project:deleted', { project_id: projectId });
    res.json({ success: true, deleted_views: r.deleted_views });
  });

  // ─── 视图 ─────────────────────────────────────────────────
  function checkItemsSize(items: any): string | null {
    const str = JSON.stringify(items);
    if (Buffer.byteLength(str, 'utf8') > SCADA_ITEMS_MAX_BYTES) {
      return 'items_too_large';
    }
    return null;
  }

  apiRouter.get('/scada/views/:viewId', (req, res) => {
    const view = sqlite.getScadaView(req.params.viewId);
    if (!view) return res.status(404).json({ error: 'view_not_found' });
    res.json(view);
  });

  apiRouter.get('/scada/reactors/:reactorId/views', (req, res) => {
    res.json({ items: sqlite.listScadaViewsByReactor(req.params.reactorId) });
  });

  apiRouter.post('/scada/projects/:projectId/views', requireRole('admin', 'engineer'), (req, res) => {
    const { projectId } = req.params;
    if (!sqlite.getScadaProject(projectId)) return res.status(404).json({ error: 'project_not_found' });
    const { view_id, name, reactor_id, width, height, background, display_order, items } = req.body ?? {};
    if (isBlankString(view_id) || isBlankString(name)) return res.status(400).json({ error: 'view_id_and_name_required' });
    if (sqlite.getScadaView(view_id)) return res.status(409).json({ error: 'view_id_conflict' });
    if (items !== undefined) {
      const err = checkItemsSize(items);
      if (err) return res.status(400).json({ error: err });
    }
    try {
      sqlite.createScadaView({
        view_id, project_id: projectId, name,
        reactor_id: reactor_id ?? null,
        width, height, background, display_order,
        items: items ?? {},
      });
    } catch (e: any) {
      if (e?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || /UNIQUE/i.test(e?.message ?? '')) {
        return res.status(409).json({ error: 'view_id_conflict' });
      }
      throw e;
    }
    const after = sqlite.getScadaView(view_id)!;
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_view_create',
      target_type: 'scada_view',
      target_id: view_id,
      new_value: JSON.stringify({ name, reactor_id: reactor_id ?? null, project_id: projectId }),
      ip_address: getIp(req),
    });
    broadcast('scada:view:saved', {
      view_id, project_id: projectId, updated_at: after.updated_at, updated_by: userId,
    });
    res.status(201).json({ success: true, view_id });
  });

  apiRouter.put('/scada/views/:viewId', requireRole('admin', 'engineer'), (req, res) => {
    const { viewId } = req.params;
    const old = sqlite.getScadaView(viewId);
    if (!old) return res.status(404).json({ error: 'view_not_found' });
    const body = req.body ?? {};
    if (body.items !== undefined) {
      const err = checkItemsSize(body.items);
      if (err) return res.status(400).json({ error: err });
    }
    const patchKeys = ['name', 'reactor_id', 'display_order', 'width', 'height', 'background', 'items'];
    const hasUserPatch = patchKeys.some(k => body[k] !== undefined);
    if (!hasUserPatch) return res.status(400).json({ error: 'empty_patch' });
    if (body.name !== undefined && isBlankString(body.name)) {
      return res.status(400).json({ error: 'blank_name' });
    }
    const r = sqlite.updateScadaView(viewId, {
      name: body.name,
      reactor_id: body.reactor_id,
      display_order: body.display_order,
      width: body.width,
      height: body.height,
      background: body.background,
      items: body.items,
      expected_updated_at: body.expected_updated_at ?? null,
    });
    if (!r.ok && 'conflict' in r && r.conflict) {
      return res.status(409).json({ error: 'concurrent_update', current_updated_at: (r as any).current_updated_at });
    }
    if (!r.ok) return res.status(404).json({ error: 'view_not_found' });
    const userId = getUserId(req);
    const widgetCount = body.items ? Object.keys(body.items).length : Object.keys(old.items).length;
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_view_save',
      target_type: 'scada_view',
      target_id: viewId,
      old_value: JSON.stringify({ updated_at: old.updated_at }),
      new_value: JSON.stringify({ updated_at: r.updated_at, widget_count: widgetCount }),
      ip_address: getIp(req),
    });
    broadcast('scada:view:saved', {
      view_id: viewId, project_id: old.project_id, updated_at: r.updated_at, updated_by: userId,
    });
    res.json({ success: true, updated_at: r.updated_at });
  });

  apiRouter.delete('/scada/views/:viewId', requireRole('admin', 'engineer'), (req, res) => {
    const { viewId } = req.params;
    const old = sqlite.getScadaView(viewId);
    if (!old) return res.status(404).json({ error: 'view_not_found' });
    sqlite.deleteScadaView(viewId);
    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_view_delete',
      target_type: 'scada_view',
      target_id: viewId,
      old_value: JSON.stringify({ name: old.name }),
      ip_address: getIp(req),
    });
    broadcast('scada:view:deleted', { view_id: viewId, project_id: old.project_id });
    res.json({ success: true });
  });

  // ─── 写意图 (建议缓冲区入口, 永不直写 PLC) ──────────────────
  apiRouter.post('/scada/write-intents', requireRole('admin', 'engineer', 'operator'), (req, res) => {
    const { tag, value, reason, view_id, widget_id, batch_id } = req.body ?? {};
    if (isBlankString(tag) || isBlankString(view_id) || isBlankString(widget_id) || isBlankString(reason)) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }
    if (reason.trim().length < 3) {
      return res.status(400).json({ error: 'reason_too_short' });
    }
    if (value !== null && value !== undefined &&
        !['number', 'string', 'boolean'].includes(typeof value)) {
      return res.status(400).json({ error: 'invalid_value_type' });
    }

    const view = sqlite.getScadaView(view_id);
    if (!view) return res.status(404).json({ error: 'view_not_found' });

    let effective_batch_id: string | undefined;
    if (typeof batch_id === 'string' && batch_id.trim()) {
      effective_batch_id = batch_id.trim();
    } else if (view.reactor_id) {
      const row: any = sqlite.getDatabase().prepare(
        `SELECT batch_id FROM batches
         WHERE reactor_id = ?
           AND current_state IN ('running','held','paused')
         ORDER BY COALESCE(started_at, created_at) DESC
         LIMIT 1`
      ).get(view.reactor_id);
      effective_batch_id = row?.batch_id;
    }

    if (!effective_batch_id) {
      return res.status(409).json({ error: 'no_active_batch' });
    }

    const suggestion_id = sqlite.createSuggestion({
      batch_id: effective_batch_id,
      suggestion_type: 'widget_button',
      source_module: 'scada',
      target_param: tag,
      suggested_value: typeof value === 'number' ? value : undefined,
      reasoning: JSON.stringify({ reason: reason.trim(), value, view_id, widget_id }),
    });

    const userId = getUserId(req);
    sqlite.writeAuditLog({
      user_id: userId,
      action: 'scada_write_intent',
      target_type: 'ai_suggestion',
      target_id: String(suggestion_id),
      new_value: JSON.stringify({ tag, value, view_id, widget_id, reason: reason.trim() }),
      ip_address: getIp(req),
    });

    broadcast('ai_suggestion', { id: suggestion_id, action: 'created', source: 'scada' });
    res.json({ success: true, suggestion_id });
  });
}
