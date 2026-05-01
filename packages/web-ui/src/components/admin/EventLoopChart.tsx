// ============================================================
// EventLoopChart — lag_p50_ms + lag_p99_ms 双线 (T41)
// ============================================================
'use client';

import React from 'react';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';

export interface EventLoopSample {
  ts: string;
  event_loop: { lag_p50_ms?: number; lag_p99_ms?: number };
}

export function EventLoopChart({ series }: { series: EventLoopSample[] }) {
  const xs = series.map((s) => s.ts);
  const p50 = series.map((s) => s.event_loop?.lag_p50_ms ?? null);
  const p99 = series.map((s) => s.event_loop?.lag_p99_ms ?? null);

  const option: any = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['p50', 'p99'], top: 0 },
    grid: { left: 50, right: 16, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: xs,
      axisLabel: {
        fontSize: 10,
        formatter: (v: string) => {
          if (typeof v === 'string' && v.length >= 16) return v.slice(11, 16);
          return v;
        },
      },
    },
    yAxis: { type: 'value', name: 'ms', nameTextStyle: { fontSize: 10 } },
    series: [
      { name: 'p50', type: 'line', data: p50, smooth: true, showSymbol: false, lineStyle: { width: 2 } },
      { name: 'p99', type: 'line', data: p99, smooth: true, showSymbol: false, lineStyle: { width: 2 } },
    ],
  };

  return (
    <div className="bg-card border rounded p-3">
      <h2 className="font-semibold mb-2 text-sm">事件循环延迟（24h）</h2>
      <div style={{ height: 240 }}>
        {series.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">暂无样本</div>
        ) : (
          <EChartsWrapper option={option} style={{ height: 240 }} />
        )}
      </div>
    </div>
  );
}
