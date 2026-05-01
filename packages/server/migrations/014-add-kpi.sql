-- 014: 批次 KPI 表 (参考 DELMIA Apriso MPI 模块)
CREATE TABLE IF NOT EXISTS batch_kpis (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id         TEXT NOT NULL UNIQUE REFERENCES batches(batch_id),
  reactor_id       TEXT NOT NULL,
  recipe_id        TEXT,
  -- OEE 三要素
  availability_pct REAL,
  performance_pct  REAL,
  quality_pct      REAL,
  oee_pct          REAL,
  -- 批次 KPI
  cycle_time_h     REAL,
  yield_g          REAL,
  titer_g_L        REAL,
  throughput_g_h   REAL,
  downtime_min     REAL,
  alarm_count      INTEGER DEFAULT 0,
  hold_count       INTEGER DEFAULT 0,
  calculated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kpi_reactor ON batch_kpis(reactor_id, calculated_at DESC);
