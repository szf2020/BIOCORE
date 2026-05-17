// SPC 控制图 — 参考 DELMIA Apriso Quality 模块
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Settings2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SpcParameter { key: string; label: string; source: string; field: string }
interface SpcPoint { id: number; parameter_name: string; batch_id: string; value: number; out_of_control: number; rules_violated: string | null; recorded_at: string }
interface SpcLimits { ucl: number; cl: number; lcl: number; usl: number | null; lsl: number | null }
interface SpcCapability { cp: number | null; cpk: number | null; sigma: number; n: number; cpk_grade: string | null }

type ChartType = 'individual' | 'xbar_r' | 'ewma' | 'p' | 'c';
const CHART_TYPE_LABELS: Record<ChartType, string> = {
  individual: 'Individual (单值)',
  xbar_r: 'X-bar R (均值-极差)',
  ewma: 'EWMA (指数加权)',
  p: 'p 图 (不合格率)',
  c: 'c 图 (缺陷数)',
};

export default function SpcPage() {
  const [parameters, setParameters] = useState<SpcParameter[]>([]);
  const [selectedParam, setSelectedParam] = useState('');
  const [chartType, setChartType] = useState<ChartType>('individual');
  const [chartData, setChartData] = useState<{ limits: SpcLimits | null; points: SpcPoint[] } | null>(null);
  const [extChartData, setExtChartData] = useState<any>(null); // 扩展图表数据 (EWMA/X-bar R/p/c)
  const [capability, setCapability] = useState<SpcCapability | null>(null);
  const [loading, setLoading] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMsg, setCalcMsg] = useState('');

  // 加载可用参数
  useEffect(() => {
    apiFetch(`${API}/api/v1/spc/parameters`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const list = Array.isArray(d?.data ?? d) ? (d?.data ?? d) : [];
        setParameters(list);
        if (list.length > 0 && !selectedParam) setSelectedParam(list[0].key);
      })
      .catch(() => {});
  }, []);

  // 加载控制图数据 (支持多图表类型)
  const loadChart = useCallback(async () => {
    if (!selectedParam) return;
    setLoading(true);
    setExtChartData(null);
    try {
      if (chartType === 'individual') {
        const [cRes, capRes] = await Promise.all([
          apiFetch(`${API}/api/v1/spc/charts/${selectedParam}`),
          apiFetch(`${API}/api/v1/spc/capability/${selectedParam}`),
        ]);
        if (cRes.ok) { const d = await cRes.json(); setChartData(d?.data ?? d); }
        if (capRes.ok) { const d = await capRes.json(); setCapability(d?.data ?? d); }
        else setCapability(null);
      } else {
        // 扩展图表类型走新端点
        const cRes = await apiFetch(`${API}/api/v1/spc/charts-ext/${selectedParam}?chart_type=${chartType}`);
        if (cRes.ok) { const d = await cRes.json(); setExtChartData(d?.data ?? d); }
        setChartData(null);
        // 能力指数仍用 individual 数据
        const capRes = await apiFetch(`${API}/api/v1/spc/capability/${selectedParam}`);
        if (capRes.ok) { const d = await capRes.json(); setCapability(d?.data ?? d); }
        else setCapability(null);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedParam, chartType]);

  useEffect(() => { loadChart(); }, [loadChart]);

  // 自动计算控制限
  const handleCalculateLimits = async () => {
    setCalcMsg('计算中...');
    try {
      const res = await apiFetch(`${API}/api/v1/spc/limits/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameter_name: selectedParam, created_by: 'admin' }),
      });
      const d = await res.json();
      if (res.ok) {
        const data = d?.data ?? d;
        setCalcMsg(`✓ 已计算: ${data.dataPointCount} 个数据点, ${data.outOfControlCount} 个失控点`);
        setCalcOpen(false);
        loadChart();
      } else {
        setCalcMsg(`✗ ${d?.error || d?.data?.error || '计算失败'}`);
      }
    } catch (e) {
      setCalcMsg(`✗ ${(e as Error).message}`);
    }
  };

  // 控制图 ECharts 配置
  const controlChartOption = chartData && chartData.points.length > 0 ? buildControlChartOption(chartData, selectedParam, parameters) : null;

  const oocCount = chartData?.points.filter(p => p.out_of_control).length ?? 0;
  const totalPoints = chartData?.points.length ?? 0;
  const paramLabel = parameters.find(p => p.key === selectedParam)?.label || selectedParam;

  return (
    <div className="p-4 space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" /> SPC 控制图
          </h1>
          <p className="text-sm text-muted-foreground mt-1">统计过程控制 · 西电规则 · 过程能力 Cp/Cpk — 参考 DELMIA Apriso Quality</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCalcOpen(true)}>
            <Settings2 className="w-3.5 h-3.5 mr-1" /> 计算控制限
          </Button>
          <Button size="sm" variant="outline" onClick={loadChart} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </div>

      {/* 参数选择 + 能力指数 */}
      <div className="flex flex-wrap gap-3">
        <Card className="flex-1 min-w-[200px]">
          <CardContent className="p-3">
            <label className="text-sm text-muted-foreground">SPC 参数</label>
            <select value={selectedParam} onChange={e => setSelectedParam(e.target.value)}
              className="mt-1 w-full h-8 px-2 rounded bg-background border border-border text-sm">
              {parameters.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </CardContent>
        </Card>
        <Card className="min-w-[180px]">
          <CardContent className="p-3">
            <label className="text-sm text-muted-foreground">图表类型</label>
            <select value={chartType} onChange={e => setChartType(e.target.value as ChartType)}
              className="mt-1 w-full h-8 px-2 rounded bg-background border border-border text-sm">
              {(parameters.find(p => p.key === selectedParam) as any)?.chartTypes?.map((ct: ChartType) => (
                <option key={ct} value={ct}>{CHART_TYPE_LABELS[ct]}</option>
              )) || Object.entries(CHART_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </CardContent>
        </Card>

        <CapabilityCard label="Cp" value={capability?.cp} />
        <CapabilityCard label="Cpk" value={capability?.cpk} grade={capability?.cpk_grade} />
        <Card className="min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-sm text-muted-foreground">σ</div>
            <div className="text-lg font-bold font-mono">{capability?.sigma?.toFixed(3) ?? '—'}</div>
          </CardContent>
        </Card>
        <Card className="min-w-[100px]">
          <CardContent className="p-3 text-center">
            <div className="text-sm text-muted-foreground">失控 / 总点数</div>
            <div className={`text-lg font-bold ${oocCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {oocCount} / {totalPoints}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 控制图 */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{paramLabel} — {CHART_TYPE_LABELS[chartType]} 控制图</h3>
          {chartType === 'individual' && controlChartOption ? (
            <EChartsWrapper option={controlChartOption} style={{ height: 360 }} />
          ) : extChartData ? (
            chartType === 'ewma' ? (
              <EChartsWrapper option={buildEWMAChartOption(extChartData)} style={{ height: 360 }} />
            ) : chartType === 'xbar_r' ? (
              <div className="space-y-2">
                <EChartsWrapper option={buildXbarRChartOption(extChartData, 'xbar')} style={{ height: 200 }} />
                <EChartsWrapper option={buildXbarRChartOption(extChartData, 'r')} style={{ height: 180 }} />
              </div>
            ) : (chartType === 'p' || chartType === 'c') ? (
              <EChartsWrapper option={buildAttributeChartOption(extChartData, chartType)} style={{ height: 360 }} />
            ) : null
          ) : (
            <div className="flex flex-col items-center justify-center h-[360px] text-muted-foreground text-sm gap-2">
              <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
              <p>暂无 SPC 数据</p>
              <p className="text-sm">完成批次并点击"计算控制限"后自动生成</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 数据点明细 */}
      {chartData && chartData.points.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">数据点明细</h3>
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2">批次</th>
                    <th className="text-right py-2 px-2">值</th>
                    <th className="text-center py-2 px-2">状态</th>
                    <th className="text-left py-2 px-2">违反规则</th>
                    <th className="text-left py-2 px-2">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.points.map(p => (
                    <tr key={p.id} className={`border-b border-border/30 ${p.out_of_control ? 'bg-red-500/5' : ''}`}>
                      <td className="py-1.5 px-2 font-mono">{p.batch_id}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{p.value?.toFixed(3)}</td>
                      <td className="py-1.5 px-2 text-center">
                        {p.out_of_control
                          ? <AlertCircle className="w-3.5 h-3.5 text-red-600 inline" />
                          : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />}
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground">
                        {p.rules_violated ? formatRules(p.rules_violated) : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground">{p.recorded_at?.slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 计算控制限对话框 */}
      {calcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setCalcOpen(false)}>
          <div className="bg-card border border-border rounded-lg w-[420px] shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">自动计算控制限</h3>
            <p className="text-sm text-muted-foreground">
              从已完成批次的历史数据自动计算 <strong>{paramLabel}</strong> 的 UCL/CL/LCL (3σ 法)。
              至少需要 3 个批次数据。
            </p>
            {calcMsg && <div className="text-sm bg-muted/50 rounded p-2">{calcMsg}</div>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setCalcOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleCalculateLimits}>计算并保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 辅助函数 ─────────────────────────────────────────────

function CapabilityCard({ label, value, grade }: { label: string; value: number | null | undefined; grade?: string | null }) {
  const color = grade === 'excellent' ? 'text-emerald-600' : grade === 'acceptable' ? 'text-amber-600' : grade === 'poor' ? 'text-red-600' : '';
  return (
    <Card className="min-w-[100px]">
      <CardContent className="p-3 text-center">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold font-mono ${color}`}>{value != null ? value.toFixed(2) : '—'}</div>
        {grade && <div className={`text-[12px] ${color}`}>{grade === 'excellent' ? '优秀' : grade === 'acceptable' ? '合格' : '不足'}</div>}
      </CardContent>
    </Card>
  );
}

const RULE_LABELS: Record<string, string> = {
  rule1: '1点>3σ',
  rule2: '9点同侧',
  rule3: '6点单调',
  rule4: '14点交替',
};

function formatRules(rulesJson: string): string {
  try {
    const rules = JSON.parse(rulesJson);
    return rules.map((r: string) => RULE_LABELS[r] || r).join(', ');
  } catch {
    return rulesJson;
  }
}

function buildControlChartOption(
  data: { limits: SpcLimits | null; points: SpcPoint[] },
  paramName: string,
  parameters: SpcParameter[],
) {
  const { limits, points } = data;
  const paramLabel = parameters.find(p => p.key === paramName)?.label || paramName;

  const xData = points.map((p, i) => p.batch_id.length > 10 ? p.batch_id.slice(-8) : p.batch_id);
  const values = points.map(p => p.value);

  // 数据点: 失控用红色, 正常用蓝色
  const seriesData = points.map(p => ({
    value: p.value,
    itemStyle: p.out_of_control ? { color: '#ef4444', borderColor: '#ef4444' } : undefined,
    symbolSize: p.out_of_control ? 10 : 6,
  }));

  const markLines: any[] = [];
  if (limits) {
    markLines.push(
      { yAxis: limits.ucl, name: 'UCL', lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: `UCL=${limits.ucl.toFixed(2)}`, fontSize: 9, color: '#ef4444' } },
      { yAxis: limits.cl, name: 'CL', lineStyle: { color: '#22c55e', type: 'solid' }, label: { formatter: `CL=${limits.cl.toFixed(2)}`, fontSize: 9, color: '#22c55e' } },
      { yAxis: limits.lcl, name: 'LCL', lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: `LCL=${limits.lcl.toFixed(2)}`, fontSize: 9, color: '#ef4444' } },
    );
    if (limits.usl != null) markLines.push({ yAxis: limits.usl, name: 'USL', lineStyle: { color: '#f59e0b', type: 'dotted' }, label: { formatter: `USL=${limits.usl.toFixed(2)}`, fontSize: 9 } });
    if (limits.lsl != null) markLines.push({ yAxis: limits.lsl, name: 'LSL', lineStyle: { color: '#f59e0b', type: 'dotted' }, label: { formatter: `LSL=${limits.lsl.toFixed(2)}`, fontSize: 9 } });
  }

  return {
    tooltip: { trigger: 'axis' as const, formatter: (params: any) => {
      const p = params[0];
      const pt = points[p.dataIndex];
      let tip = `${pt.batch_id}<br/>值: <strong>${pt.value?.toFixed(3)}</strong>`;
      if (pt.out_of_control) tip += `<br/><span style="color:#ef4444">⚠ 失控: ${formatRules(pt.rules_violated || '[]')}</span>`;
      return tip;
    }},
    grid: { left: 60, right: 30, top: 20, bottom: 40 },
    xAxis: {
      type: 'category' as const,
      data: xData,
      axisLabel: { fontSize: 9, color: '#666', rotate: 30 },
    },
    yAxis: {
      type: 'value' as const,
      name: paramLabel,
      axisLabel: { fontSize: 9, color: '#666' },
    },
    series: [{
      type: 'line',
      data: seriesData,
      symbol: 'circle',
      lineStyle: { color: '#3b82f6', width: 1.5 },
      itemStyle: { color: '#3b82f6' },
      markLine: {
        silent: true,
        symbol: 'none',
        data: markLines,
      },
    }],
  };
}

// ─── EWMA 图 (时变 UCL/LCL 曲线) ──────────────────────────

function buildEWMAChartOption(data: any) {
  const { points, cl } = data;
  if (!points || points.length === 0) return {};

  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['EWMA', 'UCL', 'LCL', 'CL'], textStyle: { color: '#888', fontSize: 10 } },
    grid: { left: 60, right: 30, top: 35, bottom: 40 },
    xAxis: { type: 'category' as const, data: points.map((p: any) => p.batch_id?.slice(-8) || ''), axisLabel: { fontSize: 9, color: '#666', rotate: 30 } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 9, color: '#666' } },
    series: [
      {
        name: 'EWMA', type: 'line', data: points.map((p: any) => ({
          value: p.ewma,
          itemStyle: p.out_of_control ? { color: '#ef4444' } : undefined,
          symbolSize: p.out_of_control ? 10 : 5,
        })),
        symbol: 'circle', lineStyle: { color: '#3b82f6', width: 2 }, itemStyle: { color: '#3b82f6' },
      },
      { name: 'UCL', type: 'line', data: points.map((p: any) => p.ucl), lineStyle: { color: '#ef4444', type: 'dashed', width: 1 }, symbol: 'none', itemStyle: { color: '#ef4444' } },
      { name: 'LCL', type: 'line', data: points.map((p: any) => p.lcl), lineStyle: { color: '#ef4444', type: 'dashed', width: 1 }, symbol: 'none', itemStyle: { color: '#ef4444' } },
      { name: 'CL', type: 'line', data: points.map(() => cl), lineStyle: { color: '#22c55e', type: 'solid', width: 1 }, symbol: 'none', itemStyle: { color: '#22c55e' } },
    ],
  };
}

// ─── X-bar R 双图 ──────────────────────────────────────────

function buildXbarRChartOption(data: any, which: 'xbar' | 'r') {
  const sub = data[which];
  if (!sub) return {};
  const ids = data.subgroup_batch_ids || [];

  return {
    title: { text: which === 'xbar' ? 'X̄ 均值图' : 'R 极差图', textStyle: { fontSize: 12, color: '#ccc' } },
    grid: { left: 60, right: 30, top: 30, bottom: 25 },
    xAxis: { type: 'category' as const, data: ids.map((_: string, i: number) => `G${i + 1}`), axisLabel: { fontSize: 9, color: '#666' } },
    yAxis: { type: 'value' as const, axisLabel: { fontSize: 9, color: '#666' } },
    series: [{
      type: 'line', data: sub.values, symbol: 'circle', symbolSize: 6,
      lineStyle: { color: '#3b82f6', width: 1.5 }, itemStyle: { color: '#3b82f6' },
      markLine: {
        silent: true, symbol: 'none',
        data: [
          { yAxis: sub.ucl, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: `UCL=${sub.ucl?.toFixed(2)}`, fontSize: 9, color: '#ef4444' } },
          { yAxis: sub.cl, lineStyle: { color: '#22c55e' }, label: { formatter: `CL=${sub.cl?.toFixed(2)}`, fontSize: 9, color: '#22c55e' } },
          { yAxis: sub.lcl, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: `LCL=${sub.lcl?.toFixed(2)}`, fontSize: 9, color: '#ef4444' } },
        ],
      },
    }],
  };
}

// ─── p/c 属性控制图 ────────────────────────────────────────

function buildAttributeChartOption(data: any, chartType: 'p' | 'c') {
  const { limits, points } = data;
  if (!points || points.length === 0) return {};

  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 60, right: 30, top: 20, bottom: 40 },
    xAxis: { type: 'category' as const, data: points.map((p: any) => p.batch_id?.slice(-8) || ''), axisLabel: { fontSize: 9, color: '#666', rotate: 30 } },
    yAxis: { type: 'value' as const, name: chartType === 'p' ? '不合格率' : '缺陷数', axisLabel: { fontSize: 9, color: '#666' } },
    series: [{
      type: 'line',
      data: points.map((p: any) => ({
        value: p.value,
        itemStyle: p.out_of_control ? { color: '#ef4444' } : undefined,
        symbolSize: p.out_of_control ? 10 : 6,
      })),
      symbol: 'circle', lineStyle: { color: '#8b5cf6', width: 1.5 }, itemStyle: { color: '#8b5cf6' },
      markLine: limits ? {
        silent: true, symbol: 'none',
        data: [
          { yAxis: limits.ucl, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: `UCL=${limits.ucl?.toFixed(3)}`, fontSize: 9, color: '#ef4444' } },
          { yAxis: limits.cl, lineStyle: { color: '#22c55e' }, label: { formatter: `CL=${limits.cl?.toFixed(3)}`, fontSize: 9, color: '#22c55e' } },
          { yAxis: limits.lcl, lineStyle: { color: '#ef4444', type: 'dashed' }, label: { formatter: `LCL=${limits.lcl?.toFixed(3)}`, fontSize: 9, color: '#ef4444' } },
        ],
      } : undefined,
    }],
  };
}
