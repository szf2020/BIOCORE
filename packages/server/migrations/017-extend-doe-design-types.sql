-- 017: 扩展 DOE 设计类型 (新增 orthogonal/uniform/plackett_burman/box_behnken)
-- SQLite 不支持 ALTER TABLE DROP CONSTRAINT, 需要重建表

-- 1. 临时表保存数据
CREATE TABLE IF NOT EXISTS doe_studies_backup AS SELECT * FROM doe_studies;

-- 2. 删除旧表
DROP TABLE IF EXISTS doe_studies;

-- 3. 重建表 (扩展 CHECK 约束)
CREATE TABLE doe_studies (
  study_id              TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  base_recipe_id        TEXT,
  base_recipe_version   TEXT,
  design_type           TEXT NOT NULL
                        CHECK(design_type IN ('full_factorial','fractional_factorial','ccd','latin_hypercube','bayesian',
                              'orthogonal','uniform','plackett_burman','box_behnken','definitive_screening')),
  factors               TEXT NOT NULL,
  responses             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK(status IN ('draft','designed','running','completed','archived')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  created_by            TEXT NOT NULL,
  updated_at            TEXT
);

-- 4. 恢复数据
INSERT OR IGNORE INTO doe_studies SELECT * FROM doe_studies_backup;

-- 5. 清理
DROP TABLE IF EXISTS doe_studies_backup;

-- 6. 重建索引
CREATE INDEX IF NOT EXISTS idx_doe_studies_status  ON doe_studies(status);
CREATE INDEX IF NOT EXISTS idx_doe_studies_created ON doe_studies(created_at DESC);
