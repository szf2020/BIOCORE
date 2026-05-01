// ============================================================
// BIOCore 核心类型定义
// 所有包共享的接口和类型
// ============================================================

// ─── PLC 通讯 ───────────────────────────────────────────────

export type PLCDataType = 'BOOL' | 'INT16' | 'INT32' | 'FLOAT32' | 'UINT16';
export type PLCDirection = 'READ' | 'WRITE' | 'READWRITE';
export type PLCVariableGroup =
  | '模拟量输入'
  | '模拟量输出'
  | '数字量输入'
  | '数字量输出'
  | '设定值'
  | 'PID参数'
  | '控制字'
  | '状态字'
  | '报警'
  | '变频器'
  | '心跳';

export type PLCProtocol = 's7' | 'modbus_tcp' | 'modbus_rtu';

export interface PLCConnection {
  id: string;
  name: string;
  protocol: PLCProtocol;           // 通讯协议
  ip: string;
  port: number;                    // S7默认102, Modbus TCP默认502
  rack: number;                    // S7-200 SMART 固定 0
  slot: number;                    // S7-200 SMART 固定 1
  s7_db: number;                   // S7 DB号 (实测: DB2用于通讯数据块)
  // Modbus RTU 专用
  serial_port?: string;            // '/dev/ttyUSB0' 或 'COM3'
  baudrate?: number;               // 默认 9600
  parity?: 'none' | 'even' | 'odd';
  slave_id?: number;               // 默认 1
  // 双向心跳
  heartbeat_write_address: string; // PC→PLC 心跳写入地址
  heartbeat_read_address: string;  // PLC→PC 心跳读取地址
  heartbeat_timeout_ms: number;    // 心跳超时, 默认 3000
  reconnect_interval_ms: number;   // 自动重连间隔, 默认 5000
  enabled: boolean;
}

export interface PLCVariableMapping {
  id: string;
  tag_name: string;                // 系统变量名, 如 "TEMP_PV"
  description: string;             // 中文描述
  plc_address: string;             // V区地址, 如 "VW100"
  data_type: PLCDataType;
  direction: PLCDirection;
  scaling_enabled: boolean;        // 是否启用工程量线性转换
  raw_min: number;                 // 原始值下限
  raw_max: number;                 // 原始值上限
  eng_min: number;                 // 工程值下限
  eng_max: number;                 // 工程值上限
  eng_unit: string;                // 工程单位
  group: PLCVariableGroup;
  poll_rate_ms: number;            // 100 | 1000 | 10000
  enabled: boolean;
  connection_id: string;           // 关联的PLC连接
}

export interface PLCConnectionStatus {
  connection_id: string;
  connected: boolean;
  last_heartbeat: string | null;   // ISO 8601
  heartbeat_count: number;
  error_count: number;
  packet_loss_rate: number;        // 0~1
  latency_ms: number;
}

// ─── ISA-88 状态机 ──────────────────────────────────────────

export type BatchState = 'idle' | 'running' | 'held' | 'paused' | 'stopped' | 'complete';

export type BatchEvent =
  | 'cmd_start'
  | 'cmd_hold'
  | 'cmd_restart'
  | 'cmd_pause'
  | 'cmd_unpause'
  | 'cmd_stop'
  | 'cmd_reset'
  | 'safety_estop'
  | 'safety_temp_high'
  | 'runningfault'
  | 'engine_complete';

export type PhaseType =
  | 'prepare'
  | 'water_fill'
  | 'manual_add'
  | 'heating'
  | 'agitation'
  | 'feeding'
  | 'temp_control'
  | 'ph_control'
  | 'do_control'
  | 'aeration'
  | 'discharge'
  | 'fermentation'
  | 'cip'
  | 'sip';

export type StepConditionType = '>=' | '<=' | 'in_band' | 'duration' | 'accumulated' | 'delta' | 'and' | 'or';

export type DOStrategy = 'active_O2' | 'active_feed' | 'constant_O2' | 'constant_feed';

export interface StepDefinition {
  step_number: number;             // 1~255
  name: string;
  description: string;
  actions: StepAction[];
  completion_condition: StepCondition;
}

export interface StepAction {
  target: string;                  // PLC地址 or 系统命令
  action: 'set' | 'pid_enable' | 'pid_disable' | 'valve_open' | 'valve_close' | 'pump_start' | 'pump_stop';
  value?: number | string;
  source?: string;                 // 参数来源: "recipe.params.xxx"
}

