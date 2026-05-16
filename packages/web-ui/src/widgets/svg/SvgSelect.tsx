import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSelect: SvgWidgetComponent = ({ width, height, tagValue, tagStale }) => {
  const text = tagValue === undefined || tagValue === null ? '—' : String(tagValue);
  const arrowSize = Math.min(8, height / 3);
  const arrowX = width - arrowSize - 6;
  const arrowY = height / 2;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#fff" stroke="#374151" />
      <text x={6} y={height / 2} dominantBaseline="central" fontSize={12} fill="#111827">{text}</text>
      <path d={`M${arrowX},${arrowY - arrowSize / 2} L${arrowX + arrowSize},${arrowY - arrowSize / 2} L${arrowX + arrowSize / 2},${arrowY + arrowSize / 2} Z`} fill="#374151" />
    </g>
  );
};
