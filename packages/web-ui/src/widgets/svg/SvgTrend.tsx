import React from 'react';
import { useTagHistory } from '@/hooks/useTagHistory';
import type { SvgWidgetComponent } from './types';

export const SvgTrend: SvgWidgetComponent = ({ width, height, tagName, config }) => {
  const windowSec = typeof config?.windowSec === 'number' ? config.windowSec : 60;
  const stroke = typeof config?.strokeColor === 'string' ? config.strokeColor : '#3b82f6';
  const strokeWidth = typeof config?.strokeWidth === 'number' ? config.strokeWidth : 2;
  const { points, isStale } = useTagHistory(tagName ?? '', { windowSec });

  if (points.length === 0) {
    return <polyline points="" stroke={stroke} fill="none" strokeWidth={strokeWidth} className={isStale ? 'opacity-50' : undefined} />;
  }

  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const vMin = Math.min(...points.map((p) => p.v));
  const vMax = Math.max(...points.map((p) => p.v));
  const tRange = tMax - tMin || 1;
  const vRange = vMax - vMin || 1;

  const coords = points
    .map((p) => {
      const x = ((p.t - tMin) / tRange) * width;
      const y = height - ((p.v - vMin) / vRange) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <polyline
      points={coords}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      className={isStale ? 'opacity-50' : undefined}
    />
  );
};
