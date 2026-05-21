// SP-RG-4: hook for phase_instances (binding of phase class → reactor).
// 同一 phase class 可被多个 reactor 多次绑定,每次产生独立 instance。

'use client';
import { useCallback, useEffect, useState } from 'react';

export interface PhaseInstance {
  instance_id: string;
  phase_class: string;
  reactor_id: string;
  label: string | null;
  params_override: Record<string, unknown>;
  notes: string;
  created_at: string;
  created_by: string;
}

export interface UsePhaseInstancesOpts {
  reactor?: string;
  phaseClass?: string;
}

export interface CreatePhaseInstanceInput {
  instance_id: string;
  phase_class: string;
  reactor_id: string;
  label?: string;
  params_override?: Record<string, unknown>;
  notes?: string;
}

export interface UpdatePhaseInstanceInput {
  phase_class?: string;
  reactor_id?: string;
  label?: string | null;
  params_override?: Record<string, unknown>;
  notes?: string;
}

function jwtHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem('biocore_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function unwrap<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status}: ${text || r.statusText}`);
  }
  if (r.status === 204) return undefined as unknown as T;
  const j = await r.json();
  // server wraps some routes as {code, msg, data, trace_id}; passthrough otherwise.
  return (j && typeof j === 'object' && 'data' in j ? j.data : j) as T;
}

export function usePhaseInstances(opts?: UsePhaseInstancesOpts): {
  instances: PhaseInstance[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  create: (input: CreatePhaseInstanceInput) => Promise<PhaseInstance>;
  update: (id: string, patch: UpdatePhaseInstanceInput) => Promise<PhaseInstance>;
  remove: (id: string) => Promise<void>;
} {
  const [instances, setInstances] = useState<PhaseInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts?.reactor) params.set('reactor', opts.reactor);
      if (opts?.phaseClass) params.set('phase_class', opts.phaseClass);
      const r = await fetch(`/api/v1/phase-instances${params.toString() ? '?' + params.toString() : ''}`, {
        headers: jwtHeader(),
      });
      const data = await unwrap<PhaseInstance[]>(r);
      setInstances(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setInstances([]);
    } finally {
      setLoading(false);
    }
  }, [opts?.reactor, opts?.phaseClass]);

  useEffect(() => { void refetch(); }, [refetch]);

  const create = useCallback(async (input: CreatePhaseInstanceInput): Promise<PhaseInstance> => {
    const r = await fetch('/api/v1/phase-instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...jwtHeader() },
      body: JSON.stringify(input),
    });
    const created = await unwrap<PhaseInstance>(r);
    await refetch();
    return created;
  }, [refetch]);

  const update = useCallback(async (id: string, patch: UpdatePhaseInstanceInput): Promise<PhaseInstance> => {
    const r = await fetch(`/api/v1/phase-instances/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...jwtHeader() },
      body: JSON.stringify(patch),
    });
    const updated = await unwrap<PhaseInstance>(r);
    await refetch();
    return updated;
  }, [refetch]);

  const remove = useCallback(async (id: string): Promise<void> => {
    const r = await fetch(`/api/v1/phase-instances/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: jwtHeader(),
    });
    await unwrap<void>(r);
    await refetch();
  }, [refetch]);

  return { instances, loading, error, refetch, create, update, remove };
}
