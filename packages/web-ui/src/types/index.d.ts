export type PLCDataType = 'BOOL' | 'INT16' | 'INT32' | 'FLOAT32' | 'UINT16';
export type PLCDirection = 'READ' | 'WRITE' | 'READWRITE';
export type PLCVariableGroup = '模拟量输入' | '模拟量输出' | '数字量输入' | '数字量输出' | '设定值' | 'PID参数' | '控制字' | '状态字' | '报警' | '变频器' | '心跳';
export type PLCProtocol = 's7' | 'modbus_tcp' | 'modbus_rtu';
export interface PLCConnection {
    id: string;
    name: string;
    protocol: PLCProtocol;
    ip: string;
    port: number;
    rack: number;
    slot: number;
    s7_db: number;
    serial_port?: string;
    baudrate?: number;
    parity?: 'none' | 'even' | 'odd';
    slave_id?: number;
    heartbeat_write_address: string;
    heartbeat_read_address: string;
    heartbeat_timeout_ms: number;
    reconnect_interval_ms: number;
    enabled: boolean;
}
export interface PLCVariableMapping {
    id: string;
    tag_name: string;
    description: string;
    plc_address: string;
    data_type: PLCDataType;
    direction: PLCDirection;
    scaling_enabled: boolean;
    raw_min: number;
    raw_max: number;
    eng_min: number;
    eng_max: number;
    eng_unit: string;
    group: PLCVariableGroup;
    poll_rate_ms: number;
    enabled: boolean;
    connection_id: string;
}
export interface PLCConnectionStatus {
    connection_id: string;
    connected: boolean;
    last_heartbeat: string | null;
    heartbeat_count: number;
    error_count: number;
    packet_loss_rate: number;
    latency_ms: number;
}
export type BatchState = 'idle' | 'running' | 'held' | 'paused' | 'stopped' | 'complete';
export type BatchEvent = 'cmd_start' | 'cmd_hold' | 'cmd_restart' | 'cmd_pause' | 'cmd_unpause' | 'cmd_stop' | 'cmd_reset' | 'safety_estop' | 'safety_temp_high' | 'runningfault' | 'engine_complete';
export type PhaseType = 'prepare' | 'water_fill' | 'manual_add' | 'heating' | 'agitation' | 'feeding' | 'temp_control' | 'ph_control' | 'do_control' | 'aeration' | 'discharge' | 'fermentation' | 'cip' | 'sip';
export type StepConditionType = '>=' | '<=' | 'in_band' | 'duration' | 'accumulated' | 'delta' | 'and' | 'or';
export type DOStrategy = 'active_O2' | 'active_feed' | 'constant_O2' | 'constant_feed';
export interface StepDefinition {
    step_number: number;
    name: string;
    description: string;
    actions: StepAction[];
    completion_condition: StepCondition;
}
export interface StepAction {
    target: string;
    action: 'set' | 'pid_enable' | 'pid_disable' | 'valve_open' | 'valve_close' | 'pump_start' | 'pump_stop';
    value?: number | string;
    source?: string;
}
export interface StepCondition {
    type: StepConditionType;
    channel?: string;
    value?: number;
    tolerance?: number;
    duration_s?: number;
    sub_conditions?: StepCondition[];
}
export type ExecutionMode = 'free' | 'sequential';
export interface Recipe {
    recipe_id: string;
    name: string;
    version: string;
    author: string;
    target_organism: string | null;
    description?: string;
    execution_mode: ExecutionMode;
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
export type DAGNodeType = 'start' | 'end' | 'phase' | 'branch';
export interface DAGNodeBase {
    id: string;
    type: DAGNodeType;
    position?: {
        x: number;
        y: number;
    };
}
export interface DAGStartNode extends DAGNodeBase {
    type: 'start';
}
export interface DAGEndNode extends DAGNodeBase {
    type: 'end';
}
export interface DAGPhaseNode extends DAGNodeBase {
    type: 'phase';
    phase_id: string;
    phase_type: PhaseType;
    params?: Record<string, any>;
}
export interface DAGBranchNode extends DAGNodeBase {
    type: 'branch';
    expression: string;
}
export type DAGNode = DAGStartNode | DAGEndNode | DAGPhaseNode | DAGBranchNode;
export interface DAGEdge {
    id: string;
    from: string;
    to: string;
    label?: 'true' | 'false';
}
export interface RecipeDAG {
    schema_version: 2;
    nodes: DAGNode[];
    edges: DAGEdge[];
}
export interface Batch {
    batch_id: string;
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
    state_snapshot?: string;
    hold_reason?: string;
    stop_trigger?: 'cmd_stop' | 'safety_estop';
    outcome?: 'success' | 'partial' | 'failed' | 'stopped';
    summary_text?: string;
    notes?: string;
}
export interface ProcessValues {
    timestamp: string;
    batch_id: string | null;
    'AI-0': number;
    'AI-1': number;
    'AI-2': number;
    'AI-3': number;
    'AI-4': number;
    'AI-5': number;
    'AI-6': number;
    rpm: number;
    vfd_current: number;
    'AO-0_cv': number;
    'AO-1_cv': number;
    'AO-2_cv': number;
    P01_rate: number;
    P02_rate: number;
    P03_rate: number;
    P04_rate: number;
    temp_mode: number;
    temp_sv?: number;
    pH_sv?: number;
    DO_sv?: number;
    phase_index?: number;
    step_number?: number;
}
export interface CalculatedParams {
    timestamp: string;
    batch_id: string;
    OUR: number;
    kLa: number;
    mu: number;
    Vs: number;
    V_feed: number;
    V_base: number;
    V_acid: number;
    O2_total: number;
    V_liquid: number;
    F0?: number;
}
export type WSChannel = 'pv_realtime' | 'state_update' | 'step_progress' | 'calculated' | 'alarm' | 'ai_suggestion' | 'soft_sensor' | 'heartbeat' | 'cusum' | 'recipe_downloaded';
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
export type AuditAction = 'pid_param_change' | 'sv_change' | 'mode_switch' | 'batch_start' | 'batch_hold' | 'batch_restart' | 'batch_pause' | 'batch_unpause' | 'batch_stop' | 'batch_reset' | 'ai_suggestion_accept' | 'ai_suggestion_reject' | 'recipe_create' | 'recipe_approve' | 'calibration_update' | 'user_login' | 'plc_config_change';
export interface AuditLog {
    id: number;
    batch_id?: string;
    user_id: string;
    action: AuditAction;
    target_type: string;
    target_id?: string;
    old_value?: string;
    new_value?: string;
    reason?: string;
    ip_address?: string;
    timestamp: string;
}
//# sourceMappingURL=index.d.ts.map