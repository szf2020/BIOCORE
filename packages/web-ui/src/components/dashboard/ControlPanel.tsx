// ============================================================
// ControlPanel — MES风格批次主控
// 布局: 报警提示 → 批次号输入 → 配方选择 → 按钮 → Phase列表
// ============================================================

'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, RotateCcw, Square, AlertTriangle,
  Check, Ban, Bell,
} from 'lucide-react';
import type { StateUpdatePayload, BatchState, Alarm } from '@/types';
import { phaseLabel } from '@/lib/utils';
import { useAudit } from '@/hooks/useAudit';
import { useRealtimeStore } from '@/stores/realtime-store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type PhaseState = 'pending' | 'ready' | 'running' | 'held' | 'completed' | 'skipped' | 'failed';

interface PhaseStatus {
  phase_id: string; phase_type: string; phase_index: number;
  state: PhaseState; step_number: number; total_steps: number;
  step_name: string; hold_reason?: string;
  started_at?: string; // Phase启动时间 (用于计时)
  duration_h?: number; // 配方中定义的目标时长 (用于倒计时)
}

interface ControlPanelProps {
  state: StateUpdatePayload | null;
  reactorId?: string;
}

const stateColors: Record<string, string> = {
  idle: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  running: 'bg-green-500/15 text-emerald-600 border-green-500/30',
  held: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30',
  paused: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30',
  stopped: 'bg-red-500/15 text-red-600 border-red-500/30',
  complete: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
};

