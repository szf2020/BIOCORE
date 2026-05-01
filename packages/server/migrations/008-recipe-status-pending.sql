-- ============================================================
-- 008-recipe-status-pending.sql
-- Sprint 3 M3.2: 扩展 recipes.status 枚举加入 pending_approval
--
-- SQLite 不支持 ALTER TABLE 改 CHECK 约束, 必须重建表:
--   1. 关闭 FK 检查 (batches 表 FK 引用 recipes)
--   2. 创建 _recipes_new 含新的 CHECK
--   3. INSERT FROM recipes (含 migration 007 的新列)
--   4. DROP recipes
--   5. ALTER _recipes_new RENAME TO recipes
--   6. 重建索引
--   7. 重新打开 FK 检查
--
-- 所有列名/类型必须与当前 recipes 表一致(含 007 加的 5 列)。
-- ============================================================

PRAGMA foreign_keys = OFF;

-- 0. 清理可能从失败重试残留的临时表
DROP TABLE IF EXISTS _recipes_new;

-- 1. 创建新表 (与现有 recipes 结构完全一致, 仅 CHECK 约束扩展)
CREATE TABLE IF NOT EXISTS _recipes_new (
  recipe_id     TEXT NOT NULL,
  version       TEXT NOT NULL,
  name          TEXT NOT NULL,
  author        TEXT NOT NULL,
  target_organism TEXT,
  vessel_config TEXT NOT NULL,
  phases        TEXT NOT NULL,
  metadata      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','pending_approval','approved','archived','superseded')),
  approved_by   TEXT,
  approved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  dag_schema_version INTEGER NOT NULL DEFAULT 1,
  is_template        INTEGER NOT NULL DEFAULT 0,
  parent_template_id TEXT,
  parent_version     TEXT,
  rejection_reason   TEXT,
  PRIMARY KEY (recipe_id, version)
);

-- 2. 复制旧数据
INSERT INTO _recipes_new
  (recipe_id, version, name, author, target_organism, vessel_config, phases, metadata,
   status, approved_by, approved_at, created_at, created_by,
   dag_schema_version, is_template, parent_template_id, parent_version, rejection_reason)
SELECT
  recipe_id, version, name, author, target_organism, vessel_config, phases, metadata,
  status, approved_by, approved_at, created_at, created_by,
  dag_schema_version, is_template, parent_template_id, parent_version, rejection_reason
FROM recipes;

-- 3. 删除旧表
DROP TABLE recipes;

-- 4. 重命名
ALTER TABLE _recipes_new RENAME TO recipes;

-- 5. 重建索引 (migration 001 + 007 的索引都要重建)
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipes_templates
  ON recipes(recipe_id, version)
  WHERE is_template = 1;
CREATE INDEX IF NOT EXISTS idx_recipes_parent_version
  ON recipes(recipe_id, parent_version)
  WHERE parent_version IS NOT NULL;

PRAGMA foreign_keys = ON;
