// IL/RF 连锁故障配置页 — 全局默认 + 反应器覆盖 (Option A)
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Save, Trash2, Globe, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/auth';
import { useAudit } from '@/hooks/useAudit';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface InterlockConfig {
  id: string; reactor_id: string | null; category: 'IL' | 'RF'; name: string; description: string;
  check_type: string; plc_tags: string[]; condition: any; duration_sec: number;
  severity: string; hold_action: string | null; display_name: string | null;
  is_enabled: number; is_system: number; sort_order: number; updated_at: string;
  is_override?: number;  // 1 = 该反应器覆盖, 0 = 来自全局默认
}

export default function InterlockConfigPage() {
  const audit = useAudit();
  const [configs, setConfigs] = useState<InterlockConfig[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 反应器选择 — '' = 编辑全局默认
  const [reactorIds, setReactorIds] = useState<string[]>([]);
  const [selectedReactor, setSelectedReactor] = useState<string>('');

  // 编辑状态
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSeverity, setEditSeverity] = useState('critical');
  const [editHoldAction, setEditHoldAction] = useState('');
  const [editDuration, setEditDuration] = useState(0);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editCondition, setEditCondition] = useState('');
  const [editPlcTags, setEditPlcTags] = useState('');

  // 拉反应器列表
  useEffect(() => {
    apiFetch(`${API}/api/reactor-configs`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const ids = Array.isArray(rows) ? rows.filter(r => r?.enabled !== 0).map(r => r.reactor_id).filter(Boolean) : [];
        setReactorIds(ids);
      })
      .catch(() => { /* offline OK */ });
  }, []);

  // 拉连锁配置 (按 selectedReactor 维度)
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedReactor
        ? `${API}/api/v1/interlock-configs?reactor_id=${encodeURIComponent(selectedReactor)}`
        : `${API}/api/v1/interlock-configs`;
      const r = await apiFetch(url);
      if (r.ok) {
        const d = await r.json();
        setConfigs(Array.isArray(d?.data ?? d) ? (d?.data ?? d) : []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [selectedReactor]);

  useEffect(() => { load(); }, [load]);

  const current = configs.find(c => c.id === selected);

  useEffect(() => {
    if (current) {
      setEditName(current.display_name || current.name);
      setEditDesc(current.description || '');
      setEditSeverity(current.severity);
      setEditHoldAction(current.hold_action || '');
      setEditDuration(current.duration_sec);
      setEditEnabled(!!current.is_enabled);
      setEditCondition(JSON.stringify(current.condition, null, 2));
      setEditPlcTags(current.plc_tags.join(', '));
    }
  }, [selected, current?.updated_at, selectedReactor]);

  const saveConfig = () => {
    if (!current) return;
    let parsedCondition: any;
    try { parsedCondition = JSON.parse(editCondition); }
    catch { alert('条件 JSON 格式错误'); return; }

    const isOverride = !!selectedReactor;
    const targetLabel = isOverride ? `${selectedReactor} 覆盖` : '全局默认';
    audit.confirm({
      description: `修改 ${targetLabel} 连锁配置 ${current.id}: ${editName}`,
      action: 'interlock_update', targetType: 'interlock_config',
      targetId: isOverride ? `${current.id}@${selectedReactor}` : current.id,
      onConfirm: async () => {
        setSaving(true);
        const qs = selectedReactor ? `?reactor_id=${encodeURIComponent(selectedReactor)}` : '';
        const r = await apiFetch(`${API}/api/v1/interlock-configs/${current.id}${qs}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: editName !== current.name ? editName : null,
            description: editDesc,
            severity: editSeverity,
            hold_action: editHoldAction || null,
            duration_sec: editDuration,
            is_enabled: editEnabled,
            condition: parsedCondition,
            plc_tags: editPlcTags.split(',').map(s => s.trim()).filter(Boolean),
          }),
        });
        if (r.ok) await load();
        else alert('保存失败');
        setSaving(false);
      },
    });
  };

  const revertOverride = async () => {
    if (!current || !selectedReactor || !current.is_override) return;
    if (!confirm(`确认删除 ${selectedReactor} 的 ${current.id} 覆盖, 回退到全局默认?`)) return;
    const r = await apiFetch(
      `${API}/api/v1/interlock-configs/${current.id}?reactor_id=${encodeURIComponent(selectedReactor)}`,
      { method: 'DELETE' }
    );
    if (r.ok) { setSelected(''); await load(); }
    else alert('删除覆盖失败');
  };

  const ilConfigs = configs.filter(c => c.category === 'IL');
  const rfConfigs = configs.filter(c => c.category === 'RF');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {audit.dialog}

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> 连锁/故障配置
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置启动连锁 (IL) 和运行故障 (RF) 的变量、阈值、严重性和显示内容 — 全局默认或单罐覆盖
        </p>
      </div>

      {/* 反应器选择栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border border-border rounded bg-card/50 overflow-x-auto">
        <span className="text-sm text-muted-foreground shrink-0">作用对象:</span>
        <button
          onClick={() => { setSelectedReactor(''); setSelected(''); }}
          className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium shrink-0 transition-all ${
            selectedReactor === ''
              ? 'bg-primary/15 text-primary border border-primary/40'
              : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted'
          }`}>
          <Globe className="w-3 h-3" /> 全局默认
        </button>
        {reactorIds.length === 0 && (
          <span className="text-sm text-muted-foreground">无反应器</span>
        )}
        {reactorIds.map(id => (
          <button
            key={id}
            onClick={() => { setSelectedReactor(id); setSelected(''); }}
            className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-mono font-semibold shrink-0 transition-all ${
              selectedReactor === id
                ? 'bg-primary/15 text-primary border border-primary/40'
                : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted'
            }`}>
            <Wrench className="w-3 h-3" /> {id}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* 左侧列表 */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-sm font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> 启动连锁 IL ({ilConfigs.length})
            </div>
            <div className="space-y-1">
              {ilConfigs.map(c => (
                <ConfigCard key={c.id} config={c} selected={selected === c.id} onClick={() => setSelected(c.id)} />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-sm font-semibold">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> 运行故障 RF ({rfConfigs.length})
            </div>
            <div className="space-y-1">
              {rfConfigs.map(c => (
                <ConfigCard key={c.id} config={c} selected={selected === c.id} onClick={() => setSelected(c.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* 右侧编辑 */}
        <div className="md:col-span-2">
          {current ? (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-primary">{current.id}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[12px] font-semibold ${current.severity === 'critical' ? 'bg-red-500/15 text-red-600' : current.severity === 'warning' ? 'bg-yellow-500/15 text-amber-600' : 'bg-blue-500/15 text-blue-600'}`}>
                    {current.severity === 'critical' ? '严重' : current.severity === 'warning' ? '警告' : '信息'}
                  </span>
                  {!current.is_enabled && <span className="text-[12px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">已禁用</span>}
                  {selectedReactor ? (
                    current.is_override ? (
                      <span className="text-[12px] bg-primary/15 text-primary px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Wrench className="w-2.5 h-2.5" /> {selectedReactor} 覆盖
                      </span>
                    ) : (
                      <span className="text-[12px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Globe className="w-2.5 h-2.5" /> 来自全局默认 — 保存即创建 {selectedReactor} 覆盖
                      </span>
                    )
                  ) : (
                    <span className="text-[12px] bg-blue-500/15 text-blue-600 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Globe className="w-2.5 h-2.5" /> 全局默认
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm text-muted-foreground">显示名称</label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">严重性</label>
                    <select value={editSeverity} onChange={e => setEditSeverity(e.target.value)}
                      className="mt-1 w-full h-8 px-2 rounded bg-background border border-border text-sm">
                      <option value="critical">critical (自动Hold)</option>
                      <option value="warning">warning (仅报警)</option>
                      <option value="info">info (仅记录)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Hold 动作</label>
                    <Input value={editHoldAction} onChange={e => setEditHoldAction(e.target.value)} className="mt-1 h-8 text-sm" placeholder="如: 搅拌急停, 补料泵停" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">持续时间阈值 (秒, 0=立即)</label>
                    <Input type="number" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} className="mt-1 h-8 text-sm" />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">描述</label>
                  <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">PLC 变量 (逗号分隔)</label>
                  <Input value={editPlcTags} onChange={e => setEditPlcTags(e.target.value)} className="mt-1 h-8 font-mono text-sm" placeholder="TEMP_PV, TEMP_SV" />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">检测条件 (JSON)</label>
                  <textarea value={editCondition} onChange={e => setEditCondition(e.target.value)}
                    className="mt-1 w-full h-24 px-3 py-2 rounded bg-background border border-border font-mono text-sm resize-none" />
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={editEnabled} onChange={e => setEditEnabled(e.target.checked)}
                      className="rounded border-border" />
                    启用此检测项
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button size="sm" onClick={saveConfig} disabled={saving}>
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {saving ? '保存中...' : (selectedReactor && !current.is_override ? `创建 ${selectedReactor} 覆盖` : '保存修改')}
                  </Button>
                  {selectedReactor && current.is_override ? (
                    <Button size="sm" variant="outline" className="text-amber-600" onClick={revertOverride}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" />删除覆盖 (回退全局)
                    </Button>
                  ) : (!selectedReactor && current.is_system) ? (
                    <span className="text-[12px] text-muted-foreground">系统内置 · 可修改阈值但不可删除</span>
                  ) : (!selectedReactor && !current.is_system) ? (
                    <Button size="sm" variant="outline" className="text-red-600" onClick={async () => {
                      const r = await apiFetch(`${API}/api/v1/interlock-configs/${current.id}`, { method: 'DELETE' });
                      if (r.ok) { setSelected(''); await load(); }
                    }}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" />删除
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm">
                  {loading ? '加载中...' : selectedReactor
                    ? `选择左侧检测项查看 ${selectedReactor} 的配置 (覆盖优先, 否则显示全局默认)`
                    : '选择左侧检测项查看和编辑全局默认配置'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigCard({ config, selected, onClick }: { config: InterlockConfig; selected: boolean; onClick: () => void }) {
  const c = config;
  const severityColor = c.severity === 'critical' ? 'border-red-500/30' : c.severity === 'warning' ? 'border-yellow-500/30' : 'border-blue-500/30';
  return (
    <button onClick={onClick}
      className={`w-full text-left rounded border p-2 transition-all text-sm ${selected ? 'border-primary bg-primary/5' : `${severityColor} hover:border-primary/40`} ${!c.is_enabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold w-10 flex-shrink-0">{c.id}</span>
        <span className="flex-1 truncate">{c.display_name || c.name}</span>
        {c.is_override ? (
          <span className="text-[12px] bg-primary/15 text-primary px-1 rounded shrink-0">覆盖</span>
        ) : null}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.severity === 'critical' ? 'bg-red-500' : c.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`} />
      </div>
      {c.duration_sec > 0 && <span className="text-[12px] text-muted-foreground ml-12">持续 {c.duration_sec}s</span>}
    </button>
  );
}
