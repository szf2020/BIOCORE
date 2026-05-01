'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Server, Pencil, FlaskConical, Power, Link2 } from 'lucide-react';
import { useAudit } from '@/hooks/useAudit';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// M2.5: 设备类型枚举 (与后端白名单保持一致)
const CATEGORY_OPTIONS = [
  { value: 'fermenter',    label: '发酵罐' },
  { value: 'bioreactor',   label: '生物反应器' },
  { value: 'centrifuge',   label: '离心机' },
  { value: 'purification', label: '纯化系统' },
  { value: 'mixer',        label: '混料/均质' },
  { value: 'other',        label: '其它' },
] as const;
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
);

interface ReactorConfig {
  reactor_id: string;
  name: string;
  description: string;
  vessel_volume_L: number;
  plc_connection_id: string | null;
  enabled: number;
  sort_order: number;
  category?: string;
  created_at: string;
  updated_at: string;
}

interface PLCConnection {
  id: string;
  name: string;
  protocol: string;
  ip: string;
  port: number;
}

interface FormData {
  reactor_id: string;
  name: string;
  description: string;
  vessel_volume_L: number;
  plc_connection_id: string;
  enabled: number;
  sort_order: number;
  category: string;
}

const EMPTY_FORM: FormData = {
  reactor_id: '', name: '', description: '',
  vessel_volume_L: 5, plc_connection_id: '',
  enabled: 1, sort_order: 0,
  category: 'fermenter',
};

