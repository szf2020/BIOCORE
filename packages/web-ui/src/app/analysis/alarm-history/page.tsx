// ============================================================
// /analysis/alarm-history — 报警历史查看页
//
// 功能:
// - 列出 alarms 表所有记录 (含已确认 + 未确认)
// - 按 批次/严重程度/确认状态/时间范围 过滤
// - 显示 触发时间, 严重度, 来源, 通道, 消息, 触发PV/SV, 确认信息
// - CSV 导出
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Download, RefreshCw, Search, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AlarmRow {
  id: number;
  batch_id: string | null;
  reactor_id: string | null;
  alarm_code: string;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  source: string;
  channel: string | null;
  message: string;
  pv_at_trigger: number | null;
  sv_at_trigger: number | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}

const SEVERITY_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  critical:  { label: '严重', color: 'bg-red-500/15 text-red-600 border-red-500/30', icon: AlertTriangle },
  emergency: { label: '紧急', color: 'bg-red-700/20 text-red-700 border-red-700/40', icon: AlertTriangle },
  warning:   { label: '警告', color: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30', icon: AlertCircle },
  info:      { label: '提示', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', icon: Info },
};

function fmtTime(raw: string | null): string {
  if (!raw) return '--';
  const iso = typeof raw === 'string' && raw.includes(' ') && !raw.includes('T')
    ? raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z') : raw;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString('zh-CN', { hour12: false });
}

export default function AlarmHistoryPage() {
  const [rows, setRows] = useState<AlarmRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [reactorId, setReactorId] = useState('');
  const [severity, setSeverity] = useState<'' | 'critical' | 'warning' | 'info' | 'emergency'>('');
  const [ack, setAck] = useState<'all' | 'ack' | 'unack'>('all');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [limit] = useState(500);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (batchId) params.set('batch_id', batchId);
      if (reactorId) params.set('reactor_id', reactorId);
      if (severity) params.set('severity', severity);
      if (ack !== 'all') params.set('ack', ack);
      if (since) params.set('since', since);
      if (until) params.set('until', until);
      params.set('limit', String(limit));
      const r = await apiFetch(`${API}/api/alarms/history?${params}`);
      if (r.ok) {
        const data = await r.json();
        setRows(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('[AlarmHistory] load failed:', e);
    }
    setLoading(false);
  }, [batchId, reactorId, severity, ack, since, until, limit]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const headers = ['ID', '触发时间', '罐号', '批次号', '报警代码', '严重度', '来源', '通道', '消息', '触发PV', '触发SV', '确认时间', '确认人'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      lines.push([
        r.id, fmtTime(r.triggered_at), r.reactor_id || '', r.batch_id || '', r.alarm_code,
        SEVERITY_META[r.severity]?.label || r.severity, r.source, r.channel || '',
        `"${(r.message || '').replace(/"/g, '""')}"`,
        r.pv_at_trigger ?? '', r.sv_at_trigger ?? '',
        fmtTime(r.acknowledged_at), r.acknowledged_by || '',
      ].join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `alarms_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      {/* 固定置顶: 标题 + 过滤栏 (sticky) */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 -my-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">报警历史</h1>
          <span className="text-xs text-muted-foreground font-mono">总计 {total} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-border hover:bg-muted transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-border hover:bg-muted transition-colors">
            <Download className="w-3.5 h-3.5" /> 导出 CSV
          </button>
        </div>
      </div>

      {/* 过滤栏 (sticky, 跟随标题置顶) */}
      <Card className="sticky top-14 z-10">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground flex items-center gap-1"><Search className="w-3 h-3" /> 罐号</div>
              <input value={reactorId} onChange={e => setReactorId(e.target.value)} placeholder="F01"
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
            </label>
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground flex items-center gap-1"><Search className="w-3 h-3" /> 批次号</div>
              <input value={batchId} onChange={e => setBatchId(e.target.value)} placeholder="B-..."
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
            </label>
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground">严重程度</div>
              <select value={severity} onChange={e => setSeverity(e.target.value as any)}
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs">
                <option value="">全部</option>
                <option value="emergency">紧急</option>
                <option value="critical">严重</option>
                <option value="warning">警告</option>
                <option value="info">提示</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground">确认状态</div>
              <select value={ack} onChange={e => setAck(e.target.value as any)}
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs">
                <option value="all">全部</option>
                <option value="unack">未确认</option>
                <option value="ack">已确认</option>
              </select>
            </label>
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground">起始时间</div>
              <input type="datetime-local" value={since} onChange={e => setSince(e.target.value)}
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs" />
            </label>
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground">截止时间</div>
              <input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)}
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs" />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12">
              {loading ? '加载中...' : '无匹配记录'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium w-10">ID</th>
                    <th className="px-2 py-2 text-left font-medium">触发时间</th>
                    <th className="px-2 py-2 text-left font-medium">严重度</th>
                    <th className="px-2 py-2 text-left font-medium">罐号</th>
                    <th className="px-2 py-2 text-left font-medium">批次</th>
                    <th className="px-2 py-2 text-left font-medium">代码</th>
                    <th className="px-2 py-2 text-left font-medium">来源/通道</th>
                    <th className="px-2 py-2 text-left font-medium">消息</th>
                    <th className="px-2 py-2 text-left font-medium">PV/SV</th>
                    <th className="px-2 py-2 text-left font-medium">确认</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const meta = SEVERITY_META[r.severity] || SEVERITY_META.info;
                    const Icon = meta.icon;
                    return (
                      <tr key={r.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.id}</td>
                        <td className="px-2 py-1.5 font-mono whitespace-nowrap">{fmtTime(r.triggered_at)}</td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold border ${meta.color}`}>
                            <Icon className="w-3 h-3" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-foreground font-semibold">{r.reactor_id || '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.batch_id || '—'}</td>
                        <td className="px-2 py-1.5 font-mono">{r.alarm_code}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {r.source}{r.channel ? ` / ${r.channel}` : ''}
                        </td>
                        <td className="px-2 py-1.5 max-w-[300px] truncate" title={r.message}>{r.message}</td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">
                          {r.pv_at_trigger != null ? r.pv_at_trigger : '—'}
                          {r.sv_at_trigger != null ? ` / ${r.sv_at_trigger}` : ''}
                        </td>
                        <td className="px-2 py-1.5">
                          {r.acknowledged_at ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <Check className="w-3 h-3" />
                              <span className="font-mono">{fmtTime(r.acknowledged_at)}</span>
                              {r.acknowledged_by && <span className="text-muted-foreground">· {r.acknowledged_by}</span>}
                            </span>
                          ) : (
                            <span className="text-xs text-red-600 font-semibold">未确认</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
