// ============================================================
// ParamCardGrid — 实时参数卡片组
// 8张卡片: 温度/pH/DO/搅拌/通气/罐压/称重/补料
// ============================================================

'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import type { ProcessValues } from '@/types';

interface ParamCardProps {
  label: string;
  channel: string;
  value: number;
  unit: string;
  sv?: number;
  cv?: number;
  cvLabel?: string;
  deadband?: number;
  precision?: number;
}

function ParamCard({ label, channel, value, unit, sv, cv, cvLabel, deadband = 1, precision = 1 }: ParamCardProps) {
  const deviation = sv !== undefined ? Math.abs(value - sv) : 0;
  const deviationColor = deviation <= deadband ? 'bg-green-500' : deviation <= deadband * 3 ? 'bg-yellow-500' : 'bg-red-500';
  const deviationWidth = sv !== undefined ? Math.min(100, (deviation / (deadband * 5)) * 100) : 0;

  return (
    <Card className="p-3 space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground font-mono">{channel}</span>
      </div>
      <div className="text-2xl font-bold font-mono">
        {value.toFixed(precision)}<span className="text-sm text-muted-foreground ml-1">{unit}</span>
      </div>
      {sv !== undefined && (
        <div className="text-sm text-muted-foreground">
          SV: {sv.toFixed(precision)} {unit}
        </div>
      )}
      {cv !== undefined && (
        <div className="text-sm text-muted-foreground">
          CV: {cv.toFixed(0)}% {cvLabel || ''}
        </div>
      )}
      {sv !== undefined && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${deviationColor} rounded-full transition-all`}
              style={{ width: `${deviationWidth}%` }} />
          </div>
          <span className="text-sm text-muted-foreground w-12 text-right">
            {deviation.toFixed(precision)} {unit}
          </span>
        </div>
      )}
    </Card>
  );
}

const PARAM_LABELS = ['温度 °C', 'pH', '溶氧 %', '搅拌 rpm', '通气 NL/m', '罐压 bar', '称重 kg', '补料 mL/h'];

export function ParamCardGrid({ pv }: { pv: ProcessValues | null }) {
  if (!pv) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {PARAM_LABELS.map((label, i) => (
          <Card key={i} className="p-3 space-y-1">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="text-xl font-bold font-mono text-muted-foreground/50">--</div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <ParamCard label="温度" channel="AI-0" value={pv['AI-0']} unit="°C" sv={37.0} cv={pv['AO-0_cv']} cvLabel={pv.temp_mode === 1 ? '加热' : pv.temp_mode === 2 ? '冷却' : '保温'} deadband={0.3} />
      <ParamCard label="pH" channel="AI-2" value={pv['AI-2']} unit="" sv={7.0} precision={2} deadband={0.05} />
      <ParamCard label="溶氧" channel="AI-3" value={pv['AI-3']} unit="%" sv={30.0} cv={pv['AO-2_cv']} deadband={2} />
      <ParamCard label="搅拌" channel="VFD" value={pv.rpm} unit="rpm" precision={0} />
      <ParamCard label="通气" channel="AI-5" value={pv['AI-5']} unit="NL/m" precision={1} />
      <ParamCard label="罐压" channel="AI-4" value={pv['AI-4']} unit="bar" precision={2} />
      <ParamCard label="称重" channel="AI-6" value={pv['AI-6']} unit="kg" precision={1} />
      <ParamCard label="补料" channel="P02" value={pv.P02_rate} unit="mL/h" precision={1} />
    </div>
  );
}
