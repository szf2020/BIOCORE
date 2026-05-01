# BIOCore 技术规格书：数据库Schema详设

> 本文档是 [BIOCore产品规划主文档](00_BIOCore_产品规划主文档.md) 的技术子文档
> 定义SQLite业务库和InfluxDB时序库的完整数据结构、索引策略、约束规则与备份方案
> 相关文档：[PLC硬件规格](01_PLC硬件规格.md) | [AI架构](02_AI架构.md) | [配方JSON规范](04_配方JSON规范.md) | [ISA-88状态机规格](06_ISA-88状态机规格.md)

---

## 一、SQLite 业务数据库

文件路径：`./data/biocore.db`，WAL模式，单文件部署。

### 1.1 users — 用户与权限

```sql
CREATE TABLE users (
  user_id       TEXT PRIMARY KEY,            -- UUID v4
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,               -- bcrypt
  role          TEXT NOT NULL CHECK(role IN ('admin','engineer','operator','viewer')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1
);
```

**角色权限矩阵：**

| 操作 | admin | engineer | operator | viewer |
|------|-------|----------|----------|--------|
| 创建/编辑配方 | ✓ | ✓ | ✗ | ✗ |
| 启动/停止批次 | ✓ | ✓ | ✓ | ✗ |
| 修改PID参数(在线) | ✓ | ✓ | ✗ | ✗ |
| 采纳AI建议 | ✓ | ✓ | ✓ | ✗ |
| Hold/Resume/Pause | ✓ | ✓ | ✓ | ✗ |
| 查看Dashboard | ✓ | ✓ | ✓ | ✓ |
| 导出数据 | ✓ | ✓ | ✓ | ✓ |
| 用户管理 | ✓ | ✗ | ✗ | ✗ |
| 校准传感器 | ✓ | ✓ | ✗ | ✗ |

---

### 1.2 recipes — 配方版本管理

```sql
CREATE TABLE recipes (
  recipe_id     TEXT NOT NULL,               -- 如 "ECOLI_FEDBATCH_V1"
  version       TEXT NOT NULL,               -- semver，如 "1.0.0"
  name          TEXT NOT NULL,
  author        TEXT NOT NULL,
  target_organism TEXT,
  vessel_config TEXT NOT NULL,               -- JSON: vessel对象
  phases        TEXT NOT NULL,               -- JSON: phases数组（完整配方体）
  metadata      TEXT,                        -- JSON: 自定义标签/备注
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK(status IN ('draft','approved','archived','superseded')),
  approved_by   TEXT REFERENCES users(user_id),
  approved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT NOT NULL REFERENCES users(user_id),
  PRIMARY KEY (recipe_id, version)
);

-- 索引：按状态快速筛选可用配方
CREATE INDEX idx_recipes_status ON recipes(status);
```

**配方状态流转：** `draft → approved → (superseded | archived)`。只有`approved`状态的配方可被批次引用。新版本发布时旧版本自动标记为`superseded`。

**配方JSON存储说明：** `phases`字段存储完整的配方phases数组（JSON格式），包含每个Phase的type和params。Step序列不存储在配方中——它们硬编码在batch-engine的`step-definitions.ts`中，由Phase类型决定。

---

### 1.3 batches — 批次主记录

```sql
CREATE TABLE batches (
  batch_id      TEXT PRIMARY KEY,            -- 格式: BATCH-YYYYMMDD-NNN
  recipe_id     TEXT NOT NULL,
  recipe_version TEXT NOT NULL,
  reactor_id    TEXT NOT NULL DEFAULT 'F01',
  organism      TEXT,
  operator_id   TEXT NOT NULL REFERENCES users(user_id),
  
  -- 批次时间轴
  started_at    TEXT,                        -- Running进入时间
  ended_at      TEXT,                        -- Complete/Stopped进入时间
  
  -- 状态机（6个状态）
  current_state TEXT NOT NULL DEFAULT 'idle'
                CHECK(current_state IN (
                  'idle','running','held','paused','stopped','complete'
                )),
  
  -- Phase/Step追踪
  current_phase_index  INTEGER DEFAULT 0,    -- 配方中Phase的序号(0-based)
  current_phase_id     TEXT,                 -- 当前Phase ID
  current_phase_type   TEXT,                 -- 当前Phase类型
  current_step_number  INTEGER DEFAULT 0 CHECK(current_step_number BETWEEN 0 AND 255),
  total_phases         INTEGER,              -- 配方Phase总数
  
  -- XState持久化快照（崩溃恢复用）
  state_snapshot TEXT,                       -- JSON: XState完整快照
  
  -- Hold相关
  hold_reason   TEXT,                        -- 最近一次Hold的原因
  
  -- 停机来源
  stop_trigger  TEXT CHECK(stop_trigger IN ('cmd_stop', 'safety_estop')),
  
  -- 批次结果
  outcome       TEXT CHECK(outcome IN ('success','partial','failed','stopped')),
  summary_text  TEXT,                        -- AI生成的批次摘要（本地Ollama）
  notes         TEXT,                        -- 操作员手动备注
  
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (recipe_id, recipe_version) REFERENCES recipes(recipe_id, version)
);

CREATE INDEX idx_batches_time ON batches(started_at DESC);
CREATE INDEX idx_batches_state ON batches(current_state);
```

