-- ============================================================
-- 001-baseline-schema.sql
-- BIOCore SQLite 业务数据库初始 schema (18 张表)
--
-- 此文件由 packages/data-service/src/sqlite-service.ts:18-336 的
-- initSchema() 完整迁移而来. 后续 schema 改动通过新增 migration 文件,
-- 不再修改 sqlite-service.ts.
--
-- baseline 检测: 若数据库已含 users + recipes + audit_logs 三张表,
-- 此 migration 自动标记为 already-run 不实际执行 (兼容旧数据库)
-- ============================================================

-- ═══ 用户与权限 ═══
CREATE TABLE IF NOT EXISTS users (
  user_id       TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('admin','engineer','operator','viewer')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1
);

-- ═══ 配方版本管理 ═══
CREATE TABLE IF NOT EXISTS recipes (
  recipe_id     TEXT NOT NULL,
  version       TEXT NOT NULL,
  name          TEXT NOT NULL,
  author        TEXT NOT NULL,
  target_organism TEXT,
  vessel_config TEXT NOT NULL,
  phases        TEXT NOT NULL,
  metadata      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','approved','archived','superseded')),
  approved_by   TEXT,
  approved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL,
  PRIMARY KEY (recipe_id, version)
);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);

-- ═══ 批次主记录 ═══
CREATE TABLE IF NOT EXISTS batches (
  batch_id      TEXT PRIMARY KEY,
  recipe_id     TEXT NOT NULL,
  recipe_version TEXT NOT NULL,
  reactor_id    TEXT NOT NULL DEFAULT 'F01',
  organism      TEXT,
  operator_id   TEXT NOT NULL,
  started_at    TEXT,
  ended_at      TEXT,
  current_state TEXT NOT NULL DEFAULT 'idle'
                CHECK(current_state IN ('idle','running','held','paused','stopped','complete')),
  current_phase_index  INTEGER DEFAULT 0,
  current_phase_id     TEXT,
  current_phase_type   TEXT,
  current_step_number  INTEGER DEFAULT 0,
  total_phases         INTEGER,
  state_snapshot TEXT,
  hold_reason   TEXT,
  stop_trigger  TEXT CHECK(stop_trigger IN ('cmd_stop','safety_estop')),
  outcome       TEXT CHECK(outcome IN ('success','partial','failed','stopped')),
  summary_text  TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recipe_id, recipe_version) REFERENCES recipes(recipe_id, version)
);
CREATE INDEX IF NOT EXISTS idx_batches_time ON batches(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_state ON batches(current_state);

-- ═══ 状态流转日志 ═══
CREATE TABLE IF NOT EXISTS state_transitions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  from_state    TEXT NOT NULL,
  to_state      TEXT NOT NULL,
  event         TEXT NOT NULL,
  phase_id      TEXT,
  step_number   INTEGER,
  triggered_by  TEXT NOT NULL,
  context       TEXT,
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_st_batch ON state_transitions(batch_id, timestamp);

-- ═══ 不可篡改审计日志 ═══
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT,
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  ip_address    TEXT,
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_batch ON audit_logs(batch_id, timestamp);

CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs禁止UPDATE'); END;

CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs禁止DELETE'); END;

-- ═══ 报警历史 ═══
CREATE TABLE IF NOT EXISTS alarms (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT,
  alarm_code    TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK(severity IN ('info','warning','critical','emergency')),
  source        TEXT NOT NULL,
  channel       TEXT,
  message       TEXT NOT NULL,
  pv_at_trigger REAL,
  sv_at_trigger REAL,
  triggered_at  TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  resolved_at   TEXT,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_alarms_batch ON alarms(batch_id, triggered_at);
CREATE INDEX IF NOT EXISTS idx_alarms_unack ON alarms(acknowledged_at) WHERE acknowledged_at IS NULL;

-- ═══ Phase执行记录 ═══
CREATE TABLE IF NOT EXISTS phase_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL REFERENCES batches(batch_id),
  phase_index     INTEGER NOT NULL,
  phase_id        TEXT NOT NULL,
  phase_type      TEXT NOT NULL,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  elapsed_sec     REAL,
  total_steps     INTEGER,
  completed_steps INTEGER,
  result          TEXT CHECK(result IN ('completed','interrupted','failed')),
  entry_snapshot  TEXT,
  exit_snapshot   TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_phase_batch ON phase_logs(batch_id, phase_index);

-- ═══ Step执行记录 ═══
CREATE TABLE IF NOT EXISTS step_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL REFERENCES batches(batch_id),
  phase_index     INTEGER NOT NULL,
  phase_id        TEXT NOT NULL,
  phase_type      TEXT NOT NULL,
  step_number     INTEGER NOT NULL,
  step_name       TEXT NOT NULL,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  elapsed_sec     REAL,
  condition_type  TEXT,
  condition_channel TEXT,
  condition_target REAL,
  condition_actual REAL,
  result          TEXT CHECK(result IN ('completed','timeout','interrupted','failed')),
  entry_snapshot  TEXT,
  exit_snapshot   TEXT,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_step_batch ON step_logs(batch_id, phase_index, step_number);

-- ═══ 传感器校准 ═══
CREATE TABLE IF NOT EXISTS calibrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel       TEXT NOT NULL,
  sensor_type   TEXT NOT NULL,
  cal_point_low_raw   REAL,
  cal_point_low_eng   REAL,
  cal_point_high_raw  REAL,
  cal_point_high_eng  REAL,
  do_zero_offset      REAL,
  do_slope            REAL,
  do_barometric_mbar  REAL,
  calibrated_by TEXT NOT NULL,
  calibrated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_cal_channel ON calibrations(channel, calibrated_at DESC);

-- ═══ 通讯事件日志 ═══
CREATE TABLE IF NOT EXISTS comm_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT,
  connection_id TEXT NOT NULL,
  event_type    TEXT NOT NULL CHECK(event_type IN ('comm_loss','comm_restored','safety_timeout')),
  reason        TEXT,
  pc_counter    INTEGER,
  plc_counter   INTEGER,
  downtime_s    INTEGER,
  auto_held     INTEGER DEFAULT 1,
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_events_batch ON comm_events(batch_id, timestamp);

-- ═══ 事件检测记录 ═══
CREATE TABLE IF NOT EXISTS batch_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  event_type    TEXT NOT NULL,
  detected_at   TEXT NOT NULL DEFAULT (datetime('now')),
  elapsed_h     REAL,
  detector      TEXT NOT NULL,
  snapshot      TEXT NOT NULL,
  confidence    REAL,
  action_taken  TEXT,
  action_ref_id TEXT,
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_batch ON batch_events(batch_id, detected_at);

-- ═══ 离线取样 ═══
CREATE TABLE IF NOT EXISTS offline_samples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  sample_time   TEXT NOT NULL,
  elapsed_h     REAL,
  od600         REAL,
  dcw_g_L       REAL,
  glucose_g_L   REAL,
  acetate_g_L   REAL,
  product_titer REAL,
  product_unit  TEXT,
  extra_analytes TEXT,
  sampled_by    TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_samples_batch ON offline_samples(batch_id, sample_time);

-- ═══ AI建议缓冲区 ═══
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  suggestion_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  target_param  TEXT NOT NULL,
  current_value REAL,
  suggested_value REAL,
  confidence    REAL,
  reasoning     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','accepted','rejected','expired','superseded')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,
  decided_by    TEXT,
  decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_suggestions_pending ON ai_suggestions(batch_id, status)
  WHERE status = 'pending';

-- ═══ AI会话 ═══
CREATE TABLE IF NOT EXISTS ai_sessions (
  session_id    TEXT PRIMARY KEY,
  batch_id      TEXT,
  user_id       TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'ollama',
  model_name    TEXT NOT NULL DEFAULT 'qwen2.5:7b',
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES ai_sessions(session_id),
  role          TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
  content       TEXT NOT NULL,
  flux_query    TEXT,
  flux_result   TEXT,
  tokens_used   INTEGER,
  latency_ms    INTEGER,
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_msg_session ON ai_messages(session_id, timestamp);

-- ═══ Phase模板注册表 ═══
CREATE TABLE IF NOT EXISTS phase_templates (
  type            TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  icon            TEXT,
  color           TEXT,
  category        TEXT DEFAULT '自定义',
  description     TEXT,
  fixed_steps     INTEGER NOT NULL DEFAULT 0,
  default_params  TEXT NOT NULL DEFAULT '{}',
  param_schema    TEXT NOT NULL DEFAULT '[]',
  steps           TEXT NOT NULL DEFAULT '[]',
  plc_mappings    TEXT NOT NULL DEFAULT '{}',
  sort_order      INTEGER DEFAULT 0,
  is_system       INTEGER DEFAULT 1
);

-- ═══ 反应器/设备配置 ═══
CREATE TABLE IF NOT EXISTS reactor_configs (
  reactor_id        TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT DEFAULT '',
  vessel_volume_L   REAL DEFAULT 5,
  plc_connection_id TEXT,
  plc_protocol      TEXT DEFAULT 's7' CHECK(plc_protocol IN ('s7','modbus_tcp','modbus_rtu')),
  plc_ip            TEXT DEFAULT '192.168.2.1',
  plc_port          INTEGER DEFAULT 102,
  plc_rack          INTEGER DEFAULT 0,
  plc_slot          INTEGER DEFAULT 1,
  heartbeat_write   TEXT DEFAULT 'VB400',
  heartbeat_read    TEXT DEFAULT 'VB401',
  enabled           INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
