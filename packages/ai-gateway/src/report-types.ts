// AI 报表数据模型

export interface Report {
  id: string;
  batch_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  chapters: ReportChapter[];
}

export interface ReportChapter {
  id: string;
  title: string;
  sections: ReportSection[];
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;       // Markdown 内容
  data_ref?: string;     // 引用的数据键 (用于图表渲染)
  chart_type?: 'line' | 'bar' | 'table';
  chart_svg?: string;    // 预渲染的 SVG 图表 (原始 HTML, 插入在 content 之前)
}

export interface ReportContext {
  batch_id: string;
  recipe_name: string;
  recipe_version: string;
  organism: string | null;
  operator: string;
  started_at: string;
  ended_at: string;
  duration_hours: number;
  outcome: string;
  stats: {
    temp_mean: number; temp_max_dev: number;
    pH_mean: number; pH_max_dev: number;
    DO_mean: number; DO_min: number;
    rpm_max: number;
    total_feed_mL: number; total_base_mL: number;
  };
  phases: Array<{ name: string; started_at: string; ended_at?: string; duration_min?: number }>;
  events: Array<{ time: string; event: string }>;
  alarms: Array<{ time: string; severity: string; message: string; code?: string }>;
  samples?: Array<{ time: string; param: string; value: number }>;
  // 历史批次对比数据
  historical?: Array<{
    batch_id: string; outcome: string; duration_hours: number;
    yield_g: number; titer_g_L: number; oee_pct: number;
    cycle_time_h: number;
  }>;
  current_kpi?: {
    yield_g: number; titer_g_L: number; oee_pct: number; cycle_time_h: number;
  };
  user_focus?: string;  // 用户关注重点, 如 "DO偏低原因"
}

// 默认章节模板
export const DEFAULT_CHAPTERS = [
  { id: 'overview',        title: '批次概况' },
  { id: 'trends',          title: '关键参数趋势分析' },
  { id: 'comparison',      title: '历史趋势对比' },
  { id: 'anomaly',         title: '异常事件分析' },
  { id: 'recommendations', title: 'AI观察与建议' },
] as const;
