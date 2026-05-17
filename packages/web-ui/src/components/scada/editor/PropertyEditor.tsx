'use client';
import React from 'react';
import type { PropSchema } from '@/widgets/registry';

export interface PropertyEditorProps {
  schema: Record<string, PropSchema>;
  values: Record<string, any>;
  onChange: (patch: Record<string, any>) => void;
}

export function PropertyEditor({ schema, values, onChange }: PropertyEditorProps) {
  return (
    <div className="space-y-2">
      {Object.entries(schema).map(([key, sch]) => {
        const v = values?.[key];
        return (
          <div key={key} className="space-y-1">
            <label className="block text-sm text-gray-600">{sch.label}</label>
            {renderInput(key, sch, v, (val) => onChange({ [key]: val }))}
          </div>
        );
      })}
    </div>
  );
}

function renderInput(key: string, schema: PropSchema, value: any, set: (v: any) => void) {
  switch (schema.type) {
    case 'number':
      return (
        <input
          type="number"
          value={value ?? ''}
          min={schema.min}
          max={schema.max}
          step={schema.step ?? 1}
          onChange={(e) => set(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      );
    case 'string':
      return (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      );
    case 'textarea':
      return (
        <textarea
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          rows={3}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      );
    case 'color':
      return (
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(e) => set(e.target.value)}
          className="w-12 h-7 border rounded"
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => set(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          value={value ?? ''}
          onChange={(e) => set(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          {(schema.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
  }
}
