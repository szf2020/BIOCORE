import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgSparger: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const flowing = !!tagValue;
  const flowingColor = typeof config?.flowingColor === 'string' ? config.flowingColor : '#3b82f6';
  const idleColor = typeof config?.idleColor === 'string' ? config.idleColor : '#9ca3af';
  const stroke = flowing ? flowingColor : idleColor;
  const holeCount = 5;
  const lines = Array.from({ length: holeCount }, (_, i) => {
    const x = ((i + 0.5) / holeCount) * width;
    return <line key={i} x1={x} y1={0} x2={x} y2={height} stroke={stroke} strokeWidth={2} />;
  });
  return <g className={tagStale ? 'opacity-50' : undefined}>{lines}</g>;
};
