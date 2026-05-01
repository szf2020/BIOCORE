-- ============================================================
-- 005-add-reactor-category.sql
-- Sprint 2 M2.5: 设备类型扩展
--
-- 加 category 字段让 reactor_configs 能容纳非发酵罐设备
-- (离心机 / 纯化 / 混料等), 为后续"设备分组显示"铺垫。
--
-- 注意:SQLite 的 ALTER TABLE ADD COLUMN 不能加 CHECK 约束,
-- 所以枚举校验放在应用层 (sqlite-service + 路由层白名单)。
--
-- 枚举值:
--   fermenter     — 发酵罐 (默认, 存量迁移兼容)
--   bioreactor    — 生物反应器
--   centrifuge    — 离心机
--   purification  — 纯化系统
--   mixer         — 混料/均质
--   other         — 其它
-- ============================================================

ALTER TABLE reactor_configs ADD COLUMN category TEXT NOT NULL DEFAULT 'fermenter';
