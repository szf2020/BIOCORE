-- ============================================================
-- 010-enhance-offline-samples.sql
-- F7: 增强离线取样 — 添加编辑/软删除支持
-- ============================================================

ALTER TABLE offline_samples ADD COLUMN updated_at TEXT;
ALTER TABLE offline_samples ADD COLUMN deleted_at TEXT;
ALTER TABLE offline_samples ADD COLUMN updated_by TEXT;
