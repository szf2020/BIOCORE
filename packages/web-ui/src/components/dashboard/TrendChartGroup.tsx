// ============================================================
// TrendChartGroup — SVG 趋势迷你图组
// 温度/pH/DO 三行 sparkline (不使用 Plotly, 纯 SVG)
// ============================================================

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLocale } from '@/i18n/useLocale';

interface SparklineProps {
  label: string;
  unit: string;
  data: number[];
  currentValue: number | null;
  sv?: number;
  min: number;
  max: number;
  color: string;
}

const SVG_W = 240;
const SVG_H = 48;
const MAX_POINTS = 60;

function Sparkline({ label, unit, data, currentValue, sv, min, max, color }: SparklineProps) {
  const range = max - min || 1;

  const toY = (v: number): number => {
    const clamped = Math.max(min, Math.min(max, v));
    return SVG_H - ((clamped - min) / range) * SVG_H;
  };

  const points = data.slice(-MAX_POINTS);
  const stepX = points.length > 1 ? SVG_W / (points.length - 1) : 0;

  const polyline = points.map((v, i) => `${(i * stepX).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  const svY = sv !== undefined ? toY(sv) : null;

  return (
    <Card className="p-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex items-baseline gap-2">
          {sv !== undefined && (
            <span className="text-sm text-muted-foreground">SV: {sv}{unit}</span>
          )}
          <span className={cn('text-sm font-bold font-mono', color)}>
            {currentValue !== null ? currentValue.toFixed(1) : '--'}{unit}
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-12"
        preserveAspectRatio="none"
      >
        {/* Y 轴参考线 */}
        <line x1="0" y1={SVG_H / 2} x2={SVG_W} y2={SVG_H / 2}
          stroke="currentColor" strokeOpacity="0.08" strokeDasharray="4 4" />

        {/* SV 参考线 */}
        {svY !== null && (
          <line x1="0" y1={svY} x2={SVG_W} y2={svY}
            stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" />
        )}

        {/* 数据折线 */}
        {points.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke={color === 'text-red-500' ? '#ef4444' : color === 'text-blue-500' ? '#3b82f6' : '#22c55e'}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* 当前值圆点 */}
        {points.length > 0 && (
          <circle
            cx={SVG_W}
            cy={toY(points[points.length - 1])}
            r="2.5"
            fill={color === 'text-red-500' ? '#ef4444' : color === 'text-blue-500' ? '#3b82f6' : '#22c55e'}
          />
        )}
      </svg>
      <div className="flex justify-between text-sm text-muted-foreground mt-0.5">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </Card>
  );
}

interface TrendChartGroupProps {
  tempHistory: number[];
  phHistory: number[];
  doHistory: number[];
  currentTemp: number | null;
  currentPH: number | null;
  currentDO: number | null;
  tempSV?: number;
  phSV?: number;
  doSV?: number;
}

export function TrendChartGroup({
  const { t } = useLocale();
  tempHistory,
  phHistory,
  doHistory,
  currentTemp,
  currentPH,
  currentDO,
  tempSV = 37.0,
  phSV = 7.0,
  doSV = 30.0,
}: TrendChartGroupProps) {
  return (
    <div className="space-y-2">
      <Sparkline
        label="温度" unit="°C" data={tempHistory}
        currentValue={currentTemp} sv={tempSV}
        min={20} max={50} color="text-red-500"
      />
      <Sparkline
        label="pH" unit="" data={phHistory}
        currentValue={currentPH} sv={phSV}
        min={4} max={10} color="text-blue-500"
      />
      <Sparkline
        label="溶氧" unit="%" data={doHistory}
        currentValue={currentDO} sv={doSV}
        min={0} max={100} color="text-green-500"
      />
    </div>
  );
}
