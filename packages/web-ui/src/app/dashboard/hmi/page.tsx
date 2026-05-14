// ============================================================
// Dashboard 二级菜单: 工艺画面 (FUXA HMI 集成)
// 顶部反应器选择栏与 /dashboard 一致, 切换时通过 iframe URL fragment 传给 FUXA
// ============================================================

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { useRealtimeStore } from '@/stores/realtime-store';

const FUXA_URL = process.env.NEXT_PUBLIC_FUXA_URL || 'http://localhost:1881';
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
  const reactorStates = useRealtimeStore(s => s.reactorStates);
  const [reactorIds, setReactorIds] = useState<string[]>([]);
  const [selectedReactor, setSelectedReactor] = useState<string>('');

  // 拉取反应器配置 (与 dashboard 同源 /api/reactor-configs)
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

  // 派生 reactor 列表 (state 来自 WS reactorStates map)
  const reactors: ReactorInfo[] = useMemo(() => {
    return reactorIds.map(id => ({
      id,
      state: (reactorStates[id]?.state as string) || 'idle',
    }));
  }, [reactorIds, reactorStates]);

  // FUXA iframe URL 含 reactor 参数 (FUXA project 可读取; 当前未对接也无害)
  const iframeSrc = useMemo(() => {
    return selectedReactor ? `${FUXA_URL}/?reactor=${encodeURIComponent(selectedReactor)}` : FUXA_URL;
  }, [selectedReactor]);

  return (
    <div className="flex flex-col h-[calc(100vh-70px)] bg-slate-50">
      {/* 顶部工具栏: 返回 + 反应器选择栏 (与 dashboard 一致) */}
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
              <span className={`text-xs ${isSelected ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
                {getStateLabel(reactor.state)}
              </span>
            </button>
          );
        })}
      </header>

      {/* FUXA iframe 主区 — key 让 selectedReactor 切换时强制 reload */}
      <main className="flex-1 relative bg-slate-100">
        <iframe
          key={selectedReactor}
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-0"
          title="FUXA HMI"
          allow="clipboard-read; clipboard-write"
        />
      </main>
    </div>
  );
}
