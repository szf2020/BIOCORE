-- ============================================================
-- 012-permissions-table.sql
-- F5: 精细 RBAC 权限表 + 默认种子
-- resource 格式: 'reactor:*', 'reactor:F01', 'calibration:*', 'recipe:*', 'batch:*', 'user:*'
-- action 格式: 'read', 'start_batch', 'stop_batch', 'hold_batch', 'calibrate',
--              'edit_recipe', 'approve_recipe', 'add_sample', 'manage_users', 'manage_permissions'
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role        TEXT NOT NULL CHECK(role IN ('admin','engineer','operator','viewer')),
  resource    TEXT NOT NULL,
  action      TEXT NOT NULL,
  allowed     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(role, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_permissions_role ON permissions(role, resource);

-- 默认种子: admin 全权 (代码里硬编码 bypass), 其他角色按需
INSERT OR IGNORE INTO permissions (role, resource, action) VALUES
  ('engineer', 'reactor:*',      'start_batch'),
  ('engineer', 'reactor:*',      'stop_batch'),
  ('engineer', 'reactor:*',      'hold_batch'),
  ('engineer', 'calibration:*',  'calibrate'),
  ('engineer', 'recipe:*',       'edit_recipe'),
  ('engineer', 'recipe:*',       'approve_recipe'),
  ('engineer', 'batch:*',        'add_sample'),
  ('engineer', 'batch:*',        'read'),
  ('operator', 'reactor:*',      'start_batch'),
  ('operator', 'reactor:*',      'hold_batch'),
  ('operator', 'batch:*',        'add_sample'),
  ('operator', 'batch:*',        'read'),
  ('operator', 'calibration:*',  'read'),
  ('operator', 'recipe:*',       'read'),
  ('viewer',   '*',              'read');