export default function DeviceConfigPage() {
  const [reactors, setReactors] = useState<ReactorConfig[]>([]);
  const [plcConnections, setPlcConnections] = useState<PLCConnection[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ReactorConfig | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const audit = useAudit();

  const fetchReactors = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/api/v1/reactor-configs`);
      if (res.ok) setReactors(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchPlcConnections = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/api/v1/plc/connections`);
      if (res.ok) setPlcConnections(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchReactors(); fetchPlcConnections(); }, [fetchReactors, fetchPlcConnections]);

  function nextReactorId(): string {
    return `Reactor-${reactors.length + 1}`;
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, reactor_id: nextReactorId(), name: `发酵罐 #${reactors.length + 1}`, sort_order: reactors.length });
    setError('');
    setShowDialog(true);
  }

  function openEdit(r: ReactorConfig) {
    setEditing(r);
    setForm({
      reactor_id: r.reactor_id, name: r.name, description: r.description,
      vessel_volume_L: r.vessel_volume_L, plc_connection_id: r.plc_connection_id || '',
      enabled: r.enabled, sort_order: r.sort_order,
      category: r.category || 'fermenter',
    });
    setError('');
    setShowDialog(true);
  }

  async function doSave() {
    const method = editing ? 'PUT' : 'POST';
    const url = editing ? `${API}/api/v1/reactor-configs/${editing.reactor_id}` : `${API}/api/v1/reactor-configs`;
    try {
      const res = await apiFetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, plc_connection_id: form.plc_connection_id || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || data.msg || '保存失败'); return; }
      setShowDialog(false);
      fetchReactors();
    } catch (e) { setError((e as Error).message); }
  }

  function handleSave() {
    setError('');
    if (!form.reactor_id || !form.name) { setError('罐号和名称为必填项'); return; }
    const summary = `${form.name} / ${form.vessel_volume_L}L / PLC:${form.plc_connection_id || '未关联'}`;
    audit.confirm({
      description: editing ? `编辑设备 ${editing.reactor_id}` : `创建设备 ${form.reactor_id}`,
      action: editing ? 'reactor_update' : 'reactor_create',
      targetType: 'reactor', targetId: form.reactor_id,
      oldValue: editing ? `${editing.name} / ${editing.vessel_volume_L}L / PLC:${editing.plc_connection_id || '未关联'}` : undefined,
      newValue: summary,
      onConfirm: doSave,
    });
  }

  async function doDelete(id: string) {
    await apiFetch(`${API}/api/v1/reactor-configs/${id}`, { method: 'DELETE' });
    fetchReactors();
  }

  function handleDelete(r: ReactorConfig) {
    audit.confirm({
      description: `删除设备 ${r.reactor_id} (${r.name}) — 关联的批次历史数据不会被删除`,
      action: 'reactor_delete', targetType: 'reactor', targetId: r.reactor_id,
      oldValue: `${r.name} / ${r.vessel_volume_L}L`,
      onConfirm: () => doDelete(r.reactor_id),
    });
  }

  async function doToggle(r: ReactorConfig) {
    await apiFetch(`${API}/api/v1/reactor-configs/${r.reactor_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...r, enabled: r.enabled ? 0 : 1 }),
    });
    fetchReactors();
  }

  function handleToggle(r: ReactorConfig) {
    audit.confirm({
      description: `${r.enabled ? '禁用' : '启用'}设备 ${r.reactor_id} (${r.name})`,
      action: 'reactor_toggle_active', targetType: 'reactor', targetId: r.reactor_id,
      oldValue: r.enabled ? '启用' : '禁用',
      newValue: r.enabled ? '禁用' : '启用',
      onConfirm: () => doToggle(r),
    });
  }

  // 通过plc_connection_id查找PLC连接信息
  function findPlc(id: string | null): PLCConnection | undefined {
    return id ? plcConnections.find(c => c.id === id) : undefined;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* 标题区 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6" /> 设备配置
          </h1>
          <p className="text-muted-foreground mt-1">
            配置系统管理的发酵罐数量，并关联PLC连接（PLC连接参数在"PLC通讯配置"中管理）
          </p>
        </div>
        <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 添加罐子</Button>
      </div>

      {/* 设备概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{reactors.length}</div>
            <div className="text-xs text-muted-foreground mt-1">配置总数</div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-emerald-600">{reactors.filter(r => r.enabled).length}</div>
            <div className="text-xs text-muted-foreground mt-1">已启用</div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-gray-400">{reactors.filter(r => !r.enabled).length}</div>
            <div className="text-xs text-muted-foreground mt-1">已禁用</div>
          </CardContent>
        </Card>
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-muted-foreground">8</div>
            <div className="text-xs text-muted-foreground mt-1">单PC上限</div>
          </CardContent>
        </Card>
      </div>

      {/* 设备列表 */}
      {reactors.length === 0 ? (
        <Card className="border-white/10 bg-white/5">
          <CardContent className="p-12 text-center">
            <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-4">尚未配置任何发酵罐</p>
            <Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> 添加第一个罐子</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reactors.map(r => {
            const isExpanded = expandedId === r.reactor_id;
            const plc = findPlc(r.plc_connection_id);
            return (
              <Card key={r.reactor_id} className={`border-white/10 ${r.enabled ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'}`}>
                <CardContent className="p-0">
                  {/* 主行 */}
                  <div className="flex items-center px-4 py-3 gap-4">
                    <div className="flex items-center gap-2 w-28 flex-shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${r.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="font-mono font-bold text-lg">{r.reactor_id}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                        <span>{r.vessel_volume_L}L</span>
                        <span className="text-muted-foreground/30">|</span>
                        {plc ? (
                          <span className="flex items-center gap-1">
                            <Link2 className="w-3 h-3" />
                            {plc.name} ({plc.protocol.toUpperCase()} {plc.ip}:{plc.port})
                          </span>
                        ) : (
                          <span className="text-yellow-500">未关联PLC</span>
                        )}
                        {r.description && <><span className="text-muted-foreground/30">|</span>{r.description}</>}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {CATEGORY_LABEL[r.category || 'fermenter'] || r.category || '发酵罐'}
                    </Badge>
                    <Badge className={r.enabled ? 'bg-green-500/20 text-emerald-600' : 'bg-gray-500/20 text-gray-400'}>
                      {r.enabled ? '启用' : '禁用'}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setExpandedId(isExpanded ? null : r.reactor_id)} title="展开详情">
                        <ChevronIcon expanded={isExpanded} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(r)} title={r.enabled ? '禁用' : '启用'}>
                        <Power className={`w-3.5 h-3.5 ${r.enabled ? 'text-emerald-600' : 'text-gray-500'}`} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="编辑">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r)} title="删除">
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div><span className="text-muted-foreground">罐体容积</span><div className="font-mono mt-0.5">{r.vessel_volume_L} L</div></div>
                        <div>
                          <span className="text-muted-foreground">关联PLC</span>
                          <div className="font-mono mt-0.5">
                            {plc ? `${plc.name} (${plc.ip}:${plc.port})` : <span className="text-yellow-500">未关联</span>}
                          </div>
                        </div>
                        <div><span className="text-muted-foreground">创建时间</span><div className="font-mono mt-0.5">{r.created_at?.slice(0, 19)}</div></div>
                        <div><span className="text-muted-foreground">更新时间</span><div className="font-mono mt-0.5">{r.updated_at?.slice(0, 19)}</div></div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 添加/编辑对话框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `编辑 ${editing.reactor_id}` : '添加新罐子'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded">{error}</div>}

            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>罐号 *</Label>
                <Input value={form.reactor_id} disabled={!!editing}
                  onChange={e => setForm({...form, reactor_id: e.target.value.replace(/[^A-Za-z0-9_-]/g, '')})}
                  placeholder="Reactor-1" className="font-mono" />
                <p className="text-[10px] text-muted-foreground mt-1">仅限英文字母、数字、下划线、短横线</p>
              </div>
              <div>
                <Label>名称 *</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="5L研发罐 #1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>罐体容积 (L)</Label>
                <Input type="number" min={0.5} max={1000} step={0.5} value={form.vessel_volume_L}
                  onChange={e => setForm({...form, vessel_volume_L: parseFloat(e.target.value) || 5})} />
              </div>
              <div>
                <Label>设备类型</Label>
                <Select value={form.category} onValueChange={v => setForm({...form, category: v})}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>描述</Label>
              <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="用途说明..." />
            </div>

            {/* 关联PLC连接 */}
            <div className="pt-2 border-t border-white/10">
              <Label>关联PLC连接</Label>
              <Select value={form.plc_connection_id} onValueChange={v => setForm({...form, plc_connection_id: v === '__none__' ? '' : v})}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="-- 选择PLC连接 --" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- 不关联 --</SelectItem>
                  {plcConnections.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.protocol?.toUpperCase()} {c.ip}:{c.port})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                PLC连接在 <a href="/settings/plc-config" className="text-primary underline">PLC通讯配置</a> 中创建和管理
              </p>
              {plcConnections.length === 0 && (
                <p className="text-[10px] text-yellow-500 mt-1">暂无PLC连接，请先到 PLC通讯配置 中添加</p>
              )}
            </div>

            {/* 启用开关 */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <Switch checked={!!form.enabled} onCheckedChange={v => setForm({...form, enabled: v ? 1 : 0})} />
              <Label>启用此罐子 (禁用后不会出现在Dashboard中)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={handleSave}>{editing ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {audit.dialog}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
