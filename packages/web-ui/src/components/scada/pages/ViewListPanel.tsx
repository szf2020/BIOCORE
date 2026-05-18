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
import { ViewListSearchBar, type SortKey, type FilterState } from './ViewListSearchBar';
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

  // SP-FX-21: 搜索/排序/tag 状态从 URL 读取
  const q = searchParams?.get('q') ?? '';
  const sort = (searchParams?.get('sort') as SortKey | null) ?? 'name_asc';
  const tags = (searchParams?.get('tag') ?? '').split(',').filter(Boolean);

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

  const { views, total, loading, error, refetch } = useViewList(projectId, { page, size, q, sort });
  const mut = useViewMutations(projectId);

  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(LS_KEY, mode); } catch { /* ignore */ }
  }, []);

  const setPage = useCallback((p: number) => {
    const params = new URLSearchParams({ page: String(p), size: String(size), q, sort, tag: tags.join(',') });
    router.replace(`?${params.toString()}`);
  }, [router, size, q, sort, tags]);

  const setSize = useCallback((s: number) => {
    const params = new URLSearchParams({ page: '1', size: String(s), q, sort, tag: tags.join(',') });
    router.replace(`?${params.toString()}`);
  }, [router, q, sort, tags]);

  // SP-FX-21: 搜索/排序/tag 变化时重置 page=1 并更新 URL
  const handleFilterChange = useCallback((patch: Partial<FilterState>) => {
    const newQ = patch.q !== undefined ? patch.q : q;
    const newSort = patch.sort !== undefined ? patch.sort : sort;
    const newTags = patch.tags !== undefined ? patch.tags : tags;
    const params = new URLSearchParams({
      page: '1',
      size: String(size),
      q: newQ,
      sort: newSort,
      tag: newTags.join(','),
    });
    router.replace(`?${params.toString()}`);
  }, [router, size, q, sort, tags]);

  // Sync localStorage viewMode on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === 'list' || stored === 'cards') setViewMode(stored);
    } catch { /* ignore */ }
  }, []);

  // SP-FX-21: 从 views 推断 tag prefix 列表
  function extractAvailableTags(vs: ViewMeta[]): string[] {
    const prefixes = new Set<string>();
    for (const v of vs) {
      const idx = v.name.indexOf('_');
      if (idx > 0 && idx < v.name.length - 1) prefixes.add(v.name.slice(0, idx));
    }
    return [...prefixes].sort();
  }

  if (loading) return <div style={{ padding: 8 }}>{t('view-list-panel.loading')}</div>;
  if (error) return <div style={{ padding: 8, color: '#dc2626' }}>{t('common.error')}: {error.message}</div>;
  if (views.length === 0 && page === 1 && !q && tags.length === 0) return (
    <>
      <div data-testid="sticky-toolbar-container" className="sticky top-0 z-10 bg-background border-b">
        <ViewListSearchBar q={q} sort={sort} tags={tags} availableTags={[]} onChange={handleFilterChange} />
        <ViewListToolbar viewMode={viewMode} onModeChange={handleModeChange} pageSize={size} onPageSizeChange={setSize} />
      </div>
      <div style={{ padding: 8, color: '#666' }}>{t('view-list-panel.no-views')}</div>
    </>
  );

  const sorted = [...views].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));

  // SP-FX-21: tag 前端过滤
  const availableTags = extractAvailableTags(sorted);
  const displayed = tags.length === 0
    ? sorted
    : sorted.filter(v => tags.some(t => v.name.startsWith(t + '_')));

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
    window.location.href = `/scada2/edit/${viewId}`;
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

      {/* SP-FX-25: sticky toolbar container (search + toolbar) for mobile */}
      <div data-testid="sticky-toolbar-container" className="sticky top-0 z-10 bg-background border-b">
        {/* SP-FX-21: 搜索/排序/tag 过滤栏 */}
        <ViewListSearchBar
          q={q}
          sort={sort}
          tags={tags}
          availableTags={availableTags}
          onChange={handleFilterChange}
        />
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