---

### 1.4 state_transitions — 状态机流转日志

```sql
CREATE TABLE state_transitions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  from_state    TEXT NOT NULL,
  to_state      TEXT NOT NULL,
  event         TEXT NOT NULL,               -- 触发事件名，如 'cmd_start','runningfault','safety_estop'
  phase_id      TEXT,                        -- 相关的Phase ID
  step_number   INTEGER,                     -- 相关的Step编号
  triggered_by  TEXT NOT NULL,               -- 'operator:<user_id>' | 'engine:auto' | 'safety:interlock' | 'fault:<RF-xx>'
  context       TEXT,                        -- JSON: 附加上下文（报警详情、Phase切换原因等）
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_st_batch ON state_transitions(batch_id, timestamp);
```

---

### 1.5 audit_logs — 不可篡改审计日志

```sql
CREATE TABLE audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT,                        -- 可为NULL（系统级操作）
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,               -- 枚举见下方
  target_type   TEXT NOT NULL,               -- 'pid_param' | 'recipe' | 'batch' | 'ai_suggestion' | 'calibration'
  target_id     TEXT,
  old_value     TEXT,                        -- JSON: 修改前的值
  new_value     TEXT,                        -- JSON: 修改后的值
  reason        TEXT,                        -- 操作员填写的变更原因
  ip_address    TEXT,
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ★ 不可篡改约束：触发器禁止UPDATE和DELETE
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs表禁止UPDATE操作');
END;

CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs表禁止DELETE操作');
END;

CREATE INDEX idx_audit_batch ON audit_logs(batch_id, timestamp);
CREATE INDEX idx_audit_user ON audit_logs(user_id, timestamp);
```

**action枚举值：**

| action | 含义 |
|--------|------|
| `pid_param_change` | 在线修改PID参数（Kp/Ki/Kd/死区） |
| `sv_change` | 修改设定值（温度SV/pH SV/DO SV等） |
| `mode_switch` | 手动/自动模式切换 |
| `batch_start` | 启动批次 |
| `batch_hold` | Hold批次 |
| `batch_restart` | 从Held恢复(Restart)批次 |
| `batch_pause` | 暂停(Pause)批次 |
| `batch_unpause` | 从Paused恢复(Unpause)批次 |
| `batch_stop` | 停止(Stop)批次 |
| `batch_reset` | 复位(Reset)批次 |
| `ai_suggestion_accept` | 采纳AI建议 |
| `ai_suggestion_reject` | 拒绝AI建议 |
| `recipe_create` | 创建配方 |
| `recipe_approve` | 批准配方 |
| `calibration_update` | 更新传感器校准参数 |
| `user_login` | 用户登录 |
| `alarm_ack` | 确认报警 |

---

### 1.6 alarms — 报警历史

```sql
CREATE TABLE alarms (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT REFERENCES batches(batch_id),
  alarm_code    TEXT NOT NULL,               -- 如 'RF-01','IL-05','CUSUM_DO'
  severity      TEXT NOT NULL CHECK(severity IN ('info','warning','critical','emergency')),
  source        TEXT NOT NULL,               -- 'plc:interlock' | 'node:runningfault' | 'node:cusum' | 'node:event_detector'
  channel       TEXT,                        -- 相关I/O通道，如 'AI-0','Q0.4'
  message       TEXT NOT NULL,
  pv_at_trigger REAL,                        -- 触发时的过程值
  sv_at_trigger REAL,                        -- 触发时的设定值
  
  triggered_at  TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  acknowledged_by TEXT REFERENCES users(user_id),
  resolved_at   TEXT,
  resolution_note TEXT
);

CREATE INDEX idx_alarms_batch ON alarms(batch_id, triggered_at);
CREATE INDEX idx_alarms_unack ON alarms(acknowledged_at) WHERE acknowledged_at IS NULL;
```

