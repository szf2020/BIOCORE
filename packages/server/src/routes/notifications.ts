// ============================================================
// notifications.ts — channel + rule CRUD (T40, Sprint 4 Track A)
//
// /api/v1/notifications/*
//   GET    /channels             list channels (admin)
//   PUT    /channels/:id         upsert (admin)
//   DELETE /channels/:id         delete (admin)
//   POST   /channels/:id/test    fire a synthetic process_restart event so
//                                 user can verify the channel works (admin)
//   GET    /rules                list rules + available event types (admin)
//   PUT    /rules                replace all rules atomically (admin)
//
// After every mutation we call alertRouter.setChannels / setRules so live
// state reflects the DB without server restart.
//
// 见: docs/superpowers/specs/2026-05-01-nodejs-hardening-design.md (T40)
// ============================================================
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eventTypes, type AlertRouter, type ChannelDef, type ChannelType, type Rule } from '@biocore/notifier';
import {
  listChannels,
  upsertChannel,
  deleteChannel,
  listRules,
  setRules,
} from '@biocore/data-service';
import type Database from 'better-sqlite3';

export interface NotificationsDeps {
  db: Database.Database;
  alertRouter: AlertRouter;
}

const VALID_CHANNEL_TYPES: ReadonlySet<ChannelType> = new Set(['feishu', 'dingtalk', 'telegram', 'webhook']);
const VALID_SEVERITIES: ReadonlySet<string> = new Set(['info', 'warn', 'critical']);

export function createNotificationsRouter(deps: NotificationsDeps): Router {
  const r = Router();

  function refreshAlertRouter(): void {
    const channelsMap: Record<string, ChannelDef> = {};
    for (const c of listChannels(deps.db)) {
      if (c.enabled) {
        channelsMap[c.id] = {
          type: c.type,
          config: c.config as { webhook_url: string; secret?: string },
        };
      }
    }
    deps.alertRouter.setChannels(channelsMap);
    deps.alertRouter.setRules(
      listRules(deps.db).map(rule => ({
        event_type: rule.event_type as Rule['event_type'],
        channel_id: rule.channel_id,
        enabled: rule.enabled,
        min_severity: rule.min_severity,
      })),
    );
  }

  // ─── Channels ────────────────────────────────────────────
  r.get('/channels', requireAdmin, (_req: Request, res: Response) => {
    res.json({ channels: listChannels(deps.db) });
  });

  r.put('/channels/:id', requireAdmin, (req: Request, res: Response) => {
    const { id } = req.params;
    const body = req.body as { type?: string; config?: Record<string, unknown>; enabled?: boolean };
    if (!body.type || !VALID_CHANNEL_TYPES.has(body.type as ChannelType)) {
      res.status(400).json({ error: 'invalid type' });
      return;
    }
    if (!body.config || typeof body.config !== 'object') {
      res.status(400).json({ error: 'invalid config' });
      return;
    }
    upsertChannel(deps.db, {
      id,
      type: body.type as ChannelType,
      config: body.config,
      enabled: body.enabled !== false,
    });
    refreshAlertRouter();
    res.json({ ok: true });
  });

  r.delete('/channels/:id', requireAdmin, (req: Request, res: Response) => {
    deleteChannel(deps.db, req.params.id);
    refreshAlertRouter();
    res.json({ ok: true });
  });

  // ─── Test trigger: fire a synthetic process_restart event ─
  r.post('/channels/:id/test', requireAdmin, async (req: Request, res: Response) => {
    const ch = listChannels(deps.db).find(c => c.id === req.params.id);
    if (!ch) {
      res.status(404).json({ error: 'channel not found' });
      return;
    }
    // process_restart is innocuous; using channel id in reason makes it traceable.
    await deps.alertRouter.emit('process_restart', {
      reason: `test_message_to_${req.params.id}`,
      pid: process.pid,
      uptime_sec: process.uptime(),
    });
    res.json({ ok: true, message: '测试事件已触发' });
  });

  // ─── Rules ───────────────────────────────────────────────
  r.get('/rules', requireAdmin, (_req: Request, res: Response) => {
    res.json({
      rules: listRules(deps.db),
      available_event_types: eventTypes,
    });
  });

  r.put('/rules', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as {
      rules?: Array<{
        event_type: string;
        channel_id: string;
        enabled: boolean;
        min_severity: 'info' | 'warn' | 'critical';
      }>;
    };
    const rules = body.rules ?? [];
    for (const rule of rules) {
      if (!eventTypes.includes(rule.event_type as typeof eventTypes[number])) {
        res.status(400).json({ error: `invalid event_type: ${rule.event_type}` });
        return;
      }
      if (!VALID_SEVERITIES.has(rule.min_severity)) {
        res.status(400).json({ error: `invalid min_severity: ${rule.min_severity}` });
        return;
      }
    }
    setRules(deps.db, rules);
    refreshAlertRouter();
    res.json({ ok: true });
  });

  return r;
}

/**
 * Inline admin gate — matches the pattern used in admin-health/-crashes.
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
