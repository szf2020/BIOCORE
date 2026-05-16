import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgProbe: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
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
  const headR = Math.min(width, height) / 5;
  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <line x1={cx} y1={0} x2={cx} y2={height / 3} stroke="#374151" strokeWidth={2} />
      <circle cx={cx} cy={height / 3 + headR} r={headR} fill="#fff" stroke="#374151" />
      <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="#111827">{text}</text>
    </g>
  );
};
