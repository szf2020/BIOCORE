-- ============================================================
-- 013-recipe-deprecation.sql
-- 配方废弃功能: 扩展 status 枚举加入 pending_deprecation / deprecated
-- 新增 pre_deprecation_status 列保存废弃前状态, 拒绝时恢复
--
-- 沿用 008 的表重建模式 (SQLite 不支持 ALTER CHECK):
--   1. 关闭 FK (batches/doe_studies 引用 recipes)
--   2. 创建 _recipes_new 含新 CHECK + 新列
--   3. 复制数据
--   4. DROP + RENAME
--   5. 重建索引
--   6. 打开 FK
-- ============================================================

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS _recipes_new;

CREATE TABLE IF NOT EXISTS _recipes_new (
  recipe_id          TEXT NOT NULL,
  version            TEXT NOT NULL,
  name               TEXT NOT NULL,
  author             TEXT NOT NULL,
  target_organism    TEXT,
  vessel_config      TEXT NOT NULL,
  phases             TEXT NOT NULL,
  metadata           TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK(status IN ('draft','pending_approval','approved','archived','superseded','pending_deprecation','deprecated')),
  approved_by        TEXT,
  approved_at        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         TEXT NOT NULL,
  dag_schema_version INTEGER NOT NULL DEFAULT 1,
  is_template        INTEGER NOT NULL DEFAULT 0,
  parent_template_id TEXT,
  parent_version     TEXT,
  rejection_reason   TEXT,
  pre_deprecation_status TEXT,
  PRIMARY KEY (recipe_id, version)
);

INSERT INTO _recipes_new
  (recipe_id, version, name, author, target_organism, vessel_config, phases, metadata,
   status, approved_by, approved_at, created_at, created_by,
   dag_schema_version, is_template, parent_template_id, parent_version, rejection_reason)
SELECT
  recipe_id, version, name, author, target_organism, vessel_config, phases, metadata,
  status, approved_by, approved_at, created_at, created_by,
  dag_schema_version, is_template, parent_template_id, parent_version, rejection_reason
FROM recipes;

DROP TABLE recipes;

ALTER TABLE _recipes_new RENAME TO recipes;

-- 重建所有索引 (001 + 007 + 008)
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);
CREATE INDEX IF NOT EXISTS idx_recipes_templates
  ON recipes(recipe_id, version)
  WHERE is_template = 1;
CREATE INDEX IF NOT EXISTS idx_recipes_parent_version
  ON recipes(recipe_id, parent_version)
  WHERE parent_version IS NOT NULL;

PRAGMA foreign_keys = ON;
