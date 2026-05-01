-- ============================================================
-- 003-add-trace-fields.sql
-- 给 audit_logs 加 trace_id 字段, 方便跨系统排错时关联请求
-- ============================================================

ALTER TABLE audit_logs ADD COLUMN trace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_trace ON audit_logs(trace_id);
