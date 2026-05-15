'use client';
import React from 'react';

export interface PumpProps {
  running?: boolean;
  rate?: number;
  unit?: string;
  label?: string;
  width: number;
  height: number;
}

export function Pump(props: PumpProps) {
  const { running = false, rate, unit = 'rpm', label, width, height } = props;
  const size = Math.min(width, height) * 0.7;
  const cx = width / 2;
  const cy = height / 2;
  const r = size / 2;
  const fanClass = running ? 'animate-spin origin-center' : 'origin-center';

  const blade = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    const x2 = cx + r * 0.7 * Math.cos(rad);
    const y2 = cy + r * 0.7 * Math.sin(rad);
    return `M ${cx},${cy} L ${x2},${y2}`;
  };

  return (
    <div className="relative w-full h-full">
      {label ? (
        <div className="absolute top-0 left-0 right-0 text-xs text-center text-gray-700 truncate">
          {label}
        </div>
      ) : null}
      <svg width={width} height={height}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6b7280" strokeWidth={1.5} />
        <g data-testid="pump-fan" className={fanClass} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <path d={blade(0)} stroke="#3b82f6" strokeWidth={3} fill="none" />
          <path d={blade(120)} stroke="#3b82f6" strokeWidth={3} fill="none" />
          <path d={blade(240)} stroke="#3b82f6" strokeWidth={3} fill="none" />
        </g>
      </svg>
      {rate !== undefined ? (
        <div className="absolute bottom-0 left-0 right-0 text-xs text-center text-gray-700">
          {rate} {unit}
        </div>
      ) : null}
    </div>
  );
}
