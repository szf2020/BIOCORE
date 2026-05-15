-- SCADA 项目 + 视图 schema (子项目 1/7)
-- spec: docs/superpowers/specs/2026-05-14-scada-data-model-api-design.md

CREATE TABLE IF NOT EXISTS scada_projects (
  project_id  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scada_views (
  view_id       TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES scada_projects(project_id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  reactor_id    TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 1280,
  height        INTEGER NOT NULL DEFAULT 720,
  background    TEXT NOT NULL DEFAULT '#ffffff',
  items_json    TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scada_views_project ON scada_views(project_id);
CREATE INDEX IF NOT EXISTS idx_scada_views_reactor ON scada_views(reactor_id);
