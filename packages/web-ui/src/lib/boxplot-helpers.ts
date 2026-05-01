// ============================================================
// boxplot-helpers.ts -- 批次对比箱线图 ECharts option 构建
//
// buildBoxplotOption -- 把批次统计数据转 ECharts boxplot option
// 多字段时使用 grid subplots (每个字段一个 subplot, 竖排堆叠)
// ============================================================

import type { EChartsOption } from 'echarts';
import * as echarts from 'echarts/core';
import { BoxplotChart, ScatterChart } from 'echarts/charts';
import { MarkAreaComponent } from 'echarts/components';
import { PARAM_LABELS, PARAM_UNITS } from './echarts-helpers';

// 注册 boxplot 相关模块 (idempotent)
let boxplotRegistered = false;
function ensureBoxplotRegistered() {
  if (boxplotRegistered) return;
  echarts.use([BoxplotChart, ScatterChart, MarkAreaComponent]);
  boxplotRegistered = true;
}

/** 后端返回的单个批次统计结构 */
export interface BatchStats {
  batch_id: string;
  stats: Record<string, {
    min: number; max: number; mean: number; sd: number;
    q1: number; median: number; q3: number; count: number;
  }>;
}

/**
 * 构建箱线图 ECharts option
 *
 * @param batchesData 批次统计数组
 * @param fields 要显示的字段列表
 */
export function buildBoxplotOption(batchesData: BatchStats[], fields: string[]): EChartsOption {
  ensureBoxplotRegistered();

  const batchIds = batchesData.map(b => b.batch_id);
  const n = fields.length;
  const isSingle = n <= 1;

  // 单字段: 一个 grid; 多字段: 纵向堆叠 subplots
  const topPad = 40;
  const gap = 16;
  const gridHeight = isSingle ? 300 : Math.max(120, 220);

  const grids = fields.map((_f, i) => ({
    left: 60, right: 30,
    top: topPad + i * (gridHeight + gap),
    height: gridHeight,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  }));

  const xAxes = fields.map((_f, i) => ({
    gridIndex: i,
    type: 'category' as const,
    data: batchIds,
    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
    axisLabel: { color: '#6b7280', fontSize: 10, show: i === n - 1 },
    splitLine: { show: false },
  }));

  const yAxes = fields.map((field, i) => ({
    gridIndex: i,
    type: 'value' as const,
    name: `${PARAM_LABELS[field] || field}${PARAM_UNITS[field] ? ` (${PARAM_UNITS[field]})` : ''}`,
    nameTextStyle: { color: '#9ca3af', fontSize: 10, align: 'left' as const },
    nameLocation: 'end' as const,
    axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.1)' } },
    axisLabel: { color: '#6b7280', fontSize: 10 },
    splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.04)' } },
  }));

  // 每个字段生成 boxplot + scatter(mean) + markArea(SD band)
  const seriesOut: any[] = [];
  fields.forEach((field, fi) => {
    // 箱线图数据: [min, q1, median, q3, max]
    const boxData = batchesData.map(b => {
      const s = b.stats[field];
      return s ? [s.min, s.q1, s.median, s.q3, s.max] : [0, 0, 0, 0, 0];
    });

    seriesOut.push({
      name: `${PARAM_LABELS[field] || field} 箱线图`,
      type: 'boxplot',
      xAxisIndex: fi,
      yAxisIndex: fi,
      data: boxData,
      itemStyle: { color: '#1677ff', borderColor: '#1677ff' },
      emphasis: { itemStyle: { borderColor: '#40a9ff' } },
    });

    // 均值散点 (菱形标记)
    const meanData = batchesData.map((b, idx) => {
      const s = b.stats[field];
      return s ? [idx, s.mean] : null;
    }).filter(Boolean);

    seriesOut.push({
      name: `${PARAM_LABELS[field] || field} 均值`,
      type: 'scatter',
      xAxisIndex: fi,
      yAxisIndex: fi,
      data: meanData,
      symbol: 'diamond',
      symbolSize: 10,
      z: 10,
      itemStyle: { color: '#f59e0b' },
      tooltip: {
        formatter: (p: any) => {
          const val = Array.isArray(p.value) ? p.value[1] : p.value;
          const unit = PARAM_UNITS[field] || '';
          return `${batchIds[p.dataIndex]} 均值: ${typeof val === 'number' ? val.toFixed(2) : val}${unit ? ' ' + unit : ''}`;
        },
      },
    });

    // SD band: mean-sd ~ mean+sd 半透明区域
    const markAreaData = batchesData.map((b, idx) => {
      const s = b.stats[field];
      if (!s) return null;
      return [
        { xAxis: batchIds[idx], yAxis: s.mean - s.sd },
        { xAxis: batchIds[idx], yAxis: s.mean + s.sd },
      ];
    }).filter(Boolean);

    if (markAreaData.length > 0) {
      // SD band 作为附加散点系列的 markArea (ECharts 限制, 需要挂到已有系列上)
      const lastSeries = seriesOut[seriesOut.length - 1];
      lastSeries.markArea = {
        silent: true,
        itemStyle: { color: 'rgba(245, 158, 11, 0.08)' },
        data: markAreaData,
      };
    }
  });

  // 总高度 (px) -- 供容器使用
  const totalHeight = topPad + n * (gridHeight + gap);

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(20, 20, 20, 0.92)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
      textStyle: { color: '#e5e7eb', fontSize: 12 },
    },
    legend: {
      textStyle: { color: '#9ca3af', fontSize: 11 },
      type: 'scroll',
      top: 4,
      itemWidth: 14,
      itemHeight: 8,
    },
    grid: isSingle ? grids[0] : grids,
    xAxis: isSingle ? xAxes[0] : xAxes,
    yAxis: isSingle ? yAxes[0] : yAxes,
    series: seriesOut,
    // 暴露 totalHeight 供容器使用
    _totalHeight: totalHeight,
  } as EChartsOption;
}

/** 辅助: 根据字段数计算推荐容器高度 (px) */
export function getBoxplotChartHeight(fieldCount: number): number {
  if (fieldCount <= 1) return 400;
  return 40 + fieldCount * (220 + 16) + 20;
}
