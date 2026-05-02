-- B1.2 Loop 节点 — 持久化 active loop frame stack 用于崩溃恢复
-- 列存储 JSON.stringify(dagExecutor.snapshotFrames()), null 表示无活跃 loop。
-- 列设计为 TEXT NULL — 旧 DB 升级后所有已存在 batch 自动取 NULL（与新 batch 起点一致），
-- 读取经 try/catch helper 故 NULL/解析失败均优雅退化为"无活跃 loop"，启动不崩。
ALTER TABLE batches ADD COLUMN current_loop_frames TEXT;
