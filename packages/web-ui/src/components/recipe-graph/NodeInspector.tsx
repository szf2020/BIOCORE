// NodeInspector — 右侧侧栏, 选中节点时显示参数表单 (M3.7)
'use client';

import React from 'react';
import type { Node } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Beaker, GitBranch, Play, Square, CornerDownRight } from 'lucide-react';
import { ConditionExpressionEditor } from './ConditionExpressionEditor';
import { RecipeMaterialsEditor, type MaterialRef } from '@/components/recipes/RecipeMaterialsEditor';
import { phaseLabel } from '@/lib/utils';

// 从 v1 编辑器复用的 Phase 模板类型
export interface APIPhaseTemplate {
  type: string;
  label: string;
  color: string;
  category: string;
  description: string;
  fixed_steps: number;
  default_params: Record<string, any>;
  param_schema: any[];
  steps: any[];
}

interface Props {
  node: Node | null;
  template?: APIPhaseTemplate;       // 当前 phase_type 对应的模板 (用于参数 schema)
  allTemplates?: APIPhaseTemplate[]; // 全部模板 (用于"类型"下拉)
  // B1.3: 全部画布节点 — 用于 Goto target 下拉选项 (排除自身/start)
  allNodes?: Array<{ id: string; type?: string; data?: any }>;
  onChange: (nodeId: string, patch: Record<string, any>) => void;
  onClose: () => void;
}

// 从嵌套对象里取值: "obj.key.sub" → obj['obj']['key']['sub']
function getNestedValue(obj: Record<string, any>, key: string): any {
  return key.split('.').reduce((acc, k) => acc?.[k], obj);
}

function setNestedValue(obj: Record<string, any>, key: string, value: any): void {
  const parts = key.split('.');
  const last = parts.pop()!;
  let cur = obj;
  for (const p of parts) {
    if (!(p in cur)) cur[p] = {};
    cur = cur[p];
  }
  cur[last] = value;
}

