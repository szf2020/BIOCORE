import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSwitch: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const on = !!tagValue;
  const onColor = typeof config?.onColor === 'string' ? config.onColor : '#22c55e';
  const offColor = typeof config?.offColor === 'string' ? config.offColor : '#9ca3af';
  const radius = height / 2;
  const thumbX = on ? width - radius : radius;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={on ? onColor : offColor} stroke="#374151" rx={radius} />
      <circle cx={thumbX} cy={height / 2} r={radius - 2} fill="#fff" />
    </g>
  );
};
