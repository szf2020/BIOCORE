'use client';
import { useLocale } from '@/i18n/useLocale';
import React, { useState } from 'react';
import type { ViewMeta } from '@/hooks/useViewList';

interface Props {
  sorted: ViewMeta[];
  onRename: (viewId: string, newName: string) => Promise<void>;
  onDelete: (view: ViewMeta) => Promise<void>;
  onMove: (viewId: string, direction: -1 | 1) => Promise<void>;
}

export function ViewListRows({ sorted, onRename, onDelete, onMove }: Props) {
  const { t } = useLocale();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sorted.map((v, i) => (
        <li key={v.view_id} data-testid="view-row"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #eee' }}>
          {renamingId === v.view_id ? (
            <RenameInput
              initial={v.name}
              onSubmit={(name) => { void onRename(v.view_id, name); setRenamingId(null); }}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <span style={{ flex: 1 }}>
              {v.name}
              {v.is_template ? <span style={{ marginLeft: 6, fontSize: 10, color: '#3b82f6' }}>[{t('view-list-toolbar.templates')}]</span> : null}
            </span>
          )}
          <button data-testid="move-up-btn" onClick={() => void onMove(v.view_id, -1)} disabled={i === 0}>↑</button>
          <button data-testid="move-down-btn" onClick={() => void onMove(v.view_id, 1)} disabled={i === sorted.length - 1}>↓</button>
          <button data-testid="rename-btn" onClick={() => setRenamingId(v.view_id)}>{t('view-list-rows.edit')}</button>
          <button data-testid="delete-btn" onClick={() => void onDelete(v)}>{t('view-list-rows.delete')}</button>
          <a href={`/scada2/${v.view_id}`}>{t('view-list-rows.view')}</a>
          <a href={`/scada2/edit/${v.view_id}`} data-testid={`edit-link-${v.view_id}`}>{t('view-list-rows.edit')}</a>
        </li>
      ))}
    </ul>
  );
}

function RenameInput({ initial, onSubmit, onCancel }: { initial: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initial);
  return (
    <input
      data-testid="rename-input"
      value={val}
      autoFocus
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmit(val);
        else if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onSubmit(val)}
      style={{ flex: 1 }}
    />
  );
}
