// ============================================================
// /settings/alarm-config — 报警设置页面
//
// 自由配置报警:
//   - 归属 owner (反应器ID/群组/全局)
//   - 分级 severity (info/warning/critical/emergency)
//   - 内容模板 message_template (支持 {pv}/{sv}/{channel} 占位符)
//   - 关联标签 channel (PLC 通道, 如 AI-0/P02)
//   - 阈值 + 滞回
//   - 启用 + 确认要求
//
// CRUD: /api/alarm-configs
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Plus, RefreshCw, Edit2, Trash2, X, Save, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AlarmDef {
  id: number;
  code: string;
  name: string;
  owner: string | null;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  message_template: string;
  channel: string | null;
  enabled: number;
  threshold_high: number | null;
  threshold_low: number | null;
  hysteresis: number | null;
  ack_required: number;
  category: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  emergency: { label: '紧急', color: 'bg-red-700/20 text-red-700 border-red-700/40', icon: AlertTriangle },
  critical:  { label: '严重', color: 'bg-red-500/15 text-red-600 border-red-500/30', icon: AlertTriangle },
  warning:   { label: '警告', color: 'bg-yellow-500/15 text-amber-600 border-yellow-500/30', icon: AlertCircle },
  info:      { label: '提示', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30', icon: Info },
};

interface Reactor { reactor_id: string; name?: string }

const EMPTY: Partial<AlarmDef> = {
  code: '', name: '', owner: '', severity: 'warning',
  message_template: '', channel: '', enabled: 1, ack_required: 1,
  threshold_high: null, threshold_low: null, hysteresis: null,
  category: '', notes: '',
};

export default function AlarmConfigPage() {
  const [rows, setRows] = useState<AlarmDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [editing, setEditing] = useState<Partial<AlarmDef> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOwner === 'global') params.set('owner', '');
      else if (filterOwner !== 'all') params.set('owner', filterOwner);
      if (filterSeverity) params.set('severity', filterSeverity);
      const r = await apiFetch(`${API}/api/alarm-configs?${params}`);
      if (r.ok) {
        const data = await r.json();
        setRows(data.items || []);
      }
    } catch (e) { console.error('[AlarmConfig] load:', e); }
    setLoading(false);
  }, [filterOwner, filterSeverity]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch(`${API}/api/reactor-configs`).then(r => r.ok ? r.json() : []).then((data: any) => {
      const items = Array.isArray(data) ? data : (data?.items || []);
      setReactors(items.filter((x: any) => x.enabled !== 0).map((x: any) => ({ reactor_id: x.reactor_id, name: x.name })));
    }).catch(() => {});
  }, []);

  const onSave = async () => {
    if (!editing) return;
    if (!editing.code || !editing.name || !editing.message_template) {
      alert('必填: 代码 / 名称 / 内容模板');
      return;
    }
    setSaving(true);
    try {
      const body = { ...editing, owner: editing.owner || null };
      const isUpdate = !!editing.id;
      const r = await apiFetch(
        `${API}/api/alarm-configs${isUpdate ? '/' + editing.id : ''}`,
        { method: isUpdate ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (r.ok) {
        setEditing(null);
        await load();
      } else {
        const e = await r.json().catch(() => ({}));
        alert('保存失败: ' + (e?.error || r.status));
      }
    } catch (e: any) { alert('保存失败: ' + e?.message); }
    setSaving(false);
  };

  const onDelete = async (id: number) => {
    if (!confirm('确认删除此报警定义?')) return;
    const r = await apiFetch(`${API}/api/alarm-configs/${id}`, { method: 'DELETE' });
    if (r.ok) await load();
    else alert('删除失败');
  };

  const onToggleEnabled = async (row: AlarmDef) => {
    const r = await apiFetch(`${API}/api/alarm-configs/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    if (r.ok) await load();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 -my-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">报警设置</h1>
          <span className="text-xs text-muted-foreground font-mono">{rows.length} 条</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-border hover:bg-muted transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </button>
          <button onClick={() => setEditing({ ...EMPTY })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" /> 新建
          </button>
        </div>
      </div>

      <Card className="sticky top-14 z-10">
        <CardContent className="p-3">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground">归属</div>
              <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
                className="h-8 px-2 rounded bg-background border border-border text-xs">
                <option value="all">全部</option>
                <option value="global">全局</option>
                {reactors.map(r => <option key={r.reactor_id} value={r.reactor_id}>{r.reactor_id}</option>)}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <div className="text-muted-foreground">严重程度</div>
              <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
                className="h-8 px-2 rounded bg-background border border-border text-xs">
                <option value="">全部</option>
                <option value="emergency">紧急</option>
                <option value="critical">严重</option>
                <option value="warning">警告</option>
                <option value="info">提示</option>
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-12">
              {loading ? '加载中...' : '无报警定义. 点击右上"新建"添加.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">代码</th>
                    <th className="px-2 py-2 text-left font-medium">名称</th>
                    <th className="px-2 py-2 text-left font-medium">归属</th>
                    <th className="px-2 py-2 text-left font-medium">分级</th>
                    <th className="px-2 py-2 text-left font-medium">关联标签</th>
                    <th className="px-2 py-2 text-left font-medium">阈值</th>
                    <th className="px-2 py-2 text-left font-medium">内容模板</th>
                    <th className="px-2 py-2 text-left font-medium w-16">启用</th>
                    <th className="px-2 py-2 text-right font-medium w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const meta = SEVERITY_META[r.severity];
                    const Icon = meta?.icon || Info;
                    return (
                      <tr key={r.id} className={`border-b border-border/40 hover:bg-muted/20 ${!r.enabled ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1.5 font-mono">{r.code}</td>
                        <td className="px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.owner || '全局'}</td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold border ${meta?.color}`}>
                            <Icon className="w-3 h-3" />{meta?.label || r.severity}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.channel || '—'}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {r.threshold_low != null ? r.threshold_low : '—'} / {r.threshold_high != null ? r.threshold_high : '—'}
                          {r.hysteresis != null && <> · ±{r.hysteresis}</>}
                        </td>
                        <td className="px-2 py-1.5 max-w-[280px] truncate" title={r.message_template}>{r.message_template}</td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => onToggleEnabled(r)}
                            className={`relative w-9 h-5 rounded-full transition-colors ${r.enabled ? 'bg-primary' : 'bg-muted'}`}>
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${r.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button onClick={() => setEditing(r)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground" title="编辑">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => onDelete(r.id)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-red-600" title="删除">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-card border border-border rounded-lg w-[640px] max-h-[90vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">{editing.id ? '编辑报警定义' : '新建报警定义'}</span>
              </div>
              <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-accent" title="关闭">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">代码 (唯一) *</div>
                  <input value={editing.code || ''} onChange={e => setEditing({ ...editing, code: e.target.value })}
                    placeholder="TEMP_HIGH" className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">名称 *</div>
                  <input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })}
                    placeholder="温度超限" className="w-full h-8 px-2 rounded bg-background border border-border text-xs" />
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">归属</div>
                  <select value={editing.owner || ''} onChange={e => setEditing({ ...editing, owner: e.target.value })}
                    className="w-full h-8 px-2 rounded bg-background border border-border text-xs">
                    <option value="">全局 (所有罐子)</option>
                    {reactors.map(r => <option key={r.reactor_id} value={r.reactor_id}>{r.reactor_id} {r.name || ''}</option>)}
                  </select>
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">严重程度 *</div>
                  <select value={editing.severity || 'warning'} onChange={e => setEditing({ ...editing, severity: e.target.value as any })}
                    className="w-full h-8 px-2 rounded bg-background border border-border text-xs">
                    <option value="emergency">紧急</option>
                    <option value="critical">严重</option>
                    <option value="warning">警告</option>
                    <option value="info">提示</option>
                  </select>
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">关联标签 (PLC 通道)</div>
                  <input value={editing.channel || ''} onChange={e => setEditing({ ...editing, channel: e.target.value })}
                    placeholder="AI-0 / P02 / V-01" className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">分类</div>
                  <input value={editing.category || ''} onChange={e => setEditing({ ...editing, category: e.target.value })}
                    placeholder="温度 / 压力 / 泵..." className="w-full h-8 px-2 rounded bg-background border border-border text-xs" />
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">下限阈值</div>
                  <input type="number" step="any" value={editing.threshold_low ?? ''}
                    onChange={e => setEditing({ ...editing, threshold_low: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">上限阈值</div>
                  <input type="number" step="any" value={editing.threshold_high ?? ''}
                    onChange={e => setEditing({ ...editing, threshold_high: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
                </label>
                <label className="text-xs space-y-1">
                  <div className="text-muted-foreground">滞回</div>
                  <input type="number" step="any" value={editing.hysteresis ?? ''}
                    onChange={e => setEditing({ ...editing, hysteresis: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    className="w-full h-8 px-2 rounded bg-background border border-border text-xs font-mono" />
                </label>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!editing.enabled}
                      onChange={e => setEditing({ ...editing, enabled: e.target.checked ? 1 : 0 })} />
                    启用
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={!!editing.ack_required}
                      onChange={e => setEditing({ ...editing, ack_required: e.target.checked ? 1 : 0 })} />
                    需要确认
                  </label>
                </div>
              </div>
              <label className="text-xs space-y-1 block">
                <div className="text-muted-foreground">内容模板 * (占位符: {'{pv}'} / {'{sv}'} / {'{channel}'})</div>
                <textarea value={editing.message_template || ''} onChange={e => setEditing({ ...editing, message_template: e.target.value })}
                  rows={2} placeholder="温度超限: 实际 {pv}°C 超过上限 {sv}°C"
                  className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs" />
              </label>
              <label className="text-xs space-y-1 block">
                <div className="text-muted-foreground">备注</div>
                <textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })}
                  rows={2} className="w-full px-2 py-1.5 rounded bg-background border border-border text-xs" />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded text-xs border border-border hover:bg-muted">取消</button>
              <button onClick={onSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
