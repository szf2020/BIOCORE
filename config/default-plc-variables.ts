// ============================================================
// 默认 PLC V区地址映射表
// 基于 01_PLC硬件规格.md 中的V区地址规划
// 用于初始化和"加载默认模板"功能
// ============================================================

import type { PLCVariableMapping } from '@/types';

export const DEFAULT_V_AREA_MAP: Omit<PLCVariableMapping, 'id' | 'connection_id'>[] = [
  // ═══ PC→PLC 控制字 (VW0 ~ VW9) ═══
  { tag_name: 'SYS_CONTROL_WORD', description: '系统控制字(启停/自手动/急停/温控模式)', plc_address: 'VW0', data_type: 'UINT16', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 65535, eng_unit: '', group: '控制字', poll_rate_ms: 100, enabled: true },
  { tag_name: 'STATE_CODE',       description: 'ISA-88状态机编码(0~5)', plc_address: 'VW2', data_type: 'UINT16', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 5, eng_unit: '', group: '控制字', poll_rate_ms: 100, enabled: true },

  // ═══ PC→PLC 设定值 (VW10 ~ VW29) ═══
  { tag_name: 'TEMP_SV',     description: '罐温设定值',     plc_address: 'VD10', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 150, eng_unit: '°C', group: '设定值', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'RPM_SV',      description: '搅拌转速设定值', plc_address: 'VW14', data_type: 'INT16',   direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 50, eng_max: 1200, eng_unit: 'rpm', group: '设定值', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'DO_SV',       description: 'DO设定值',       plc_address: 'VD16', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 100, eng_unit: '%', group: '设定值', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'PH_SV',       description: 'pH设定值',       plc_address: 'VD20', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 14, eng_unit: 'pH', group: '设定值', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'PRESSURE_SV', description: '罐压设定值',     plc_address: 'VD24', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: -1, eng_max: 3, eng_unit: 'bar', group: '设定值', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'AIRFLOW_SV',  description: '空气流量设定值', plc_address: 'VD28', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 30, eng_unit: 'NL/MIN', group: '设定值', poll_rate_ms: 1000, enabled: true },

  // ═══ PLC→PC 过程值 (VW100 ~ VW129) ═══
  { tag_name: 'TEMP_PV',     description: '罐内温度(AI-0)', plc_address: 'VW100', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 150, eng_unit: '°C', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'JACKET_PV',   description: '夹套温度(AI-1)', plc_address: 'VW102', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 150, eng_unit: '°C', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'PH_PV',       description: 'pH值(AI-2)',     plc_address: 'VW104', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 14, eng_unit: 'pH', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'DO_PV',       description: '溶氧(AI-3)',     plc_address: 'VW106', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 100, eng_unit: '%', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'PRESSURE_PV', description: '罐压(AI-4)',     plc_address: 'VW108', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: -1, eng_max: 3, eng_unit: 'bar', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'AIRFLOW_PV',  description: '空气流量(AI-5)', plc_address: 'VW110', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 30, eng_unit: 'NL/MIN', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'WEIGHT_PV',   description: '称重(AI-6)',     plc_address: 'VW112', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 80, eng_unit: 'kg', group: '模拟量输入', poll_rate_ms: 1000, enabled: true },

  // ═══ PLC→PC 控制输出值 (VW150 ~ VW179) ═══
  { tag_name: 'STEAM_CV',    description: '蒸汽阀开度(AO-0)', plc_address: 'VW150', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 100, eng_unit: '%', group: '模拟量输出', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'COOL_CV',     description: '冷却阀开度(AO-1)', plc_address: 'VW152', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 100, eng_unit: '%', group: '模拟量输出', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'AIR_CV',      description: '空气阀开度(AO-2)', plc_address: 'VW154', data_type: 'INT16', direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 100, eng_unit: '%', group: '模拟量输出', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'TEMP_MODE',   description: '温控模式(0保温/1加热/2冷却)', plc_address: 'VW156', data_type: 'UINT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 2, eng_unit: '', group: '状态字', poll_rate_ms: 1000, enabled: true },

  // ═══ 报警位字 (VB200 ~ VB209) ═══
  { tag_name: 'ALARM_WORD_0', description: '报警字0(安全连锁状态)', plc_address: 'VW200', data_type: 'UINT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 65535, eng_unit: '', group: '报警', poll_rate_ms: 100, enabled: true },
  { tag_name: 'ALARM_WORD_1', description: '报警字1',               plc_address: 'VW202', data_type: 'UINT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 65535, eng_unit: '', group: '报警', poll_rate_ms: 100, enabled: true },

  // ═══ 变频器诊断 (VW210 ~ VW219) ═══
  { tag_name: 'VFD_ACTUAL_FREQ', description: '变频器实际频率',   plc_address: 'VW210', data_type: 'INT16',  direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 10000, eng_min: 0, eng_max: 50, eng_unit: 'Hz', group: '变频器', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'VFD_CURRENT',     description: '变频器输出电流',   plc_address: 'VW212', data_type: 'INT16',  direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 10000, eng_min: 0, eng_max: 10, eng_unit: 'A', group: '变频器', poll_rate_ms: 1000, enabled: true },
  { tag_name: 'VFD_BUS_VOLTAGE', description: '变频器母线电压',   plc_address: 'VW214', data_type: 'INT16',  direction: 'READ', scaling_enabled: true, raw_min: 0, raw_max: 10000, eng_min: 0, eng_max: 400, eng_unit: 'V', group: '变频器', poll_rate_ms: 10000, enabled: true },
  { tag_name: 'VFD_FAULT_CODE',  description: '变频器故障码',     plc_address: 'VW218', data_type: 'UINT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 65535, eng_unit: '', group: '变频器', poll_rate_ms: 1000, enabled: true },

  // ═══ PID参数在线修改区 (VW300 ~ VW349) ═══
  { tag_name: 'PID01_KP', description: 'PID01(罐温加热) Kp', plc_address: 'VD300', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 100, eng_unit: '', group: 'PID参数', poll_rate_ms: 10000, enabled: true },
  { tag_name: 'PID01_KI', description: 'PID01(罐温加热) Ki', plc_address: 'VD304', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 100, eng_unit: '', group: 'PID参数', poll_rate_ms: 10000, enabled: true },
  { tag_name: 'PID01_KD', description: 'PID01(罐温加热) Kd', plc_address: 'VD308', data_type: 'FLOAT32', direction: 'WRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 100, eng_unit: '', group: 'PID参数', poll_rate_ms: 10000, enabled: true },

  // ═══ 心跳 (VB400) ═══
  { tag_name: 'HEARTBEAT', description: '心跳字节(PC每秒递增,PLC监测3秒超时)', plc_address: 'VB400', data_type: 'UINT16', direction: 'READWRITE', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 255, eng_unit: '', group: '心跳', poll_rate_ms: 100, enabled: true },

  // ═══ 数字量输入反馈 ═══
  { tag_name: 'ESTOP',              description: '急停按钮(I0.0)',     plc_address: 'V200.0', data_type: 'BOOL', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '数字量输入', poll_rate_ms: 100, enabled: true },
  { tag_name: 'STEAM_VALVE_OPEN',   description: '蒸汽阀开到位(I0.1)', plc_address: 'V200.1', data_type: 'BOOL', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '数字量输入', poll_rate_ms: 100, enabled: true },
  { tag_name: 'STEAM_VALVE_CLOSED', description: '蒸汽阀关到位(I0.2)', plc_address: 'V200.2', data_type: 'BOOL', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '数字量输入', poll_rate_ms: 100, enabled: true },
  { tag_name: 'COOL_VALVE_CLOSED',  description: '冷却阀关到位(I0.4)', plc_address: 'V200.4', data_type: 'BOOL', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '数字量输入', poll_rate_ms: 100, enabled: true },
  { tag_name: 'LID_LOCKED',         description: '罐盖限位(I0.5)',     plc_address: 'V200.5', data_type: 'BOOL', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '数字量输入', poll_rate_ms: 100, enabled: true },
  { tag_name: 'STEAM_PRESSURE_SW',  description: '蒸汽压力开关(I0.6)', plc_address: 'V200.6', data_type: 'BOOL', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '数字量输入', poll_rate_ms: 100, enabled: true },
];
