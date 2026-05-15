-- ════════════════════════════════════════════════════════════
-- 027: 报警定义表 (alarm_definitions)
--
-- 自由配置报警:
--   - 归属 (owner): 反应器ID/群组/系统级 (NULL=全局)
--   - 分级 (severity): info / warning / critical / emergency
--   - 内容模板 (message_template): 支持 {pv}/{sv}/{channel} 占位符
--   - 关联标签 (channel): PLC 通道/标签
--   - 阈值 (threshold_high/low + hysteresis)
--   - 启用开关 + 确认要求
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alarm_definitions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  owner           TEXT,
  severity        TEXT NOT NULL CHECK(severity IN ('info','warning','critical','emergency')),
  message_template TEXT NOT NULL,
  channel         TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  threshold_high  REAL,
  threshold_low   REAL,
  hysteresis      REAL,
  ack_required    INTEGER NOT NULL DEFAULT 1,
  category        TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alarm_defs_owner ON alarm_definitions(owner);
CREATE INDEX IF NOT EXISTS idx_alarm_defs_enabled ON alarm_definitions(enabled);
CREATE INDEX IF NOT EXISTS idx_alarm_defs_severity ON alarm_definitions(severity);