const phaseStateColors: Record<PhaseState, { bg: string; label: string }> = {
  pending:   { bg: 'bg-gray-500/15 text-gray-400 border-gray-500/30', label: '待执行' },
  ready:     { bg: 'bg-blue-500/15 text-blue-600 border-blue-500/30', label: '就绪' },
  running:   { bg: 'bg-green-500/15 text-emerald-600 border-green-500/30', label: '运行中' },
  held:      { bg: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30', label: '保持' },
  completed: { bg: 'bg-blue-500/15 text-blue-600 border-blue-500/30', label: '已完成' },
  skipped:   { bg: 'bg-purple-500/15 text-purple-600 border-purple-500/30', label: '已跳过' },
  failed:    { bg: 'bg-red-500/15 text-red-600 border-red-500/30', label: '失败' },
};

const STATE_LABELS: Record<string, string> = {
  idle: '空闲', running: '运行中', held: '保持', paused: '暂停', stopped: '已停止', complete: '已完成',
};

export function ControlPanel({ state, reactorId = 'F01' }: ControlPanelProps) {
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [changingRecipe, setChangingRecipe] = useState(false);
  const [approvedRecipes, setApprovedRecipes] = useState<any[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [batchIdInput, setBatchIdInput] = useState('');
  // 多反应器隔离: alarms 按 reactorId 取, 未匹配 fallback 顶层
  const _topAlarms = useRealtimeStore(s => s.alarms);
  const _reactorAlarms = useRealtimeStore(s => s.reactorData[reactorId]?.alarms);
  const alarms = _reactorAlarms ?? _topAlarms;
  const setAlarms = useRealtimeStore(s => s.setAlarms);
  const ackAlarmInStore = useRealtimeStore(s => s.acknowledgeAlarm);
  const reactorStateFromWS = useRealtimeStore(s => s.reactorStates[reactorId]);
  const reactorRecipeFromWS = useRealtimeStore(s => s.reactorRecipes[reactorId]);
  const setReactorRecipe = useRealtimeStore(s => s.setReactorRecipe);
  const setReactorStateInStore = useRealtimeStore(s => s.setReactorState);
  // T19: DAG runtime phase_id — find the entry for the current batch (batch_id from reactorStateFromWS)
  const batchRuntime = useRealtimeStore(s => s.batchRuntime);
  const currentBatchId = (reactorStateFromWS as any)?.batch_id ?? '';
  const dagRuntime = currentBatchId ? batchRuntime[currentBatchId] : undefined;
  // 审计追踪 hook
  const audit = useAudit();
  // Phase计时器
  const [phaseTimers, setPhaseTimers] = useState<Record<number, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载 Phase 模板 (一次) — 关联系统设置中的 Phase 模板配置
  const [phaseTemplateMap, setPhaseTemplateMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch(`${API}/api/phase-templates`).then(r => r.ok ? r.json() : []).then((data: any[]) => {
      if (Array.isArray(data)) {
        const map: Record<string, string> = {};
        data.forEach(t => { if (t.type && t.label) map[t.type] = t.label; });
        setPhaseTemplateMap(map);
      }
    }).catch(() => {});
  }, []);

  // 加载配方列表 (一次)
  useEffect(() => {
    fetch(`${API}/api/recipes?status=approved`).then(r => r.json()).then(data => setApprovedRecipes(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // 初始报警快照 (后续由 WS 'alarm' channel 推送增量)
  useEffect(() => {
    fetch(`${API}/api/alarms`).then(r => r.ok ? r.json() : []).then((data: Alarm[]) => {
      if (Array.isArray(data)) setAlarms(data);
    }).catch(() => {});
  }, [setAlarms]);

  // 下载配方 (后端 broadcast 'recipe_downloaded' → store 自动更新)
  const downloadRecipeToReactor = async () => {
    if (!selectedRecipeId) return;
    setDownloading(true);
    try {
      const [recipeId, version] = selectedRecipeId.split('::');
      const resp = await fetch(`${API}/api/reactors/${reactorId}/download-recipe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipeId, version }),
      });
      const data = await resp.json();
      if (data.success) {
        setChangingRecipe(false);
        // store 会通过 WS recipe_downloaded 自动更新, 此处无需手动 setState
      }
    } catch { }
    setDownloading(false);
  };

  // 切换反应器时,初始 fetch 一次配方状态 (后续由 WS 推送增量)
  useEffect(() => {
    fetch(`${API}/api/reactors/${reactorId}/recipe`).then(r => r.ok ? r.json() : null).then((data: any) => {
      if (data?.downloaded && data?.recipe_id) {
        // 拉完整 phases (列表 API 不返回 phases)
        fetch(`${API}/api/recipes/${data.recipe_id}?version=${data.version}`).then(r => r.json()).then(rData => {
          setReactorRecipe(reactorId, {
            recipe_id: data.recipe_id,
            recipe_name: data.recipe_name || data.recipe_id,
            version: data.version,
            phases: rData?.phases || [],
            execution_mode: rData?.execution_mode || 'free',
            downloaded_at: data.downloaded_at,
          });
        }).catch(() => {});
      } else {
        setReactorRecipe(reactorId, null);
      }
    }).catch(() => {});
  }, [reactorId, setReactorRecipe]);

  // 切换反应器时,初始 fetch 一次罐状态 (后续由 WS state_update 推送增量)
  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/reactors/${reactorId}/status`);
      if (resp.ok) {
        const data = await resp.json();
        setReactorStateInStore(reactorId, { ...data, reactor_id: reactorId });
      }
    } catch { }
  }, [reactorId, setReactorStateInStore]);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // 派生 (去除 changingRecipe 相关 state, 改用 store)
  const recipeDownloaded = !changingRecipe && !!reactorRecipeFromWS;
  const downloadedRecipeName = reactorRecipeFromWS?.recipe_name || '';
  const downloadedPhases = reactorRecipeFromWS?.phases || [];
  const downloadedExecutionMode: 'free' | 'sequential' = reactorRecipeFromWS?.execution_mode || 'free';

  // Phase计时器 (每秒更新)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPhaseTimers(prev => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) next[Number(k)] = v + 1;
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // 状态数据 (优先用 store 中的 per-reactor WS 推送, 回退到 prop state)
  const wsBatchState: BatchState = state?.state || 'idle';
  const wsPhaseStatuses: PhaseStatus[] = (state as any)?.phase_statuses || [];
  const realBatchState: BatchState = (reactorStateFromWS?.state as BatchState) || wsBatchState;
  const allPhaseStatuses: PhaseStatus[] = (reactorStateFromWS as any)?.phase_statuses || wsPhaseStatuses;
  const CLEAN_TYPES = ['CIP', 'SIP', 'cip', 'sip'];
  const realPhaseStatuses = allPhaseStatuses.filter(p => !CLEAN_TYPES.includes(p.phase_type));
  const realIsIdle = realBatchState === 'idle';
  const realIsRunning = realBatchState === 'running';
  const realIsPaused = realBatchState === 'paused';
  const realIsHeld = realBatchState === 'held';
  const realIsStopped = realBatchState === 'stopped' || realBatchState === 'complete';

  // P0 修复: 把 Phase 状态的签名 useMemo 固化, 避免每次 render 都创建新字符串触发重算
  const phaseStatusSignature = useMemo(
    () => realPhaseStatuses.map(p => `${p.phase_index}:${p.state}`).join(','),
    [realPhaseStatuses]
  );
  // 当Phase状态变化时重置计时器
  useEffect(() => {
    const timers: Record<number, number> = {};
    for (const ps of realPhaseStatuses) {
      if (ps.state === 'running' && ps.started_at) {
        timers[ps.phase_index] = Math.floor((Date.now() - new Date(ps.started_at).getTime()) / 1000);
      }
    }
    setPhaseTimers(timers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseStatusSignature]);

  const CMD_ROUTES: Record<string, string> = {
    cmd_start: 'start', cmd_pause: 'pause', cmd_unpause: 'unpause',
    cmd_restart: 'restart', cmd_stop: 'stop', cmd_reset: 'reset',
  };

  const sendBatchCommand = async (command: string) => {
    setConfirmAction(null);
    const route = CMD_ROUTES[command];
    if (!route) return;
    try {
      await fetch(`${API}/api/reactors/${reactorId}/${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchIdInput || undefined }),
      });
      await fetchStatus();
    } catch (e) { console.error(`Command ${command} failed:`, e); }
  };

  const sendPhaseCmd = async (phaseIndex: number, action: string) => {
    try {
      await fetch(`${API}/api/reactors/${reactorId}/phases/${phaseIndex}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      await fetchStatus();
    } catch (e) { console.error(e); }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const formatCountdown = (elapsedSec: number, durationH: number) => {
    const totalSec = durationH * 3600;
    const remaining = Math.max(0, totalSec - elapsedSec);
    return `剩余 ${formatTime(remaining)}`;
  };

  const unacknowledgedAlarms = alarms.filter(a => !a.acknowledged_at);

  return (
    <div className="space-y-3">
      {/* ═══ 报警提示 (在配方主控上方) ═══ */}
      {unacknowledgedAlarms.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
            <Bell className="w-4 h-4" />
            报警 ({unacknowledgedAlarms.length})
          </div>
          {unacknowledgedAlarms.slice(0, 3).map(a => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className="text-red-600 font-mono flex-shrink-0">
                {a.triggered_at ? new Date(a.triggered_at).toLocaleTimeString('zh-CN', { hour12: false }) : '--'}
              </span>
              <span className="text-red-300 truncate flex-1">{a.message}</span>
              <button onClick={async () => {
                const resp = await fetch(`${API}/api/alarms/${a.id}/acknowledge`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: 'admin-001' }),
                });
                if (resp.ok) ackAlarmInStore(a.id);
              }} className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-600 hover:bg-red-500/10 flex-shrink-0">
                确认
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══ 配方主控 ═══ */}
      <div className="bg-card border border-border rounded-md overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-primary rounded" />
            <span className="text-sm font-semibold text-foreground">配方主控</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${stateColors[realBatchState] || stateColors.idle}`}>
            {STATE_LABELS[realBatchState] || realBatchState}
          </span>
        </div>

        <div className="p-3 space-y-3">
          {/* T19: 当前 Phase (DAG runtime) — 仅批次运行时显示 */}
          {dagRuntime && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-primary/8 border border-primary/20">
              <span className="text-[10px] text-muted-foreground flex-shrink-0">当前</span>
              <strong className="text-xs font-mono text-foreground truncate flex-1">
                {dagRuntime.phase_id || '—'}
              </strong>
              {dagRuntime.phase_type && (
                <span className="text-[10px] text-muted-foreground bg-muted/60 border border-border px-1.5 py-0.5 rounded flex-shrink-0">
                  {dagRuntime.phase_type}
                </span>
              )}
            </div>
          )}

          {/* 罐号 + 批次号输入 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-shrink-0">{reactorId}</span>
            <input value={batchIdInput}
              onChange={e => setBatchIdInput(e.target.value)}
              placeholder="输入批次号 (统计报表用)"
              disabled={!realIsIdle}
              className="flex-1 h-7 px-2 rounded bg-background border border-border text-xs font-mono text-foreground placeholder:text-muted-foreground/50 disabled:opacity-50" />
            {(state?.batch_elapsed_sec ?? 0) > 0 && (
              <span className="font-mono text-xs text-foreground flex-shrink-0">{formatTime(state?.batch_elapsed_sec ?? 0)}</span>
            )}
          </div>

          {/* 配方选择与下载 */}
          {realIsIdle && !recipeDownloaded && (
            <div className="space-y-2 bg-yellow-500/5 border border-yellow-500/20 rounded p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-medium">请选择已锁定的配方并下载</span>
              </div>
              <div className="flex gap-1.5">
                <select value={selectedRecipeId} onChange={e => setSelectedRecipeId(e.target.value)}
                  className="flex-1 h-7 rounded bg-background border border-border text-[11px] text-foreground px-2 truncate">
                  <option value="">-- 选择已锁定配方 --</option>
                  {approvedRecipes.map(r => (
                    <option key={`${r.recipe_id}::${r.version}`} value={`${r.recipe_id}::${r.version}`}>
                      {r.name || r.recipe_id} v{r.version}
                    </option>
                  ))}
                </select>
                <button onClick={downloadRecipeToReactor} disabled={!selectedRecipeId || downloading}
                  className={`h-7 px-2.5 rounded text-[11px] font-semibold whitespace-nowrap ${
                    selectedRecipeId && !downloading ? 'bg-primary text-white hover:bg-primary/90' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
                  {downloading ? '...' : '下载'}
                </button>
              </div>
            </div>
          )}

          {recipeDownloaded && (
            <>
              <div className="flex items-center justify-between text-xs text-emerald-600 bg-green-500/5 border border-green-500/20 rounded px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{realIsIdle ? '配方已就绪' : '当前配方'}: <strong>{downloadedRecipeName}</strong></span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                    downloadedExecutionMode === 'sequential' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-border'
                  }`}>{downloadedExecutionMode === 'sequential' ? '顺序' : '自由'}</span>
                </div>
                {realIsIdle && (
                  <button onClick={() => { setChangingRecipe(true); setReactorRecipe(reactorId, null); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline">更换</button>
                )}
              </div>
              {realIsIdle && downloadedPhases.length > 0 && (() => {
                const prodPhases = downloadedPhases.filter((p: any) => !CLEAN_TYPES.includes(p.type));
                if (prodPhases.length === 0) return null;
                return (
                  <div className="border border-border rounded p-2 space-y-1">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">生产 Phase ({prodPhases.length})</div>
                    {prodPhases.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs px-1.5 py-1 rounded bg-muted/20">
                        <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>
                        <span className="font-medium text-foreground">{phaseLabel(p.type)}</span>
                        <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] bg-gray-500/15 text-gray-400 border border-gray-500/20">待执行</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </>
          )}

          {/* 批次号必填提示 (idle + 已下载配方 + 批次号未填) */}
          {realIsIdle && recipeDownloaded && !batchIdInput.trim() && (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-yellow-500/5 border border-yellow-500/20 rounded px-2 py-1">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              请输入批次号后再启动
            </div>
          )}

          {/* 主控按钮 */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => audit.confirm({
              description: `启动批次 ${batchIdInput}`,
              action: 'batch_start', targetType: 'batch', targetId: reactorId,
              oldValue: 'idle', newValue: 'running',
              batchId: batchIdInput,
              onConfirm: () => sendBatchCommand('cmd_start'),
            })}
              disabled={!realIsIdle || !recipeDownloaded || !batchIdInput.trim()}
              className={`flex items-center justify-center gap-1 h-9 rounded text-xs font-semibold border transition-all ${
                realIsIdle && recipeDownloaded && batchIdInput.trim() ? 'bg-green-500/15 text-emerald-600 border-green-500/40 hover:bg-green-500/25' : 'bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed'}`}
              title={!batchIdInput.trim() ? '必须先输入批次号' : '启动批次'}>
              <Play className="w-3.5 h-3.5" /> 启动
            </button>
            <button onClick={() => sendBatchCommand('cmd_pause')} disabled={!realIsRunning}
              className={`flex items-center justify-center gap-1 h-9 rounded text-xs font-semibold border transition-all ${
                realIsRunning ? 'bg-yellow-500/15 text-amber-600 border-yellow-500/40 hover:bg-yellow-500/25' : 'bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed'}`}>
              <Pause className="w-3.5 h-3.5" /> 暂停
            </button>
            <button onClick={() => sendBatchCommand(realIsHeld ? 'cmd_restart' : 'cmd_unpause')} disabled={!realIsPaused && !realIsHeld}
              className={`flex items-center justify-center gap-1 h-9 rounded text-xs font-semibold border transition-all ${
                realIsPaused || realIsHeld ? 'bg-blue-500/15 text-blue-600 border-blue-500/40 hover:bg-blue-500/25' : 'bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed'}`}>
              <RotateCcw className="w-3.5 h-3.5" /> 恢复
            </button>
            <button onClick={() => audit.confirm({
              description: `放弃批次 ${reactorId}`,
              action: 'batch_stop', targetType: 'batch', targetId: reactorId,
              oldValue: realBatchState, newValue: 'stopped',
              batchId: batchIdInput || null,
              onConfirm: () => sendBatchCommand('cmd_stop'),
            })}
              disabled={!realIsPaused && !realIsHeld}
              className={`flex items-center justify-center gap-1 h-9 rounded text-xs font-semibold border transition-all ${
                realIsPaused || realIsHeld ? 'bg-red-500/15 text-red-600 border-red-500/40 hover:bg-red-500/25' : 'bg-muted/30 text-muted-foreground/40 border-border cursor-not-allowed'}`}>
              <Square className="w-3.5 h-3.5" /> 放弃
            </button>
          </div>

          {/* 复位 (stopped/complete 时，仅此一处) */}
          {realIsStopped && (
            <button onClick={() => { sendBatchCommand('cmd_reset'); setReactorRecipe(reactorId, null); setBatchIdInput(''); }}
              className="w-full flex items-center justify-center gap-1.5 h-9 rounded text-xs font-semibold bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-all">
              <RotateCcw className="w-3.5 h-3.5" /> 复位
            </button>
          )}

          {/* Phase 控制列表 */}
          {realPhaseStatuses.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-3.5 bg-primary rounded" />
                <span className="text-xs font-semibold text-foreground">Phase 控制列表</span>
              </div>
              <div className="space-y-1">
                {realPhaseStatuses.map(ps => {
                  const cfg = phaseStateColors[ps.state] || phaseStateColors.pending;
                  const progress = ps.total_steps > 0 ? Math.round((ps.step_number / ps.total_steps) * 100) : 0;
                  const elapsed = phaseTimers[ps.phase_index] || 0;
                  const durationH = ps.duration_h || downloadedPhases[ps.phase_index]?.params?.duration_h;

                  return (
                    <div key={ps.phase_index} className="rounded bg-muted/20 border border-border/40 p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground w-3 text-right">{ps.phase_index + 1}</span>
                        <span className="text-xs font-medium text-foreground flex-1 truncate">
                          {ps.phase_id || phaseLabel(ps.phase_type, phaseTemplateMap[ps.phase_type])}
                        </span>
                        {ps.phase_type && (
                          <span className="text-[9px] text-muted-foreground bg-muted/40 border border-border/60 px-1 py-0.5 rounded flex-shrink-0 hidden sm:inline">
                            {ps.phase_type}
                          </span>
                        )}
                        {/* 运行中: 倒计时或计时 */}
                        {ps.state === 'running' && (
                          <span className="text-[10px] font-mono text-emerald-600 flex-shrink-0">
                            {durationH ? formatCountdown(elapsed, durationH) : formatTime(elapsed)}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cfg.bg}`}>{cfg.label}</span>
                      </div>

                      {(ps.state === 'running' || ps.state === 'held') && ps.total_steps > 0 && (
                        <div className="space-y-0.5">
                          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                            <span>Step {ps.step_number}/{ps.total_steps}: {ps.step_name || '...'}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="h-1 bg-muted rounded overflow-hidden">
                            <div className={`h-full rounded transition-all ${ps.state === 'running' ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-1">
                        {(ps.state === 'pending' || ps.state === 'ready') && downloadedExecutionMode === 'free' && (
                          <>
                            <button onClick={() => sendPhaseCmd(ps.phase_index, 'start')} className="h-5 px-1.5 rounded text-[10px] font-medium text-emerald-600 border border-green-500/30 hover:bg-green-500/10">▶ 启动</button>
                            <button onClick={() => sendPhaseCmd(ps.phase_index, 'skip')} className="h-5 px-1.5 rounded text-[10px] font-medium text-muted-foreground border border-border hover:bg-muted">跳过</button>
                          </>
                        )}
                        {(ps.state === 'pending' || ps.state === 'ready') && downloadedExecutionMode === 'sequential' && (
                          <span className="text-[10px] text-muted-foreground italic">自动</span>
                        )}
                        {ps.state === 'running' && (
                          <>
                            <button onClick={() => sendPhaseCmd(ps.phase_index, 'hold')} className="h-5 px-1.5 rounded text-[10px] font-medium text-amber-600 border border-yellow-500/30 hover:bg-yellow-500/10">⏸ 保持</button>
                            <button onClick={() => sendPhaseCmd(ps.phase_index, 'skip')} className="h-5 px-1.5 rounded text-[10px] font-medium text-red-600 border border-red-500/30 hover:bg-red-500/10">⏹ 停止</button>
                          </>
                        )}
                        {ps.state === 'held' && (
                          <>
                            <button onClick={() => sendPhaseCmd(ps.phase_index, 'restart')} className="h-5 px-1.5 rounded text-[10px] font-medium text-emerald-600 border border-green-500/30 hover:bg-green-500/10">▶ 恢复</button>
                            <button onClick={() => sendPhaseCmd(ps.phase_index, 'skip')} className="h-5 px-1.5 rounded text-[10px] font-medium text-red-600 border border-red-500/30 hover:bg-red-500/10">⏹ 放弃</button>
                          </>
                        )}
                        {ps.state === 'completed' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                        {ps.state === 'skipped' && <Ban className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {audit.dialog}
    </div>
  );
}
