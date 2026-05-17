// ============================================================
// CusumHistoryPanel — 历史批次 CUSUM 累积和可视化
// 从 /api/v1/cusum/:batchId/history 获取离线计算的 CUSUM 结果
// 展示每个通道的 S⁺/S⁻ 时序曲线 + 阈值线 h
// ============================================================

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/auth';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import type { EChartsOption } from 'echarts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const CHANNEL_LABELS: Record<string, string> = {
  temperature: '温度',
  pH: 'pH',
  DO: '溶氧',
  pressure: '罐压',
  rpm: '转速',
};

const CHANNEL_COLORS: Record<string, string> = {
  temperature: '#ef4444',
  pH: '#a855f7',
  DO: '#22c55e',
  pressure: '#64748b',
  rpm: '#f97316',
};

interface CusumPoint {
  channel: string;
  minute: number;
  timestamp: string;
  raw_value: number;
  normalized: number;
  cum_pos: number;
  cum_neg: number;
  anomaly: number;
}

interface CusumSummary {
  total: number;
  alarmCount: number;
  maxCumPos: number;
  maxCumNeg: number;
  firstAlarmMin: number | null;
}

interface CusumHistoryResponse {
  batchId: string;
  channels: Record<string, CusumPoint[]>;
  summary: Record<string, CusumSummary>;
  h: number;
  k: number;
}

function buildChannelChart(
  channel: string,
  points: CusumPoint[],
  h: number,
): EChartsOption {
  const minutes = points.map(p => `${Math.floor(p.minute / 60)}h${(p.minute % 60).toString().padStart(2, '0')}m`);
  const cumPosData = points.map(p => p.cum_pos);
  const cumNegData = points.map(p => -p.cum_neg);
  const color = CHANNEL_COLORS[channel] || '#3b82f6';

  return {
    grid: { left: 50, right: 16, top: 24, bottom: 28 },
    title: {
      text: `${CHANNEL_LABELS[channel] || channel}  CUSUM`,
      left: 'center',
      top: 2,
      textStyle: { fontSize: 12, color: '#ccc', fontWeight: 500 },
    },
    xAxis: {
      type: 'category',
      data: minutes,
      axisLabel: { fontSize: 9, color: '#888', interval: Math.floor(minutes.length / 6) },
      axisLine: { lineStyle: { color: '#333' } },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLabel: { fontSize: 9, color: '#888' },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: 'transparent',
      textStyle: { fontSize: 11, color: '#ddd' },
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex ?? 0;
        const pt = points[idx];
        if (!pt) return '';
        const lines = [
          `<b>${minutes[idx]}</b> (第${pt.minute}分钟)`,
          `原始值: ${pt.raw_value.toFixed(2)}`,
          `标准化偏差: ${pt.normalized >= 0 ? '+' : ''}${pt.normalized.toFixed(2)}σ`,
          `S⁺: ${pt.cum_pos.toFixed(2)}`,
          `S⁻: ${pt.cum_neg.toFixed(2)}`,
          pt.anomaly ? '<span style="color:#f87171">⚠ 报警</span>' : '<span style="color:#4ade80">正常</span>',
        ];
        return lines.join('<br/>');
      },
    },
    series: [
      {
        name: 'S⁺ (偏高累积)',
        type: 'line',
        data: cumPosData,
        symbol: 'none',
        lineStyle: { width: 1.5, color },
        areaStyle: { color: `${color}15` },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: true, position: 'insideEndTop', fontSize: 9, color: '#f87171', formatter: `h=${h}` },
          lineStyle: { type: 'dashed', color: '#f87171', width: 1 },
          data: [{ yAxis: h }],
        },
      },
      {
        name: 'S⁻ (偏低累积)',
        type: 'line',
        data: cumNegData,
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#60a5fa' },
        areaStyle: { color: 'rgba(96,165,250,0.08)' },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: true, position: 'insideEndBottom', fontSize: 9, color: '#f87171', formatter: `-h=${-h}` },
          lineStyle: { type: 'dashed', color: '#f87171', width: 1 },
          data: [{ yAxis: -h }],
        },
      },
    ],
  };
}

export function CusumHistoryPanel({ batchId }: { batchId: string }) {
  const [data, setData] = useState<CusumHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batchId) return;
    setLoading(true);
    setError('');
    apiFetch(`${API}/api/v1/cusum/${encodeURIComponent(batchId)}/history`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(resp => {
        const d = resp?.data || resp;
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [batchId]);

  const chartOptions = useMemo(() => {
    if (!data?.channels) return {};
    const opts: Record<string, EChartsOption> = {};
    for (const [ch, pts] of Object.entries(data.channels)) {
      if (pts.length >= 2) {
        opts[ch] = buildChannelChart(ch, pts, data.h);
      }
    }
    return opts;
  }, [data]);

  if (loading) return <div className="text-sm text-muted-foreground p-3">加载 CUSUM 历史数据...</div>;
  if (error) return <div className="text-sm text-red-400 p-3">CUSUM 数据加载失败: {error}</div>;
  if (!data || Object.keys(data.channels || {}).length === 0) return null;

  const channels = Object.keys(chartOptions);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/90">
          CUSUM 统计过程监控 — {batchId}
        </h3>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>h={data.h} k={data.k}</span>
          <span>S⁺: 上偏累积和</span>
          <span>S⁻: 下偏累积和</span>
          <span className="text-red-400">--- 报警阈值</span>
        </div>
      </div>

      {/* 通道摘要卡片 */}
      <div className="grid grid-cols-5 gap-2">
        {channels.map(ch => {
          const s = data.summary[ch];
          if (!s) return null;
          const hasAlarm = s.alarmCount > 0;
          return (
            <div key={ch} className={`rounded border p-2 text-sm ${hasAlarm ? 'border-red-500/30 bg-red-500/5' : 'border-border bg-card'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${hasAlarm ? 'bg-red-500' : 'bg-green-500'}`} />
                <span className="font-medium" style={{ color: CHANNEL_COLORS[ch] }}>
                  {CHANNEL_LABELS[ch] || ch}
                </span>
              </div>
              <div className="text-muted-foreground space-y-0.5">
                <div>S⁺max: {s.maxCumPos.toFixed(1)}</div>
                <div>S⁻max: {s.maxCumNeg.toFixed(1)}</div>
                {hasAlarm && (
                  <div className="text-red-400">
                    报警 {s.alarmCount}次 · 首次: {s.firstAlarmMin}min
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CUSUM 趋势图 */}
      <div className="grid grid-cols-1 gap-3">
        {channels.map(ch => (
          <div key={ch}>
            <EChartsWrapper option={chartOptions[ch]} style={{ height: 160 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
