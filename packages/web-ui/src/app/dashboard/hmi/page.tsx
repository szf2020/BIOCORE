// ============================================================
// Dashboard 二级菜单: 工艺画面 (FUXA HMI 集成)
// 顶部反应器选择栏与 /dashboard 一致, 切换时通过 iframe URL fragment 传给 FUXA
// ============================================================

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Pencil, Eye } from 'lucide-react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useLocale } from '@/i18n/useLocale';

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
  const { t } = useLocale();
  const reactorStates = useRealtimeStore(s => s.reactorStates);
  const [reactorIds, setReactorIds] = useState<string[]>([]);
  const [selectedReactor, setSelectedReactor] = useState<string>('');
  const [editMode, setEditMode] = useState<boolean>(false);

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

  // FUXA iframe URL 含 reactor 参数; editMode=true → /editor (编辑), false → / (运行视图)
  const iframeSrc = useMemo(() => {
    const path = editMode ? '/editor' : '/';
    const q = selectedReactor ? `?reactor=${encodeURIComponent(selectedReactor)}` : '';
    return `${FUXA_URL}${path}${q}`;
  }, [selectedReactor, editMode]);

  const [showHelp, setShowHelp] = useState(false);

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
              <span className={`text-sm ${isSelected ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
                {getStateLabel(reactor.state)}
              </span>
            </button>
          );
        })}

        {/* 右上角: 切换 FUXA 编辑/查看模式 */}
        <button
          onClick={() => setEditMode(v => !v)}
          title={editMode ? '切换到查看模式' : '切换到编辑模式'}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded text-sm shrink-0 border transition-colors ${
            editMode
              ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {editMode ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {editMode ? '编辑模式' : '查看模式'}
        </button>
      </header>

      {/* FUXA iframe 主区 — key 含 editMode 让模式切换也强制 reload */}
      <main className="flex-1 relative bg-slate-100">
        <iframe
          key={`${selectedReactor}-${editMode ? 'edit' : 'view'}`}
          src={iframeSrc}
          className="absolute inset-0 w-full h-full border-0"
          title="FUXA HMI"
          allow="clipboard-read; clipboard-write"
        />

        {/* FUXA 未启动? 右下角 help — iframe 显示 broken icon 时用户点这里看启动指南 */}
        <button
          type="button"
          onClick={() => setShowHelp(v => !v)}
          className="absolute bottom-3 right-3 px-3 py-1.5 bg-white border border-slate-300 rounded shadow-sm text-sm text-slate-700 hover:bg-slate-50"
        >
          画面未加载?
        </button>
        {showHelp && (
          <div className="absolute bottom-14 right-3 max-w-sm bg-white border border-slate-300 rounded-lg shadow-lg p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-800">FUXA HMI 未启动</div>
              <button onClick={() => setShowHelp(false)} className="text-slate-400 hover:text-slate-700 text-lg leading-none">&times;</button>
            </div>
            <div className="text-sm text-slate-600">iframe 连接 <code className="font-mono bg-slate-100 px-1 rounded">{FUXA_URL}</code></div>
            <div className="text-sm text-slate-500">
              启动 (monorepo 方案 A):
              <pre className="bg-slate-900 text-slate-100 p-2 mt-1 rounded font-mono text-sm overflow-x-auto whitespace-pre">pnpm --filter @biocore/fuxa dev</pre>
            </div>
            <button
              type="button"
              onClick={() => location.reload()}
              className="w-full px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              FUXA 已启动 — 刷新页面
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
