-- ============================================================
-- 034-audit-log.sql — 用户操作审计日志 (SP-FX-19)
-- ============================================================
-- 记录所有写操作 (POST/PUT/PATCH/DELETE) 的审计日志.
-- user_id: JWT sub 或 API Key id，未认证时为 NULL.
-- resource_type: 从 URL 路径提取, e.g. 'batches', 'recipes'.
-- resource_id: 路径参数, e.g. '42', 无时为 NULL.
-- payload: JSON.stringify(req.body), 超 4096 字节截断.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT,
  action        TEXT    NOT NULL,
  resource_type TEXT    NOT NULL,
  resource_id   TEXT,
  payload       TEXT,
  ip            TEXT,
  timestamp     DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_ts
  ON audit_log(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_resource_ts
  ON audit_log(resource_type, resource_id, timestamp DESC);
