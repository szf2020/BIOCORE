// ============================================================
// MemoryChart — heap_used_mb + rss_mb 双线 (T41)
// ============================================================
'use client';

import React from 'react';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';

export interface MemorySample {
  ts: string;
  memory: { heap_used_mb?: number; rss_mb?: number };
}

export function MemoryChart({ series }: { series: MemorySample[] }) {
  const xs = series.map((s) => s.ts);
  const heap = series.map((s) => s.memory?.heap_used_mb ?? null);
  const rss = series.map((s) => s.memory?.rss_mb ?? null);

  const option: any = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['heap', 'rss'], top: 0 },
    grid: { left: 50, right: 16, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: xs,
      axisLabel: {
        fontSize: 10,
        formatter: (v: string) => {
          // 时间戳过长时只显示 HH:mm
          if (typeof v === 'string' && v.length >= 16) return v.slice(11, 16);
          return v;
        },
      },
    },
    yAxis: { type: 'value', name: 'MB', nameTextStyle: { fontSize: 10 } },
    series: [
      { name: 'heap', type: 'line', data: heap, smooth: true, showSymbol: false, lineStyle: { width: 2 } },
      { name: 'rss', type: 'line', data: rss, smooth: true, showSymbol: false, lineStyle: { width: 2 } },
    ],
  };

  return (
    <div className="bg-card border rounded p-3">
      <h2 className="font-semibold mb-2 text-sm">内存（24h）</h2>
      <div style={{ height: 240 }}>
        {series.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">暂无样本</div>
        ) : (
          <EChartsWrapper option={option} style={{ height: 240 }} />
        )}
      </div>
    </div>
  );
}
