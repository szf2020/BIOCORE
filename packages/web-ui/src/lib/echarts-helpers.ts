// ============================================================
// echarts-helpers.ts — ECharts option 构建工具
//
// buildTrendOption — 把多通道数据转 ECharts line option
// formatElapsedAxis — 秒数 → "1h23m" (M2.3 横坐标)
// phaseMarkLines — 阶段虚线 markLine config
// ============================================================

import type { EChartsOption } from 'echarts';

// BIOCore 深色 MES 主题色板 (匹配 trends/page.tsx 原 PARAMS color)
export const TREND_COLORS: Record<string, string> = {
  temperature: '#ef4444',  // 红
  jacket_temp: '#fb923c',  // 橙
  pH: '#a855f7',           // 紫
  DO: '#22c55e',           // 绿
  rpm: '#f97316',          // 橙红
  airflow: '#06b6d4',      // 青
  feed: '#10b981',         // 翠绿
  pressure: '#64748b',     // 灰
  weight: '#eab308',       // 黄
  vfd_current: '#ec4899',  // 粉
};

// 参数中文标签
export const PARAM_LABELS: Record<string, string> = {
  temperature: '温度',
  jacket_temp: '夹套',
  pH: 'pH',
  DO: 'DO',
  rpm: '搅拌',
  airflow: '通气',
  feed: '补料',
  pressure: '罐压',
  weight: '称重',
  vfd_current: '变频电流',
};

// 参数单位
export const PARAM_UNITS: Record<string, string> = {
  temperature: '°C',
  jacket_temp: '°C',
  pH: '',
  DO: '%',
  rpm: 'rpm',
  airflow: 'L/min',
  feed: 'mL/h',
  pressure: 'bar',
  weight: 'kg',
  vfd_current: 'A',
};

export interface TrendSeries {
  /** 序列 ID, 格式 `{reactor_id}-{batch_id}-{field}` 或简单 `{field}` */
  id: string;
  /** 显示标签 */
  name: string;
  /** 字段名 (用于颜色映射) */
  field: string;
  /** 数据点 [x, y][] - x 是时间戳 (ms) 或秒数 */
  data: [number | string, number | null][];
  /** M2.3: 自定义颜色, 多反应器对比时覆盖默认 field 颜色 */
  color?: string;
  /** M2.3: 线型 solid/dashed, 用于区分不同反应器 */
  lineType?: 'solid' | 'dashed' | 'dotted';
}

export interface BuildTrendOptionOpts {
  /** x 轴类型: 'time' (绝对时间) | 'value' (经过秒数) */
  xAxisType?: 'time' | 'value';
  /** 是否启用 dataZoom */
  dataZoom?: boolean;
  /** 阶段标记线 (M2.3 可选) */
  phaseMarks?: { idx: number; label: string }[];
  /** 标题 */
  title?: string;
}

/**
 * 把多通道数据转 ECharts trends option
 *
 * @param series 多个序列, 每个含 id/name/field/data
 * @param opts 选项
 */
export function buildTrendOption(series: TrendSeries[], opts: BuildTrendOptionOpts = {}): EChartsOption {
  const { xAxisType = 'time', dataZoom = true, title } = opts;

  return {
    backgroundColor: 'transparent',
    title: title ? {
      text: title,
      textStyle: { color: '#e5e7eb', fontSize: 14, fontWeight: 'normal' },
      left: 'center',
      top: 4,
    } : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 20, 20, 0.92)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      axisPointer: { type: 'cross', lineStyle: { color: '#6b7280', type: 'dashed' } },
      formatter: (params: any) => {
        if (!Array.isArray(params)) params = [params];
        const t = params[0]?.axisValueLabel || params[0]?.axisValue || '';
        const lines = params.map((p: any) => {
          const value = typeof p.value === 'number' ? p.value : (Array.isArray(p.value) ? p.value[1] : null);
          if (value === null || value === undefined) return null;
          return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
            <span style="flex:1">${p.seriesName}</span>
            <span style="font-family:monospace;font-weight:600">${typeof value === 'number' ? value.toFixed(2) : value}</span>
          </div>`;
        }).filter(Boolean);
        return `<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">${t}</div>${lines.join('')}`;
      },
    },
    legend: {
      data: series.map(s => s.name),
      textStyle: { color: '#9ca3af', fontSize: 11 },
      type: 'scroll',
      top: title ? 28 : 8,
      itemWidth: 14,
      itemHeight: 8,
    },
    grid: {
      left: 50,
      right: 30,
      top: title ? 60 : 40,
      bottom: dataZoom ? 60 : 30,
      borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    xAxis: {
      type: xAxisType,
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      axisLabel: {
        color: '#6b7280',
        fontSize: 10,
        formatter: xAxisType === 'value'
          ? (val: number) => formatElapsedAxis(val)
          : undefined,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.04)' } },
    },
    dataZoom: dataZoom ? [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        start: 0, end: 100,
        height: 24, bottom: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        fillerColor: 'rgba(22, 119, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.06)',
        handleStyle: { color: '#1677ff' },
        textStyle: { color: '#6b7280', fontSize: 10 },
      },
    ] : undefined,
    series: series.map(s => {
      const color = s.color || TREND_COLORS[s.field] || '#94a3b8';
      return {
        id: s.id,
        name: s.name,
        type: 'line' as const,
        data: s.data,
        itemStyle: { color },
        lineStyle: { width: 1.5, color, type: s.lineType || 'solid' },
        smooth: false,
        showSymbol: false,
        connectNulls: false,  // LTTB 多字段对齐时缺失值显示断点
        sampling: 'lttb' as const,     // ECharts 内置 LTTB 二次下采样兜底
      };
    }),
  };
}

