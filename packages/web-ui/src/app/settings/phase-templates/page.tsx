// ============================================================
// Phase 模板配置页面
// - 参数键名来自PLC已配置变量
// - 步骤支持 AND/OR/NOT 组合条件 + 自定义跳转
// - 内置Phase全部可编辑
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  Plus, Trash2, Save, Edit2, AlertCircle, RefreshCw, Blocks, Copy,
} from 'lucide-react';
import { useAudit } from '@/hooks/useAudit';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── 类型定义 ──────────────────────────────────────────────

// 单个条件
interface Condition {
  type: '>=' | '<=' | 'in_band' | 'duration' | 'accumulated' | 'delta';
  channel?: string;     // PLC tag_name
  value?: number;
  duration_s?: number;
  tolerance?: number;   // in_band 死区
}

// 组合条件
interface CompositeCondition {
  logic: 'single' | 'and' | 'or';
  not?: boolean;        // 取反
  conditions: Condition[];
}

interface StepDef {
  step_number: number;
  name: string;
  description: string;
  completion: CompositeCondition;
  next_step: number | 'next' | 'end'; // 完成后跳转: 步骤号, 'next'顺序, 'end'结束Phase
  plc_actions_on_enter?: { tag: string; action: string; value?: number }[];
  plc_actions_on_exit?: { tag: string; action: string; value?: number }[];
}

interface ParamBinding {
  plc_tag: string;        // PLC变量tag_name (如 TEMP_SV)
  label: string;          // 显示名 (如 "温度设定值")
  write_on_enter: boolean; // Phase启动时写入此值到PLC
  default_value?: number;
}

interface PhaseTemplate {
  type: string;
  label: string;
  icon: string;
  color: string;
  category: string;
  description: string;
  fixed_steps: number;
  default_params: Record<string, any>;
  param_schema: ParamBinding[];
  steps: StepDef[];
  plc_mappings: Record<string, string>;
  sort_order: number;
  is_system: number;
}

interface PLCVar { tag_name: string; description: string; eng_unit: string; direction: string; }

const CATEGORIES = ['系统操作', '温控', '过程控制', '发酵主体', '清洗灭菌', '自定义'];
const COLORS = ['gray', 'blue', 'amber', 'orange', 'red', 'green', 'teal', 'cyan', 'purple', 'sky', 'emerald', 'indigo', 'slate'];
const COND_TYPES: { value: Condition['type']; label: string }[] = [
  { value: 'duration', label: '持续时间(秒)' },
  { value: '>=', label: '>= 大于等于' },
  { value: '<=', label: '<= 小于等于' },
  { value: 'in_band', label: '进入死区' },
  { value: 'accumulated', label: '累积值' },
  { value: 'delta', label: '变化量' },
];

// ─── 主页面 ────────────────────────────────────────────────

