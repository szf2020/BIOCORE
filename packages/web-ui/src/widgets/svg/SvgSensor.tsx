import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSensor: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const decimals = typeof config?.decimals === 'number' ? config.decimals : 2;
  const unit = typeof config?.unit === 'string' ? config.unit : '';
  let text: string;
  if (tagValue === undefined || tagValue === null) {
    text = '—';
  } else if (typeof tagValue === 'number') {
    text = unit ? `${tagValue.toFixed(decimals)} ${unit}` : tagValue.toFixed(decimals);
  } else {
    text = String(tagValue);
  }
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 4;
  const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <polygon points={points} fill="#fff" stroke="#374151" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#111827">{text}</text>
    </g>
  );
};
