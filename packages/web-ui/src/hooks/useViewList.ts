'use client';
import { useCallback, useEffect, useState } from 'react';

export interface ViewMeta {
  view_id: string;
  project_id?: string;
  name: string;
  reactor_id?: string | null;
  display_order: number;
  is_template: number;
  is_svg?: number;
  updated_at?: string;
}

export interface UseViewListResult {
  views: ViewMeta[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useViewList(projectId: string): UseViewListResult {
  const [views, setViews] = useState<ViewMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setViews((body.views ?? []) as ViewMeta[]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setViews([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { views, loading, error, refetch };
}
