import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgLamp: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const on = !!tagValue;
  const onColor = typeof config?.onColor === 'string' ? config.onColor : '#22c55e';
  const offColor = typeof config?.offColor === 'string' ? config.offColor : '#9ca3af';
  return (
    <circle
      cx={width / 2}
      cy={height / 2}
      r={Math.min(width, height) / 2 - 2}
      fill={on ? onColor : offColor}
      stroke="#374151"
      className={tagStale ? 'opacity-50' : undefined}
    />
  );
};
