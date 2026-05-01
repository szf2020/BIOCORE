// ============================================================
// Phase 模板注册表 — 14种预定义Phase的拖拽源
// 配方编辑 = 从左侧面板拖Phase模板 → 放入右侧时间线
// 每个Phase的params可在放入后通过表单自定义
// ============================================================

export type PhaseType =
  | 'prepare' | 'water_fill' | 'manual_add' | 'heating' | 'agitation'
  | 'feeding' | 'temp_control' | 'ph_control' | 'do_control' | 'aeration'
  | 'discharge' | 'fermentation' | 'cip' | 'sip';

export interface PhaseTemplate {
  type: PhaseType;
  label: string;              // 中文名
  icon: string;               // lucide icon名
  color: string;              // tailwind颜色 (用于卡片)
  description: string;        // 简要说明
  fixed_steps: number;        // 硬编码Step数量
  default_params: Record<string, any>;  // 默认参数
  param_schema: ParamField[]; // 参数表单Schema (用于动态渲染表单)
}

export interface ParamField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'boolean' | 'group';
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: any;
  options?: { value: string; label: string }[];
  required?: boolean;
  children?: ParamField[];    // group类型的子字段
  condition?: { field: string; value: any }; // 条件显示
}

// ─── 14种Phase模板定义 ──────────────────────────────────────

