// KPI 仪表盘 — 参考 DELMIA Apriso MPI (Manufacturing Process Intelligence)
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Gauge, TrendingUp, Clock, Zap, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BatchKpi {
  batch_id: string;
  reactor_id: string;
  recipe_id: string | null;
  oee_pct: number | null;
  availability_pct: number | null;
  performance_pct: number | null;
  quality_pct: number | null;
  cycle_time_h: number | null;
  yield_g: number | null;
  titer_g_L: number | null;
  throughput_g_h: number | null;
  downtime_min: number;
  alarm_count: number;
  hold_count: number;
  calculated_at: string;
}

interface KpiSummary {
  batch_count: number;
  avg_oee: number | null;
  avg_cycle_time_h: number | null;
  avg_yield_g: number | null;
  avg_titer: number | null;
  avg_throughput: number | null;
  avg_downtime_min: number | null;
  total_alarms: number;
  total_holds: number;
}

interface ParetoItem { category: string; label: string; total_min: number; percentage: number; cumulative_pct: number; event_count: number }

export default function KpiDashboardPage() {
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [trends, setTrends] = useState<BatchKpi[]>([]);
  const [batches, setBatches] = useState<BatchKpi[]>([]);
  const [pareto, setPareto] = useState<ParetoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes, bRes, pRes] = await Promise.all([
        apiFetch(`${API}/api/v1/kpis/summary?days=${days}`),
        apiFetch(`${API}/api/v1/kpis/trends?limit=30`),
        apiFetch(`${API}/api/v1/kpis/batches?limit=50`),
        apiFetch(`${API}/api/v1/kpis/pareto?days=${days}`),
      ]);
      if (sRes.ok) { const d = await sRes.json(); setSummary(d?.data ?? d); }
      if (tRes.ok) { const d = await tRes.json(); setTrends(Array.isArray(d?.data ?? d) ? (d?.data ?? d) : []); }
      if (bRes.ok) { const d = await bRes.json(); setBatches(Array.isArray(d?.data ?? d) ? (d?.data ?? d) : []); }
      if (pRes.ok) { const d = await pRes.json(); setPareto((d?.data ?? d)?.pareto || []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // OEE Gauge 配置
  const oeeGaugeOption: any = {
    series: [{
      type: 'gauge' as const,
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      splitNumber: 10,
      itemStyle: { color: oeeColor(summary?.avg_oee) },
      progress: { show: true, width: 20 },
      pointer: { show: true, length: '60%', width: 4 },
      axisLine: { lineStyle: { width: 20, color: [[0.3, '#ef4444'], [0.7, '#eab308'], [1, '#22c55e']] as [number, string][] } },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { width: 2, color: '#666' } },
      axisLabel: { distance: 28, fontSize: 10, color: '#888' },
      detail: {
        valueAnimation: true, fontSize: 28, fontWeight: 'bold' as const,
        formatter: (v: number) => `${(v || 0).toFixed(1)}%`,
        color: '#fff', offsetCenter: [0, '70%'],
      },
      title: { offsetCenter: [0, '95%'], fontSize: 12, color: '#888' },
      data: [{ value: summary?.avg_oee != null ? round(summary.avg_oee * 100, 1) : 0, name: 'OEE' }],
    }],
  };

  // 趋势图配置
  const trendOption: any = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['OEE', '产量(g)', '周期(h)'], textStyle: { color: '#888', fontSize: 10 } },
    grid: { left: 50, right: 20, top: 35, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: trends.map(t => t.batch_id.length > 10 ? t.batch_id.slice(-8) : t.batch_id),
      axisLabel: { fontSize: 9, color: '#666', rotate: 30 },
    },
    yAxis: [
      { type: 'value' as const, name: 'OEE %', min: 0, max: 100, axisLabel: { fontSize: 9, color: '#666' } },
      { type: 'value' as const, name: '产量/周期', axisLabel: { fontSize: 9, color: '#666' } },
    ],
    series: [
      { name: 'OEE', type: 'line', data: trends.map(t => t.oee_pct != null ? round(t.oee_pct * 100, 1) : null), itemStyle: { color: '#22c55e' }, smooth: true },
      { name: '产量(g)', type: 'line', yAxisIndex: 1, data: trends.map(t => t.yield_g), itemStyle: { color: '#3b82f6' }, smooth: true },
      { name: '周期(h)', type: 'line', yAxisIndex: 1, data: trends.map(t => t.cycle_time_h), itemStyle: { color: '#f59e0b' }, smooth: true },
    ],
  };

  return (
    <div className="p-4 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" /> KPI 仪表盘
          </h1>
          <p className="text-xs text-muted-foreground mt-1">OEE · 产量 · 周期时间 · 停机分析 — 参考 DELMIA Apriso MPI</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="h-8 px-2 rounded bg-card border border-border text-xs">
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <SummaryCard icon={<Gauge className="w-4 h-4" />} label="平均 OEE" value={summary?.avg_oee != null ? `${round(summary.avg_oee * 100, 1)}%` : '—'} color="text-emerald-600" />
        <SummaryCard icon={<BarChart3 className="w-4 h-4" />} label="平均产量" value={summary?.avg_yield_g != null ? `${round(summary.avg_yield_g, 1)} g` : '—'} color="text-blue-600" />
        <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="平均滴度" value={summary?.avg_titer != null ? `${round(summary.avg_titer, 2)} g/L` : '—'} color="text-purple-600" />
        <SummaryCard icon={<Clock className="w-4 h-4" />} label="平均周期" value={summary?.avg_cycle_time_h != null ? `${round(summary.avg_cycle_time_h, 1)} h` : '—'} color="text-amber-600" />
        <SummaryCard icon={<Zap className="w-4 h-4" />} label="平均停机" value={summary?.avg_downtime_min != null ? `${round(summary.avg_downtime_min, 0)} min` : '—'} color="text-orange-600" />
        <SummaryCard icon={<AlertTriangle className="w-4 h-4" />} label="批次数" value={summary?.batch_count?.toString() ?? '0'} color="text-cyan-600" />
      </div>

      {/* OEE Gauge + 趋势图 */}
      <div className="grid md:grid-cols-5 gap-3">
        <Card className="md:col-span-2">
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">OEE 综合效率</h3>
            <EChartsWrapper option={oeeGaugeOption} style={{ height: 260 }} />
            {summary && (
              <div className="flex justify-around text-[10px] text-muted-foreground mt-2">
                <span>可用率 {summary.avg_oee != null ? round((summary.avg_oee || 0) * 100, 0) : '—'}%</span>
                <span>性能率 100%</span>
                <span>合格率 {summary.avg_oee != null ? '100' : '—'}%</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">KPI 趋势</h3>
            {trends.length > 0 ? (
              <EChartsWrapper option={trendOption} style={{ height: 280 }} />
            ) : (
              <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
                暂无趋势数据，完成批次后自动生成
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 帕累托图 — 损失原因分析 (参考 OEE-Designer) */}
      {pareto.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">损失帕累托分析 — 近 {days} 天</h3>
            <EChartsWrapper option={{
              tooltip: { trigger: 'axis' as const },
              legend: { data: ['损失时间 (min)', '累计 %'], textStyle: { color: '#888', fontSize: 10 } },
              grid: { left: 60, right: 50, top: 35, bottom: 60 },
              xAxis: { type: 'category' as const, data: pareto.map(p => p.label), axisLabel: { fontSize: 10, color: '#888', rotate: 20 } },
              yAxis: [
                { type: 'value' as const, name: '时间 (min)', axisLabel: { fontSize: 9, color: '#666' } },
                { type: 'value' as const, name: '累计 %', min: 0, max: 100, axisLabel: { fontSize: 9, color: '#666' } },
              ],
              series: [
                {
                  name: '损失时间 (min)', type: 'bar', data: pareto.map(p => p.total_min),
                  itemStyle: { color: '#ef4444', borderRadius: [4, 4, 0, 0] },
                },
                {
                  name: '累计 %', type: 'line', yAxisIndex: 1, data: pareto.map(p => p.cumulative_pct),
                  lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b' }, symbol: 'circle', symbolSize: 6,
                },
              ],
            }} style={{ height: 280 }} />
          </CardContent>
        </Card>
      )}

      {/* 批次 KPI 表 */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground mb-3">批次 KPI 明细</h3>
          {batches.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">暂无 KPI 数据</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2">批次</th>
                    <th className="text-left py-2 px-2">反应器</th>
                    <th className="text-right py-2 px-2">OEE</th>
                    <th className="text-right py-2 px-2">产量 (g)</th>
                    <th className="text-right py-2 px-2">滴度 (g/L)</th>
                    <th className="text-right py-2 px-2">周期 (h)</th>
                    <th className="text-right py-2 px-2">停机 (min)</th>
                    <th className="text-right py-2 px-2">报警</th>
                    <th className="text-right py-2 px-2">Hold</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.batch_id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-1.5 px-2 font-mono">{b.batch_id}</td>
                      <td className="py-1.5 px-2">{b.reactor_id}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={b.oee_pct != null ? oeeTextColor(b.oee_pct) : ''}>{b.oee_pct != null ? `${round(b.oee_pct * 100, 1)}%` : '—'}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right">{b.yield_g != null ? round(b.yield_g, 1) : '—'}</td>
                      <td className="py-1.5 px-2 text-right">{b.titer_g_L != null ? round(b.titer_g_L, 2) : '—'}</td>
                      <td className="py-1.5 px-2 text-right">{b.cycle_time_h != null ? round(b.cycle_time_h, 1) : '—'}</td>
                      <td className="py-1.5 px-2 text-right">{round(b.downtime_min, 0)}</td>
                      <td className="py-1.5 px-2 text-right">{b.alarm_count}</td>
                      <td className="py-1.5 px-2 text-right">{b.hold_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 辅助组件 ─────────────────────────────────────────────

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={color}>{icon}</div>
        <div>
          <div className="text-[10px] text-muted-foreground">{label}</div>
          <div className="text-sm font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function oeeColor(v: number | null | undefined): string {
  if (v == null) return '#666';
  const pct = v * 100;
  if (pct >= 85) return '#22c55e';
  if (pct >= 60) return '#eab308';
  return '#ef4444';
}

function oeeTextColor(v: number): string {
  const pct = v * 100;
  if (pct >= 85) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