**severity分级与系统响应：**

| 级别 | 含义 | 系统响应 | 示例 |
|------|------|---------|------|
| `info` | 信息记录 | 仅记录，不弹窗 | 延迟期结束检测 |
| `warning` | 软报警 | Dashboard橙色弹窗 + 声音提示 | CUSUM异常、IL-10蒸汽压力偏低 |
| `critical` | 硬报警 | 红色弹窗 + Hold状态 + Q1.0声光报警 | pH失控(RF-04)、变频器故障(RF-01) |
| `emergency` | 紧急停机 | PLC安全连锁接管 + Stopped | 罐温>130°C、急停按钮(ESTOP) |

---

### 1.7 calibrations — 传感器校准记录

```sql
CREATE TABLE calibrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel       TEXT NOT NULL,               -- 'AI-2'(pH), 'AI-3'(DO)等
  sensor_type   TEXT NOT NULL,               -- 'pH','DO','temperature','pressure','weight'
  
  -- 校准参数（两点线性校准）
  cal_point_low_raw   REAL,                  -- 低点原始值(mA)
  cal_point_low_eng   REAL,                  -- 低点工程值
  cal_point_high_raw  REAL,                  -- 高点原始值(mA)
  cal_point_high_eng  REAL,                  -- 高点工程值
  
  -- DO特有校准
  do_zero_offset      REAL,                  -- 零氧校准偏移
  do_slope            REAL,                  -- 斜率校准系数
  do_barometric_mbar  REAL,                  -- 校准时大气压
  
  calibrated_by TEXT NOT NULL REFERENCES users(user_id),
  calibrated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,                        -- 校准有效期
  notes         TEXT
);

CREATE INDEX idx_cal_channel ON calibrations(channel, calibrated_at DESC);
```

---

### 1.8 ai_sessions — AI对话会话

```sql
CREATE TABLE ai_sessions (
  session_id    TEXT PRIMARY KEY,            -- UUID v4
  batch_id      TEXT REFERENCES batches(batch_id),
  user_id       TEXT NOT NULL REFERENCES users(user_id),
  provider      TEXT NOT NULL DEFAULT 'ollama'
                CHECK(provider IN ('ollama','anthropic','openai')),
  model_name    TEXT NOT NULL,               -- 如 'qwen2.5:7b'
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0
);

CREATE TABLE ai_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL REFERENCES ai_sessions(session_id),
  role          TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
  content       TEXT NOT NULL,
  flux_query    TEXT,                        -- 如果是NL→Flux，存储生成的Flux语句
  flux_result   TEXT,                        -- Flux查询结果摘要(JSON)
  tokens_used   INTEGER,
  latency_ms    INTEGER,                     -- 响应耗时
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_msg_session ON ai_messages(session_id, timestamp);
```

---

### 1.9 ai_suggestions — AI建议缓冲区

```sql
CREATE TABLE ai_suggestions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  suggestion_type TEXT NOT NULL,             -- 'feed_rate','pid_param','phase_switch','do_strategy'
  source_module TEXT NOT NULL,               -- 'feed-advisor' | 'root-cause' | 'cusum' | 'ml-pid'
  
  -- 建议内容
  target_param  TEXT NOT NULL,               -- 目标参数，如 'P02_feed_rate_mL_h'
  current_value REAL,
  suggested_value REAL,
  confidence    REAL,                        -- 0.0~1.0
  reasoning     TEXT,                        -- JSON或自然语言：建议理由
  
  -- 生命周期
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending','accepted','rejected','expired','superseded')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT,                        -- 建议过期时间（默认创建后30min）
  decided_by    TEXT REFERENCES users(user_id),
  decided_at    TEXT
);

CREATE INDEX idx_suggestions_pending ON ai_suggestions(batch_id, status)
  WHERE status = 'pending';
```

---

### 1.10 offline_samples — 离线取样数据

