import React from 'react';
import type { SvgWidgetComponent } from './types';

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(endDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export const SvgGauge: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const raw = typeof tagValue === 'number' ? tagValue : Number(tagValue);
  const min = typeof config?.min === 'number' ? config.min : 0;
  const max = typeof config?.max === 'number' ? config.max : 100;
  const fillColor = typeof config?.fillColor === 'string' ? config.fillColor : '#3b82f6';
  const bgColor = typeof config?.bgColor === 'string' ? config.bgColor : '#e5e7eb';

  const v = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min));
  const pct = (v - min) / (max - min || 1);
  const startDeg = -120;
  const endDeg = -120 + pct * 240;
  const fullEndDeg = 120;

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 6;

  return (
    <g className={tagStale ? 'opacity-50' : undefined}>
      <path d={arcPath(cx, cy, r, startDeg, fullEndDeg)} stroke={bgColor} strokeWidth={8} fill="none" />
      {pct > 0 && <path d={arcPath(cx, cy, r, startDeg, endDeg)} stroke={fillColor} strokeWidth={8} fill="none" />}
      <text x={cx} y={cy + r * 0.3} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(width, height) / 5}>
        {String(Number.isFinite(raw) ? raw : '—')}
      </text>
    </g>
  );
};
