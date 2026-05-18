-- ============================================================
-- 037-alert-tables.sql — 告警通知系统 (SP-FX-42)
-- ============================================================
-- 3 张表:
--   alert_channels  — 通知渠道 (slack/email/webhook)
--   alert_rules     — 告警规则 (触发类型 + 条件表达式 + 渠道)
--   alert_history   — 告警历史 (触发记录 + 投递状态 + retry 次数)
-- ============================================================

CREATE TABLE IF NOT EXISTS alert_channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT    NOT NULL CHECK(type IN ('slack','email','webhook')),
  name        TEXT    NOT NULL,
  config      TEXT    NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  trigger_type    TEXT    NOT NULL CHECK(trigger_type IN ('audit_log','write_intent_reject','system_error','threshold')),
  condition_expr  TEXT    NOT NULL DEFAULT 'true',
  channel_id      INTEGER NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  fired_at    DATETIME NOT NULL DEFAULT (datetime('now')),
  payload     TEXT    NOT NULL DEFAULT '{}',
  delivered   INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alert_history_rule_fired
  ON alert_history(rule_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_history_fired
  ON alert_history(fired_at DESC);
