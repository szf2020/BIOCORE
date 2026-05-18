// ============================================================
// alert-routes.ts — 告警通知系统 REST API (SP-FX-42)
// ============================================================
// Routes (mounted under /api/v1):
//   GET    /alerts/channels
//   POST   /alerts/channels
//   PUT    /alerts/channels/:id
//   DELETE /alerts/channels/:id
//   GET    /alerts/rules
//   POST   /alerts/rules
//   PUT    /alerts/rules/:id
//   DELETE /alerts/rules/:id
//   GET    /alerts/history?limit=100
//   POST   /alerts/test/:channelId
// 全接口 admin only.
// ============================================================

import type { Router } from 'express';
import type Database from 'better-sqlite3';
import { sendTestMessage } from './services/alert-dispatcher';

const VALID_CHANNEL_TYPES = ['slack', 'email', 'webhook'] as const;
const VALID_TRIGGER_TYPES = ['audit_log', 'write_intent_reject', 'system_error', 'threshold'] as const;

type ChannelType = (typeof VALID_CHANNEL_TYPES)[number];
type TriggerType = (typeof VALID_TRIGGER_TYPES)[number];

function isValidChannelType(v: unknown): v is ChannelType {
  return VALID_CHANNEL_TYPES.includes(v as ChannelType);
}

function isValidTriggerType(v: unknown): v is TriggerType {
  return VALID_TRIGGER_TYPES.includes(v as TriggerType);
}

function requireAdmin(req: any, res: any, next: () => void): void {
  if (!req.user) { res.status(401).json({ error: '未认证' }); return; }
  if (req.user.role !== 'admin') { res.status(403).json({ error: '仅管理员可访问' }); return; }
  next();
}

export interface AlertRoutesDeps {
  db: InstanceType<typeof Database>;
}

