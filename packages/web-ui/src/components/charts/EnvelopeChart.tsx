'use client';

import React, { useEffect, useState } from 'react';
import { EChartsWrapper } from './EChartsWrapperDynamic';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const FIELD_LABELS: Record<string, string> = {
  temperature: '温度 (°C)',
  pH: 'pH',
  DO: '溶氧 (%)',
  pressure: '罐压 (bar)',
  airflow: '通气量 (NL/min)',
  rpm: '转速 (rpm)',
};

interface EnvelopeData {
  target: string;
  field: string;
  sigma: number;
  historicalBatchCount: number;
  envelope: { mean: number[]; upper: number[]; lower: number[] } | null;
  currentBatch: { data: number[]; inBand: boolean; deviations: number[] } | null;
}

export function EnvelopeChart({ batchId, field = 'temperature' }: { batchId: string; field?: string }) {
  const [data, setData] = useState<EnvelopeData | null>(null);
  const [selectedField, setSelectedField] = useState(field);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/batches/${batchId}/envelope?field=${selectedField}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [batchId, selectedField]);

  if (loading) return <div className="text-muted-foreground text-sm p-4">加载包络线数据...</div>;
  if (!data?.envelope) return <div className="text-muted-foreground text-sm p-4">无历史批次数据</div>;

  const xAxis = Array.from({ length: data.envelope.mean.length }, (_, i) => i);

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: `${FIELD_LABELS[selectedField] || selectedField} 历史包络线`,
      subtext: `基于 ${data.historicalBatchCount} 个历史批次 (±${data.sigma}σ)`,
      textStyle: { color: '#d4d4d8', fontSize: 14 },
      subtextStyle: { color: '#71717a', fontSize: 11 },
    },
    tooltip: { trigger: 'axis' as const },
    legend: {
      data: ['上限', '均值', '下限', '当前批次'],
      textStyle: { color: '#a1a1aa' },
      top: 30,
    },
    grid: { left: 60, right: 20, bottom: 60, top: 80 },
    xAxis: {
      type: 'category' as const,
      data: xAxis,
      name: '采样点',
      nameTextStyle: { color: '#71717a' },
      axisLabel: { color: '#71717a' },
    },
    yAxis: {
      type: 'value' as const,
      name: FIELD_LABELS[selectedField] || selectedField,
      nameTextStyle: { color: '#71717a' },
      axisLabel: { color: '#71717a' },
      splitLine: { lineStyle: { color: '#27272a' } },
    },
    dataZoom: [{ type: 'inside' as const }, { type: 'slider' as const }],
    series: [
      {
        name: '上限',
        type: 'line' as const,
        data: data.envelope.upper,
        lineStyle: { color: '#f87171', type: 'dashed' as const, width: 1 },
        symbol: 'none',
        areaStyle: { color: 'transparent' },
      },
      {
        name: '均值',
        type: 'line' as const,
        data: data.envelope.mean,
        lineStyle: { color: '#60a5fa', type: 'dashed' as const, width: 1 },
        symbol: 'none',
      },
      {
        name: '下限',
        type: 'line' as const,
        data: data.envelope.lower,
        lineStyle: { color: '#f87171', type: 'dashed' as const, width: 1 },
        symbol: 'none',
        areaStyle: {
          color: 'rgba(248, 113, 113, 0.05)',
          origin: 'auto' as const,
        },
      },
      {
        name: '当前批次',
        type: 'line' as const,
        data: data.currentBatch?.data || [],
        lineStyle: { color: '#22c55e', width: 2 },
        symbol: 'none',
      },
    ],
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {Object.keys(FIELD_LABELS).map(f => (
          <button
            key={f}
            onClick={() => setSelectedField(f)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              selectedField === f
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {FIELD_LABELS[f]}
          </button>
        ))}
      </div>

      {data.currentBatch && !data.currentBatch.inBand && (
        <div className="text-sm text-amber-600 bg-yellow-400/10 px-3 py-1.5 rounded">
          当前批次轨迹偏离历史包络线范围
        </div>
      )}

      <EChartsWrapper option={option} style={{ height: 400 }} />
    </div>
  );
}