export const PHASE_TEMPLATES: PhaseTemplate[] = [
  {
    type: 'prepare',
    label: '准备',
    icon: 'Settings2',
    color: 'gray',
    description: '系统初始化: 阀门归位、传感器自检、称重清零、VFD检查',
    fixed_steps: 5,
    default_params: {},
    param_schema: [],
  },
  {
    type: 'water_fill',
    label: '加水',
    icon: 'Droplets',
    color: 'blue',
    description: '向罐内加入RO水/培养基底液至目标重量',
    fixed_steps: 4,
    default_params: { target_weight_kg: 15.5, coarse_offset_kg: 0.3 },
    param_schema: [
      { key: 'target_weight_kg', label: '目标重量', type: 'number', unit: 'kg', min: 0.5, max: 20, step: 0.1, required: true },
      { key: 'coarse_offset_kg', label: '粗加水提前量', type: 'number', unit: 'kg', min: 0.1, max: 2, step: 0.1, default: 0.3 },
    ],
  },
  {
    type: 'manual_add',
    label: '人工加料',
    icon: 'Hand',
    color: 'amber',
    description: '等待操作员手动添加培养基组分或菌种',
    fixed_steps: 4,
    default_params: { prompt_message: '请完成加料操作', expected_delta_kg: 0.1, agitation_rpm: 200, timeout_min: 60 },
    param_schema: [
      { key: 'prompt_message', label: '提示消息', type: 'text', required: true },
      { key: 'expected_delta_kg', label: '预期重量变化', type: 'number', unit: 'kg', min: 0.01, max: 5, step: 0.01, default: 0.1 },
      { key: 'agitation_rpm', label: '搅拌转速', type: 'number', unit: 'rpm', min: 50, max: 600, step: 10, default: 200 },
      { key: 'timeout_min', label: '超时时间', type: 'number', unit: 'min', min: 5, max: 120, step: 5, default: 60 },
    ],
  },
  {
    type: 'sip',
    label: '就地灭菌',
    icon: 'Flame',
    color: 'red',
    description: 'SIP灭菌: 升温→保温F₀积分→冷却',
    fixed_steps: 4,
    default_params: { target_temp_C: 121, hold_time_min: 20, cool_to_C: 40 },
    param_schema: [
      { key: 'target_temp_C', label: '灭菌温度', type: 'number', unit: '°C', min: 110, max: 135, step: 1, default: 121 },
      { key: 'hold_time_min', label: '保温时间', type: 'number', unit: 'min', min: 10, max: 60, step: 5, default: 20 },
      { key: 'cool_to_C', label: '冷却至', type: 'number', unit: '°C', min: 20, max: 60, step: 1, default: 40 },
    ],
  },
  {
    type: 'heating',
    label: '加热',
    icon: 'Thermometer',
    color: 'orange',
    description: '升温至目标温度并稳定',
    fixed_steps: 4,
    default_params: { target_temp_C: 37, ramp_rate_C_min: 1.0 },
    param_schema: [
      { key: 'target_temp_C', label: '目标温度', type: 'number', unit: '°C', min: 15, max: 135, step: 0.5, required: true },
      { key: 'ramp_rate_C_min', label: '升温速率', type: 'number', unit: '°C/min', min: 0.1, max: 5, step: 0.1, default: 1.0 },
    ],
  },
  {
    type: 'temp_control',
    label: '控温',
    icon: 'ThermometerSun',
    color: 'orange',
    description: '温度维持或切换至新设定值',
    fixed_steps: 3,
    default_params: { target_temp_C: 37, deadband: 0.3 },
    param_schema: [
      { key: 'target_temp_C', label: '目标温度', type: 'number', unit: '°C', min: 15, max: 60, step: 0.5, required: true },
      { key: 'deadband', label: '死区', type: 'number', unit: '°C', min: 0.1, max: 2, step: 0.1, default: 0.3 },
    ],
  },
  {
    type: 'agitation',
    label: '搅拌',
    icon: 'RotateCw',
    color: 'teal',
    description: '启动搅拌至目标转速',
    fixed_steps: 3,
    default_params: { target_rpm: 300 },
    param_schema: [
      { key: 'target_rpm', label: '目标转速', type: 'number', unit: 'rpm', min: 50, max: 1200, step: 10, required: true },
    ],
  },
  {
    type: 'feeding',
    label: '补料',
    icon: 'Pipette',
    color: 'green',
    description: '蠕动泵补料 (恒速/指数)',
    fixed_steps: 3,
    default_params: { pump: 'P02', mode: 'constant', rate_mL_h: 10, duration_min: 60 },
    param_schema: [
      { key: 'pump', label: '泵选择', type: 'select', options: [
        { value: 'P01', label: 'P01 (补碱/补料)' }, { value: 'P02', label: 'P02 (碳源)' },
        { value: 'P03', label: 'P03 (氮源)' }, { value: 'P04', label: 'P04 (补酸/消泡)' },
      ], required: true },
      { key: 'mode', label: '补料模式', type: 'select', options: [
        { value: 'constant', label: '恒速' }, { value: 'exponential', label: '指数' },
      ], default: 'constant' },
      { key: 'rate_mL_h', label: '初始速率', type: 'number', unit: 'mL/h', min: 0.1, max: 200, step: 0.1 },
      { key: 'mu_set', label: '设定比生长速率μ', type: 'number', unit: '1/h', min: 0.01, max: 0.5, step: 0.01, condition: { field: 'mode', value: 'exponential' } },
      { key: 'duration_min', label: '持续时间', type: 'number', unit: 'min', min: 1, max: 1440, step: 1 },
    ],
  },
  {
    type: 'ph_control',
    label: 'pH调节',
    icon: 'FlaskConical',
    color: 'purple',
    description: 'pH闭环控制 (补酸/补碱)',
    fixed_steps: 3,
    default_params: { sv: 7.0, deadband: 0.05 },
    param_schema: [
      { key: 'sv', label: 'pH设定值', type: 'number', unit: '', min: 3, max: 10, step: 0.1, required: true },
      { key: 'deadband', label: '死区', type: 'number', unit: '', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
    ],
  },
  {
    type: 'do_control',
    label: 'DO调节',
    icon: 'Wind',
    color: 'cyan',
    description: '溶氧控制 (4种策略可选)',
    fixed_steps: 3,
    default_params: { strategy: 'active_O2', sv: 30, cascade: [{ level: 1, actuator: 'agitation', range_rpm: [200, 1200] }, { level: 2, actuator: 'airflow', range_NL_min: [1, 30] }] },
    param_schema: [
      { key: 'strategy', label: 'DO策略', type: 'select', options: [
        { value: 'active_O2', label: '策略一: 主动调氧' }, { value: 'active_feed', label: '策略二: DO-stat补料' },
        { value: 'constant_O2', label: '策略三: 恒定氧气' }, { value: 'constant_feed', label: '策略四: 恒定补料' },
      ], required: true },
      { key: 'sv', label: 'DO设定值', type: 'number', unit: '%', min: 5, max: 100, step: 1, default: 30 },
    ],
  },
  {
    type: 'aeration',
    label: '通气',
    icon: 'CloudRain',
    color: 'sky',
    description: '空气流量调节',
    fixed_steps: 3,
    default_params: { target_NL_min: 15 },
    param_schema: [
      { key: 'target_NL_min', label: '目标流量', type: 'number', unit: 'NL/MIN', min: 0, max: 30, step: 0.5, required: true },
    ],
  },
  {
    type: 'fermentation',
    label: '发酵',
    icon: 'Dna',
    color: 'emerald',
    description: '发酵主体阶段: 温度+pH+DO+补料综合运行',
    fixed_steps: 3,
    default_params: { duration_h: 8, controls: { temperature: { sv: 37, deadband: 0.3 }, pH: { sv: 7.0, deadband: 0.05 }, DO: { strategy: 'active_O2', sv: 30 } } },
    param_schema: [
      { key: 'duration_h', label: '持续时间', type: 'number', unit: 'h', min: 0.5, max: 168, step: 0.5, required: true },
      { key: 'controls.temperature.sv', label: '温度设定', type: 'number', unit: '°C', min: 15, max: 60, step: 0.5, default: 37 },
      { key: 'controls.pH.sv', label: 'pH设定', type: 'number', unit: '', min: 3, max: 10, step: 0.1, default: 7.0 },
      { key: 'controls.DO.strategy', label: 'DO策略', type: 'select', options: [
        { value: 'active_O2', label: '主动调氧' }, { value: 'active_feed', label: 'DO-stat' },
        { value: 'constant_O2', label: '恒定氧气' }, { value: 'constant_feed', label: '恒定补料' },
      ] },
      { key: 'controls.DO.sv', label: 'DO设定', type: 'number', unit: '%', min: 5, max: 100, step: 1, default: 30 },
    ],
  },
  {
    type: 'discharge',
    label: '出料',
    icon: 'ArrowDownToLine',
    color: 'slate',
    description: '降温→泄压→排料→阀门归位',
    fixed_steps: 5,
    default_params: { cool_to_C: 25 },
    param_schema: [
      { key: 'cool_to_C', label: '冷却至', type: 'number', unit: '°C', min: 10, max: 40, step: 1, default: 25 },
    ],
  },
  {
    type: 'cip',
    label: '就地清洗',
    icon: 'Waves',
    color: 'indigo',
    description: 'CIP五步清洗: 预冲→碱洗→中冲→酸洗→终冲',
    fixed_steps: 5,
    default_params: { pre_rinse_s: 600, alkali_s: 1200, mid_rinse_s: 600, acid_s: 900, final_rinse_s: 600 },
    param_schema: [
      { key: 'pre_rinse_s', label: '预冲洗', type: 'number', unit: '秒', min: 60, max: 1800, step: 60, default: 600 },
      { key: 'alkali_s', label: '碱洗', type: 'number', unit: '秒', min: 300, max: 3600, step: 60, default: 1200 },
      { key: 'acid_s', label: '酸洗', type: 'number', unit: '秒', min: 300, max: 3600, step: 60, default: 900 },
    ],
  },
];

export function getPhaseTemplate(type: PhaseType): PhaseTemplate | undefined {
  return PHASE_TEMPLATES.find(t => t.type === type);
}
