import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgLabel: SvgWidgetComponent = ({ width, height, tagValue, tagStale }) => {
  const text = tagValue === undefined || tagValue === null ? '—' : String(tagValue);
  const className = tagStale ? 'opacity-50' : undefined;
  return (
    <text
      x={width / 2}
      y={height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={14}
      fill="currentColor"
      className={className}
    >
      {text}
    </text>
  );
};
