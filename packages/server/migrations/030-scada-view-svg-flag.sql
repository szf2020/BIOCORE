-- 030-scada-view-svg-flag.sql
-- Adds is_svg flag so the sub-project 1/8 SVG runtime can coexist with the
-- legacy React-widget renderer until sub-project 7 deletes the legacy path.

ALTER TABLE scada_views ADD COLUMN is_svg INTEGER NOT NULL DEFAULT 0;
