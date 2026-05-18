'use client';

// SP-FX-4: editor shell entry page. Loads view via GET, injects into store,
// renders EditorShell. 404 fallback + 5xx retry.

import React, { useEffect, useState, useCallback } from 'react';
import { useEditorStore } from '@/scada-engine/services/editor-store';
import { EditorShell } from '@/scada-engine/editor/editor-shell';
import { parseFuxaView } from '@/scada-engine/models/hmi';

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

export default function Page({ params }: { params: { viewId: string } }): JSX.Element {
  const [state, setState] = useState<LoadState>('loading');
  const openView = useEditorStore.getState().openView;

  const load = useCallback(async () => {
    setState('loading');
    try {
      const r = await fetch(`/api/v1/fuxa-views/${params.viewId}`);
      if (r.status === 404) { setState('not_found'); return; }
      if (!r.ok) { setState('error'); return; }
      const row = await r.json();
      const view = parseFuxaView(typeof row.payload === 'string' ? row.payload : JSON.stringify(row));
      openView(view);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [params.viewId, openView]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <div className="p-8 text-zinc-400">加载中...</div>;
  if (state === 'not_found') return (
    <div className="p-8">
      <p className="mb-2">视图不存在</p>
      <a href="/scada2/" className="text-blue-400 underline">返回列表</a>
    </div>
  );
  if (state === 'error') return (
    <div className="p-8">
      <p className="mb-2">加载失败</p>
      <button data-action="retry" onClick={load} className="px-3 py-1 bg-blue-600 text-white rounded">
        重试
      </button>
    </div>
  );
  return <EditorShell viewId={params.viewId} />;
}
