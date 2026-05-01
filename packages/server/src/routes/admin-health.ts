// ============================================================
// admin-health.ts — runtime-guard exposure routes (T36, Sprint 4 Track A)
//
// /api/v1/admin/health/*
//   /liveness   docker healthcheck probe. event loop lag p99 < 1s = ok.
//                no auth required (mounted under apiRouter, but bypasses any
//                role check; authMiddleware still runs at app level — see
//                index.ts where this router is mounted).
//   /           full HealthSnapshot + server-side facts. admin only.
//   /timeseries last 24h ring buffer (1440 minute samples). admin only.
//
// 见: docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md (T36)
// ============================================================
import { Router, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import type { MetricsCollector } from '@biocore/runtime-guard';
import { listDiagnosticDumps } from '@biocore/runtime-guard';

export interface AdminHealthDeps {
  metricsCollector: MetricsCollector;
  crashesDir: string;
}

export function createAdminHealthRouter(deps: AdminHealthDeps): Router {
  const r = Router();

  // Liveness — docker healthcheck probe. NO auth gate (auth middleware at the
  // /api level still runs, but we want this reachable without admin role).
  // Health = event loop lag p99 < 1000ms.
  r.get('/liveness', (_req: Request, res: Response) => {
    const lag = deps.metricsCollector.snapshot().event_loop.lag_p99_ms;
    if (lag > 1000) {
      return res.status(503).json({ status: 'degraded', lag });
    }
    return res.json({ status: 'ok' });
  });

  // Full snapshot — admin only.
  r.get('/', requireAdmin, (_req: Request, res: Response) => {
    const snap = deps.metricsCollector.snapshot();
    const dumps = listDiagnosticDumps(deps.crashesDir);
    res.json({
      service: snap.service,
      memory: snap.memory,
      handles: snap.handles,
      event_loop: snap.event_loop,

      // TODO(Phase3-wiring): replace placeholders with real values from
      // PLC manager singleton, wss listener, data-service buffer, batch manager.
      plc: { connected: false, last_heartbeat_age_ms: 0, reconnect_count_24h: 0 },
      ws: { connections: 0, total_listeners: 0 },
      data_service: { buffer_depth: 0, influx_writes_24h: 0, influx_failures_24h: 0 },
      batches: { active_count: 0, current_batch_id: null },
      restarts: { last_24h: 0, since_install: 0, last_reason: null },

      crashes: {
        total: dumps.length,
        files: dumps.slice(-10).map(d => ({
          ts: d.ts,
          name: path.basename(d.path),
        })),
      },

      // TODO(Phase3-wiring): wire alertRouter once exported from index.ts
      alerts: { active: [], throttled_24h: 0 },
    });
  });

  // Time series — admin only.
  r.get('/timeseries', requireAdmin, (_req: Request, res: Response) => {
    res.json({ samples: deps.metricsCollector.timeSeries() });
  });

  return r;
}

/**
 * Inline admin gate — matches the pattern used by registerPermissionRoutes
 * in middlewares/permissions.ts (`req.user?.role !== 'admin'`).
 * authMiddleware at the /api level populates req.user; here we just check role.
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = (req as { user?: { role?: string } }).user?.role;
  if (role !== 'admin') {
    res.status(403).json({ error: 'admin required' });
    return;
  }
  next();
}
