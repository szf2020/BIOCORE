'use client';
import React, { useMemo } from 'react';
import { EChartsWrapper } from '@/components/charts/EChartsWrapper';
import { useTagHistory } from '@/hooks';

export interface TrendProps {
  series: Array<{ tag: string; label?: string; color?: string }>;
  windowSec?: number;
  staleMs?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
}

export function Trend(props: TrendProps) {
  const { series, windowSec = 60, staleMs, yMin, yMax, width, height } = props;

  const seriesData = series.map((s) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTagHistory(s.tag, { windowSec, staleMs })
  );

  const option = useMemo(() => {
    return {
      grid: { left: 40, right: 8, top: 20, bottom: 24 },
      xAxis: { type: 'time' as const },
      yAxis: {
        type: 'value' as const,
        min: yMin,
        max: yMax,
      },
      legend: { show: series.length > 1, top: 0 },
      tooltip: { trigger: 'axis' as const },
      series: series.map((s, i) => ({
        name: s.label ?? s.tag,
        type: 'line' as const,
        showSymbol: false,
        data: seriesData[i].points.map((p) => [p.t, p.v]),
        lineStyle: s.color ? { color: s.color } : undefined,
      })),
    };
  }, [series, seriesData, yMin, yMax]);

  return (
    <div style={{ width, height }}>
      <EChartsWrapper option={option} />
    </div>
  );
}
