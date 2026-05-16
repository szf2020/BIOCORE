'use client';
import { useMemo } from 'react';

export interface UseViewMutationsResult {
  create: (name: string, opts?: { cloneFrom?: string; isTemplate?: boolean }) => Promise<string>;
  rename: (viewId: string, name: string) => Promise<void>;
  delete: (viewId: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  setTemplate: (viewId: string, isTemplate: boolean) => Promise<void>;
}

function generateViewId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `view_${Date.now()}_${rand}`;
}

async function jsonFetch(input: string, init: RequestInit): Promise<Response> {
  const r = await fetch(input, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!r.ok) {
    let detail = '';
    try { const j = await r.json(); detail = j.error ?? ''; } catch { /* ignore */ }
    throw new Error(`HTTP ${r.status}${detail ? ` (${detail})` : ''}`);
  }
  return r;
}

export function useViewMutations(projectId: string): UseViewMutationsResult {
  return useMemo<UseViewMutationsResult>(() => ({
    async create(name, opts = {}) {
      const view_id = generateViewId();
      const body: Record<string, unknown> = { view_id, name };
      if (opts.cloneFrom) body.clone_from = opts.cloneFrom;
      if (opts.isTemplate) body.is_template = 1;
      await jsonFetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}/views`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return view_id;
    },
    async rename(viewId, name) {
      await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
    },
    async delete(viewId) {
      await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, { method: 'DELETE' });
    },
    async reorder(orderedIds) {
      await jsonFetch(`/api/v1/scada/projects/${encodeURIComponent(projectId)}/views/order`, {
        method: 'PATCH',
        body: JSON.stringify({ ordered_view_ids: orderedIds }),
      });
    },
    async setTemplate(viewId, isTemplate) {
      await jsonFetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        body: JSON.stringify({ is_template: isTemplate ? 1 : 0 }),
      });
    },
  }), [projectId]);
}
