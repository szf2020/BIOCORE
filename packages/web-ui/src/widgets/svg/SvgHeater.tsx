import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgHeater: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const heated = !!tagValue;
  const heatedColor = typeof config?.heatedColor === 'string' ? config.heatedColor : '#dc2626';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const fill = heated ? heatedColor : idleColor;
  const waveCount = 3;
  const waves = Array.from({ length: waveCount }, (_, i) => {
    const cy = ((i + 1) / (waveCount + 1)) * height;
    return (
      <path
        key={i}
        d={`M0,${cy} Q${width / 4},${cy - 4} ${width / 2},${cy} T${width},${cy}`}
        stroke="#fff"
        strokeWidth={1.5}
        fill="none"
      />
    );
  });
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill={fill} stroke="#374151" />
      {waves}
    </g>
  );
};