```sql
CREATE TABLE offline_samples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  sample_time   TEXT NOT NULL,               -- 取样时间（操作员手动输入）
  elapsed_h     REAL,                        -- 发酵经过时间(h)，由系统自动计算
  
  -- 离线分析值（全部可选，按实际检测项填写）
  od600         REAL,                        -- 光密度
  dcw_g_L       REAL,                        -- 干细胞重(g/L)
  glucose_g_L   REAL,                        -- 残糖浓度(g/L)
  acetate_g_L   REAL,                        -- 乙酸浓度(g/L)
  product_titer REAL,                        -- 目标产物效价
  product_unit  TEXT,                        -- 产物单位，如 'g/L','U/mL','mg/L'
  
  -- 其他可选指标（JSON扩展）
  extra_analytes TEXT,                       -- JSON: {"ethanol_g_L": 0.5, "NH4_mM": 12}
  
  sampled_by    TEXT NOT NULL REFERENCES users(user_id),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_samples_batch ON offline_samples(batch_id, sample_time);
```

---

### 1.11 batch_events — 事件检测记录

```sql
CREATE TABLE batch_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT NOT NULL REFERENCES batches(batch_id),
  event_type    TEXT NOT NULL,               -- 枚举见下方
  detected_at   TEXT NOT NULL DEFAULT (datetime('now')),
  elapsed_h     REAL,                        -- 发酵经过时间
  detector      TEXT NOT NULL,               -- 'event_detector' | 'cusum' | 'operator_manual'
  
  -- 事件上下文快照
  snapshot      TEXT NOT NULL,               -- JSON: 检测时刻的多参数快照
  confidence    REAL,                        -- 0.0~1.0，算法置信度
  
  -- 关联动作
  action_taken  TEXT,                        -- 'phase_transition' | 'alarm_raised' | 'suggestion_created' | 'none'
  action_ref_id TEXT,                        -- 关联的state_transitions.id 或 ai_suggestions.id
  
  notes         TEXT
);

CREATE INDEX idx_events_batch ON batch_events(batch_id, detected_at);
```

**event_type枚举：** `lag_phase_end`, `do_spike`, `overflow_metabolism`, `log_phase_end`, `foam_event`, `ph_runaway`, `temp_runaway`, `vfd_fault`, `feed_depletion`, `substrate_accumulation`

---

### 1.12 phase_logs — Phase执行记录

```sql
CREATE TABLE phase_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL REFERENCES batches(batch_id),
  phase_index     INTEGER NOT NULL,          -- 配方中Phase的序号(0-based)
  phase_id        TEXT NOT NULL,             -- 如 'SIP', 'FED_BATCH'
  phase_type      TEXT NOT NULL CHECK(phase_type IN (
                    'prepare','water_fill','manual_add','heating',
                    'agitation','feeding','temp_control','ph_control',
                    'do_control','aeration','discharge','fermentation',
                    'cip','sip'
                  )),
  
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  elapsed_sec     REAL,                      -- 实际执行秒数
  total_steps     INTEGER,                   -- Phase包含的总步数
  completed_steps INTEGER,                   -- 已完成的步数
  
  result          TEXT CHECK(result IN (
                    'completed','interrupted','failed'
                  )),
  
  entry_snapshot  TEXT,                      -- JSON: Phase开始时的过程值快照
  exit_snapshot   TEXT,                      -- JSON: Phase结束时的过程值快照
  notes           TEXT
);

CREATE INDEX idx_phase_batch ON phase_logs(batch_id, phase_index);
```

---

### 1.13 step_logs — Step执行记录

```sql
CREATE TABLE step_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id        TEXT NOT NULL REFERENCES batches(batch_id),
  
  -- Phase定位
  phase_index     INTEGER NOT NULL,
  phase_id        TEXT NOT NULL,
  phase_type      TEXT NOT NULL,
  
  -- Step定位
  step_number     INTEGER NOT NULL CHECK(step_number BETWEEN 1 AND 255),
  step_name       TEXT NOT NULL,
  
  -- 时间
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  elapsed_sec     REAL,
  
  -- 完成条件
  condition_type  TEXT,                      -- '>=', '<=', 'in_band', 'duration', 'accumulated', 'delta', 'and', 'or'
  condition_channel TEXT,                    -- 'AI-0', 'AI-6' 等
  condition_target REAL,                     -- 设定值
  condition_actual REAL,                     -- 满足条件时的实际PV值
  
  -- 结果
  result          TEXT CHECK(result IN (
                    'completed','timeout','interrupted','failed'
                  )),
  
  -- 快照
  entry_snapshot  TEXT,                      -- JSON: Step开始时的过程值
  exit_snapshot   TEXT,                      -- JSON: Step完成时的过程值
  
  notes           TEXT
);

CREATE INDEX idx_step_batch ON step_logs(batch_id, phase_index, step_number);
```

