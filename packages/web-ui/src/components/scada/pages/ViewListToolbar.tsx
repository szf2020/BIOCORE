'use client';
import React from 'react';
import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'cards' | 'list';

interface Props {
  viewMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZES = [12, 24, 48] as const;

export function ViewListToolbar({ viewMode, onModeChange, pageSize, onPageSizeChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <button
        data-testid="view-mode-cards"
        aria-pressed={viewMode === 'cards'}
        onClick={() => onModeChange('cards')}
        title="卡片视图"
        style={{
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: 4,
          background: viewMode === 'cards' ? '#3b82f6' : 'transparent',
          color: viewMode === 'cards' ? '#fff' : 'inherit',
          cursor: 'pointer',
        }}
      >
        <LayoutGrid size={16} />
      </button>
      <button
        data-testid="view-mode-list"
        aria-pressed={viewMode === 'list'}
        onClick={() => onModeChange('list')}
        title="列表视图"
        style={{
          padding: '4px 8px',
          border: '1px solid #ccc',
          borderRadius: 4,
          background: viewMode === 'list' ? '#3b82f6' : 'transparent',
          color: viewMode === 'list' ? '#fff' : 'inherit',
          cursor: 'pointer',
        }}
      >
        <List size={16} />
      </button>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <label htmlFor="page-size-select" style={{ fontSize: 13, color: '#666' }}>每页</label>
        <select
          id="page-size-select"
          data-testid="page-size-select"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          style={{ padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
