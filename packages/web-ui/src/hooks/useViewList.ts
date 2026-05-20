'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/i18n/useLocale';

export interface ViewMeta {
  view_id: string;
  project_id?: string;
  name: string;
  reactor_id?: string | null;
  display_order: number;
  is_template: number;
  is_svg?: number;
  updated_at?: string;
  svgcontent?: string | null;
  owner_id?: string | null;
  acl?: string; // JSON: { users: string[], roles: string[] }
  // SP-FX-FF.36: cards-view 列表项可携带 items + width/height 供 ViewCard
  // 渲染 widget bbox 缩略图 (无 svgcontent 时的回退预览)。
  width?: number;
  height?: number;
  items?: Record<string, { id: string; type: string; x?: number; y?: number; w?: number; h?: number; property?: unknown }>;
}

export interface UseViewListOpts {
  page?: number;
  size?: number;
  /** SP-FX-21: name 模糊搜索关键词 */
  q?: string;
  /** SP-FX-21: 排序方式 (name_asc | name_desc | mtime_asc | mtime_desc) */
  sort?: string;
}

export interface UseViewListResult {
  views: ViewMeta[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useViewList(projectId: string, opts?: UseViewListOpts): UseViewListResult {
  const [views, setViews] = useState<ViewMeta[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const page = opts?.page ?? 1;
  const size = opts?.size ?? 0;
  const q = opts?.q ?? '';
  const sort = opts?.sort ?? '';

  const refetch = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/scada/projects/${encodeURIComponent(projectId)}`;
      if (size > 0) {
        const offset = (page - 1) * size;
        url += `?limit=${size}&offset=${offset}`;
        // SP-FX-21: 追加 q / sort 参数
        if (q) url += `&q=${encodeURIComponent(q)}`;
        if (sort) url += `&sort=${encodeURIComponent(sort)}`;
      }
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      const fetched = (body.views ?? []) as ViewMeta[];
      setViews(fetched);
      setTotal(typeof body.total === 'number' ? body.total : fetched.length);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setViews([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, page, size, q, sort]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { views, total, loading, error, refetch };
}
