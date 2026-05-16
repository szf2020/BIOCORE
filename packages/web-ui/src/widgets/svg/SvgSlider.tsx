import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSlider: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const min = typeof config?.min === 'number' ? config.min : 0;
  const max = typeof config?.max === 'number' ? config.max : 100;
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';

  const v = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
  const pct = (v - min) / (max - min || 1);
  const thumbX = pct * width;
  const trackY = height / 2 - 2;

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect x={0} y={trackY} width={width} height={4} fill="#e5e7eb" />
      <rect x={0} y={trackY} width={thumbX} height={4} fill={fillColor} />
      <circle cx={thumbX} cy={height / 2} r={Math.min(8, height / 2)} fill={fillColor} stroke="#374151" />
    </g>
  );
};