---

## 二、InfluxDB 时序数据库

### 2.1 组织结构

| 层级 | 值 | 说明 |
|------|-----|------|
| Organization | `biocore` | 单组织 |
| Bucket | `fermentation` | 所有发酵相关时序数据 |
| Retention | 原始数据365天；降采样永久归档 | 见2.5节 |

---

### 2.2 Measurement: `process_data` — 传感器原始数据

**写入频率：** 每分钟1条（Node.js collector.js从1秒内存环形缓冲区取均值后写入）

**Tags（索引维度）：**

| Tag Key | 示例值 | 说明 |
|---------|--------|------|
| `batch_id` | `BATCH-20260404-001` | 批次号 |
| `reactor_id` | `F01` | 反应器编号 |

**Fields（数值，不索引）：**

| Field Key | 类型 | 单位 | 来源 |
|-----------|------|------|------|
| `temperature` | float | °C | AI-0 |
| `jacket_temp` | float | °C | AI-1 |
| `pH` | float | — | AI-2 |
| `DO` | float | % | AI-3 |
| `pressure` | float | bar | AI-4 |
| `airflow` | float | NL/min | AI-5 |
| `weight` | float | kg | AI-6 |
| `rpm` | float | rpm | VFD RS232 |
| `vfd_current` | float | A | VFD RS232 |
| `steam_valve` | float | % | AO-0 CV |
| `cool_valve` | float | % | AO-1 CV |
| `air_valve` | float | % | AO-2 CV |
| `feed_rate_P01` | float | mL/h | Q0.0 PWM换算 |
| `feed_rate_P02` | float | mL/h | Q0.1 PWM换算 |
| `feed_rate_P03` | float | mL/h | Q0.2 PWM换算 |
| `feed_rate_P04` | float | mL/h | Q0.3 PWM换算 |
| `temp_sv` | float | °C | 当前温度设定值 |
| `pH_sv` | float | — | 当前pH设定值 |
| `DO_sv` | float | % | 当前DO设定值 |
| `temp_mode` | int | — | 0=保温, 1=加热, 2=冷却 |
| `phase_index` | int | — | 当前Phase序号 |
| `step_number` | int | — | 当前Step编号 |

---

### 2.3 Measurement: `calculated_params` — 软件测算值

**写入频率：** 每分钟1次（与process_data同步）

**Tags：** 同 `process_data`（batch_id, reactor_id）

**Fields：**

| Field Key | 类型 | 单位 | 计算方法 | 参考文档 |
|-----------|------|------|---------|---------|
| `OUR` | float | mmol/L/h | kLa × (DO* - DO) | 03_工艺控制 2.6.1 |
| `kLa` | float | 1/h | Van't Riet关联式 | 03_工艺控制 2.6.1 |
| `Vs` | float | m/s | airflow / 截面积 | 03_工艺控制 2.6.1 |
| `cum_feed_P02` | float | mL | Σ(P02速率×Δt) | — |
| `cum_base_P01` | float | mL | Σ(P01碱速率×Δt) | — |
| `cum_acid_P04` | float | mL | Σ(P04酸速率×Δt) | — |
| `liquid_volume` | float | L | 初始+补料+补碱-取样 | 03_工艺控制 2.6.1 |
| `mu_estimated` | float | 1/h | d(ln(OUR))/dt | 03_工艺控制 2.6.1 |
| `base_consumption_rate` | float | mL/h | 碱消耗速率滑窗回归 | 03_工艺控制 2.6.3 |
| `F0` | float | min | Σ10^((T-121)/z)×Δt | 仅SIP阶段 |

---

### 2.4 Measurement: `soft_sensor` — AI软测量估算值（v2.0）

**写入频率：** 每分钟1次

**Tags：** batch_id, reactor_id, `model_id`（模型版本标识）

**Fields：**

| Field Key | 类型 | 单位 | 说明 |
|-----------|------|------|------|
| `OD_estimated` | float | — | ONNX模型推断的OD600 |
| `OD_ci_lower` | float | — | 95%置信区间下界 |
| `OD_ci_upper` | float | — | 95%置信区间上界 |
| `glucose_estimated` | float | g/L | 残糖推断 |
| `glucose_ci_lower` | float | g/L | 下界 |
| `glucose_ci_upper` | float | g/L | 上界 |
| `model_r2` | float | — | 训练时的R²值 |
| `is_extrapolating` | int | — | 1=当前特征超出训练范围 |

