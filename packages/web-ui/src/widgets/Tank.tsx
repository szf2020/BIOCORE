'use client';
import React from 'react';

export interface TankProps {
  fillPct?: number;
  max?: number;
  unit?: string;
  label?: string;
  color?: string;
  width: number;
  height: number;
}

export function Tank(props: TankProps) {
  const { fillPct = 50, max, unit, label, color = '#3b82f6', width, height } = props;
  const innerPad = 4;
  const labelOffset = label ? 18 : 0;
  const innerW = Math.max(0, width - innerPad * 2);
  const innerH = Math.max(0, height - innerPad * 2 - labelOffset);
  const clamped = Math.max(0, Math.min(100, fillPct));
  const fillH = (clamped / 100) * innerH;
  const fillY = innerPad + labelOffset + (innerH - fillH);

  return (
    <div className="relative w-full h-full">
      {label ? (
        <div className="absolute top-0 left-0 right-0 text-xs text-center text-gray-700 truncate">
          {label}
        </div>
      ) : null}
      <svg width={width} height={height} className="absolute inset-0">
        <rect
          x={innerPad}
          y={innerPad + labelOffset}
          width={innerW}
          height={innerH}
          rx={4}
          stroke="#6b7280"
          fill="none"
          strokeWidth={1.5}
        />
        <rect
          data-testid="tank-fill"
          x={innerPad}
          y={fillY}
          width={innerW}
          height={fillH}
          rx={2}
          fill={color}
          opacity={0.8}
        />
      </svg>
      {max !== undefined && unit ? (
        <div className="absolute bottom-0 left-0 right-0 text-xs text-center text-gray-500">
          max {max} {unit}
        </div>
      ) : null}
    </div>
  );
}
