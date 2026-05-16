import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgPipe: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const flowing = !!tagValue;
  const flowingColor = typeof config?.flowingColor === 'string' ? config.flowingColor : '#3b82f6';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const orientation = config?.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const fill = flowing ? flowingColor : idleColor;

  let arrow: string;
  if (orientation === 'horizontal') {
    const cx = width / 2;
    const cy = height / 2;
    arrow = `M${cx - 4},${cy - 5} L${cx + 4},${cy} L${cx - 4},${cy + 5} Z`;
  } else {
    const cx = width / 2;
    const cy = height / 2;
    arrow = `M${cx - 5},${cy - 4} L${cx},${cy + 4} L${cx + 5},${cy - 4} Z`;
  }

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={fill} stroke="#374151" />
      <path d={arrow} fill="#fff" />
    </g>
  );
};
