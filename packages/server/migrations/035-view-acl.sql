-- ============================================================
-- 035-view-acl.sql — scada_views 视图级权限控制 (SP-FX-24)
-- ============================================================
-- owner_id: 视图所有者 user_id (NULL = 无 owner, 仅 acl/admin 控制)
-- acl: JSON { "users": [...], "roles": [...] }
--   默认所有人（admin + operator）均可访问
-- ============================================================

ALTER TABLE scada_views ADD COLUMN owner_id TEXT;
ALTER TABLE scada_views ADD COLUMN acl TEXT NOT NULL DEFAULT '{"users":[],"roles":["admin","operator"]}';
