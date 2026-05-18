import React from 'react';

export interface SchedulerProps {
  cron: string;
  onChange: (cron: string) => void;
  disabled?: boolean;
}

const FIELD_RE = /^(\*|\d+|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;

export function validateCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return '必须是 5 字段 cron';
  for (const p of parts) {
    if (!FIELD_RE.test(p)) return `字段格式错误: ${p}`;
  }
  return null;
}

const LABELS = ['分', '时', '日', '月', '周'];

export function Scheduler({ cron, onChange, disabled = false }: SchedulerProps): JSX.Element {
  const parts = cron.trim().split(/\s+/);
  const padded = parts.length === 5 ? parts : ['*', '*', '*', '*', '*'];
  const error = validateCron(cron);
  return (
    <div
      data-widget="scheduler"
      className={`flex gap-2 ${error ? 'border border-red-500 p-1 rounded' : ''}`}
    >
      {padded.map((v, i) => (
        <label key={i} className="flex flex-col items-center text-xs">
          <span className="text-zinc-400">{LABELS[i]}</span>
          <input
            type="text"
            value={v}
            disabled={disabled}
            onChange={(e) => {
              const next = [...padded];
              next[i] = e.target.value;
              onChange(next.join(' '));
            }}
            className="w-12 px-1 py-0.5 bg-zinc-800 text-zinc-100 rounded text-center"
          />
        </label>
      ))}
    </div>
  );
}
