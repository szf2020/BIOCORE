'use client';
import { useCallback } from 'react';

export interface WriteIntentInput {
  tag: string;
  value?: number | string | boolean | null;
  reason: string;
  view_id: string;
  widget_id: string;
}

export interface WriteIntentResult {
  success: true;
  suggestion_id: number;
}

export interface UsePostWriteIntentResult {
  post: (input: WriteIntentInput) => Promise<WriteIntentResult>;
}

export function usePostWriteIntent(): UsePostWriteIntentResult {
  const post = useCallback(async (input: WriteIntentInput): Promise<WriteIntentResult> => {
    const r = await fetch('/api/v1/scada/write-intents', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      let detail = '';
      try { const j = await r.json(); detail = j.error ?? ''; } catch { /* ignore */ }
      throw new Error(`HTTP ${r.status}${detail ? ` (${detail})` : ''}`);
    }
    return (await r.json()) as WriteIntentResult;
  }, []);
  return { post };
}
