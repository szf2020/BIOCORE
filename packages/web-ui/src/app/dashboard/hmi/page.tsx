// ============================================================
// Dashboard 二级菜单: 工艺画面 — BIOCore 自写 SCADA (FUXA iframe 已退役)
// SP-FX-48.1: 删 FUXA iframe (http://localhost:1881), 改嵌 BIOCore /scada2 view list
// 保留 reactor selector 顶部栏
// ============================================================

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ReactorInfo {
  id: string;
  state: string;
}

function getReactorLedClass(state: string): string {
  switch (state) {
    case 'running': return 'status-led-running';
    case 'held': return 'status-led-held';
    case 'paused': return 'status-led-paused';
    case 'stopped': return 'status-led-stopped';
    case 'complete': return 'status-led-complete';
    default: return 'status-led-idle';
  }
}

function getStateLabel(state: string): string {
  switch (state) {
    case 'running': return '运行';
    case 'held': return '保持';
    case 'paused': return '暂停';
    case 'stopped': return '停止';
    case 'complete': return '完成';
    default: return '空闲';
  }
}

export default function HmiPage() {
  const { t } = useLocale();
  const reactorStates = useRealtimeStore(s => s.reactorStates);
  const [reactorIds, setReactorIds] = useState<string[]>([]);
  const [selectedReactor, setSelectedReactor] = useState<string>('');

  useEffect(() => {
    fetch(`${API}/api/reactor-configs`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const ids = Array.isArray(rows) ? rows.map(r => r.reactor_id).filter(Boolean) : [];
        setReactorIds(ids);
        setSelectedReactor(prev => (prev && ids.includes(prev)) ? prev : (ids[0] || ''));
      })
      .catch(() => { /* offline OK */ });
  }, []);

  const reactors: ReactorInfo[] = useMemo(() => {
    return reactorIds.map(id => ({
      id,
      state: (reactorStates[id]?.state as string) || 'idle',
    }));
  }, [reactorIds, reactorStates]);

  const scadaListUrl = useMemo(() => {
    const q = selectedReactor ? `?reactor=${encodeURIComponent(selectedReactor)}` : '';
    return `/scada2${q}`;
  }, [selectedReactor]);

  return (
    <div className="flex flex-col h-[calc(100vh-70px)] bg-slate-50">
      <header className="flex items-center gap-2 px-4 py-2 bg-white border-b shadow-sm overflow-x-auto">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
          返回 Dashboard
        </Link>
        <div className="h-5 w-px bg-slate-300 shrink-0" />
        <h1 className="text-base font-semibold shrink-0">工艺画面</h1>
        <div className="h-5 w-px bg-slate-300 mx-2 shrink-0" />

        {reactors.map(reactor => {
          const isSelected = selectedReactor === reactor.id;
          return (
            <button
              key={reactor.id}
              onClick={() => setSelectedReactor(reactor.id)}
              className={`flex items-center gap-2 px-3 py-1 rounded text-sm shrink-0 transition-colors ${
                isSelected
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:bg-muted border border-transparent'
              }`}
            >
              <div className={`status-led ${getReactorLedClass(reactor.state)}`} />
              <span className="font-mono font-semibold">{reactor.id}</span>
              <span className={`text-sm ${isSelected ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
                {getStateLabel(reactor.state)}
              </span>
            </button>
          );
        })}

        <Link
          href={scadaListUrl}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-sm shrink-0 border bg-blue-500 text-white border-blue-600 hover:bg-blue-600"
        >
          打开画面集
        </Link>
      </header>

      <main className="flex-1 relative bg-slate-100">
        <iframe
          key={selectedReactor}
          src={scadaListUrl}
          className="absolute inset-0 w-full h-full border-0"
          title="BIOCore SCADA"
        />
      </main>
    </div>
  );
}
