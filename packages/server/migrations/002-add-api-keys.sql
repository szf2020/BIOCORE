-- ============================================================
-- 002-add-api-keys.sql
-- 新增 API Key 表 (供 MES 等外部系统调用 biocore 使用)
--
-- 设计:
-- - key_id: 公开标识符 'ak_' + 8 字节 hex (例 'ak_a3f5b1c8...')
-- - raw key 格式: '{key_id}.{32 字节 base64url}'
-- - 存储 sha256(salt + raw_key), 不存原始 key
-- - 撤销 = revoked = 1, 不物理删除 (保留审计追溯)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  key_id        TEXT PRIMARY KEY,
  key_hash      TEXT NOT NULL,
  salt          TEXT NOT NULL,
  name          TEXT NOT NULL,
  scopes        TEXT NOT NULL DEFAULT 'read:* write:*',
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  revoked       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked);
CREATE INDEX IF NOT EXISTS idx_api_keys_creator ON api_keys(created_by);
