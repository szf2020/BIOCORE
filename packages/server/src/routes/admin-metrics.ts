// ============================================================
// admin-metrics.ts — Prometheus exposition endpoint (T37, Sprint 4 Track A)
//
// /api/v1/admin/metrics — Prometheus exposition (text/plain; version=0.0.4).
//
// Default: no auth (Prometheus standard scrape practice).
// Set BIOCORE_METRICS_REQUIRE_AUTH=true to gate behind admin role.
// Each request rebuilds gauge values from a fresh metricsCollector.snapshot()
// so values are always current (cheap; snapshot is in-memory).
//
// 见: docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md (T37)
// ============================================================
import { Router, type Request, type Response } from 'express';
import { Registry, Gauge } from 'prom-client';
import type { MetricsCollector } from '@biocore/runtime-guard';

export interface AdminMetricsDeps {
  metricsCollector: MetricsCollector;
  requireAuth?: boolean;
}

export function createAdminMetricsRouter(deps: AdminMetricsDeps): Router {
  const r = Router();
  const registry = new Registry();

  const gHeapUsed = new Gauge({ name: 'biocore_heap_used_bytes', help: 'Heap used (bytes)', registers: [registry] });
  const gHeapTotal = new Gauge({ name: 'biocore_heap_total_bytes', help: 'Heap total (bytes)', registers: [registry] });
  const gRss = new Gauge({ name: 'biocore_rss_bytes', help: 'RSS (bytes)', registers: [registry] });
  const gOomThreshold = new Gauge({ name: 'biocore_oom_threshold_bytes', help: 'OOM threshold (bytes)', registers: [registry] });
  const gLag = new Gauge({ name: 'biocore_event_loop_lag_seconds', help: 'Event loop lag (seconds)', labelNames: ['quantile'], registers: [registry] });
  const gHandles = new Gauge({ name: 'biocore_handles_active', help: 'Active handles', registers: [registry] });
  const gHandlesByType = new Gauge({ name: 'biocore_handles_by_type', help: 'Active handles by constructor name', labelNames: ['type'], registers: [registry] });
  const gUptime = new Gauge({ name: 'biocore_uptime_seconds', help: 'Process uptime (seconds)', registers: [registry] });
  const gInfo = new Gauge({ name: 'biocore_info', help: 'Build info', labelNames: ['node', 'version'], registers: [registry] });

  r.get('/', async (req: Request, res: Response) => {
    if (deps.requireAuth) {
      const role = (req as { user?: { role?: string } }).user?.role;
      if (role !== 'admin') {
        res.status(403).end();
        return;
      }
    }

    const snap = deps.metricsCollector.snapshot();

    gHeapUsed.set(snap.memory.heap_used_mb * 1024 * 1024);
    gHeapTotal.set(snap.memory.heap_total_mb * 1024 * 1024);
    gRss.set(snap.memory.rss_mb * 1024 * 1024);
    gOomThreshold.set(snap.memory.oom_threshold_mb * 1024 * 1024);
    gLag.set({ quantile: '0.5' }, snap.event_loop.lag_p50_ms / 1000);
    gLag.set({ quantile: '0.99' }, snap.event_loop.lag_p99_ms / 1000);
    gLag.set({ quantile: 'max' }, snap.event_loop.lag_max_ms / 1000);
    gHandles.set(snap.handles.active);
    gUptime.set(snap.service.uptime_sec);
    gInfo.set({ node: snap.service.node, version: snap.service.version }, 1);

    // Reset by-type gauge per request to avoid stale labels accumulating
    gHandlesByType.reset();
    for (const [type, count] of Object.entries(snap.handles.by_type)) {
      gHandlesByType.set({ type }, count);
    }

    try {
      const text = await registry.metrics();
      res.set('Content-Type', registry.contentType);
      res.send(text);
    } catch (e) {
      res.status(500).send(`# error: ${(e as Error).message}\n`);
    }
  });

  return r;
}
