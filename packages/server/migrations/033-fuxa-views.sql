-- ============================================================
-- 033-fuxa-views.sql — FUXA-port view storage (SP-FX-1)
-- ============================================================
-- Holds FUXA Hmi.View JSON for the React-native FUXA port. Independent
-- of scada_views (SP4-7); the two tables coexist. payload is the full
-- serialized FuxaView (see scada-engine/models/hmi.ts schemaVersion=1).
-- version is the optimistic-lock counter incremented on every UPDATE.
-- ============================================================

CREATE TABLE IF NOT EXISTS fuxa_views (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'svg',
  payload         TEXT NOT NULL,
  width           INTEGER NOT NULL,
  height          INTEGER NOT NULL,
  parent_view_id  TEXT REFERENCES fuxa_views(id) ON DELETE SET NULL,
  is_template     INTEGER NOT NULL DEFAULT 0,
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT,
  updated_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_fuxa_views_template
  ON fuxa_views(is_template) WHERE is_template = 1;

CREATE INDEX IF NOT EXISTS idx_fuxa_views_parent
  ON fuxa_views(parent_view_id) WHERE parent_view_id IS NOT NULL;
