'use client';
import React from 'react';

export interface ValveProps {
  open?: boolean | number;
  label?: string;
  colorOpen?: string;
  colorClosed?: string;
  width: number;
  height: number;
}

export function Valve(props: ValveProps) {
  const { open = false, label, colorOpen = '#22c55e', colorClosed = '#9ca3af', width, height } = props;

  const isOpen = typeof open === 'number' ? open > 0 : !!open;
  const fill = isOpen ? colorOpen : colorClosed;

  const cx = width / 2;
  const cy = height / 2;
  const w = width * 0.7;
  const h = height * 0.7;
  const x0 = (width - w) / 2;
  const y0 = (height - h) / 2;
  const path = `M ${x0},${y0} L ${cx},${cy} L ${x0},${y0 + h} Z M ${x0 + w},${y0} L ${cx},${cy} L ${x0 + w},${y0 + h} Z`;

  const pctText = typeof open === 'number' ? `${Math.round(open)}%` : null;

  return (
    <div className="relative w-full h-full">
      <svg width={width} height={height}>
        <path
          data-testid="valve-body"
          d={path}
          fill={fill}
          stroke="#6b7280"
          strokeWidth={1.5}
        />
      </svg>
      {pctText ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold pointer-events-none">
          {pctText}
        </div>
      ) : null}
      {label ? (
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full text-sm text-gray-700 whitespace-nowrap">
          {label}
        </div>
      ) : null}
    </div>
  );
}
