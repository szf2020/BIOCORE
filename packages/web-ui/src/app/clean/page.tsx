// ============================================================
// 清洗灭菌页面 — CIP/SIP 独立状态机控制
// 根据 S88 安全规范，CIP/SIP 与主发酵互锁
// ============================================================

'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, RotateCcw, AlertTriangle, AlertOctagon } from 'lucide-react';
import { phaseLabel, phaseStateLabel } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type PhaseState = 'pending' | 'ready' | 'running' | 'held' | 'completed' | 'skipped' | 'failed';

interface CleanPhase {
  phase_index: number;
  phase_id: string;
  phase_type: string;
  state: PhaseState;
  step_number: number;
  total_steps: number;
  step_name: string;
}

const stateColors: Record<string, string> = {
  pending: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  ready: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  running: 'bg-green-500/15 text-emerald-600 border-green-500/30',
  held: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30',
  completed: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  skipped: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  failed: 'bg-red-500/15 text-red-600 border-red-500/30',
};

export default function CleanPage() {
  const [reactorIds, setReactorIds] = useState<string[]>([]);
  const [selectedReactor, setSelectedReactor] = useState<string>('');
  const [reactorState, setReactorState] = useState<any>(null);
  const [batchState, setBatchState] = useState('idle');

  // 拉取启用的反应器配置 (与 dashboard/hmi 同源)
  useEffect(() => {
    fetch(`${API}/api/reactor-configs`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const ids = Array.isArray(rows)
          ? rows.filter(r => r?.enabled !== 0).map(r => r.reactor_id).filter(Boolean)
          : [];
        setReactorIds(ids);
        setSelectedReactor(prev => (prev && ids.includes(prev)) ? prev : (ids[0] || ''));
      })
      .catch(() => { /* offline OK */ });
  }, []);

  const fetchStatus = async () => {
    if (!selectedReactor) return;
    try {
      const resp = await fetch(`${API}/api/reactors/${selectedReactor}/status`);
      if (resp.ok) {
        const data = await resp.json();
        setReactorState(data);
        setBatchState(data.state || 'idle');
      }
    } catch { }
  };

  useEffect(() => {
    if (!selectedReactor) return;
    fetchStatus();
    const t = setInterval(fetchStatus, 2000);
    return () => clearInterval(t);
  }, [selectedReactor]);

  // 提取 CIP/SIP phases
  const allPhases: CleanPhase[] = reactorState?.phase_statuses || [];
  const CLEAN_TYPES = ['CIP', 'SIP', 'cip', 'sip'];
  const cleanPhases = allPhases.filter(p => CLEAN_TYPES.includes(p.phase_type));

  const cipPhases = cleanPhases.filter(p => p.phase_type === 'CIP' || p.phase_type === 'cip');
  const sipPhases = cleanPhases.filter(p => p.phase_type === 'SIP' || p.phase_type === 'sip');

  // 主发酵是否在运行 (互锁: 发酵运行中不能CIP/SIP)
  const prodRunning = batchState === 'running' || batchState === 'paused';

  const sendPhaseCmd = async (phaseIndex: number, action: string) => {
    try {
      await fetch(`${API}/api/reactors/${selectedReactor}/phases/${phaseIndex}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      await fetchStatus();
    } catch { }
  };

  const renderPhaseCard = (title: string, icon: string, color: string, phases: CleanPhase[]) => {
    const isRunning = phases.some(p => p.state === 'running');
    const isCompleted = phases.length > 0 && phases.every(p => p.state === 'completed' || p.state === 'skipped');

    return (
      <div className="bg-card border border-border rounded-md flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-lg`}>{icon}</div>
            <span className="text-sm font-semibold text-foreground">{title}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase border ${
            isRunning ? stateColors.running :
            isCompleted ? stateColors.completed :
            stateColors.pending
          }`}>
            {isRunning ? 'RUNNING' : isCompleted ? 'DONE' : 'IDLE'}
          </span>
        </div>

        <div className="flex-1 p-4 space-y-4">
          {/* 互锁警告 */}
          {prodRunning && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-xs text-red-600">互锁: 主发酵运行中，禁止启动清洗/灭菌</span>
            </div>
          )}

          {/* 无Phase时的提示 */}
          {phases.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              当前配方未包含 {title} 阶段
            </div>
          )}

          {/* Phase 步骤列表 */}
          {phases.map(ps => {
            const cfg = stateColors[ps.state] || stateColors.pending;
            const progress = ps.total_steps > 0 ? Math.round((ps.step_number / ps.total_steps) * 100) : 0;

            return (
              <div key={ps.phase_index} className="bg-muted/20 border border-border/40 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{phaseLabel(ps.phase_type || ps.phase_id)}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border ${cfg}`}>
                    {phaseStateLabel(ps.state)}
                  </span>
                </div>

                {/* 步骤进度 */}
                {(ps.state === 'running' || ps.state === 'held') && ps.total_steps > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono text-muted-foreground">
                      <span>Step {ps.step_number}/{ps.total_steps}: {ps.step_name || '...'}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div className={`h-full rounded transition-all ${ps.state === 'running' ? 'bg-green-500' : 'bg-yellow-500'}`}
                        style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  {(ps.state === 'pending' || ps.state === 'ready') && (
                    <button onClick={() => sendPhaseCmd(ps.phase_index, 'start')} disabled={prodRunning}
                      className={`flex items-center gap-1 h-7 px-3 rounded text-xs font-medium border transition-all
                        ${prodRunning
                          ? 'bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed'
                          : 'bg-green-500/15 text-emerald-600 border-green-500/30 hover:bg-green-500/25'}`}>
                      <Play className="w-3 h-3" /> 启动
                    </button>
                  )}
                  {ps.state === 'running' && (
                    <>
                      <button onClick={() => sendPhaseCmd(ps.phase_index, 'hold')}
                        className="flex items-center gap-1 h-7 px-3 rounded text-xs font-medium bg-yellow-500/15 text-amber-600 border border-yellow-500/30 hover:bg-yellow-500/25">
                        <Pause className="w-3 h-3" /> 暂停
                      </button>
                      <button onClick={() => sendPhaseCmd(ps.phase_index, 'skip')}
                        className="flex items-center gap-1 h-7 px-3 rounded text-xs font-medium bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25">
                        <Square className="w-3 h-3" /> 终止
                      </button>
                    </>
                  )}
                  {ps.state === 'held' && (
                    <>
                      <button onClick={() => sendPhaseCmd(ps.phase_index, 'restart')}
                        className="flex items-center gap-1 h-7 px-3 rounded text-xs font-medium bg-green-500/15 text-emerald-600 border border-green-500/30 hover:bg-green-500/25">
                        <RotateCcw className="w-3 h-3" /> 恢复
                      </button>
                      <button onClick={() => sendPhaseCmd(ps.phase_index, 'skip')}
                        className="flex items-center gap-1 h-7 px-3 rounded text-xs font-medium bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25">
                        <Square className="w-3 h-3" /> 终止
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* 罐选择 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-card/50 overflow-x-auto">
        {reactorIds.length === 0 && (
          <span className="text-xs text-muted-foreground px-2">无可用反应器</span>
        )}
        {reactorIds.map(id => (
          <button key={id} onClick={() => setSelectedReactor(id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all shrink-0
              ${selectedReactor === id
                ? 'bg-primary/15 text-primary border border-primary/40'
                : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted'}`}>
            {id}
          </button>
        ))}
      </div>

      {/* 标题 */}
      <div className="px-4 py-3 border-b border-border bg-card/30">
        <h1 className="text-sm font-semibold text-foreground">设备清洗与灭菌 (CIP / SIP)</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          独立状态机控制。安全互锁: 主发酵运行中禁止启动清洗/灭菌，CIP和SIP不能同时运行。
        </p>
      </div>

      {/* 双栏: CIP 和 SIP */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-auto">
        {renderPhaseCard('就地清洗 (CIP)', '🚿', 'bg-blue-500/15 text-blue-600', cipPhases)}
        {renderPhaseCard('就地灭菌 (SIP)', '🔥', 'bg-red-500/15 text-red-600', sipPhases)}
      </div>
    </div>
  );
}
