import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgPump: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const running = !!tagValue;
  const runningColor = typeof config?.runningColor === 'string' ? config.runningColor : '#22c55e';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 2;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <circle cx={cx} cy={cy} r={r} fill={running ? runningColor : idleColor} stroke="#374151" />
      <path d={`M${cx - r * 0.5},${cy} L${cx + r * 0.5},${cy} M${cx},${cy - r * 0.5} L${cx},${cy + r * 0.5}`} stroke="#fff" strokeWidth={2} fill="none" />
    </g>
  );
};
