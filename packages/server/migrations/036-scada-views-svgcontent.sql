-- ============================================================
-- 036-scada-views-svgcontent.sql — SP-FX-34 KI-3
-- ============================================================
-- 给 scada_views 加 svgcontent 列，用于存储视图 SVG 内容。
-- ViewCard.tsx 读取此字段决定是否渲染 thumbnail。
-- backfill 默认空字符串，旧行 hasSvg = false（不破坏现有卡片）。
-- ============================================================

ALTER TABLE scada_views ADD COLUMN svgcontent TEXT NOT NULL DEFAULT '';
