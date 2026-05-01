import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Phase类型 英文→中文 映射 ────────────────────────────────

const PHASE_TYPE_LABELS: Record<string, string> = {
  Prepare:      '准备',
  AddWater:     '加水',
  ManualAdd:    '人工加料',
  Heating:      '加热',
  TempControl:  '控温',
  Agitation:    '搅拌',
  Feeding:      '补料',
  PHControl:    'pH调节',
  DOControl:    'DO调节',
  Aeration:     '通气',
  Discharge:    '出料',
  Fermentation: '发酵',
  SIP:          '就地灭菌',
  CIP:          '就地清洗',
  // 兼容snake_case (旧版/配方JSON)
  prepare:      '准备',
  water_fill:   '加水',
  manual_add:   '人工加料',
  heating:      '加热',
  temp_control: '控温',
  agitation:    '搅拌',
  feeding:      '补料',
  ph_control:   'pH调节',
  do_control:   'DO调节',
  aeration:     '通气',
  discharge:    '出料',
  fermentation: '发酵',
  sip:          '就地灭菌',
  cip:          '就地清洗',
};

/**
 * 将Phase类型英文标识转换为中文显示名
 * 优先使用传入的label参数(来自模板)，否则查映射表，最后回退原值
 */
export function phaseLabel(type: string, templateLabel?: string): string {
  if (templateLabel) return templateLabel;
  return PHASE_TYPE_LABELS[type] || type;
}

// ─── Phase状态 英文→中文 映射 ────────────────────────────────

const PHASE_STATE_LABELS: Record<string, string> = {
  pending:   '待执行',
  ready:     '就绪',
  running:   '运行中',
  held:      '保持',
  completed: '已完成',
  skipped:   '已跳过',
  failed:    '失败',
};

export function phaseStateLabel(state: string): string {
  return PHASE_STATE_LABELS[state] || state;
}
