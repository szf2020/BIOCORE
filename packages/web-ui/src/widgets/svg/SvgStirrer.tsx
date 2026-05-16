import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgStirrer: SvgWidgetComponent = ({ width, height, tagStale, config }) => {
  const bladeCount = typeof config?.bladeCount === 'number' ? config.bladeCount : 3;
  const color = typeof config?.color === 'string' ? config.color : '#374151';
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 4;
  const bladeW = r * 0.8;
  const bladeH = 4;
  const blades = Array.from({ length: bladeCount }, (_, i) => {
    const angle = (i * 360) / bladeCount;
    return (
      <rect
        key={i}
        x={cx - bladeW / 2}
        y={cy - bladeH / 2}
        width={bladeW}
        height={bladeH}
        fill={color}
        transform={`rotate(${angle} ${cx} ${cy})`}
      />
    );
  });
  return <g className={tagStale ? 'opacity-50' : undefined}>{blades}</g>;
};
