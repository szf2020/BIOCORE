import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgReactor: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const pct = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : 0));
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';
  const vesselStroke = typeof config?.vesselStroke === 'string' ? config.vesselStroke : '#374151';

  const inset = 6;
  const vesselX = inset;
  const vesselY = inset;
  const vesselW = width - inset * 2;
  const vesselH = height - inset * 2;
  const fillH = (pct / 100) * vesselH;

  const shaftX = width / 2;

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <rect width={width} height={height} fill="#fff" stroke={vesselStroke} />
      <rect x={vesselX} y={vesselY} width={vesselW} height={vesselH} fill="#fff" stroke={vesselStroke} />
      <rect x={vesselX} y={vesselY + vesselH - fillH} width={vesselW} height={fillH} fill={fillColor} />
      <line x1={shaftX} y1={vesselY} x2={shaftX} y2={vesselY + vesselH / 2} stroke="#374151" strokeWidth={2} />
    </g>
  );
};
