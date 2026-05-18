import React from 'react';

export interface GaugeThreshold {
  value: number;
  color: string;
}

export interface GaugeProps {
  value: number;
  min: number;
  max: number;
  thresholds?: GaugeThreshold[];
  label?: string;
  width?: number;
  height?: number;
}

function pickColor(value: number, thresholds: GaugeThreshold[] | undefined, fallback: string): string {
  if (!thresholds || thresholds.length === 0) return fallback;
  let color = fallback;
  for (const t of thresholds) {
    if (value >= t.value) color = t.color;
  }
  return color;
}

export function Gauge({
  value,
  min,
  max,
  thresholds,
  label,
  width = 160,
  height = 100,
}: GaugeProps): JSX.Element {
  if (min >= max) {
    return (
      <div data-widget="gauge" data-state="invalid" className="text-xs text-red-500">
        Invalid range
      </div>
    );
  }
  const v = Math.min(max, Math.max(min, value));
  const ratio = (v - min) / (max - min);
  const cx = width / 2;
  const cy = height;
  const r = Math.min(width, height * 2) / 2 - 8;
  function polar(angleDeg: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  const startA = 180;
  const endA = 180 + 180 * ratio;
  const start = polar(startA);
  const end = polar(endA);
  const largeArc = endA - startA > 180 ? 1 : 0;
  const color = pickColor(v, thresholds, '#3b82f6');
  return (
    <div data-widget="gauge" className="flex flex-col items-center">
      <svg width={width} height={height + 8}>
        <path
          d={`M ${polar(180).x} ${polar(180).y} A ${r} ${r} 0 1 1 ${polar(360).x} ${polar(360).y}`}
          fill="none"
          stroke="#374151"
          strokeWidth={10}
        />
        <path
          data-arc="value"
          d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
          fill="none"
          stroke={color}
          strokeWidth={10}
        />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="14" fill="#111827">
          {v}
        </text>
      </svg>
      {label ? <span className="text-xs text-zinc-400">{label}</span> : null}
    </div>
  );
}
