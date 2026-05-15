'use client';
import React from 'react';
import type { Binding } from '@/widgets';

export interface BindingsEditorProps {
  bindings: Binding[];
  bindableProps: string[];
  onChange: (next: Binding[]) => void;
}

export function BindingsEditor({ bindings, bindableProps, onChange }: BindingsEditorProps) {
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
        <span className="text-xs font-semibold text-gray-700">绑定 (Bindings)</span>
        <button
          type="button"
          onClick={handleAdd}
          disabled={bindableProps.length === 0}
          className="text-xs text-blue-600 disabled:text-gray-400"
        >
          + 添加绑定
        </button>
      </div>
      {bindings.length === 0 && (
        <div className="text-xs text-gray-400 italic">无绑定</div>
      )}
      {bindings.map((b, i) => (
        <div key={i} className="border rounded p-2 space-y-1 bg-gray-50">
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="block text-xs text-gray-600">字段</label>
              <select
                value={b.prop}
                onChange={(e) => update(i, { prop: e.target.value })}
                className="w-full border rounded px-2 py-1 text-xs"
              >
                {bindableProps.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600">Tag</label>
              <input
                type="text"
                value={b.tag}
                onChange={(e) => update(i, { tag: e.target.value })}
                className="w-full border rounded px-2 py-1 text-xs"
                placeholder="F01.AI-0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600">变换 (可选, v=原值)</label>
            <textarea
              name="transform"
              value={b.transform ?? ''}
              onChange={(e) => update(i, { transform: e.target.value })}
              rows={2}
              className="w-full border rounded px-2 py-1 text-xs font-mono"
              placeholder="Math.min(100, (v / 50) * 100)"
            />
          </div>
          <div className="text-right">
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-xs text-red-600"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
