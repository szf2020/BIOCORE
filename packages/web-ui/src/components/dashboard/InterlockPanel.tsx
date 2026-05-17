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
import { ShieldCheck, ShieldAlert, Activity, X } from 'lucide-react';
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

  const ilItems = ilData?.items || [];
  const ilFailedCount = ilItems.filter(i => !i.passed && i.severity === 'critical').length;
  const ilWarningCount = ilItems.filter(i => !i.passed && i.severity === 'warning').length;
  const activeFaultSet = new Set(activeFaultCodes);
  const activeRfCount = rfList.filter(rf => activeFaultSet.has(rf.code)).length;

  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div>
      {/* 标题栏 */}
      <div className="w-full flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          {loading && <Activity className="w-3 h-3 text-muted-foreground animate-pulse" />}
          <div className="w-1 h-4 bg-primary rounded" />
          <span className="text-sm font-semibold text-foreground">状态机连锁</span>
          <span className="text-xs text-muted-foreground font-mono">IL·RF</span>
        </div>
        <div className="flex items-center gap-2">
          {/* IL 失败计数 */}
          {ilFailedCount > 0 && (
            <button type="button" onClick={() => setDetailOpen(true)} title="查看 IL/RF 详情"
              className="px-2.5 py-1 rounded text-[15px] font-semibold bg-red-500/15 text-red-600 border border-red-500/30 hover:bg-red-500/25 transition-colors cursor-pointer">
              IL {ilFailedCount} 失败
            </button>
          )}
          {ilFailedCount === 0 && ilWarningCount === 0 && ilData?.checked && (
            <button type="button" onClick={() => setDetailOpen(true)} title="查看 IL/RF 详情"
              className="px-2.5 py-1 rounded text-[15px] font-semibold bg-green-500/15 text-emerald-600 border border-green-500/30 hover:bg-green-500/25 transition-colors cursor-pointer">
              IL 全通过
            </button>
          )}
          {/* 运行故障计数 */}
          {activeRfCount > 0 ? (
            <button type="button" onClick={() => setDetailOpen(true)} title="查看 IL/RF 详情"
              className="px-2.5 py-1 rounded text-[15px] font-semibold bg-yellow-500/15 text-amber-600 border border-yellow-500/30 hover:bg-yellow-500/25 transition-colors cursor-pointer">
              RF {activeRfCount} 触发
            </button>
          ) : rfList.length > 0 ? (
            <button type="button" onClick={() => setDetailOpen(true)} title="查看 IL/RF 详情"
              className="px-2.5 py-1 rounded text-[15px] font-semibold bg-green-500/15 text-emerald-600 border border-green-500/30 hover:bg-green-500/25 transition-colors cursor-pointer">
              RF 全通过
            </button>
          ) : null}
        </div>
      </div>

      {detailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
          onClick={() => setDetailOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg w-[640px] max-h-[80vh] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded" />
                <span className="text-sm font-semibold">状态机连锁详情</span>
                <span className="text-xs text-muted-foreground font-mono">IL · RF</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-foreground">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  启动前连锁 (IL-01 ~ IL-10)
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  必须全部 critical 项通过才能从 idle 进入 running. IL-10 为警告级不阻止启动.
                </p>
                <div className="space-y-1">
                  {ilItems.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">无数据</div>
                  ) : ilItems.map(il => {
                    const passed = il.passed;
                    const warn = il.severity === 'warning';
                    return (
                      <div key={il.id}
                        className={`flex items-start gap-2 text-[11px] px-2 py-1.5 rounded border
                          ${passed
                            ? 'bg-green-500/5 border-green-500/20 text-emerald-600'
                            : warn
                              ? 'bg-yellow-500/5 border-yellow-500/20 text-amber-600'
                              : 'bg-red-500/5 border-red-500/20 text-red-600'
                          }`}
                      >
                        <span className="font-mono font-semibold w-10 flex-shrink-0">{il.id}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">{il.name}</div>
                          <div className="text-xs opacity-75 mt-0.5">{il.description}</div>
                          <div className="font-mono text-xs opacity-90 mt-0.5">{il.detail}</div>
                        </div>
                        <span className={`px-1 rounded text-[11px] flex-shrink-0 self-start ${
                          warn ? 'bg-yellow-500/15 text-amber-600' : passed ? 'bg-green-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'
                        }`}>
                          {passed ? '通过' : warn ? '警告' : '失败'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-foreground">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  运行故障 (RF-01 ~ RF-11)
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  running 状态下每秒检测, critical 级故障自动切换到 held.
                </p>
                <div className="space-y-1">
                  {rfList.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">无数据</div>
                  ) : rfList.map(rf => {
                    const active = activeFaultSet.has(rf.code);
                    const warn = rf.severity === 'warning';
                    return (
                      <div key={rf.code}
                        className={`flex items-start gap-2 text-[11px] px-2 py-1.5 rounded border
                          ${active
                            ? 'bg-red-500/10 border-red-500/40 text-red-600'
                            : 'bg-muted/20 border-border text-muted-foreground'
                          }`}
                      >
                        <span className="font-mono font-semibold w-10 flex-shrink-0">{rf.code}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">{rf.name}</div>
                          <div className="text-xs opacity-75 mt-0.5">{rf.description}</div>
                          {rf.holdAction && (
                            <div className="text-xs opacity-90 mt-0.5">动作: {rf.holdAction}</div>
                          )}
                        </div>
                        <span className={`px-1 rounded text-[11px] flex-shrink-0 self-start ${
                          warn ? 'bg-yellow-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'
                        }`}>
                          {active ? '触发' : warn ? '警告' : '严重'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
