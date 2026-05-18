// ============================================================
// CusumAlertPanel — CUSUM 实时异常检测面板
// 展示累积和 S+/S- 时序曲线 + 阈值线 h, 体现统计过程
// ============================================================

'use client';

import React, { useMemo } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import type { EChartsOption } from 'echarts';
import { useLocale } from '@/i18n/useLocale';

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

// CUSUM 报警阈值 (与后端 cusumConfig.h 一致)
const H_THRESHOLD = 5;

function statusDot(alarming: boolean): string {
  if (alarming) return 'bg-red-500 animate-pulse';
  return 'bg-green-500';
}

/** 构建单通道 CUSUM 趋势图 option */
function buildCusumChartOption(
  channel: string,
  history: Array<{ t: number; cumPos: number; cumNeg: number }>,
): EChartsOption {
  const times = history.map(p => new Date(p.t).toLocaleTimeString('zh-CN', { hour12: false }));
  const cumPosData = history.map(p => p.cumPos);
  const cumNegData = history.map(p => -p.cumNeg); // 负方向显示

  return {
    grid: { left: 36, right: 8, top: 8, bottom: 20 },
    xAxis: {
      type: 'category',
      data: times,
      show: false,
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLabel: { fontSize: 10, color: '#888' },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.8)',
      borderColor: 'transparent',
      textStyle: { fontSize: 11, color: '#ddd' },
      formatter: (params: any) => {
        const t = params[0]?.axisValue || '';
        const lines = params.map((p: any) =>
          `${p.marker} ${p.seriesName}: ${Math.abs(p.value).toFixed(2)}`
        );
        return `${t}<br/>${lines.join('<br/>')}`;
      },
    },
    series: [
      {
        name: 'S⁺ (偏高累积)',
        type: 'line',
        data: cumPosData,
        symbol: 'none',
        lineStyle: { width: 1.5, color: CHANNEL_COLORS[channel] || '#3b82f6' },
        areaStyle: { color: `${CHANNEL_COLORS[channel] || '#3b82f6'}15` },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: true, position: 'insideEndTop', fontSize: 9, color: '#f87171', formatter: 'h={c}' },
          lineStyle: { type: 'dashed', color: '#f87171', width: 1 },
          data: [{ yAxis: H_THRESHOLD }],
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
          label: { show: true, position: 'insideEndBottom', fontSize: 9, color: '#f87171', formatter: '-h={c}' },
          lineStyle: { type: 'dashed', color: '#f87171', width: 1 },
          data: [{ yAxis: -H_THRESHOLD }],
        },
      },
    ],
  };
}

export function CusumAlertPanel({ batchId, reactorId }: { batchId?: string; reactorId?: string }) {
  // 多反应器隔离: 按 reactorId 取 CUSUM 数据, 未匹配 fallback 顶层
  const _topCusumAlerts = useRealtimeStore((s) => s.cusumAlerts);
  const _topCusumHistory = useRealtimeStore((s) => s.cusumHistory);
  const _reactorCusumAlerts = useRealtimeStore((s) => reactorId ? s.reactorData[reactorId]?.cusumAlerts : undefined);
  const _reactorCusumHistory = useRealtimeStore((s) => reactorId ? s.reactorData[reactorId]?.cusumHistory : undefined);
  const cusumAlerts = _reactorCusumAlerts ?? _topCusumAlerts;
  const cusumHistory = _reactorCusumHistory ?? _topCusumHistory;

  // 按通道构建图表 option (仅对有历史数据的通道)
  const chartOptions = useMemo(() => {
    const opts: Record<string, EChartsOption> = {};
    for (const [ch, history] of Object.entries(cusumHistory)) {
      if (history.length >= 2) {
        opts[ch] = buildCusumChartOption(ch, history);
      }
    }
    return opts;
  }, [cusumHistory]);

  if (!cusumAlerts || cusumAlerts.length === 0) return null;

  async function handleReset(channel?: string) {
    if (!batchId) return;
    try {
      await fetch(`${API}/api/cusum/${batchId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground/90">CUSUM 统计过程监控</h3>
        <button
          onClick={() => handleReset()}
          className="text-sm text-muted-foreground hover:text-foreground/90 transition-colors"
        >
          全部重置
        </button>
      </div>

      <div className="space-y-3">
        {cusumAlerts.map((alert) => {
          const hasChart = chartOptions[alert.channel];
          return (
            <div key={alert.channel} className="space-y-1">
              {/* 通道标题行 */}
              <div className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(alert.alarming)}`} />
                <span className="w-10 text-muted-foreground font-mono">
                  {CHANNEL_LABELS[alert.channel] || alert.channel}
                </span>
                <span className={`w-16 text-right font-mono ${
                  alert.alarming ? 'text-red-600' : Math.abs(alert.deviation) > 2 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {alert.deviation >= 0 ? '+' : ''}{alert.deviation.toFixed(1)}σ
                </span>
                <span className="text-sm text-muted-foreground font-mono">
                  S⁺={alert.cumPos.toFixed(1)} S⁻={alert.cumNeg.toFixed(1)}
                </span>
                <div className="flex-1" />
                {alert.alarming && (
                  <button
                    onClick={() => handleReset(alert.channel)}
                    className="text-sm text-muted-foreground hover:text-foreground/90"
                  >
                    重置
                  </button>
                )}
              </div>

              {/* CUSUM 累积和趋势图 */}
              {hasChart && (
                <div className="ml-5">
                  <EChartsWrapper
                    option={chartOptions[alert.channel]}
                    style={{ height: 80 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 图例说明 */}
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center gap-4 text-sm text-muted-foreground">
        <span>S⁺: 上偏累积和</span>
        <span>S⁻: 下偏累积和</span>
        <span className="text-red-400">--- h: 报警阈值 ({H_THRESHOLD}σ)</span>
        <span>累积和越过阈值 → 触发报警</span>
      </div>
    </div>
  );
}