export function NodeInspector({ node, template, allTemplates, allNodes, onChange, onClose }: Props) {
  if (!node) return null;

  const data = node.data as any;
  const type = node.type;

  const updateData = (patch: Record<string, any>) => {
    onChange(node.id, patch);
  };

  // 更新单个参数 (支持嵌套 key)
  const updateParam = (key: string, value: any) => {
    const params = structuredClone(data.params || {});
    setNestedValue(params, key, value);
    updateData({ params });
  };

  // 切换 phase_type — 自动重置为新模板的默认参数
  const changePhaseType = (newType: string) => {
    const newTmpl = allTemplates?.find(t => t.type === newType);
    if (!newTmpl) {
      updateData({ phase_type: newType });
      return;
    }
    const params: Record<string, any> = { ...(newTmpl.default_params || {}) };
    (newTmpl.param_schema || []).forEach((f: any) => {
      const key = f.key || f.plc_tag;
      if (key && f.default_value !== undefined && !(key in params)) {
        params[key] = f.default_value;
      }
    });
    updateData({
      phase_type: newType,
      label: newTmpl.label,
      params,
    });
  };

  // 合并模板参数 schema 与配方实际值 (v1 编辑器同款逻辑)
  const collectParams = (): { key: string; label: string; value: any; unit?: string; type?: string }[] => {
    const schemaFields = (template?.param_schema || []) as any[];
    const paramKeys = new Set<string>();
    const all: { key: string; label: string; value: any; unit?: string; type?: string }[] = [];
    schemaFields.forEach((f: any) => {
      const key = f.key || f.plc_tag || '';
      if (!key) return;
      paramKeys.add(key);
      all.push({
        key,
        label: f.label || key,
        value: getNestedValue(data.params || {}, key) ?? f.default ?? f.default_value,
        unit: f.unit || f.eng_unit || '',
        type: f.type,
      });
    });
    Object.entries(data.params || {}).forEach(([k, v]) => {
      if (paramKeys.has(k)) return;
      if (k === 'materials') return;   // 原料单独渲染
      paramKeys.add(k);
      all.push({ key: k, label: k, value: v });
    });
    return all;
  };

  return (
    <div className="w-[340px] border-l border-border bg-card flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          {type === 'phase' && <Beaker className="w-4 h-4 text-primary" />}
          {type === 'branch' && <GitBranch className="w-4 h-4 text-amber-400" />}
          {type === 'goto' && <CornerDownRight className="w-4 h-4 text-violet-400" />}
          {type === 'start' && <Play className="w-4 h-4 text-emerald-600" />}
          {type === 'end' && <Square className="w-4 h-4 text-red-600" />}
          <span className="text-sm font-semibold">
            {type === 'phase' ? 'Phase 节点' :
             type === 'branch' ? 'IF/ELSE 节点' :
             type === 'goto' ? 'Goto 跳转节点' :
             type === 'start' ? 'Start 节点' : 'End 节点'}
          </span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {type === 'phase' && (
          <>
            {/* Phase 元信息 */}
            <div>
              <Label className="text-xs">Phase ID *</Label>
              <Input
                value={data.phase_id || ''}
                onChange={e => updateData({ phase_id: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') })}
                placeholder="PHASE_01"
                className="h-7 text-xs font-mono mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">类型 *</Label>
              {allTemplates && allTemplates.length > 0 ? (
                <select
                  value={data.phase_type || ''}
                  onChange={e => changePhaseType(e.target.value)}
                  className="h-7 w-full text-xs font-mono mt-1 rounded bg-background border border-border px-1"
                >
                  <option value="">-- 选择 Phase 类型 --</option>
                  {allTemplates.map(t => (
                    <option key={t.type} value={t.type}>
                      {phaseLabel(t.type, t.label)} ({t.fixed_steps} steps)
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={data.phase_type || ''}
                  onChange={e => updateData({ phase_type: e.target.value })}
                  placeholder="heating / fermentation / ..."
                  className="h-7 text-xs font-mono mt-1"
                />
              )}
            </div>

            <div>
              <Label className="text-xs">显示名</Label>
              <Input
                value={data.label || ''}
                onChange={e => updateData({ label: e.target.value })}
                placeholder={template?.label || '节点显示名'}
                className="h-7 text-xs mt-1"
              />
            </div>

            {/* 模板说明 */}
            {template?.description && (
              <div className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2 border border-border/40">
                {template.description}
              </div>
            )}

            {/* 步骤序列预览 */}
            {template && template.steps && template.steps.length > 0 && (
              <div className="pt-2 border-t border-border/40">
                <Label className="text-xs mb-1 block">
                  步骤序列 ({template.steps.length})
                </Label>
                <div className="space-y-1">
                  {template.steps.map((step: any, si: number) => (
                    <div key={si} className="flex items-center gap-1.5 text-[10px] bg-muted/40 rounded px-2 py-1">
                      <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                        {step.step_number || si + 1}
                      </span>
                      <span className="font-medium truncate">{step.name || `Step ${si + 1}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 参数表单 (基于模板 param_schema) */}
            {(() => {
              const params = collectParams();
              if (params.length === 0) {
                return template ? null : (
                  <div className="pt-2 border-t border-border/40 text-[10px] text-muted-foreground italic">
                    此 Phase 类型没有可编辑的参数
                  </div>
                );
              }
              return (
                <div className="pt-2 border-t border-border/40">
                  <Label className="text-xs mb-1 block">参数设置</Label>
                  <div className="space-y-2">
                    {params.map(p => (
                      <div key={p.key} className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">
                          {p.label}
                          {p.unit && <span className="ml-1">({p.unit})</span>}
                        </Label>
                        {typeof p.value === 'object' && p.value !== null ? (
                          <div className="text-[10px] font-mono bg-muted rounded px-2 py-1">
                            {JSON.stringify(p.value)}
                          </div>
                        ) : (
                          <Input
                            className="h-6 text-[11px]"
                            value={p.value ?? ''}
                            type={p.type === 'number' || typeof p.value === 'number' ? 'number' : 'text'}
                            onChange={e => {
                              const val = p.type === 'number' || typeof p.value === 'number'
                                ? (e.target.value === '' ? undefined : parseFloat(e.target.value))
                                : e.target.value;
                              updateParam(p.key, val);
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 原料关联 (与 v1 编辑器一致) */}
            <div className="pt-2 border-t border-border/40">
              <RecipeMaterialsEditor
                materials={(data.params?.materials as MaterialRef[]) || []}
                onChange={(materials) => updateParam('materials', materials)}
              />
            </div>
          </>
        )}

        {type === 'branch' && (
          <>
            <ConditionExpressionEditor
              value={data.expression || ''}
              onChange={(expression, valid) => updateData({ expression, valid })}
            />
            <div className="pt-2 border-t border-border/40">
              <Label className="text-xs">默认分支（PV 缺失回退）</Label>
              <select
                className="h-7 w-full text-xs font-mono mt-1 rounded bg-background border border-border px-1"
                value={data.default_branch ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  updateData({
                    default_branch: v === '' ? undefined : (v as 'true' | 'false'),
                  });
                }}
              >
                <option value="">不设置（PV 缺失时走 false）</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                当表达式所需的 PV 字段缺失时使用此分支
              </p>
            </div>
          </>
        )}

        {type === 'goto' && (
          <>
            <div>
              <Label className="text-xs">跳转目标节点 *</Label>
              {allNodes && allNodes.length > 0 ? (
                <select
                  className="h-7 w-full text-xs font-mono mt-1 rounded bg-background border border-border px-1"
                  value={data.target ?? ''}
                  onChange={(e) => updateData({ target: e.target.value || undefined })}
                >
                  <option value="">— 选择目标 —</option>
                  {allNodes
                    .filter(n => n.id !== node.id && n.type !== 'start')
                    .map(n => {
                      const lbl = (n.data?.label || n.data?.phase_id || n.id) as string;
                      return (
                        <option key={n.id} value={n.id}>
                          {lbl} ({n.type}) — {n.id}
                        </option>
                      );
                    })}
                </select>
              ) : (
                <Input
                  value={data.target ?? ''}
                  onChange={e => updateData({ target: e.target.value || undefined })}
                  placeholder="目标节点 id (如 n_2)"
                  className="h-7 text-xs font-mono mt-1"
                />
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Goto 节点跳到选定目标 (可用于循环回边或异常处理).
                目标若需 ≥ 2 次重访, 须在 recipe.options.maxRevisits 中设置 &gt; 1.
              </p>
            </div>
            <div className="pt-2 border-t border-border/40">
              <Label className="text-xs">显示名 (可选)</Label>
              <Input
                value={data.label || ''}
                onChange={e => updateData({ label: e.target.value })}
                placeholder="跳转回 A"
                className="h-7 text-xs mt-1"
              />
            </div>
          </>
        )}

        {(type === 'start' || type === 'end') && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {type === 'start' ? 'Start 节点是 DAG 的入口' : 'End 节点是 DAG 的出口'}, 无参数
          </div>
        )}
      </div>
    </div>
  );
}
