-- 026: 系统级 k-v 配置表 (面包屑文案等组织级元数据)
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 默认项 (NULL value = 'auto-derive 或回退 env/硬编码')
INSERT OR IGNORE INTO system_config (key, value, description) VALUES
  ('facility_name', NULL, '面包屑第一段 — 厂区/车间名称, NULL 则回退 env NEXT_PUBLIC_FACILITY_NAME 或硬编码'),
  ('line_name', NULL, '面包屑第二段 — 产线名称, NULL 则回退 env NEXT_PUBLIC_LINE_NAME 或硬编码'),
  ('reactor_group_name', NULL, '面包屑第三段 — 反应器组名称, NULL 则从 reactor_configs vessel_volume_L+category 众数自动推导');
