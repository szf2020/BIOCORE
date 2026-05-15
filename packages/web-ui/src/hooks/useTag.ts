import { useEffect } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

export interface UseTagOpts {
  staleMs?: number;
}

export interface TagSnapshot {
  value: number | null;
  isStale: boolean;
  ageMs: number;
}

export interface ParsedTagId {
  reactorId: string;
  field: string;
}

const DEFAULT_STALE_MS = 5000;

const PROCESS_VALUES_FIELDS = new Set<string>([
  'AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4', 'AI-5', 'AI-6',
  'AO-0_cv', 'AO-1_cv', 'AO-2_cv',
  'P01_rate', 'P02_rate', 'P03_rate', 'P04_rate',
  'rpm', 'vfd_current', 'temp_sv', 'temp_mode',
]);

export function parseTagId(tagId: string): ParsedTagId | null {
  if (typeof tagId !== 'string') return null;
  const parts = tagId.split('.');
  if (parts.length !== 2) return null;
  const [reactorId, field] = parts;
  if (!reactorId || !field) return null;
  return { reactorId, field };
}

let tickStarted = false;
export function ensureTick(): void {
  if (tickStarted) return;
  if (typeof window === 'undefined') return;
  tickStarted = true;
  setInterval(() => {
    useRealtimeStore.setState({ _tick: Date.now() });
  }, 1000);
}

const STALE_SNAPSHOT: TagSnapshot = Object.freeze({
  value: null,
  isStale: true,
  ageMs: Infinity,
});

export function useTag(tagId: string, opts: UseTagOpts = {}): TagSnapshot {
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  useEffect(() => {
    ensureTick();
  }, []);

  const wsConnected = useRealtimeStore((s) => s.wsConnected);
  const tick = useRealtimeStore((s) => s._tick);
  const parsed = parseTagId(tagId);
  const reactorData = useRealtimeStore((s) =>
    parsed ? s.reactorData[parsed.reactorId] : undefined
  );

  if (!parsed) return STALE_SNAPSHOT;
  if (!reactorData || !reactorData.processValues) return STALE_SNAPSHOT;
  if (!PROCESS_VALUES_FIELDS.has(parsed.field)) return STALE_SNAPSHOT;

  const pv = reactorData.processValues as Record<string, any>;
  const raw = pv[parsed.field];
  const value = typeof raw === 'number' ? raw : null;

  let ageMs = Infinity;
  if (pv.timestamp) {
    const ts = new Date(pv.timestamp).getTime();
    if (!Number.isNaN(ts)) {
      ageMs = Date.now() - ts;
    }
  }
  void tick;

  const isStale = value === null || !wsConnected || ageMs > staleMs;

  return { value, isStale, ageMs };
}
