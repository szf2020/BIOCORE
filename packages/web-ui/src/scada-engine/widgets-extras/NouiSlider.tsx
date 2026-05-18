import React from 'react';

export interface NouiSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
}

export function NouiSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  label,
}: NouiSliderProps): JSX.Element {
  const safeStep = step > 0 ? step : 1;
  const clamped = Math.min(max, Math.max(min, value));
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs text-zinc-400">{label}</span> : null}
      <input
        type="range"
        role="slider"
        aria-valuenow={clamped}
        aria-valuemin={min}
        aria-valuemax={max}
        value={clamped}
        min={min}
        max={max}
        step={safeStep}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
