import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgInput: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const placeholder = typeof config?.placeholder === 'string' ? config.placeholder : '';
  const fontSize = typeof config?.fontSize === 'number' ? config.fontSize : 12;
  const isEmpty = tagValue === undefined || tagValue === null || tagValue === '';
  const text = isEmpty ? placeholder : String(tagValue);
  const textColor = isEmpty ? '#9ca3af' : '#111827';
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#fff" stroke="#374151" />
      <text x={6} y={height / 2} dominantBaseline="central" fontSize={fontSize} fill={textColor}>{text}</text>
    </g>
  );
};
