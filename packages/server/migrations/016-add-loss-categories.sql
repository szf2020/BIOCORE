-- 016: OEE 时间损失分类 (参考 OEE-Designer 8类损失模型)
CREATE TABLE IF NOT EXISTS batch_loss_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  category      TEXT NOT NULL CHECK(category IN (
    'planned_downtime','unplanned_downtime','setup_changeover',
    'minor_stoppage','reduced_speed','quality_loss','no_demand','other'
  )),
  reason        TEXT NOT NULL,
  duration_min  REAL NOT NULL,
  started_at    TEXT,
  ended_at      TEXT,
  recorded_by   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loss_batch ON batch_loss_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_loss_category ON batch_loss_events(category);
