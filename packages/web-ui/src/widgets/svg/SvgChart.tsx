import React from 'react';
import { useTagHistory } from '@/hooks/useTagHistory';
import type { SvgWidgetComponent } from './types';

export const SvgChart: SvgWidgetComponent = ({ width, height, tagName, config }) => {
  const windowSec = typeof config?.windowSec === 'number' ? config.windowSec : 60;
  const barColor = typeof config?.barColor === 'string' ? config.barColor : '#3b82f6';
  const { points, isStale } = useTagHistory(tagName ?? '', { windowSec });

  if (points.length === 0) {
    return <g className={isStale ? 'opacity-50' : undefined} />;
  }

  const vMin = Math.min(...points.map((p) => p.v));
  const vMax = Math.max(...points.map((p) => p.v));
  const vRange = vMax - vMin || 1;
  const barW = width / points.length;

  return (
    <g className={isStale ? 'opacity-50' : undefined}>
      {points.map((p, i) => {
        const h = ((p.v - vMin) / vRange) * height;
        return (
          <rect
            key={i}
            x={i * barW}
            y={height - h}
            width={Math.max(1, barW - 1)}
            height={h}
            fill={barColor}
          />
        );
      })}
    </g>
  );
};
