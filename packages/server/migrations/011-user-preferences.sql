-- ============================================================
-- 011-user-preferences.sql
-- F6: 用户偏好键值存储 (仪表盘布局等)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     TEXT NOT NULL,
  pref_key    TEXT NOT NULL,
  pref_value  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, pref_key)
);
