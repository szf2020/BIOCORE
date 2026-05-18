'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ViewMeta } from './useViewList';
import { useLocale } from '@/i18n/useLocale';

export interface UseTemplatesResult {
  templates: ViewMeta[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTemplates(projectId: string): UseTemplatesResult {
  const [templates, setTemplates] = useState<ViewMeta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}/templates`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setTemplates((body.items ?? []) as ViewMeta[]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { templates, loading, error, refetch };
}