export default function PhaseTemplatesPage() {
  const [templates, setTemplates] = useState<PhaseTemplate[]>([]);
  const [editing, setEditing] = useState<PhaseTemplate | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plcVars, setPlcVars] = useState<PLCVar[]>([]);
  const audit = useAudit();

  const load = useCallback(async () => {
    try {
      const [tResp, vResp] = await Promise.all([
        fetch(`${API}/api/phase-templates`), fetch(`${API}/api/plc/variables`),
      ]);
      setTemplates(await tResp.json());
      const vars = await vResp.json();
      setPlcVars(Array.isArray(vars) ? vars : []);
    } catch { setError('无法加载数据'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const initDefaults = () => {
    audit.confirm({
      description: '加载默认 Phase 模板 (14 种系统内置)',
      action: 'phase_template_init', targetType: 'phase_template', targetId: 'system_defaults',
      onConfirm: async () => {
        await fetch(`${API}/api/phase-templates/init-defaults`, { method: 'POST' });
        load();
      },
    });
  };

  const saveTemplate = (t: PhaseTemplate) => {
    const existing = templates.find(x => x.type === t.type);
    audit.confirm({
      description: existing ? `编辑 Phase 模板 ${t.type}` : `创建 Phase 模板 ${t.type}`,
      action: existing ? 'phase_template_update' : 'phase_template_create',
      targetType: 'phase_template', targetId: t.type,
      oldValue: existing ? `${existing.label} / ${existing.steps?.length || 0}步 / ${existing.param_schema?.length || 0}参数` : undefined,
      newValue: `${t.label} / ${t.steps?.length || 0}步 / ${t.param_schema?.length || 0}参数`,
      onConfirm: async () => {
        const method = existing ? 'PUT' : 'POST';
        const url = existing ? `${API}/api/phase-templates/${t.type}` : `${API}/api/phase-templates`;
        const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t) });
        const result = await resp.json();
        if (result.error) { setError(result.error); return; }
        setShowDialog(false);
        setEditing(null);
        load();
      },
    });
  };

  const deleteTemplate = (t: PhaseTemplate) => {
    audit.confirm({
      description: `删除 Phase 模板 ${t.type} (${t.label})`,
      action: 'phase_template_delete', targetType: 'phase_template', targetId: t.type,
      oldValue: `${t.label} / ${t.steps?.length || 0}步`,
      onConfirm: async () => {
        await fetch(`${API}/api/phase-templates/${t.type}`, { method: 'DELETE' });
        load();
      },
    });
  };

  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    items: templates.filter(t => t.category === cat),
  })).filter(g => g.items.length > 0);

  const newTemplate = (): PhaseTemplate => ({
    type: '', label: '', icon: '', color: 'gray', category: '自定义',
    description: '', fixed_steps: 0, default_params: {}, param_schema: [],
    steps: [], plc_mappings: {}, sort_order: 99, is_system: 0,
  });

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phase 模板配置</h1>
          <p className="text-muted-foreground mt-1">配置步骤序列、PLC参数绑定、跳转条件</p>
        </div>
        <div className="flex gap-2">
          {templates.length === 0 && (
            <Button variant="outline" onClick={initDefaults}><RefreshCw className="w-4 h-4 mr-1" /> 加载默认模板</Button>
          )}
          <Button onClick={() => { setEditing(newTemplate()); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-1" /> 新建Phase
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center justify-between">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>关闭</Button>
        </div>
      )}

      {grouped.map(group => (
        <div key={group.category}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">{group.category}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {group.items.map(t => (
              <Card key={t.type} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setExpandedType(expandedType === t.type ? null : t.type)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono">{t.type}</Badge>
                      {t.label}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="text-muted-foreground">{t.description}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{t.steps?.length || t.fixed_steps} 步</span>
                    <span>{t.param_schema?.length || 0} 参数绑定</span>
                  </div>
                  {expandedType === t.type && (
                    <div className="mt-3 pt-3 border-t space-y-2" onClick={e => e.stopPropagation()}>
                      {t.steps?.length > 0 && t.steps.map((s, i) => (
                        <div key={i} className="text-xs flex items-center gap-1">
                          <Badge variant="outline" className="w-5 h-5 flex items-center justify-center p-0 text-xs">{s.step_number}</Badge>
                          <span>{s.name}</span>
                          <span className="text-muted-foreground ml-auto">
                            → {s.next_step === 'end' ? '结束' : s.next_step === 'next' ? `Step${s.step_number + 1}` : `Step${s.next_step}`}
                          </span>
                        </div>
                      ))}
                      {t.param_schema?.length > 0 && (
                        <div className="text-xs">
                          <span className="font-medium">PLC参数: </span>
                          {(t.param_schema as any[]).map((p: any) => p.plc_tag || p.key).join(', ')}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditing({ ...t }); setShowDialog(true); }}>
                          <Edit2 className="w-3 h-3 mr-1" /> 编辑
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditing({ ...t, type: t.type + '_copy', label: t.label + ' (副本)', is_system: 0 });
                          setShowDialog(true);
                        }}>
                          <Copy className="w-3 h-3 mr-1" /> 复制
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => deleteTemplate(t)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {templates.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Blocks className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无Phase模板，点击"加载默认模板"初始化</p>
        </Card>
      )}

      {showDialog && editing && (
        <TemplateEditor template={editing} plcVars={plcVars}
          isNew={!templates.find(t => t.type === editing.type)}
          onSave={saveTemplate} onClose={() => { setShowDialog(false); setEditing(null); }} />
      )}

      {audit.dialog}
    </div>
  );
}

// ─── 模板编辑器 ────────────────────────────────────────────

