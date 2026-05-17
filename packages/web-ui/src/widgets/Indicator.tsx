'use client';
import React from 'react';

export interface IndicatorProps {
  value?: number | string | null;
  unit?: string;
  label?: string;
  precision?: number;
  color?: string;
  width: number;
  height: number;
}

export function Indicator(props: IndicatorProps) {
  const { value, unit, label, precision = 1, color, width, height } = props;

  let display: string;
  if (value === null || value === undefined) {
    display = '—';
  } else if (typeof value === 'number') {
    display = Number.isFinite(value) ? value.toFixed(precision) : '—';
  } else {
    display = String(value);
  }

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center"
      style={{ width, height }}
    >
      {label ? (
        <div className="text-sm text-gray-600 truncate w-full text-center">{label}</div>
      ) : null}
      <div className="flex items-baseline gap-1" style={color ? { color } : undefined}>
        <span className="text-2xl font-semibold tabular-nums">{display}</span>
        {unit ? <span className="text-sm text-gray-500">{unit}</span> : null}
      </div>
    </div>
  );
}
