'use client';
// SP-FX-21: ViewList 搜索栏 — q/sort/tag 过滤控件
import React from 'react';

export type SortKey = 'name_asc' | 'name_desc' | 'mtime_asc' | 'mtime_desc';

export interface FilterState {
  q: string;
  sort: SortKey;
  tags: string[];
}

interface ViewListSearchBarProps {
  q: string;
  sort: SortKey;
  tags: string[];
  availableTags: string[];
  onChange: (patch: Partial<FilterState>) => void;
}

export function ViewListSearchBar({ q, sort, tags, availableTags, onChange }: ViewListSearchBarProps) {
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ q: e.target.value });
  }

  function handleSortChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onChange({ sort: e.target.value as SortKey });
  }

  function handleTagClick(tag: string) {
    const next = tags.includes(tag)
      ? tags.filter(t => t !== tag)
      : [...tags, tag];
    onChange({ tags: next });
  }

  return (
    <div
      data-testid="view-search-bar"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0' }}
    >
      {/* 搜索输入 */}
      <input
        data-testid="view-search-input"
        type="text"
        placeholder="搜索画面名称…"
        value={q}
        onChange={handleQChange}
        style={{ flex: '1 1 160px', minWidth: 120, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
        aria-label="搜索画面"
      />

      {/* 排序下拉 */}
      <select
        data-testid="view-sort-select"
        value={sort}
        onChange={handleSortChange}
        style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
        aria-label="排序方式"
      >
        <option value="name_asc">名称 A→Z</option>
        <option value="name_desc">名称 Z→A</option>
        <option value="mtime_asc">修改时间 旧→新</option>
        <option value="mtime_desc">修改时间 新→旧</option>
      </select>

      {/* Tag chip 多选 */}
      {availableTags.map(tag => (
        <button
          key={tag}
          data-testid={`tag-chip-${tag}`}
          onClick={() => handleTagClick(tag)}
          aria-pressed={tags.includes(tag)}
          style={{
            padding: '2px 10px',
            borderRadius: 12,
            border: '1px solid #6b7280',
            background: tags.includes(tag) ? '#374151' : 'transparent',
            color: tags.includes(tag) ? '#fff' : '#374151',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}
