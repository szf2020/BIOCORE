-- ============================================================
-- 007-add-recipe-v2-fields.sql
-- Sprint 3 M3.5: 配方 v2 基础字段
--
-- 给 recipes 表加 5 个新列, 为后续模块铺垫:
--   dag_schema_version  — DAG schema 版本号 (1=老线性配方, 2=新DAG格式)
--   is_template         — 是否为模板 (M3.3)
--   parent_template_id  — 实例化时记录源模板 (M3.3)
--   parent_version      — 该版本的父版本 (M3.1 版本血缘)
--   rejection_reason    — 审批被拒原因 (M3.2, 提前加列避免 M3.2 重建表丢失)
--
-- 注意: pending_approval 状态扩展放在 migration 008 (需要重建表才能改 CHECK)
-- ============================================================

ALTER TABLE recipes ADD COLUMN dag_schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN is_template        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN parent_template_id TEXT;
ALTER TABLE recipes ADD COLUMN parent_version     TEXT;
ALTER TABLE recipes ADD COLUMN rejection_reason   TEXT;

-- Partial index: 加速 "模板列表" 查询 (WHERE is_template = 1)
CREATE INDEX IF NOT EXISTS idx_recipes_templates
  ON recipes(recipe_id, version)
  WHERE is_template = 1;

-- Partial index: 加速版本血缘查询
CREATE INDEX IF NOT EXISTS idx_recipes_parent_version
  ON recipes(recipe_id, parent_version)
  WHERE parent_version IS NOT NULL;
