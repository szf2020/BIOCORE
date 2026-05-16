import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgButton: SvgWidgetComponent = ({ width, height, tagStale, config }) => {
  const label = typeof config?.label === 'string' ? config.label : '?';
  const fontSize = typeof config?.fontSize === 'number' ? config.fontSize : 14;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#e5e7eb" stroke="#374151" rx={4} />
      <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fill="#111827">
        {label}
      </text>
    </g>
  );
};
