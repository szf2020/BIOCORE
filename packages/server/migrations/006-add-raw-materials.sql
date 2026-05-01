-- ============================================================
-- 006-add-raw-materials.sql
-- Sprint 2 M2.6: 原料库 M9(完整版本)
--
-- 全新的原料 / 试剂 / 缓冲液主数据表, 支持 MSDS PDF 上传、
-- 物性曲线 (JSON)、软删除、审计。
--
-- 设计决策:
--   material_id = `RM-${nanoid(8)}` — 可读 + 全局唯一 + 跨环境迁移友好
--   physical_properties JSON — 含密度、粘度曲线 [(T,viscosity)]、操作范围
--   msds_filename — 只存文件名, 实际文件在 data/uploads/msds/ 目录
--   deleted_at — 软删除, LIST 端点 WHERE deleted_at IS NULL
-- ============================================================

CREATE TABLE IF NOT EXISTS raw_materials (
  material_id    TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,       -- 'media' / 'buffer' / 'reagent' / 'substrate' / 'additive' / 'other'
  supplier       TEXT,
  catalog_no     TEXT,
  unit           TEXT,                -- 'kg' / 'L' / 'g' / 'mL' / 'pcs'
  cost_per_unit  REAL,
  storage        TEXT,                -- '4°C' / '-20°C' / 'RT' / 'dry'
  physical_properties TEXT,           -- JSON: { density, viscosity_curve: [[T,v],...], pH_range, operating_temp_range }
  msds_filename  TEXT,                -- 上传到 data/uploads/msds/ 的文件名 (含扩展名)
  msds_uploaded_at TEXT,              -- ISO timestamp
  notes          TEXT,
  created_by     TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  deleted_at     TEXT                 -- 软删除标记
);

-- Partial indexes 只对未删除行建索引, 加速 LIST + 按 category 过滤
CREATE INDEX IF NOT EXISTS idx_raw_materials_category
  ON raw_materials(category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_raw_materials_name
  ON raw_materials(name)
  WHERE deleted_at IS NULL;
