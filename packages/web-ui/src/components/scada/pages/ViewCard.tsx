'use client';
import React from 'react';
import { ExternalLink, Pencil, Copy, Trash2 } from 'lucide-react';
import type { ViewMeta } from '@/hooks/useViewList';
import { ThumbnailRenderer } from './ThumbnailRenderer';

interface Props {
  view: ViewMeta;
  onEdit: (viewId: string) => void;
  onOpen: (viewId: string) => void;
  onDuplicate: (viewId: string) => void;
  onDelete: (view: ViewMeta) => void;
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function ViewCard({ view, onEdit, onOpen, onDuplicate, onDelete }: Props) {
  const hasSvg = typeof view.svgcontent === 'string' && view.svgcontent.trim().length > 0;

  return (
    <div
      data-testid="view-card"
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Thumbnail */}
      <div style={{ height: 80, background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
        {hasSvg ? (
          <div data-testid="view-card-thumbnail-svg">
            <ThumbnailRenderer
              svgcontent={view.svgcontent!}
              viewWidth={800}
              viewHeight={600}
              height={80}
            />
          </div>
        ) : (
          <div
            data-testid="view-card-thumbnail-placeholder"
            style={{
              width: '100%',
              height: '100%',
              background: '#e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: 12,
            }}
          >
            无预览
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px', flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {view.name}
          {view.is_template ? <span style={{ marginLeft: 6, fontSize: 10, color: '#3b82f6' }}>[模板]</span> : null}
        </div>
        {view.updated_at && (
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{relativeTime(view.updated_at)}</div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderTop: '1px solid #f3f4f6' }}>
        <button
          data-testid="view-card-open-btn"
          onClick={() => onOpen(view.view_id)}
          title="查看"
          style={{ flex: 1, padding: '3px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
        >
          <ExternalLink size={14} />
        </button>
        <button
          data-testid="view-card-edit-btn"
          onClick={() => onEdit(view.view_id)}
          title="编辑"
          style={{ flex: 1, padding: '3px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
        >
          <Pencil size={14} />
        </button>
        <button
          data-testid="view-card-duplicate-btn"
          onClick={() => onDuplicate(view.view_id)}
          title="复制"
          style={{ flex: 1, padding: '3px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
        >
          <Copy size={14} />
        </button>
        <button
          data-testid="view-card-delete-btn"
          onClick={() => onDelete(view)}
          title="删除"
          style={{ flex: 1, padding: '3px 0', border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
