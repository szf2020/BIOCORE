// ============================================================
// stats-utils.ts — 统计计算 (用于批次对比 / 箱线图)
// ============================================================

export interface FieldStats {
  min: number;
  max: number;
  mean: number;
  sd: number;
  q1: number;    // 25th percentile
  median: number;
  q3: number;    // 75th percentile
  count: number;
}

/**
 * 对排序后的数组取百分位数 (线性插值)
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * 计算一组数值的描述统计 (min/max/mean/sd/q1/median/q3)
 * 输入不需要预排序, 内部会排序
 */
export function computeFieldStats(values: number[]): FieldStats | null {
  const clean = values.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (clean.length === 0) return null;
  const n = clean.length;
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = clean.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const variance = clean.reduce((s, v) => s + (v - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    sd: Math.sqrt(variance),
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    count: n,
  };
}
