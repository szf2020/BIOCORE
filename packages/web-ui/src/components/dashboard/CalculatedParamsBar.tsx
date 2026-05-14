// ============================================================
// CalculatedParamsBar — 计算参数底栏
// 水平展示 通气量, 补料速率, OUR, kLa, mu, V_liquid, 累积补料, 累积补碱, F0
// 通气量/补料速率来自 processValues, 其余来自 calculatedParams
// ============================================================

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { CalculatedParams } from '@/types';

interface ParamItem {
  label: string;
  key: keyof CalculatedParams;
  unit: string;
  precision: number;
}

const PARAMS: ParamItem[] = [
  { label: 'OUR',     key: 'OUR',    unit: 'mmol/L/h', precision: 2 },
  { label: 'kLa',     key: 'kLa',    unit: '1/h',      precision: 1 },
  { label: 'μ',   key: 'mu',     unit: '1/h',      precision: 3 },
  { label: 'Vₗ',  key: 'V_liquid', unit: 'L',      precision: 1 },
  { label: '累积补料', key: 'V_feed', unit: 'mL',       precision: 0 },
  { label: '累积补碱', key: 'V_base', unit: 'mL',       precision: 0 },
  { label: 'F₀',  key: 'F0',     unit: 'min',      precision: 1 },
];

interface CalculatedParamsBarProps {
  params: CalculatedParams | null;
  airflow?: number | null;
  feedRate?: number | null;
}

function Cell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-base">
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn('font-mono font-medium', value === '--' && 'text-muted-foreground')}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

export function CalculatedParamsBar({ params, airflow, feedRate }: CalculatedParamsBarProps) {
  const airflowStr = typeof airflow === 'number' ? airflow.toFixed(1) : '--';
  const feedRateStr = typeof feedRate === 'number' ? feedRate.toFixed(1) : '--';
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t bg-card px-5 py-2.5">
      <Cell label="通气量" value={airflowStr} unit="NL/min" />
      <Cell label="补料速率" value={feedRateStr} unit="mL/h" />
      {PARAMS.map(({ label, key, unit, precision }) => {
        const raw = params?.[key];
        const value = typeof raw === 'number' ? raw.toFixed(precision) : '--';
        return <Cell key={key} label={label} value={value} unit={unit} />;
      })}
    </div>
  );
}