export function registerAlertRoutes(apiRouter: Router, deps: AlertRoutesDeps): void {
  const { db } = deps;

  // ─── 渠道 ──────────────────────────────────────────────────

  apiRouter.get('/alerts/channels', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM alert_channels ORDER BY created_at DESC').all();
    res.json(rows.map(parseChannel));
  });

  apiRouter.post('/alerts/channels', requireAdmin, (req, res) => {
    const { type, name, config, enabled = 1 } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: '缺少 name' }); return;
    }
    if (!isValidChannelType(type)) {
      res.status(400).json({ error: `type 必须是 ${VALID_CHANNEL_TYPES.join('/')}` }); return;
    }
    const configStr = typeof config === 'string' ? config : JSON.stringify(config ?? {});
    const result = db.prepare(
      `INSERT INTO alert_channels (type, name, config, enabled) VALUES (?, ?, ?, ?)`,
    ).run(type, name.trim(), configStr, enabled ? 1 : 0);
    const row = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(parseChannel(row));
  });

  apiRouter.put('/alerts/channels/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(id);
    if (!existing) { res.status(404).json({ error: '渠道不存在' }); return; }
    const { type, name, config, enabled } = req.body ?? {};
    if (type !== undefined && !isValidChannelType(type)) {
      res.status(400).json({ error: `type 必须是 ${VALID_CHANNEL_TYPES.join('/')}` }); return;
    }
    const ex = existing as any;
    const newType = type ?? ex.type;
    const newName = (name !== undefined ? name : ex.name).trim();
    const newConfig = config !== undefined
      ? (typeof config === 'string' ? config : JSON.stringify(config))
      : ex.config;
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : ex.enabled;
    db.prepare(
      `UPDATE alert_channels SET type=?, name=?, config=?, enabled=? WHERE id=?`,
    ).run(newType, newName, newConfig, newEnabled, id);
    const row = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(id);
    res.json(parseChannel(row));
  });

  apiRouter.delete('/alerts/channels/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM alert_channels WHERE id = ?').get(id);
    if (!existing) { res.status(404).json({ error: '渠道不存在' }); return; }
    db.prepare('DELETE FROM alert_channels WHERE id = ?').run(id);
    res.status(204).end();
  });

  // ─── 规则 ──────────────────────────────────────────────────

  apiRouter.get('/alerts/rules', requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all();
    res.json(rows.map(parseRule));
  });

  apiRouter.post('/alerts/rules', requireAdmin, (req, res) => {
    const { name, trigger_type, condition_expr = 'true', channel_id, enabled = 1 } = req.body ?? {};
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: '缺少 name' }); return;
    }
    if (!isValidTriggerType(trigger_type)) {
      res.status(400).json({ error: `trigger_type 必须是 ${VALID_TRIGGER_TYPES.join('/')}` }); return;
    }
    if (!channel_id || typeof channel_id !== 'number') {
      res.status(400).json({ error: '缺少有效 channel_id' }); return;
    }
    const ch = db.prepare('SELECT id FROM alert_channels WHERE id = ?').get(channel_id);
    if (!ch) { res.status(400).json({ error: 'channel_id 不存在' }); return; }
    const result = db.prepare(
      `INSERT INTO alert_rules (name, trigger_type, condition_expr, channel_id, enabled) VALUES (?, ?, ?, ?, ?)`,
    ).run(name.trim(), trigger_type, condition_expr, channel_id, enabled ? 1 : 0);
    const row = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(parseRule(row));
  });

  apiRouter.put('/alerts/rules/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id);
    if (!existing) { res.status(404).json({ error: '规则不存在' }); return; }
    const { name, trigger_type, condition_expr, channel_id, enabled } = req.body ?? {};
    if (trigger_type !== undefined && !isValidTriggerType(trigger_type)) {
      res.status(400).json({ error: `trigger_type 必须是 ${VALID_TRIGGER_TYPES.join('/')}` }); return;
    }
    const ex = existing as any;
    const newName = (name !== undefined ? name : ex.name).trim();
    const newTrigger = trigger_type ?? ex.trigger_type;
    const newExpr = condition_expr ?? ex.condition_expr;
    const newChannel = channel_id ?? ex.channel_id;
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : ex.enabled;
    db.prepare(
      `UPDATE alert_rules SET name=?, trigger_type=?, condition_expr=?, channel_id=?, enabled=? WHERE id=?`,
    ).run(newName, newTrigger, newExpr, newChannel, newEnabled, id);
    const row = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id);
    res.json(parseRule(row));
  });

  apiRouter.delete('/alerts/rules/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM alert_rules WHERE id = ?').get(id);
    if (!existing) { res.status(404).json({ error: '规则不存在' }); return; }
    db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id);
    res.status(204).end();
  });

  // ─── 历史 ──────────────────────────────────────────────────

  apiRouter.get('/alerts/history', requireAdmin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = db.prepare(
      'SELECT * FROM alert_history ORDER BY fired_at DESC LIMIT ?',
    ).all(limit);
    res.json(rows.map(parseHistory));
  });

  // ─── 测试发送 ──────────────────────────────────────────────

  apiRouter.post('/alerts/test/:channelId', requireAdmin, async (req, res) => {
    const channelId = Number(req.params.channelId);
    const channel = db.prepare('SELECT * FROM alert_channels WHERE id = ?').get(channelId) as any;
    if (!channel) { res.status(404).json({ error: '渠道不存在' }); return; }
    const config = tryParseJson(channel.config);
    const ok = await sendTestMessage({ type: channel.type, config });
    res.json({ ok, channel: channel.name });
  });
}

// ─── 工具函数 ─────────────────────────────────────────────────

function parseChannel(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    config: tryParseJson(row.config),
    enabled: row.enabled === 1,
    created_at: row.created_at,
  };
}

function parseRule(row: any) {
  return {
    id: row.id,
    name: row.name,
    trigger_type: row.trigger_type,
    condition_expr: row.condition_expr,
    channel_id: row.channel_id,
    enabled: row.enabled === 1,
    created_at: row.created_at,
  };
}

function parseHistory(row: any) {
  return {
    id: row.id,
    rule_id: row.rule_id,
    fired_at: row.fired_at,
    payload: tryParseJson(row.payload),
    delivered: row.delivered === 1,
    retry_count: row.retry_count,
  };
}

function tryParseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v ?? {};
  try { return JSON.parse(v); } catch { return {}; }
}
