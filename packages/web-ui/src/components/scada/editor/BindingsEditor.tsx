'use client';
import React from 'react';
import { useLocale } from '@/i18n/useLocale';
import type { Binding } from '@/widgets';

export interface BindingsEditorProps {
  bindings: Binding[];
  bindableProps: string[];
  onChange: (next: Binding[]) => void;
}

export function BindingsEditor({ bindings, bindableProps, onChange }: BindingsEditorProps) {
  const { t } = useLocale();
  const handleAdd = () => {
    const defaultProp = bindableProps[0] ?? '';
    onChange([...bindings, { tag: '', prop: defaultProp }]);
  };

  const update = (idx: number, patch: Partial<Binding>) => {
    const next = bindings.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    const cleaned = next.map((b) => {
      if (!b.transform || b.transform.trim() === '') {
        const { transform: _t, ...rest } = b;
        return rest as Binding;
      }
      return b;
    });
    onChange(cleaned);
  };

  const remove = (idx: number) => {
    onChange(bindings.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{t('bindings-editor.title')}</span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={bindableProps.length === 0}
          className="text-sm text-blue-600 disabled:text-gray-400"
        >
          + 添加绑定
        </button>
      </div>
      {bindings.length === 0 && (
        <div className="text-sm text-gray-400 italic">{t('bindings-editor.no-bindings')}</div>
      )}
      {bindings.map((b, i) => (
        <div key={i} className="border rounded p-2 space-y-1 bg-gray-50">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="block text-sm text-gray-600">Field</label>
              <select
                value={b.prop}
                onChange={(e) => update(i, { prop: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
              >
                {bindableProps.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Tag</label>
              <input
                type="text"
                value={b.tag}
                onChange={(e) => update(i, { tag: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="F01.AI-0"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600">Transform (opt, v=value)</label>
            <textarea
              name="transform"
              value={b.transform ?? ''}
              onChange={(e) => update(i, { transform: e.target.value })}
              rows={2}
              className="w-full border rounded px-2 py-1 text-sm font-mono"
              placeholder="Math.min(100, (v / 50) * 100)"
            />
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-sm text-red-600"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
