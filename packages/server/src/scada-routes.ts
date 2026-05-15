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

function getUserId(req: Request): string {
  return (req as any).user?.user_id || 'unknown';
}

function getIp(req: Request): string | undefined {
  return (req.ip || req.socket.remoteAddress) ?? undefined;
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
    if (!project_id || !name) return res.status(400).json({ error: 'project_id_and_name_required' });
    if (sqlite.getScadaProject(project_id)) {
      return res.status(409).json({ error: 'project_id_conflict' });
    }
    const userId = getUserId(req);
    sqlite.createScadaProject({ project_id, name, description: description ?? null, created_by: userId });
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
    if (typeof req.body?.name === 'string') patch.name = req.body.name;
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
}
