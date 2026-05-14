// ============================================================
// InterlockPanel — 状态机 RF/IL 连锁实时显示
//
// 关联到当前罐子的状态机:
//   - 启动前连锁 (IL-01 ~ IL-10) — 决定能否进入 running 状态
//   - 运行故障 (RF-01 ~ RF-11) — 运行中自动 Hold 触发条件
// 轮询 /api/reactors/:id/interlocks 获取实时 IL 状态, RF 元数据一次加载
// ============================================================

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface InterlockItem {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning';
  passed: boolean;
  detail: string;
}

interface InterlockResponse {
  reactor_id: string;
  all_passed: boolean;
  checked: boolean;
  items: InterlockItem[];
}

interface RunningFaultItem {
  code: string;
  name: string;
  description: string;
  severity: 'critical' | 'warning';
  holdAction?: string;
}

interface Props {
  reactorId: string;
  /** 当前状态机状态 — 决定展示侧重 (idle 时看 IL, running/held 时看 RF) */
  currentState?: string;
  /** 外部报警列表 — 用于标记当前触发的 RF */
  activeFaultCodes?: string[];
}

export function InterlockPanel({ reactorId, currentState, activeFaultCodes = [] }: Props) {
  const [ilData, setIlData] = useState<InterlockResponse | null>(null);
  const [rfList, setRfList] = useState<RunningFaultItem[]>([]);
  // userCollapsed: null=auto (跟随故障状态), true/false=用户手动覆盖
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const loadIl = useCallback(async () => {
    if (!reactorId) return;
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/api/reactors/${reactorId}/interlocks`);
      if (r.ok) {
        const data = await r.json();
        setIlData(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [reactorId]);

  // 初始 + 每 5 秒刷新 IL 状态 (IL 只在 idle 时有实际价值, 避免高频轮询)
  useEffect(() => {
    loadIl();
    const t = setInterval(loadIl, 5000);
    return () => clearInterval(t);
  }, [loadIl]);

  // RF 元数据一次加载
  useEffect(() => {
    if (!reactorId) return;
    apiFetch(`${API}/api/reactors/${reactorId}/running-faults`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(data => setRfList(data.items || []))
      .catch(() => { /* ignore */ });
  }, [reactorId]);

  // 始终同时显示 IL 和 RF, 让用户看到状态机的完整连锁拓扑 (idle 时 IL 决定能否启动, running 时 RF 决定能否继续)
  const showIL = true;
  const showRF = true;

  const ilItems = ilData?.items || [];
  const ilFailedCount = ilItems.filter(i => !i.passed && i.severity === 'critical').length;
  const ilWarningCount = ilItems.filter(i => !i.passed && i.severity === 'warning').length;
  const activeFaultSet = new Set(activeFaultCodes);
  const activeRfCount = rfList.filter(rf => activeFaultSet.has(rf.code)).length;

  // 自动展开逻辑: 有故障默认展开, 无故障默认折叠. 用户手动操作后尊重选择
  const hasIssues = ilFailedCount > 0 || activeRfCount > 0;
  const collapsed = userCollapsed === null ? !hasIssues : userCollapsed;
  const setCollapsed = (c: boolean) => setUserCollapsed(c);

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden">
      {/* 标题栏 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-primary rounded" />
          <span className="text-sm font-semibold text-foreground">状态机连锁</span>
          <span className="text-[10px] text-muted-foreground font-mono">IL·RF</span>
        </div>
        <div className="flex items-center gap-2">
          {/* IL 失败计数 */}
          {ilFailedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-600 border border-red-500/30">
              IL {ilFailedCount} 失败
            </span>
          )}
          {ilFailedCount === 0 && ilWarningCount === 0 && ilData?.checked && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500/15 text-emerald-600 border border-green-500/30">
              IL 全通过
            </span>
          )}
          {/* 运行故障计数 */}
          {activeRfCount > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-500/15 text-amber-600 border border-yellow-500/30">
              RF {activeRfCount} 触发
            </span>
          )}
          {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* 启动前连锁 IL */}
          {showIL && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  启动前连锁 (IL-01 ~ IL-10)
                </div>
                {loading && <Activity className="w-3 h-3 text-muted-foreground animate-pulse" />}
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                必须全部 critical 项通过才能从 idle 进入 running. IL-10 为警告级不阻止启动.
              </p>
              <div className="space-y-1">
                {ilItems.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground italic">加载中...</div>
                ) : ilItems.map(il => {
                  const passed = il.passed;
                  const warn = il.severity === 'warning';
                  return (
                    <div key={il.id}
                      className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded border
                        ${passed
                          ? 'bg-green-500/5 border-green-500/20 text-emerald-600'
                          : warn
                            ? 'bg-yellow-500/5 border-yellow-500/20 text-amber-600'
                            : 'bg-red-500/5 border-red-500/20 text-red-600'
                        }`}
                      title={il.description}
                    >
                      <span className="font-mono font-semibold w-10 flex-shrink-0">{il.id}</span>
                      <span className="flex-1 truncate">{il.name}</span>
                      <span className="font-mono text-[10px] opacity-75 truncate max-w-[120px]">{il.detail}</span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        passed ? 'bg-green-500' : warn ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 运行故障 RF */}
          {showRF && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-foreground">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                运行故障 (RF-01 ~ RF-11)
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">
                running 状态下每秒检测, critical 级故障自动切换到 held.
              </p>
              <div className="grid grid-cols-1 gap-1">
                {rfList.map(rf => {
                  const active = activeFaultSet.has(rf.code);
                  const warn = rf.severity === 'warning';
                  return (
                    <div key={rf.code}
                      className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded border
                        ${active
                          ? 'bg-red-500/10 border-red-500/40 text-red-600 animate-pulse'
                          : warn
                            ? 'bg-muted/20 border-border text-muted-foreground'
                            : 'bg-muted/20 border-border text-muted-foreground'
                        }`}
                      title={`${rf.description}${rf.holdAction ? ' · 动作: ' + rf.holdAction : ''}`}
                    >
                      <span className="font-mono font-semibold w-10 flex-shrink-0">{rf.code}</span>
                      <span className="flex-1 truncate">{rf.name}</span>
                      {rf.holdAction && (
                        <span className="text-[9px] opacity-60 truncate max-w-[100px]">{rf.holdAction}</span>
                      )}
                      <span className={`px-1 rounded text-[9px] flex-shrink-0 ${
                        warn ? 'bg-yellow-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'
                      }`}>
                        {warn ? '警告' : '严重'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