export interface StepCondition {
  type: StepConditionType;
  channel?: string;                // AI通道 or 计算值
  value?: number;
  tolerance?: number;              // in_band 用
  duration_s?: number;             // duration 用
  sub_conditions?: StepCondition[]; // and/or 用
}

// ─── 配方 ───────────────────────────────────────────────────

export type ExecutionMode = 'free' | 'sequential';

export interface Recipe {
  recipe_id: string;
  name: string;
  version: string;                 // semver
  author: string;
  target_organism: string | null;
  description?: string;
  execution_mode: ExecutionMode;   // 'free': 操作员手动启动每个Phase; 'sequential': Phase顺序自动执行
  vessel: VesselConfig;
  phases: PhaseConfig[];
}

export interface VesselConfig {
  id: string;
  working_volume_L: number;
  total_volume_L: number;
  tare_weight_kg: number;
  material?: string;
  pressure_range_bar?: [number, number];
  agitation_range_rpm?: [number, number];
  airflow_range_NL_min?: [number, number];
}

export interface PhaseConfig {
  phase_id: string;
  type: PhaseType;
  params?: Record<string, any>;
}

// ─── 配方 DAG (Sprint 3 M3.5) ──────────────────────────────
//
// 配方的 phases 从线性数组升级为 DAG。Schema v1 = 老线性配方
// (continues to use phases[]),Schema v2 = 新 DAG (用 nodes/edges)。
//
// Node 类型:
//   - start    : 入口节点 (恰好 1 个)
//   - end      : 出口节点 (>=1 个, 用于多分支收敛或多终结)
//   - phase    : 工艺 phase 节点, 含 phase_id + type + params
//   - branch   : IF/ELSE 决策节点, 含 condition 表达式 (M3.8 支持)
//
// Edge 类型:
//   - 普通边: { from, to }
//   - branch 出边: { from: 'branch_node', to, label: 'true' | 'false' }
// ─────────────────────────────────────────────────────────────

export type DAGNodeType = 'start' | 'end' | 'phase' | 'branch';

export interface DAGNodeBase {
  id: string;             // 节点唯一 ID (UI 用)
  type: DAGNodeType;
  position?: { x: number; y: number }; // react-flow 用
}

export interface DAGStartNode extends DAGNodeBase {
  type: 'start';
}

export interface DAGEndNode extends DAGNodeBase {
  type: 'end';
}

export interface DAGPhaseNode extends DAGNodeBase {
  type: 'phase';
  phase_id: string;       // 业务 ID, 例如 'HEATING_01'
  phase_type: PhaseType;
  params?: Record<string, any>;
}

export interface DAGBranchNode extends DAGNodeBase {
  type: 'branch';
  expression: string;     // 例如 'OD600 > 5'
}

export type DAGNode = DAGStartNode | DAGEndNode | DAGPhaseNode | DAGBranchNode;

export interface DAGEdge {
  id: string;
  from: string;           // source node id
  to: string;             // target node id
  label?: 'true' | 'false'; // 仅用于 branch 出边
}

export interface RecipeDAG {
  schema_version: 2;
  nodes: DAGNode[];
  edges: DAGEdge[];
}

// ─── 批次 ───────────────────────────────────────────────────

export interface Batch {
  batch_id: string;                // BATCH-YYYYMMDD-NNN
  recipe_id: string;
  recipe_version: string;
  reactor_id: string;
  organism?: string;
  operator_id: string;
  started_at?: string;
  ended_at?: string;
  current_state: BatchState;
  current_phase_index: number;
  current_phase_id?: string;
  current_phase_type?: PhaseType;
  current_step_number: number;
  total_phases: number;
  state_snapshot?: string;         // XState JSON snapshot
  hold_reason?: string;
  stop_trigger?: 'cmd_stop' | 'safety_estop';
  outcome?: 'success' | 'partial' | 'failed' | 'stopped';
  summary_text?: string;           // AI生成摘要
  notes?: string;
}

// ─── 实时数据 ───────────────────────────────────────────────

