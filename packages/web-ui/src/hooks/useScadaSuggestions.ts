import { useEffect, useState, useCallback, useRef } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import {
  fetchScadaSuggestions,
  acceptSuggestion as apiAccept,
  rejectSuggestion as apiReject,
  type ScadaSuggestion,
} from '@/api/scada';

const REFETCH_DEBOUNCE_MS = 500;

export function useScadaSuggestions() {
  const [suggestions, setSuggestions] = useState<ScadaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchScadaSuggestions();
      setSuggestions(list);
    } catch (e: any) {
      setError(e?.message || 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Debounced refetch when store head changes to a scada suggestion
  useEffect(() => {
    if (!latest) return;
    const src = (latest as any).source_module;
    if (src !== 'scada') return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => { refetch(); }, REFETCH_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [latest?.id, refetch]);

  const accept = useCallback(async (id: number) => {
    await apiAccept(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const reject = useCallback(async (id: number) => {
    await apiReject(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { suggestions, loading, error, refetch, accept, reject };
}
