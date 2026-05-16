import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgValve: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const open = !!tagValue;
  const openColor = typeof config?.openColor === 'string' ? config.openColor : '#22c55e';
  const closedColor = typeof config?.closedColor === 'string' ? config.closedColor : '#9ca3af';
  const fill = open ? openColor : closedColor;
  const points = `0,0 ${width / 2},${height / 2} 0,${height} ${width},0 ${width / 2},${height / 2} ${width},${height}`;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <polygon points={points} fill={fill} stroke="#374151" />
    </g>
  );
};