function TemplateEditor({ template, plcVars, isNew, onSave, onClose }: {
  template: PhaseTemplate; plcVars: PLCVar[]; isNew: boolean;
  onSave: (t: PhaseTemplate) => void; onClose: () => void;
}) {
  // 确保每个step都有completion字段 (兼容旧数据)
  const DEFAULT_COMPLETION: CompositeCondition = { logic: 'single', conditions: [{ type: 'duration', duration_s: 10 }] };
  const safeSteps = (template.steps || []).map(s => ({
    ...s,
    completion: s.completion ?? DEFAULT_COMPLETION,
    next_step: s.next_step ?? 'next',
  }));
  const [form, setForm] = useState<PhaseTemplate>({ ...template, steps: safeSteps });
  const [tab, setTab] = useState<'basic' | 'steps' | 'params'>('basic');
  const up = (u: Partial<PhaseTemplate>) => setForm(p => ({ ...p, ...u }));

  // ── 步骤操作 ──
  const addStep = () => {
    const n = form.steps.length + 1;
    up({ steps: [...form.steps, {
      step_number: n, name: '', description: '',
      completion: { logic: 'single', conditions: [{ type: 'duration', duration_s: 10 }] },
      next_step: 'next',
    }], fixed_steps: n });
  };
  const delStep = (i: number) => {
    const steps = form.steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 }));
    up({ steps, fixed_steps: steps.length });
  };
  const upStep = (i: number, u: Partial<StepDef>) => {
    const steps = [...form.steps]; steps[i] = { ...steps[i], ...u }; up({ steps });
  };

  // ── 参数绑定操作 ──
  const addParam = () => up({
    param_schema: [...form.param_schema, { plc_tag: '', label: '', write_on_enter: true } as any],
  });
  const delParam = (i: number) => up({ param_schema: form.param_schema.filter((_, idx) => idx !== i) });
  const upParam = (i: number, u: Partial<ParamBinding>) => {
    const ps = [...form.param_schema] as any[]; ps[i] = { ...ps[i], ...u }; up({ param_schema: ps });
  };

  // 按方向分组PLC变量
  const readVars = plcVars.filter(v => v.direction === 'READ' || v.direction === 'READWRITE');
  const writeVars = plcVars.filter(v => v.direction === 'READWRITE');
  const allVars = plcVars;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isNew ? '新建Phase模板' : `编辑: ${form.label} (${form.type})`}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-2">
          {(['basic', 'steps', 'params'] as const).map(t => (
            <Button key={t} variant={tab === t ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t)}>
              {{ basic: '基本信息', steps: `步骤 (${form.steps.length})`, params: `PLC参数 (${form.param_schema.length})` }[t]}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-3">

          {/* ── 基本信息 ── */}
          {tab === 'basic' && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">类型标识 *</Label>
                  <Input value={form.type} disabled={!isNew} onChange={e => up({ type: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="如 custom_heat" /></div>
                <div><Label className="text-xs">显示名称 *</Label>
                  <Input value={form.label} onChange={e => up({ label: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">分类</Label>
                  <Select value={form.category} onValueChange={v => up({ category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-xs">颜色</Label>
                  <Select value={form.color} onValueChange={v => up({ color: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{COLORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-xs">排序</Label>
                  <Input type="number" value={form.sort_order} onChange={e => up({ sort_order: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div><Label className="text-xs">描述</Label>
                <Input value={form.description} onChange={e => up({ description: e.target.value })} /></div>
            </div>
          )}

          {/* ── 步骤序列 ── */}
          {tab === 'steps' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">每步可配置组合条件(AND/OR) + 自定义跳转目标</p>
              {form.steps.map((step, si) => (
                <Card key={si} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs">{step.step_number}</Badge>
                    <Input className="flex-1 h-8 text-sm font-medium" value={step.name} placeholder="步骤名称"
                      onChange={e => upStep(si, { name: e.target.value })} />
                    <div className="flex items-center gap-1">
                      <Label className="text-xs whitespace-nowrap">完成→</Label>
                      <Select value={String(step.next_step)} onValueChange={v => upStep(si, { next_step: v === 'next' ? 'next' : v === 'end' ? 'end' : parseInt(v) })}>
                        <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="next">下一步</SelectItem>
                          <SelectItem value="end">结束Phase</SelectItem>
                          {form.steps.filter((_, i) => i !== si).map(s => (
                            <SelectItem key={s.step_number} value={String(s.step_number)}>Step {s.step_number}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => delStep(si)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <Input className="h-7 text-xs" value={step.description} placeholder="步骤描述"
                    onChange={e => upStep(si, { description: e.target.value })} />

                  {/* 组合条件 */}
                  <div className="bg-muted/50 rounded p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium">完成条件</Label>
                      <Select value={step.completion.logic} onValueChange={v => upStep(si, {
                        completion: { ...step.completion, logic: v as any },
                      })}>
                        <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">单条件</SelectItem>
                          <SelectItem value="and">全部满足(AND)</SelectItem>
                          <SelectItem value="or">任一满足(OR)</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1 ml-auto">
                        <Label className="text-xs">取反(NOT)</Label>
                        <Switch checked={step.completion.not || false} onCheckedChange={v => upStep(si, {
                          completion: { ...step.completion, not: v },
                        })} />
                      </div>
                    </div>

                    {step.completion.conditions.map((cond, ci) => (
                      <ConditionRow key={ci} cond={cond} plcVars={readVars}
                        onChange={c => {
                          const conds = [...step.completion.conditions]; conds[ci] = c;
                          upStep(si, { completion: { ...step.completion, conditions: conds } });
                        }}
                        onRemove={step.completion.conditions.length > 1 ? () => {
                          const conds = step.completion.conditions.filter((_, i) => i !== ci);
                          upStep(si, { completion: { ...step.completion, conditions: conds } });
                        } : undefined}
                      />
                    ))}
                    {step.completion.logic !== 'single' && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                        const conds = [...step.completion.conditions, { type: 'duration' as const, duration_s: 10 }];
                        upStep(si, { completion: { ...step.completion, conditions: conds } });
                      }}><Plus className="w-3 h-3 mr-1" /> 添加条件</Button>
                    )}
                  </div>
                </Card>
              ))}
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="w-3 h-3 mr-1" /> 添加步骤
              </Button>
            </div>
          )}

          {/* ── PLC 参数绑定 ── */}
          {tab === 'params' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                将PLC变量绑定为Phase参数。配方编辑时用户可设置参数值，运行时写入PLC。
              </p>
              {(form.param_schema as any[]).map((param: ParamBinding, i: number) => (
                <Card key={i} className="p-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">PLC变量</Label>
                      <Select value={param.plc_tag || ''} onValueChange={v => {
                        const found = plcVars.find(pv => pv.tag_name === v);
                        upParam(i, {
                          plc_tag: v,
                          label: found ? found.description : v,
                        } as any);
                      }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择PLC变量" /></SelectTrigger>
                        <SelectContent>
                          {allVars.map(v => (
                            <SelectItem key={v.tag_name} value={v.tag_name}>
                              {v.tag_name} — {v.description} {v.eng_unit ? `(${v.eng_unit})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-40">
                      <Label className="text-xs">显示名</Label>
                      <Input className="h-8 text-xs" value={param.label}
                        onChange={e => upParam(i, { label: e.target.value } as any)} />
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">默认值</Label>
                      <Input className="h-8 text-xs" type="number" value={param.default_value ?? ''}
                        onChange={e => upParam(i, { default_value: parseFloat(e.target.value) } as any)} />
                    </div>
                    <div className="flex items-center gap-1 pb-1">
                      <Switch checked={param.write_on_enter} onCheckedChange={v => upParam(i, { write_on_enter: v } as any)} />
                      <Label className="text-xs whitespace-nowrap">启动写入</Label>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => delParam(i)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </Card>
              ))}
              <Button variant="outline" size="sm" onClick={addParam}>
                <Plus className="w-3 h-3 mr-1" /> 绑定PLC变量
              </Button>
              {allVars.length === 0 && (
                <p className="text-xs text-orange-600">⚠ 尚未配置PLC变量，请先到 PLC通讯配置 中添加变量</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={() => onSave(form)} disabled={!form.type || !form.label}>
            <Save className="w-4 h-4 mr-1" /> 保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── 条件行组件 ────────────────────────────────────────────

function ConditionRow({ cond, plcVars, onChange, onRemove }: {
  cond: Condition; plcVars: PLCVar[];
  onChange: (c: Condition) => void; onRemove?: () => void;
}) {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-32">
        <Select value={cond.type} onValueChange={v => onChange({ ...cond, type: v as any })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{COND_TYPES.map(ct => <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {cond.type !== 'duration' && (
        <div className="flex-1">
          <Select value={cond.channel || ''} onValueChange={v => onChange({ ...cond, channel: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="PLC变量" /></SelectTrigger>
            <SelectContent>
              {plcVars.map(v => <SelectItem key={v.tag_name} value={v.tag_name}>{v.tag_name} ({v.description})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {cond.type === 'duration' ? (
        <div className="w-20">
          <Input className="h-7 text-xs" type="number" value={cond.duration_s ?? ''} placeholder="秒"
            onChange={e => onChange({ ...cond, duration_s: parseInt(e.target.value) || 0 })} />
        </div>
      ) : cond.type === 'in_band' ? (
        <div className="w-20">
          <Input className="h-7 text-xs" type="number" value={cond.tolerance ?? ''} placeholder="死区"
            onChange={e => onChange({ ...cond, tolerance: parseFloat(e.target.value) || 0 })} />
        </div>
      ) : (
        <div className="w-20">
          <Input className="h-7 text-xs" type="number" value={cond.value ?? ''} placeholder="目标值"
            onChange={e => onChange({ ...cond, value: parseFloat(e.target.value) || 0 })} />
        </div>
      )}
      {onRemove && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
