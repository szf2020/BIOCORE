-- T35 (Sprint 4 Track A) — Notification system tables
-- Backs the @biocore/notifier AlertRouter: channels store per-platform config,
-- rules map (event_type, channel_id) pairs with severity threshold.

CREATE TABLE IF NOT EXISTS notification_channels (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('feishu', 'dingtalk', 'telegram', 'webhook')),
  config      TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,
  channel_id   TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  enabled      INTEGER NOT NULL DEFAULT 1,
  min_severity TEXT NOT NULL DEFAULT 'warn' CHECK (min_severity IN ('info', 'warn', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_event_type
  ON notification_rules(event_type) WHERE enabled = 1;
