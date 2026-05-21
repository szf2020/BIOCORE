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
import { useLocale } from '@/i18n/useLocale';

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

  const { t } = useLocale();
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

  if (loading) return <div style={{ padding: 8 }}>{t('view-list-panel.loading')}</div>;
  if (error) return <div style={{ padding: 8, color: '#dc2626' }}>{t('common.error')}: {error.message}</div>;
  if (views.length === 0 && page === 1) return (
    <>
      <div data-testid="sticky-toolbar-container" className="sticky top-0 z-10 bg-background border-b">
        <ViewListToolbar viewMode={viewMode} onModeChange={handleModeChange} pageSize={size} onPageSizeChange={setSize} />
      </div>
      <div style={{ padding: 8, color: '#666' }}>{t('view-list-panel.no-views')}</div>
    </>
  );

  const sorted = [...views].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  // SP-FX-FF.48: 取消 SP-FX-21 的 demo/prod tag 过滤 — UI chip 已移除,显示全部。
  const displayed = sorted;

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
    if (!window.confirm(`${t('view-list-panel.delete-confirm')}: "${view.name}"?`)) return;
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
    const newName = original ? `${original.name} (copy)` : 'copy';
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
    window.location.href = `/scada2/edit-v2/${viewId}`;
  }

  return (
    <>
      {mutationError && (
        <div
          data-testid="mutation-error-banner"
          style={{ padding: 8, marginBottom: 4, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ flex: 1 }}>{t('common.error')}: {mutationError}</span>
          <button
            data-testid="dismiss-error-btn"
            onClick={() => setMutationError(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#dc2626' }}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>
      )}

      {/* SP-FX-FF.48: 搜索栏取消, 仅保留 toolbar (cards/list 切换 + pageSize) */}
      <div data-testid="sticky-toolbar-container" className="sticky top-0 z-10 bg-background border-b">
        <ViewListToolbar viewMode={viewMode} onModeChange={handleModeChange} pageSize={size} onPageSizeChange={setSize} />
      </div>

      {viewMode === 'cards' ? (
        <ViewCardGrid
          views={displayed}
          onEdit={handleEdit}
          onOpen={handleOpen}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      ) : (
        <ViewListRows
          sorted={displayed}
          onRename={handleRename}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      )}

      <ViewPaginator page={page} total={total} size={size} onPageChange={setPage} onSizeChange={setSize} />
    </>
  );
}
