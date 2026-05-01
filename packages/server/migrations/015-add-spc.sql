-- 015: SPC 控制图表 (参考 DELMIA Apriso Quality 模块)

-- SPC 控制限参数
CREATE TABLE IF NOT EXISTS spc_control_limits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  parameter_name   TEXT NOT NULL,
  chart_type       TEXT NOT NULL DEFAULT 'individual'
                   CHECK(chart_type IN ('xbar_r','individual','cusum','ewma')),
  ucl              REAL NOT NULL,
  cl               REAL NOT NULL,
  lcl              REAL NOT NULL,
  usl              REAL,
  lsl              REAL,
  subgroup_size    INTEGER DEFAULT 1,
  based_on_batches TEXT,
  valid_from       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_spc_limits_param ON spc_control_limits(parameter_name, valid_from DESC);

-- SPC 数据点
CREATE TABLE IF NOT EXISTS spc_data_points (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  parameter_name   TEXT NOT NULL,
  batch_id         TEXT NOT NULL REFERENCES batches(batch_id),
  value            REAL NOT NULL,
  out_of_control   INTEGER NOT NULL DEFAULT 0,
  rules_violated   TEXT,
  recorded_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_spc_data_param ON spc_data_points(parameter_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_spc_data_batch ON spc_data_points(batch_id);
