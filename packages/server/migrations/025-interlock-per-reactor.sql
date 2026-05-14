-- 025: 连锁/故障配置加 reactor_id (NULL = 全局默认, 有值 = 该反应器覆盖)
-- 设计: 全局默认 + 反应器覆盖模型 (Option A)
-- 查询: WHERE reactor_id IS NULL OR reactor_id = ? (反应器优先, 否则回退全局)

ALTER TABLE interlock_configs RENAME TO interlock_configs_old;

CREATE TABLE interlock_configs (
  id            TEXT NOT NULL,
  reactor_id    TEXT,
  category      TEXT NOT NULL CHECK(category IN ('IL','RF')),
  name          TEXT NOT NULL,
  description   TEXT,
  check_type    TEXT NOT NULL DEFAULT 'tag_compare',
  plc_tags      TEXT,
  condition     TEXT,
  duration_sec  INTEGER DEFAULT 0,
  severity      TEXT DEFAULT 'critical' CHECK(severity IN ('critical','warning','info')),
  hold_action   TEXT,
  display_name  TEXT,
  is_enabled    INTEGER DEFAULT 1,
  is_system     INTEGER DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  updated_by    TEXT,
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 旧数据全部当作全局默认 (reactor_id = NULL)
INSERT INTO interlock_configs (id, reactor_id, category, name, description, check_type, plc_tags, condition,
    duration_sec, severity, hold_action, display_name, is_enabled, is_system, sort_order, updated_by, updated_at)
SELECT id, NULL, category, name, description, check_type, plc_tags, condition,
       duration_sec, severity, hold_action, display_name, is_enabled, is_system, sort_order, updated_by, updated_at
FROM interlock_configs_old;

DROP TABLE interlock_configs_old;

-- 唯一索引: (id, reactor_id) 元组唯一. IFNULL 让 NULL 也能参与唯一性
CREATE UNIQUE INDEX idx_il_id_reactor ON interlock_configs(id, IFNULL(reactor_id, '__global__'));
CREATE INDEX idx_il_reactor ON interlock_configs(reactor_id);