/**
 * 构建"分面 (subplot)"趋势图 option — 每个参数独立 grid + Y 轴, 堆叠竖排.
 * 适用于"单批次多参数对比": 温度/pH/DO 等量纲差异大的参数, 分面显示避免相互掩盖.
 *
 * @param series 序列列表 (field 相同的序列会被合并到同一 subplot, 支持多反应器对比)
 * @param opts   xAxis 类型 + dataZoom
 */
export function buildFacetedTrendOption(series: TrendSeries[], opts: BuildTrendOptionOpts = {}): EChartsOption {
  const { xAxisType = 'time', dataZoom = true } = opts;

  // 按 field 分组, 每组一个 subplot
  const fieldOrder: string[] = [];
  const fieldMap = new Map<string, TrendSeries[]>();
  for (const s of series) {
    if (!fieldMap.has(s.field)) { fieldMap.set(s.field, []); fieldOrder.push(s.field); }
    fieldMap.get(s.field)!.push(s);
  }

  const n = fieldOrder.length || 1;
  // 每个 subplot 的高度百分比 (减去顶部 legend 和底部 dataZoom)
  const topPad = 40;
  const botPad = dataZoom ? 60 : 30;
  const gap = 16;
  const totalHeight = 100;  // 百分比
  const unitH = (totalHeight - (n - 1) * (gap / 6)) / n;  // 粗略分配

  const grids = fieldOrder.map((_, i) => ({
    left: 60,
    right: 30,
    top: `${topPad + i * (100 / n)}px`,
    height: `${Math.max(60, 100 / n - gap)}px`,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    containLabel: false,
  }));

  const xAxes = fieldOrder.map((_, i) => ({
    gridIndex: i,
    type: xAxisType,
    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
    axisLabel: {
      color: '#6b7280',
      fontSize: 10,
      show: i === n - 1,  // 只在最下面一个 subplot 显示 X 轴标签
      formatter: xAxisType === 'value'
        ? (val: number) => formatElapsedAxis(val)
        : undefined,
    },
    splitLine: { show: false },
  }));

  const yAxes = fieldOrder.map((field, i) => ({
    gridIndex: i,
    type: 'value' as const,
    name: `${PARAM_LABELS[field] || field}${PARAM_UNITS[field] ? ` (${PARAM_UNITS[field]})` : ''}`,
    nameTextStyle: { color: '#9ca3af', fontSize: 10, align: 'left' as const },
    nameLocation: 'end' as const,
    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
    axisLabel: { color: '#6b7280', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.04)' } },
  }));

  const seriesOut = series.map(s => {
    const gridIdx = fieldOrder.indexOf(s.field);
    const color = s.color || TREND_COLORS[s.field] || '#94a3b8';
    return {
      id: s.id,
      name: s.name,
      type: 'line' as const,
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx,
      data: s.data,
      itemStyle: { color },
      lineStyle: { width: 1.5, color, type: s.lineType || 'solid' },
      smooth: false,
      showSymbol: false,
      connectNulls: false,
      sampling: 'lttb' as const,
    };
  });

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20, 20, 20, 0.92)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
      axisPointer: { type: 'cross', lineStyle: { color: '#6b7280', type: 'dashed' } },
    },
    legend: {
      data: series.map(s => s.name),
      textStyle: { color: '#9ca3af', fontSize: 11 },
      type: 'scroll',
      top: 4,
      itemWidth: 14,
      itemHeight: 8,
    },
    axisPointer: {
      // 所有 subplot 的光标联动
      link: [{ xAxisIndex: 'all' }] as any,
    },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    dataZoom: dataZoom ? [
      { type: 'inside', xAxisIndex: fieldOrder.map((_, i) => i), start: 0, end: 100 },
      {
        type: 'slider',
        xAxisIndex: fieldOrder.map((_, i) => i),
        start: 0, end: 100,
        height: 24, bottom: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        fillerColor: 'rgba(22, 119, 255, 0.15)',
        borderColor: 'rgba(255, 255, 255, 0.06)',
        handleStyle: { color: '#1677ff' },
        textStyle: { color: '#6b7280', fontSize: 10 },
      },
    ] : undefined,
    series: seriesOut,
  } as EChartsOption;
  void unitH; // 保留备用, 避免 lint 警告
}

/**
 * 把秒数格式化为 "1h23m" / "45m12s" / "23s"
 */
export function formatElapsedAxis(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

/**
 * 生成阶段标记线 (虚线 markLine)
 */
export function phaseMarkLines(phases: { idx: number; label: string }[]) {
  return {
    silent: true,
    symbol: 'none',
    lineStyle: { color: '#94a3b8', type: 'dashed' as const, width: 1 },
    label: { color: '#94a3b8', fontSize: 10, position: 'insideEndTop' as const },
    data: phases.map(p => ({ xAxis: p.idx, name: p.label })),
  };
}