export interface ProcessValues {
  timestamp: string;
  batch_id: string | null;
  'AI-0': number;   // 罐温 °C
  'AI-1': number;   // 夹套温度 °C
  'AI-2': number;   // pH
  'AI-3': number;   // DO %
  'AI-4': number;   // 罐压 bar
  'AI-5': number;   // 空气流量 NL/MIN
  'AI-6': number;   // 称重 kg
  rpm: number;       // 搅拌转速
  vfd_current: number;
  'AO-0_cv': number; // 蒸汽阀开度 %
  'AO-1_cv': number; // 冷却阀开度 %
  'AO-2_cv': number; // 空气阀开度 %
  P01_rate: number;  // 碱泵速率
  P02_rate: number;  // 补料泵速率
  P03_rate: number;  // 氮源泵速率
  P04_rate: number;  // 酸泵速率
  temp_mode: number; // 0=保温 1=加热 2=冷却
  temp_sv?: number;       // 温度设定值 °C
  pH_sv?: number;         // pH设定值
  DO_sv?: number;         // DO设定值 %
  phase_index?: number;   // 当前Phase索引
  step_number?: number;   // 当前Step编号
}

export interface CalculatedParams {
  timestamp: string;
  batch_id: string;
  OUR: number;        // mmol/L/h
  kLa: number;        // 1/h
  mu: number;         // 1/h (比生长速率)
  Vs: number;         // m/s (表观气速)
  V_feed: number;     // mL (累积补料量)
  V_base: number;     // mL (累积补碱量)
  V_acid: number;     // mL (累积补酸量)
  O2_total: number;   // mmol (累积耗氧)
  V_liquid: number;   // L (罐内液体体积)
  F0?: number;        // min (SIP灭菌值, 仅SIP阶段)
}

// ─── WebSocket 消息 ─────────────────────────────────────────

export type WSChannel =
  | 'pv_realtime'
  | 'state_update'
  | 'step_progress'
  | 'calculated'
  | 'alarm'
  | 'ai_suggestion'
  | 'soft_sensor'
  | 'heartbeat'
  | 'cusum'
  | 'recipe_downloaded';

export interface WSMessage<T = Record<string, any>> {
  channel: WSChannel;
  timestamp: string;
  batch_id: string | null;
  reactor_id: string | null;
  payload: T;
}

export interface StateUpdatePayload {
  state: BatchState;
  reactor_id?: string;
  phase_index: number;
  phase_id: string;
  phase_type: PhaseType;
  phase_name: string;
  total_phases: number;
  step_number: number;
  step_name: string;
  total_steps: number;
  step_elapsed_sec: number;
  batch_elapsed_sec: number;
  hold_reason: string | null;
  buttons: ButtonEnableState;
  phase_statuses?: PhaseStatus[];
}

export interface ButtonEnableState {
  start: boolean;
  hold: boolean;
  restart: boolean;
  pause: boolean;
  unpause: boolean;
  stop: boolean;
  reset: boolean;
  estop: boolean;
}

// ─── Per-Phase 状态机 ──────────────────────────────────────

export type PhaseState = 'pending' | 'ready' | 'running' | 'held' | 'completed' | 'skipped' | 'failed';

export interface PhaseStatus {
  phase_id: string;
  phase_type: string;
  phase_index: number;
  state: PhaseState;
  step_number: number;
  total_steps: number;
  step_name: string;
  hold_reason?: string;
  started_at?: string;
  ended_at?: string;
}

// ─── 报警 ───────────────────────────────────────────────────

export type AlarmSeverity = 'info' | 'warning' | 'critical';
export type AlarmSource = 'plc_interlock' | 'pid_deviation' | 'cusum_anomaly' | 'communication' | 'system';

export interface Alarm {
  id: string;
  batch_id?: string;
  severity: AlarmSeverity;
  source: AlarmSource;
  message: string;
  channel?: string;
  value?: number;
  threshold?: number;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  triggered_at?: string;
  created_at: string;
}

// ─── 用户与权限 ─────────────────────────────────────────────

export type UserRole = 'admin' | 'engineer' | 'operator' | 'viewer';

export interface User {
  user_id: string;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
}

// ─── 审计日志 ───────────────────────────────────────────────

export type AuditAction =
  | 'pid_param_change'
  | 'sv_change'
  | 'mode_switch'
  | 'batch_start'
  | 'batch_hold'
  | 'batch_restart'
  | 'batch_pause'
  | 'batch_unpause'
  | 'batch_stop'
  | 'batch_reset'
  | 'ai_suggestion_accept'
  | 'ai_suggestion_reject'
  | 'recipe_create'
  | 'recipe_approve'
  | 'calibration_update'
  | 'user_login'
  | 'plc_config_change';

export interface AuditLog {
  id: number;
  batch_id?: string;
  user_id: string;
  action: AuditAction;
  target_type: string;
  target_id?: string;
  old_value?: string;              // JSON
  new_value?: string;              // JSON
  reason?: string;
  ip_address?: string;
  timestamp: string;
}
