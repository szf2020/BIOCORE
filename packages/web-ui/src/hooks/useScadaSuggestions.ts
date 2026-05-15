import { useEffect, useState, useCallback, useRef } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import {
  fetchScadaSuggestions,
  fetchFailedDispatches,
  acceptSuggestion as apiAccept,
  rejectSuggestion as apiReject,
  retryDispatch as apiRetry,
  type ScadaSuggestion,
} from '@/api/scada';

const REFETCH_DEBOUNCE_MS = 500;

export function useScadaSuggestions() {
  const [suggestions, setSuggestions] = useState<ScadaSuggestion[]>([]);
  const [failed, setFailed] = useState<ScadaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, failedList] = await Promise.all([
        fetchScadaSuggestions(),
        fetchFailedDispatches(),
      ]);
      setSuggestions(pending);
      setFailed(failedList);
    } catch (e: any) {
      setError(e?.message || 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

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

  const retry = useCallback(async (id: number) => {
    await apiRetry(id);
    setFailed((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { suggestions, failed, loading, error, refetch, accept, reject, retry };
}
