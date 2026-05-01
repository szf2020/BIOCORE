-- B1.1 DAG 运行时 — 持久化 currentNodeId + audit target 类型区分
ALTER TABLE batches ADD COLUMN current_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_batches_current_node_id
  ON batches(current_node_id) WHERE current_node_id IS NOT NULL;

-- target_kind 区分 audit_logs.target_id 的语义
-- 老数据 NULL（前端按 NULL = 'phase_index' 渲染）
ALTER TABLE audit_logs ADD COLUMN target_kind TEXT;
