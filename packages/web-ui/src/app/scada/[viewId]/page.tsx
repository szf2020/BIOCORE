'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchView, type ScadaView } from '@/api/scada';
import { useRealtimeStore } from '@/stores/realtime-store';
import { WidgetView } from '@/components/scada/WidgetView';
import { ViewActionRouter } from '@/components/scada/ViewActionRouter';

export default function ScadaViewerPage() {
  const params = useParams() as { viewId: string };
  const viewId = params.viewId;
  const [view, setView] = useState<ScadaView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const savedTick = useRealtimeStore(s => s._scadaViewSavedTick);

  const reload = useCallback(() => {
    fetchView(viewId)
      .then(v => { setView(v); setErr(null); })
      .catch(e => setErr(String(e)));
  }, [viewId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (savedTick?.view_id !== viewId) return;
    if (savedTick.updated_at === 'deleted') {
      setErr('视图已被删除');
      setView(null);
      return;
    }
    if (savedTick.updated_at !== view?.updated_at) reload();
  }, [savedTick, viewId, view?.updated_at, reload]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/scada" className="text-blue-600 hover:underline">← SCADA 列表</Link>
          <span className="text-gray-400">/</span>
          <span className="font-medium">{view?.name ?? viewId}</span>
          {view?.reactor_id && <span className="text-gray-500">· {view.reactor_id}</span>}
        </div>
        <div className="text-xs text-gray-400">{view?.updated_at}</div>
      </div>

      {err && <div className="p-6 text-red-700">{err}</div>}
      {!err && !view && <div className="p-6 text-gray-500">加载中…</div>}

      {view && (
        <ViewActionRouter viewId={viewId}>
          <div className="p-6 overflow-auto">
            <WidgetView view={view} />
          </div>
        </ViewActionRouter>
      )}
    </div>
  );
}
