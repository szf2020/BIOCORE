-- ============================================================
-- 004-extend-offline-samples.sql
-- Sprint 2 M2.4: 离线取样字段扩展
--
-- 加 4 列覆盖实验室常见新分析物, 沿用既有 REAL 数值列模式
-- (用户决策: 不用 extra_analytes JSON, 列查询快, 可索引, ECharts 直接绑列名)
--
-- 命名约定:
--   biomass_g_L         = 湿重细胞浓度 (g/L) — 区别于既有 dcw_g_L (干重)
--   cell_viability_pct  = 细胞活性百分比 (0-100)
--   lactate_g_L         = 乳酸 (g/L)
--   ethanol_g_L         = 乙醇 (g/L)
-- ============================================================

ALTER TABLE offline_samples ADD COLUMN lactate_g_L REAL;
ALTER TABLE offline_samples ADD COLUMN biomass_g_L REAL;
ALTER TABLE offline_samples ADD COLUMN cell_viability_pct REAL;
ALTER TABLE offline_samples ADD COLUMN ethanol_g_L REAL;
