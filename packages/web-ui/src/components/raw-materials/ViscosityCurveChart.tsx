// 粘度-温度曲线实时预览 (M2.6 物性编辑器)
'use client';

import React, { useMemo } from 'react';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import type { EChartsOption } from 'echarts';

interface Props {
  data: [number, number][]; // [[temperature, viscosity], ...]
  height?: number;
}

/**
 * 温度-粘度曲线可视化 (X=温度°C, Y=粘度 mPa·s)
 * 空数据时显示占位文本。
 */
export function ViscosityCurveChart({ data, height = 240 }: Props) {
  const option: EChartsOption = useMemo(() => {
    const sorted = [...data].filter(p => p[0] !== null && p[1] !== null).sort((a, b) => a[0] - b[0]);
    return {
      backgroundColor: 'transparent',
      grid: { left: 45, right: 15, top: 20, bottom: 35 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#e5e7eb', fontSize: 11 },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          const v = Array.isArray(p?.value) ? p.value : [p?.axisValue, p?.value];
          return `<div style="font-size:11px">T = <b>${v[0]}°C</b><br/>η = <b>${v[1]} mPa·s</b></div>`;
        },
      },
      xAxis: {
        type: 'value',
        name: '温度 (°C)',
        nameLocation: 'middle',
        nameGap: 22,
        nameTextStyle: { color: '#9ca3af', fontSize: 10 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: { color: '#9ca3af', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      yAxis: {
        type: 'value',
        name: 'η (mPa·s)',
        nameTextStyle: { color: '#9ca3af', fontSize: 10 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.15)' } },
        axisLabel: { color: '#9ca3af', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      series: [
        {
          type: 'line',
          data: sorted,
          smooth: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: '#06b6d4' },
          lineStyle: { color: '#06b6d4', width: 2 },
          areaStyle: { color: 'rgba(6, 182, 212, 0.15)' },
        },
      ],
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded"
      >
        尚无曲线数据 — 添加至少 2 个点以预览
      </div>
    );
  }

  return <EChartsWrapper option={option} style={{ height }} />;
}