---

### 2.5 Retention & 降采样策略

```
原始数据（1min分辨率）
  └─ Retention: 365天自动过期
  
降采样任务（InfluxDB Task，每小时运行）:
  process_data → process_data_5m（5分钟均值聚合）
  calculated_params → calculated_params_5m
  soft_sensor → soft_sensor_5m
  
  └─ 目标Bucket: fermentation_archive
  └─ Retention: 永久保留(infinite)
  
降采样Flux示例:
  option task = {name: "downsample_5m", every: 1h}
  from(bucket: "fermentation")
    |> range(start: -task.every)
    |> filter(fn: (r) => r._measurement == "process_data")
    |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
    |> to(bucket: "fermentation_archive")
```

---

### 2.6 备份策略

| 数据 | 方法 | 频率 | 保留 |
|------|------|------|------|
| SQLite `biocore.db` | `sqlite3 .backup` 命令复制WAL检查点后的完整文件 | 每日凌晨 + 每批次结束时 | 本地保留30天 |
| InfluxDB | `influx backup` 全量导出 | 每周一次 | 本地保留4份 |
| 配方JSON | 随SQLite备份（嵌入在recipes表中） | 同上 | 同上 |
| ONNX模型文件 | 文件复制 `./models/` 目录 | 每次训练后自动 | 保留最近5个版本 |

---


---

### 新增表 (v2)

#### comm_events — 通讯断线/恢复事件日志

```sql
CREATE TABLE comm_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id      TEXT,                        -- 关联批次（可为NULL）
  connection_id TEXT NOT NULL,               -- PLC连接ID
  event_type    TEXT NOT NULL CHECK(event_type IN ('comm_loss','comm_restored','safety_timeout')),
  reason        TEXT,                        -- 断线原因
  pc_counter    INTEGER,                     -- 断线时PC端计数器值
  plc_counter   INTEGER,                     -- 断线时PLC端计数器值
  downtime_s    INTEGER,                     -- 断线持续秒数（仅restored事件）
  auto_held     INTEGER DEFAULT 1,           -- 是否触发了自动Hold
  timestamp     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_comm_events_batch ON comm_events(batch_id, timestamp);
```

#### plc_connections — PLC连接配置 (v2更新: 增加协议和双向心跳字段)

```sql
CREATE TABLE plc_connections (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  protocol                TEXT NOT NULL DEFAULT 's7' CHECK(protocol IN ('s7','modbus_tcp','modbus_rtu')),
  ip                      TEXT NOT NULL,
  port                    INTEGER NOT NULL DEFAULT 102,
  rack                    INTEGER DEFAULT 0,
  slot                    INTEGER DEFAULT 1,
  serial_port             TEXT,              -- Modbus RTU: '/dev/ttyUSB0' 或 'COM3'
  baudrate                INTEGER DEFAULT 9600,
  parity                  TEXT DEFAULT 'even',
  slave_id                INTEGER DEFAULT 1,
  heartbeat_write_address TEXT NOT NULL DEFAULT 'VB400',  -- PC→PLC
  heartbeat_read_address  TEXT NOT NULL DEFAULT 'VB401',  -- PLC→PC (v2新增)
  heartbeat_timeout_ms    INTEGER NOT NULL DEFAULT 3000,
  reconnect_interval_ms   INTEGER NOT NULL DEFAULT 5000,
  enabled                 INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### phase_templates — Phase模板注册表 (v2新增, 支持可配置Phase)

```sql
CREATE TABLE phase_templates (
  type            TEXT PRIMARY KEY,          -- 'prepare','sip','fermentation'等
  label           TEXT NOT NULL,             -- 中文显示名
  icon            TEXT,                      -- lucide图标名
  color           TEXT,                      -- 颜色标识
  description     TEXT,                      -- 说明文本
  fixed_steps     INTEGER NOT NULL,          -- 硬编码Step数量
  default_params  TEXT NOT NULL,             -- JSON: 默认参数值
  param_schema    TEXT NOT NULL,             -- JSON: 参数表单Schema
  sort_order      INTEGER DEFAULT 0,         -- 模板库排序
  is_system       INTEGER DEFAULT 1          -- 系统内置(不可删除)
);
```

**说明：** phase_templates表中的param_schema定义了Phase参数的表单结构，前端配方编辑器根据此Schema动态渲染参数输入控件。用户可在系统内置的14种Phase基础上自定义Phase模板（is_system=0）。
