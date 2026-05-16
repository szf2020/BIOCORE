'use client';
import React, { useState } from 'react';
import { useViewList } from '@/hooks/useViewList';
import { useViewMutations } from '@/hooks/useViewMutations';
import type { ViewMeta } from '@/hooks/useViewList';

interface Props {
  projectId: string;
}

export function ViewListPanel({ projectId }: Props) {
  const { views, loading, error, refetch } = useViewList(projectId);
  const mut = useViewMutations(projectId);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  if (loading) return <div style={{ padding: 8 }}>加载中…</div>;
  if (error) return <div style={{ padding: 8, color: '#dc2626' }}>错误: {error.message}</div>;
  if (views.length === 0) return <div style={{ padding: 8, color: '#666' }}>没有画面</div>;

  const sorted = [...views].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  async function handleRename(viewId: string, newName: string) {
    if (newName.trim().length === 0) { setRenamingId(null); return; }
    await mut.rename(viewId, newName.trim());
    setRenamingId(null);
    await refetch();
  }

  async function handleDelete(view: ViewMeta) {
    if (!window.confirm(`确认删除画面 "${view.name}"?`)) return;
    await mut.delete(view.view_id);
    await refetch();
  }

  async function handleMove(viewId: string, direction: -1 | 1) {
    const idx = sorted.findIndex(v => v.view_id === viewId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const swapped = [...sorted];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    await mut.reorder(swapped.map(v => v.view_id));
    await refetch();
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {sorted.map((v, i) => (
        <li key={v.view_id} data-testid="view-row"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderBottom: '1px solid #eee' }}>
          {renamingId === v.view_id ? (
            <RenameInput initial={v.name} onSubmit={(name) => handleRename(v.view_id, name)} onCancel={() => setRenamingId(null)} />
          ) : (
            <span style={{ flex: 1 }}>
              {v.name}
              {v.is_template ? <span style={{ marginLeft: 6, fontSize: 10, color: '#3b82f6' }}>[模板]</span> : null}
            </span>
          )}
          <button data-testid="move-up-btn" onClick={() => handleMove(v.view_id, -1)} disabled={i === 0}>↑</button>
          <button data-testid="move-down-btn" onClick={() => handleMove(v.view_id, 1)} disabled={i === sorted.length - 1}>↓</button>
          <button data-testid="rename-btn" onClick={() => setRenamingId(v.view_id)}>重命名</button>
          <button data-testid="delete-btn" onClick={() => handleDelete(v)}>删除</button>
          <a href={`/scada2/${v.view_id}`}>查看</a>
          <a href={`/scada2/edit/${v.view_id}`}>编辑</a>
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
