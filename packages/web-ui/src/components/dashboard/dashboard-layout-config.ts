// ============================================================
// Dashboard 布局配置 — 纯数据/工具函数, 不含 @dnd-kit
// 从 DashboardLayoutEditor 中拆出, 避免 dashboard 页面静态导入 @dnd-kit
// ============================================================

export interface BigParamConfig {
  key: string;
  label: string;
  unit: string;
  sv?: number;
  visible: boolean;
}

export interface DashboardLayout {
  bigParams: BigParamConfig[];
  showTrends: boolean;
  showAlarms: boolean;
  showCalculated: boolean;
}

const STORAGE_KEY = 'biocore_dashboard_layout';

const DEFAULT_PARAMS: BigParamConfig[] = [
  { key: 'temperature', label: '温度 (Temperature)', unit: '°C', sv: 37.0, visible: true },
  { key: 'pH', label: '酸碱度 (pH Level)', unit: 'pH', sv: 7.0, visible: true },
  { key: 'DO', label: '溶氧 (Dissolved Oxygen)', unit: '%', sv: 30, visible: true },
  { key: 'rpm', label: '搅拌 (Agitation)', unit: 'rpm', sv: 0, visible: true },
  { key: 'weight', label: '称重 (Weight)', unit: 'kg', visible: true },
  { key: 'pressure', label: '罐压 (Pressure)', unit: 'bar', visible: true },
];

export const DEFAULT_LAYOUT: DashboardLayout = {
  bigParams: DEFAULT_PARAMS,
  showTrends: true,
  showAlarms: true,
  showCalculated: true,
};

/** 读取 localStorage 中的布局配置, 无则返回默认 */
export function loadDashboardLayout(): DashboardLayout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as DashboardLayout;
    if (!Array.isArray(parsed.bigParams) || parsed.bigParams.length === 0) return DEFAULT_LAYOUT;
    return parsed;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** 保存布局配置到 localStorage */
export function saveDashboardLayout(layout: DashboardLayout): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
