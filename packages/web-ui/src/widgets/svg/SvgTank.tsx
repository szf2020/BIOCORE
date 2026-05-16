import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgTank: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  const fillH = (pct / 100) * height;
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';
  const bgColor = typeof config?.bgColor === 'string' ? config.bgColor : '#e5e7eb';
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={bgColor} stroke="#374151" />
      <rect x={0} y={height - fillH} width={width} height={fillH} fill={fillColor} />
    </g>
  );
};
