// ai-gateway 共享类型定义

export interface BatchSummaryContext {
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
  events: Array<{ time: string; event: string }>;
  alarms: Array<{ time: string; severity: string; message: string }>;
}
