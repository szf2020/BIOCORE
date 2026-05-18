'use client';
import React from 'react';
import { useLocale } from '@/i18n/useLocale';
import type { WidgetDef, Binding } from '@/widgets';
import { WIDGET_REGISTRY } from '@/widgets/registry';
import type { EditorAction } from '@/hooks/useEditorState';
import { PropertyEditor } from './PropertyEditor';
import { BindingsEditor } from './BindingsEditor';

export interface PropertyPanelProps {
  selected: WidgetDef | null;
  dispatch: React.Dispatch<EditorAction>;
}

export function PropertyPanel({ selected, dispatch }: PropertyPanelProps) {
  const { t } = useLocale();
  if (!selected) {
    return (
      <div className="p-4 text-sm text-gray-400 italic bg-white border-l" style={{ width: 280 }}>
        {t('property-panel.no-selection')}
      </div>
    );
  }
  const entry = (WIDGET_REGISTRY as any)[selected.type];
  if (!entry) {
    return <div className="p-4 text-sm text-red-600 bg-white border-l" style={{ width: 280 }}>Unknown widget type: {selected.type}</div>;
  }
  const props = (selected as any).props ?? {};
  return (
    <div className="p-3 space-y-4 overflow-y-auto bg-white border-l" style={{ width: 280 }}>
      <div>
        <div className="text-sm font-semibold">{entry.displayName}</div>
        <div className="text-sm text-gray-400 font-mono">{selected.id}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-sm text-gray-600">X</label>
          <input type="number" value={selected.x}
            onChange={(e) => dispatch({ type: 'move', id: selected.id, x: Number(e.target.value), y: selected.y })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Y</label>
          <input type="number" value={selected.y}
            onChange={(e) => dispatch({ type: 'move', id: selected.id, x: selected.x, y: Number(e.target.value) })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600">W</label>
          <input type="number" value={selected.w} min={40}
            onChange={(e) => dispatch({ type: 'resize', id: selected.id, w: Number(e.target.value), h: selected.h })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm text-gray-600">H</label>
          <input type="number" value={selected.h} min={30}
            onChange={(e) => dispatch({ type: 'resize', id: selected.id, w: selected.w, h: Number(e.target.value) })}
            className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      <PropertyEditor
        schema={entry.propsSchema}
        values={props}
        onChange={(patch) => dispatch({ type: 'updateProps', id: selected.id, patch })}
      />

      <BindingsEditor
        bindings={selected.bindings ?? []}
        bindableProps={entry.bindableProps}
        onChange={(bindings: Binding[]) => dispatch({ type: 'setBindings', id: selected.id, bindings })}
      />

      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={() => dispatch({ type: 'delete', id: selected.id })}
          className="text-sm text-red-600"
        >
          {t('toolbar.delete')}
        </button>
      </div>
    </div>
  );
}
