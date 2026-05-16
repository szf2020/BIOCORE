-- 031-scada-view-template-flag.sql
-- Adds is_template flag so view-set sub-project (SP5) can mark template views.

ALTER TABLE scada_views ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_scada_views_template
  ON scada_views(project_id, is_template)
  WHERE is_template = 1;
