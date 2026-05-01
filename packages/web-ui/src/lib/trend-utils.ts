// ============================================================
// trend-utils.ts — 多反应器趋势数据对齐工具 (M2.3)
//
// alignByElapsedSeconds — 把 InfluxDB 原始行的绝对 _time 转成
//   从 batch.started_at 起算的"发酵经过秒数",
//   用于在同一 xAxis=value 下叠加多批次曲线, 起点都归零。
// ============================================================

export interface TrendRow {
  _time: string;
  [field: string]: any;
}

/**
 * 把时序行按"发酵经过秒数"重新计算 x 值。
 *
 * @param rows 原始行 (每行含 _time + 数值字段)
 * @param field 要提取的字段名 (如 'temperature')
 * @param startedAt batch 开始时间 ISO 字符串; 缺省时返回绝对 ms 时间戳
 * @returns [x, y][] 序列, x 是秒数 (startedAt 给出时) 或 ms (未给出时), y 为字段值或 null
 *
 * 边界:
 * - field 字段缺失或为 null/undefined → y=null (不丢行, 让 ECharts 显示断点)
 * - startedAt 未提供 → 退化为 [ms时间戳, y]
 * - _time 解析失败 → 跳过该行
 */
export function alignByElapsedSeconds(
  rows: TrendRow[],
  field: string,
  startedAt?: string | null,
): [number, number | null][] {
  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const useElapsed = !isNaN(startMs);
  const out: [number, number | null][] = [];
  for (const r of rows) {
    const tMs = new Date(r._time).getTime();
    if (isNaN(tMs)) continue;
    const x = useElapsed ? Math.round((tMs - startMs) / 1000) : tMs;
    const raw = r[field];
    const y = (raw === null || raw === undefined || (typeof raw === 'number' && isNaN(raw))) ? null : Number(raw);
    out.push([x, y === null ? null : y]);
  }
  return out;
}

/**
 * 为多反应器/多批次生成调色板 (HSL 均匀分布 + 深浅变化)
 *
 * @param count 总序列数
 * @returns 颜色数组, 长度 = count
 */
export function generateSeriesPalette(count: number): string[] {
  if (count <= 0) return [];
  const out: string[] = [];
  const step = 360 / Math.max(count, 6);
  for (let i = 0; i < count; i++) {
    const hue = Math.round((i * step) % 360);
    const lightness = i % 2 === 0 ? 58 : 72;
    out.push(`hsl(${hue}, 70%, ${lightness}%)`);
  }
  return out;
}
