import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgIndicator: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const num = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const threshold = typeof config?.threshold === 'number' ? config.threshold : Infinity;
  const normalColor = typeof config?.normalColor === 'string' ? config.normalColor : '#22c55e';
  const alertColor = typeof config?.alertColor === 'string' ? config.alertColor : '#dc2626';
  const fill = Number.isFinite(num) && num >= threshold ? alertColor : normalColor;
  const text = tagValue === undefined || tagValue === null ? '—' : String(tagValue);
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={fill} stroke="#374151" />
      <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="#fff">
        {text}
      </text>
    </g>
  );
};
