'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useViewList } from '@/hooks/useViewList';
import { useViewMutations } from '@/hooks/useViewMutations';
import type { ViewMeta } from '@/hooks/useViewList';
import { ViewListToolbar, type ViewMode } from './ViewListToolbar';
import { ViewCardGrid } from './ViewCardGrid';
import { ViewListRows } from './ViewListRows';
import { ViewPaginator } from './ViewPaginator';

const LS_KEY = 'biocore.scada.viewListMode';
const VALID_SIZES = [12, 24, 48];

interface Props {
  projectId: string;
}

export function ViewListPanel({ projectId }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const page = Math.max(1, Number(searchParams?.get('page') ?? '1') || 1);
  const sizeParam = Number(searchParams?.get('size') ?? '12');
  const size = VALID_SIZES.includes(sizeParam) ? sizeParam : 12;

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
      return (stored === 'list' || stored === 'cards') ? stored : 'cards';
    } catch {
      return 'cards';
    }
  });

  const [mutationError, setMutationError] = useState<string | null>(null);

  const { views, total, loading, error, refetch } = useViewList(projectId, { page, size });
  const mut = useViewMutations(projectId);

  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(LS_KEY, mode); } catch { /* ignore */ }
  }, []);

  const setPage = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), size: String(size) });
    router.replace(`?${params.toString()}`);
  }, [router, size]);

  const setSize = useCallback((s: number) => {
    const params = new URLSearchParams({ page: '1', size: String(s) });
    router.replace(`?${params.toString()}`);
  }, [router]);

  // Sync localStorage viewMode on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === 'list' || stored === 'cards') setViewMode(stored);
    } catch { /* ignore */ }
  }, []);

  if (loading) return <div style={{ padding: 8 }}>加载中…</div>;
  if (error) return <div style={{ padding: 8, color: '#dc2626' }}>错误: {error.message}</div>;
  if (views.length === 0 && page === 1) return (
    <>
      <ViewListToolbar viewMode={viewMode} onModeChange={handleModeChange} pageSize={size} onPageSizeChange={setSize} />
      <div style={{ padding: 8, color: '#666' }}>没有画面</div>
    </>
  );

  const sorted = [...views].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  async function handleRename(viewId: string, newName: string) {
    if (newName.trim().length === 0) return;
    try {
      await mut.rename(viewId, newName.trim());
      setMutationError(null);
      await refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(view: ViewMeta) {
    if (!window.confirm(`确认删除画面 "${view.name}"?`)) return;
    try {
      await mut.delete(view.view_id);
      setMutationError(null);
      await refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMove(viewId: string, direction: -1 | 1) {
    const idx = sorted.findIndex(v => v.view_id === viewId);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const swapped = [...sorted];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    try {
      await mut.reorder(swapped.map(v => v.view_id));
      setMutationError(null);
      await refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDuplicate(viewId: string) {
    const original = views.find(v => v.view_id === viewId);
    const newName = original ? `${original.name} (副本)` : '副本';
    try {
      await mut.create(newName, { cloneFrom: viewId });
      setMutationError(null);
      await refetch();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleOpen(viewId: string) {
    window.location.href = `/scada2/${viewId}`;
  }

  function handleEdit(viewId: string) {
    window.location.href = `/scada2/edit/${viewId}`;
  }

  return (
    <>
      {mutationError && (
        <div
          data-testid="mutation-error-banner"
          style={{ padding: 8, marginBottom: 4, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ flex: 1 }}>操作失败: {mutationError}</span>
          <button
            data-testid="dismiss-error-btn"
            onClick={() => setMutationError(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#dc2626' }}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      <ViewListToolbar viewMode={viewMode} onModeChange={handleModeChange} pageSize={size} onPageSizeChange={setSize} />

      {viewMode === 'cards' ? (
        <ViewCardGrid
          views={sorted}
          onEdit={handleEdit}
          onOpen={handleOpen}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      ) : (
        <ViewListRows
          sorted={sorted}
          onRename={handleRename}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      )}

      <ViewPaginator page={page} total={total} size={size} onPageChange={setPage} onSizeChange={setSize} />
    </>
  );
}
