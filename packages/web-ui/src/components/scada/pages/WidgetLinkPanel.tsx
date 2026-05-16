'use client';
import React from 'react';
import { useViewList } from '@/hooks/useViewList';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';

interface Props {
  projectId: string;
  currentViewId?: string;
}

export function WidgetLinkPanel({ projectId, currentViewId }: Props) {
  const { views } = useViewList(projectId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const items = useEditorStore((s) => s.view.items);
  const setWidget = useEditorStore((s) => s.setWidget);

  if (selectedIds.size !== 1) return null;
  const [selectedId] = Array.from(selectedIds);
  const widget = items.find(it => it.id === selectedId);
  if (!widget) return null;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (!widget) return;
    if (v === '') {
      setWidget(widget.id, { link: undefined });
    } else {
      setWidget(widget.id, { link: { viewId: v } });
    }
  }

  return (
    <div data-testid="widget-link-panel" style={{ padding: 8, borderTop: '1px solid #eee' }}>
      <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>点击跳转到画面</label>
      <select
        data-testid="widget-link-select"
        value={widget.link?.viewId ?? ''}
        onChange={onChange}
        style={{ width: '100%' }}
      >
        <option value="">(无)</option>
        {views.filter(v => v.view_id !== currentViewId).map(v => (
          <option key={v.view_id} value={v.view_id}>{v.name}</option>
        ))}
      </select>
    </div>
  );
}
