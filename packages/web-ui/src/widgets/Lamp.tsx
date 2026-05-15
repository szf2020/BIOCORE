'use client';
import React from 'react';

export interface LampProps {
  on?: boolean;
  blink?: boolean;
  colorOn?: string;
  colorOff?: string;
  label?: string;
  width: number;
  height: number;
}

export function Lamp(props: LampProps) {
  const { on = false, blink = false, colorOn = '#ef4444', colorOff = '#e5e7eb', label, width, height } = props;
  const size = Math.min(width, height) * 0.7;
  const cx = width / 2;
  const cy = height / 2 - (label ? 6 : 0);
  const r = size / 2;
  const fill = on ? colorOn : colorOff;
  const wrapperClass = on && blink ? 'animate-pulse' : '';

  return (
    <div
      data-testid="lamp-wrapper"
      className={`relative w-full h-full ${wrapperClass}`}
    >
      <svg width={width} height={height}>
        <circle
          data-testid="lamp"
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          stroke="#6b7280"
          strokeWidth={1.5}
        />
      </svg>
      {label ? (
        <div className="absolute bottom-0 left-0 right-0 text-xs text-center text-gray-700 truncate">
          {label}
        </div>
      ) : null}
    </div>
  );
}
