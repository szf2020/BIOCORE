// ============================================================
// /analysis/audit-logs — 审计追踪查看页
//
// 功能:
// - 列出 audit_logs 表所有不可篡改记录
// - 按 user / action / target_type / 时间范围 过滤
// - 显示 trace_id, ip_address, old_value→new_value 对比
// - CSV 导出
// ============================================================

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AuditLog {
  id: number;
  batch_id: string | null;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_kind?: 'phase_index' | 'node_id' | 'recipe_id' | 'batch_id' | 'user_id' | 'channel_id' | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  ip_address: string | null;
  trace_id: string | null;
  details?: Record<string, unknown> | string | null;
  timestamp: string;
}

// action 类型 → 中文标签 + 颜色
const ACTION_STYLE: Record<string, { label: string; color: string }> = {
  user_create:           { label: '创建用户',     color: 'bg-green-500/15 text-emerald-600 border-green-500/30' },
  user_update:           { label: '更新用户',     color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  user_delete:           { label: '删除用户',     color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  user_toggle_active:    { label: '启禁用用户',   color: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30' },
  reactor_create:        { label: '创建反应器',   color: 'bg-green-500/15 text-emerald-600 border-green-500/30' },
  reactor_update:        { label: '更新反应器',   color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  reactor_delete:        { label: '删除反应器',   color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  reactor_toggle_active: { label: '启禁用反应器', color: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30' },
  recipe_create:         { label: '创建配方',     color: 'bg-green-500/15 text-emerald-600 border-green-500/30' },
  recipe_update:         { label: '更新配方',     color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  recipe_delete:         { label: '删除配方',     color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  recipe_approve:        { label: '批准配方',     color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
  recipe_unapprove:      { label: '解锁配方',     color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  recipe_submit_review:  { label: '提交审核',     color: 'bg-violet-500/15 text-violet-600 border-violet-500/30' },
  recipe_reject:         { label: '拒绝配方',     color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  recipe_save_as_template: { label: '另存为模板', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  recipe_instantiate_template: { label: '从模板实例化', color: 'bg-green-500/15 text-emerald-600 border-green-500/30' },
  batch_start:           { label: '启动批次',     color: 'bg-green-500/15 text-emerald-600 border-green-500/30' },
  batch_stop:            { label: '停止批次',     color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  plc_connection_create: { label: '创建PLC连接',  color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  plc_connection_update: { label: '更新PLC连接',  color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  plc_connection_delete: { label: '删除PLC连接',  color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  plc_variable_create:   { label: '创建PLC变量',  color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  plc_variable_update:   { label: '更新PLC变量',  color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  plc_variable_delete:   { label: '删除PLC变量',  color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  plc_heartbeat_start:   { label: '启动PLC心跳',  color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  plc_heartbeat_stop:    { label: '停止PLC心跳',  color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  api_key_create:        { label: '创建API Key',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  api_key_revoke:        { label: '撤销API Key',  color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  calibration_update:    { label: '校准更新',     color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  phase_template_create: { label: '创建Phase模板',color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  phase_template_update: { label: '更新Phase模板',color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  phase_template_delete: { label: '删除Phase模板',color: 'bg-red-500/15 text-red-600 border-red-500/30' },
  phase_template_init:   { label: '初始化Phase模板', color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  ai_config_update:      { label: '更新AI配置',   color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
  ai_suggestion_accept:  { label: '采纳AI建议',   color: 'bg-green-500/15 text-emerald-600 border-green-500/30' },
  ai_suggestion_reject:  { label: '拒绝AI建议',   color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  maintenance_backup:    { label: '数据备份',     color: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/30' },
  maintenance_log_cleanup: { label: '清理日志',   color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  maintenance_config_update:  { label: '更新维护配置', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  branch_evaluated:           { label: '分支评估',     color: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  branch_evaluation_skipped:  { label: '分支已跳过',   color: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
};

function actionLabel(action: string): { label: string; color: string } {
  return ACTION_STYLE[action] || { label: action, color: 'bg-gray-500/15 text-gray-400 border-gray-500/30' };
}

function renderTarget(
  target_id: string | null | undefined,
  target_kind: AuditLog['target_kind'],
): React.ReactNode {
  if (target_id == null) return <span className="text-gray-400">—</span>;
  if (target_kind === 'node_id')
    return <code className="font-mono text-sm">node:{target_id}</code>;
  if (target_kind === 'phase_index' || !target_kind)
    return <span>Phase {target_id}</span>;
  return <code className="font-mono text-sm">{target_kind}:{target_id}</code>;
}

export default function AuditLogsPage() {
  const { t } = useLocale();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterText, setFilterText] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = filterBatch
        ? `${API}/api/v1/audit-logs?batch_id=${encodeURIComponent(filterBatch)}`
        : `${API}/api/v1/audit-logs`;
      const r = await apiFetch(url);
      if (!r.ok) { setError(`查询失败: HTTP ${r.status}`); return; }
      const data = await r.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(`网络错误: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [filterBatch]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // 客户端过滤 (user/action/text)
  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterUser && !l.user_id.toLowerCase().includes(filterUser.toLowerCase())) return false;
      if (filterAction && !l.action.toLowerCase().includes(filterAction.toLowerCase())) return false;
      if (filterText) {
        const t = filterText.toLowerCase();
        const blob = `${l.target_type} ${l.target_id || ''} ${l.reason || ''} ${l.old_value || ''} ${l.new_value || ''} ${l.trace_id || ''}`.toLowerCase();
        if (!blob.includes(t)) return false;
      }
      return true;
    });
  }, [logs, filterUser, filterAction, filterText]);

  function exportCSV() {
    const headers = ['ID', '时间', '用户', '操作', '目标类型', '目标ID', '旧值', '新值', '原因', 'IP', 'Trace ID', '批次'];
    const rows = filtered.map(l => [
      l.id, l.timestamp, l.user_id, l.action, l.target_type, l.target_id || '',
      l.old_value || '', l.new_value || '', l.reason || '', l.ip_address || '',
      l.trace_id || '', l.batch_id || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> 审计追踪
          </h1>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            不可篡改的操作记录(SQLite 触发器禁止 UPDATE/DELETE)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-3.5 h-3.5 mr-1" /> CSV 导出
          </Button>
        </div>
      </div>

      {/* 过滤器 */}
      <Card>
        <CardContent className="p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">用户</label>
            <Input value={filterUser} onChange={e => setFilterUser(e.target.value)} placeholder="admin / 操作员..." className="h-9 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">操作类型</label>
            <Input value={filterAction} onChange={e => setFilterAction(e.target.value)} placeholder="user_create / batch_start..." className="h-9 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">批次 ID</label>
            <Input value={filterBatch} onChange={e => setFilterBatch(e.target.value)} placeholder="精确匹配 (后端过滤)" className="h-9 text-sm mt-0.5" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">全文搜索</label>
            <div className="relative mt-0.5">
              <Search className="absolute left-2 top-2.5 w-3 h-3 text-muted-foreground" />
              <Input value={filterText} onChange={e => setFilterText(e.target.value)} placeholder="目标/原因/trace_id..." className="h-9 text-sm pl-7" />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded border border-red-500/30">{error}</div>}

      {/* 统计 */}
      <div className="text-sm text-muted-foreground">
        共 <span className="text-foreground font-semibold">{filtered.length}</span> 条记录{filtered.length !== logs.length && ` (从 ${logs.length} 条中过滤)`}
      </div>

      {/* 表格 */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                <th className="px-3 py-2 text-left whitespace-nowrap">时间</th>
                <th className="px-3 py-2 text-left">用户</th>
                <th className="px-3 py-2 text-left">操作</th>
                <th className="px-3 py-2 text-left">目标</th>
                <th className="px-3 py-2 text-left">变更</th>
                <th className="px-3 py-2 text-left">原因</th>
                <th className="px-3 py-2 text-left">IP</th>
                <th className="px-3 py-2 text-left">Trace ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                  {logs.length === 0 ? '暂无审计记录' : '没有符合条件的记录'}
                </td></tr>
              )}
              {filtered.map(l => {
                const style = actionLabel(l.action);
                return (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/5 align-top">
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-muted-foreground">{l.timestamp}</td>
                    <td className="px-3 py-2 font-medium">{l.user_id}</td>
                    <td className="px-3 py-2">
                      <Badge className={`text-sm ${style.color}`}>{style.label}</Badge>
                      <div className="text-[12px] text-muted-foreground mt-0.5 font-mono">{l.action}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-muted-foreground">{l.target_type}</div>
                      {l.target_id && (
                        <div className="mt-0.5">{renderTarget(l.target_id, l.target_kind)}</div>
                      )}
                      {l.batch_id && <div className="text-sm text-blue-600">batch: {l.batch_id}</div>}
                    </td>
                    <td className="px-3 py-2 max-w-xs">
                      {l.old_value && (
                        <div className="text-red-600 line-through text-sm truncate" title={l.old_value}>{l.old_value}</div>
                      )}
                      {l.new_value && (
                        <div className="text-emerald-600 text-sm truncate" title={l.new_value}>{l.new_value}</div>
                      )}
                      {!l.old_value && !l.new_value && <span className="text-muted-foreground/50">—</span>}
                      {l.action === 'branch_evaluated' && l.details && (() => {
                        try {
                          const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details as Record<string, unknown>;
                          return (
                            <div className="text-sm text-amber-700 mt-1">
                              <span className="font-mono">{String(d.expression)}</span>
                              {' → '}
                              <span className="font-semibold">{String(d.result)}</span>
                              {d.skipped && <span className="ml-1 text-orange-500">(skipped)</span>}
                            </div>
                          );
                        } catch {
                          return null;
                        }
                      })()}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate text-muted-foreground" title={l.reason || ''}>
                      {l.reason || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm text-muted-foreground">{l.ip_address || '—'}</td>
                    <td className="px-3 py-2 font-mono text-sm text-muted-foreground" title={l.trace_id || ''}>
                      {l.trace_id ? l.trace_id.slice(0, 16) : '—'}
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
