import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (b: boolean) => void;
  labelOn?: string;
  labelOff?: string;
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  labelOn,
  labelOff,
  disabled = false,
}: SwitchProps): JSX.Element {
  const on = Boolean(checked);
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-zinc-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      {on && labelOn ? <span className="text-sm">{labelOn}</span> : null}
      {!on && labelOff ? <span className="text-sm">{labelOff}</span> : null}
    </div>
  );
}
