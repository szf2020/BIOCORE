'use client';
import React, { useMemo } from 'react';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';

type ValueType = 'string' | 'number' | 'boolean';

function inferType(v: unknown): ValueType {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

export function WidgetWriteIntentPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const items = useEditorStore((s) => s.view.items);
  const setWidget = useEditorStore((s) => s.setWidget);

  if (selectedIds.size !== 1) return null;
  const [selectedId] = Array.from(selectedIds);
  const widget = items.find((it) => it.id === selectedId);
  if (!widget) return null;

  const wi = (widget as any).writeIntent as
    | { tag?: string; value?: number | string | boolean }
    | undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const currentType = useMemo<ValueType>(() => inferType(wi?.value), [wi?.value]);

  function setTag(tag: string) {
    setWidget(widget!.id, { writeIntent: { ...(wi ?? {}), tag } } as any);
  }

  function setValue(raw: string, type: ValueType) {
    if (!wi) return;
    let v: number | string | boolean | undefined;
    if (type === 'number') {
      const n = Number(raw);
      v = Number.isFinite(n) ? n : undefined;
    } else if (type === 'boolean') {
      v = raw === 'true';
    } else {
      v = raw;
    }
    setWidget(widget!.id, { writeIntent: { ...wi, value: v } } as any);
  }

  function setType(type: ValueType) {
    if (!wi) return;
    if (type === 'number') setValue('0', 'number');
    else if (type === 'boolean') setValue('false', 'boolean');
    else setValue('', 'string');
  }

  function clearAll() {
    setWidget(widget!.id, { writeIntent: undefined } as any);
  }

  return (
    <div data-testid="widget-write-intent-panel" style={{ padding: 8, borderTop: '1px solid #eee' }}>
      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>
        写意图 Tag
      </label>
      <input
        data-testid="write-intent-tag-input"
        value={wi?.tag ?? ''}
        onChange={(e) => setTag(e.target.value)}
        style={{ width: '100%', marginBottom: 6 }}
        placeholder="e.g. tank.fill"
      />
      {wi?.tag ? (
        <>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>
            类型
          </label>
          <select
            data-testid="write-intent-value-type"
            value={currentType}
            onChange={(e) => setType(e.target.value as ValueType)}
            style={{ width: '100%', marginBottom: 6 }}
          >
            <option value="string">字符串</option>
            <option value="number">数字</option>
            <option value="boolean">布尔</option>
          </select>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>
            值
          </label>
          {currentType === 'boolean' ? (
            <select
              data-testid="write-intent-value-bool"
              value={String(wi?.value ?? false)}
              onChange={(e) => setValue(e.target.value, 'boolean')}
              style={{ width: '100%' }}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          ) : (
            <input
              data-testid="write-intent-value-input"
              value={String(wi?.value ?? '')}
              onChange={(e) => setValue(e.target.value, currentType)}
              style={{ width: '100%' }}
              type={currentType === 'number' ? 'number' : 'text'}
            />
          )}
          <button data-testid="write-intent-clear" onClick={clearAll} style={{ marginTop: 6 }}>
            清除
          </button>
        </>
      ) : null}
    </div>
  );
}
