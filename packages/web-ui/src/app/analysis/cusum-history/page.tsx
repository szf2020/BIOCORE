// ============================================================
// /analysis/cusum-history — CUSUM 提示历史
//
// 来源: alarms 表中 source='cusum_anomaly' OR source LIKE 'ai:%' OR alarm_code LIKE 'CUSUM_%'
// 与操作性报警 (/analysis/alarm-history) 完全分离展示
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Download, RefreshCw, Search, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CusumRow {
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

export default function CusumHistoryPage() {
  const [rows, setRows] = useState<CusumRow[]>([]);
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
      const r = await apiFetch(`${API}/api/cusum/history?${params}`);
      if (r.ok) {
        const data = await r.json();
        setRows(data.items || []);
        setTotal(data.total || 0);
      }
    } catch (e) {
      console.error('[CusumHistory] load failed:', e);
    }
    setLoading(false);
  }, [batchId, reactorId, severity, ack, since, until, limit]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const headers = ['ID', '触发时间', '罐号', '批次号', 'CUSUM代码', '严重度', '来源', '通道', '消息', 'PV', 'SV', '确认时间', '确认人'];
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
    a.href = url; a.download = `cusum_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" /> CUSUM 历史
          </h1>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            统计层异常检测累积记录 (CUSUM / AI 提示, 与操作性报警分离)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1" /> CSV 导出
          </Button>
        </div>
      </div>

      {/* 过滤器 */}
      <Card>
        <CardContent className="p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground">罐号</label>
            <Input value={reactorId} onChange={e => setReactorId(e.target.value)} placeholder="F01" className="h-9 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">批次 ID</label>
            <Input value={batchId} onChange={e => setBatchId(e.target.value)} placeholder="B-..." className="h-9 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">严重程度</label>
            <select value={severity} onChange={e => setSeverity(e.target.value as any)}
              className="w-full h-9 px-2 mt-0.5 rounded bg-background border border-border text-xs">
              <option value="">全部</option>
              <option value="emergency">紧急</option>
              <option value="critical">严重</option>
              <option value="warning">警告</option>
              <option value="info">提示</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">确认状态</label>
            <select value={ack} onChange={e => setAck(e.target.value as any)}
              className="w-full h-9 px-2 mt-0.5 rounded bg-background border border-border text-xs">
              <option value="all">全部</option>
              <option value="unack">未确认</option>
              <option value="ack">已确认</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">起始时间</label>
            <Input type="datetime-local" value={since} onChange={e => setSince(e.target.value)} className="h-9 text-xs mt-0.5" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">截止时间</label>
            <Input type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} className="h-9 text-xs mt-0.5" />
          </div>
        </CardContent>
      </Card>

      {/* 统计 */}
      <div className="text-xs text-muted-foreground">
        共 <span className="text-foreground font-semibold">{rows.length}</span> 条记录{total !== rows.length && ` (从 ${total} 条中过滤)`}
      </div>

      {/* 表格 */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-2 text-left whitespace-nowrap">触发时间</th>
                <th className="px-3 py-2 text-left">严重度</th>
                <th className="px-3 py-2 text-left">罐号</th>
                <th className="px-3 py-2 text-left">批次</th>
                <th className="px-3 py-2 text-left">CUSUM 代码</th>
                <th className="px-3 py-2 text-left">来源/通道</th>
                <th className="px-3 py-2 text-left">消息</th>
                <th className="px-3 py-2 text-left">PV/SV</th>
                <th className="px-3 py-2 text-left">确认</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={9} className="px-3 py-12 text-center text-muted-foreground">
                  无 CUSUM 提示记录
                </td></tr>
              )}
              {rows.map(r => {
                const meta = SEVERITY_META[r.severity] || SEVERITY_META.info;
                const Icon = meta.icon;
                return (
                  <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 align-top">
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">{fmtTime(r.triggered_at)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.color}`}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-foreground font-semibold">{r.reactor_id || '—'}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.batch_id || '—'}</td>
                    <td className="px-3 py-2 font-mono">{r.alarm_code}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.source}{r.channel ? ` / ${r.channel}` : ''}
                    </td>
                    <td className="px-3 py-2 max-w-[300px] truncate" title={r.message}>{r.message}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                      {r.pv_at_trigger != null ? r.pv_at_trigger : '—'}
                      {r.sv_at_trigger != null ? ` / ${r.sv_at_trigger}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      {r.acknowledged_at ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                          <Check className="w-3 h-3" />
                          <span className="font-mono">{fmtTime(r.acknowledged_at)}</span>
                          {r.acknowledged_by && <span className="text-muted-foreground">· {r.acknowledged_by}</span>}
                        </span>
                      ) : (
                        <span className="text-[10px] text-purple-600 font-semibold">未确认</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
