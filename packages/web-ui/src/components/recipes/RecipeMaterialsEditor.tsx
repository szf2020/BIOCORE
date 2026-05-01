// ============================================================
// RecipeMaterialsEditor — Phase 级原料关联编辑器
//
// 每个 Phase 可以关联 N 个原料 (培养基 / 缓冲液 / 补料等), 每个关联包含:
//   - material_id → 指向 raw_materials 主数据
//   - qty / unit   → 用量 (可选)
//   - role         → 用途 (初始培养基 / 补料 / 碱液 / 消泡剂...)
//
// 存储: Phase.params.materials: MaterialRef[]
// ============================================================

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, FlaskConical, X } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface MaterialRef {
  material_id: string;
  name?: string;        // 缓存的名称 (显示用, 保存时按 material_id 查最新)
  role?: string;        // 用途 (如 "初始培养基")
  qty?: number;
  unit?: string;
}

interface Material {
  material_id: string;
  name: string;
  category: string;
  unit?: string;
}

const ROLE_OPTIONS = [
  { value: 'initial_media',   label: '初始培养基' },
  { value: 'feed',            label: '补料' },
  { value: 'acid',            label: '酸液 (pH 下调)' },
  { value: 'base',            label: '碱液 (pH 上调)' },
  { value: 'antifoam',        label: '消泡剂' },
  { value: 'buffer',          label: '缓冲液' },
  { value: 'inoculum',        label: '接种液' },
  { value: 'cleaning_agent',  label: '清洗液' },
  { value: 'other',           label: '其他' },
];

interface Props {
  materials: MaterialRef[];
  onChange: (next: MaterialRef[]) => void;
  disabled?: boolean;
}

export function RecipeMaterialsEditor({ materials, onChange, disabled }: Props) {
  const [library, setLibrary] = useState<Material[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  // 一次加载原料库
  useEffect(() => {
    fetch(`${API}/api/v1/raw-materials`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data ?? []);
        setLibrary(list);
      })
      .catch(() => { /* ignore */ });
  }, []);

  const addMaterial = useCallback((m: Material) => {
    onChange([
      ...materials,
      { material_id: m.material_id, name: m.name, role: 'initial_media', qty: undefined, unit: m.unit || '' },
    ]);
    setPickerOpen(false);
    setSearch('');
  }, [materials, onChange]);

  const removeAt = useCallback((idx: number) => {
    onChange(materials.filter((_, i) => i !== idx));
  }, [materials, onChange]);

  const updateAt = useCallback((idx: number, patch: Partial<MaterialRef>) => {
    onChange(materials.map((m, i) => i === idx ? { ...m, ...patch } : m));
  }, [materials, onChange]);

  const filteredLibrary = search.trim()
    ? library.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.material_id.toLowerCase().includes(search.toLowerCase()))
    : library;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <FlaskConical className="w-3 h-3" />
          原料关联 ({materials.length})
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 h-6 px-2 rounded text-[11px] border border-primary/40 text-primary hover:bg-primary/10"
          >
            <Plus className="w-3 h-3" /> 添加原料
          </button>
        )}
      </div>

      {materials.length === 0 ? (
        <div className="text-[10px] text-muted-foreground italic border border-dashed border-border rounded px-3 py-2 text-center">
          未关联原料 — 点击"添加原料"从原料库选择
        </div>
      ) : (
        <div className="space-y-1">
          {materials.map((m, i) => (
            <div key={`${m.material_id}-${i}`}
              className="flex items-center gap-1.5 bg-muted/30 border border-border/50 rounded px-2 py-1.5 text-xs">
              <span className="font-mono text-[10px] text-muted-foreground w-20 truncate flex-shrink-0" title={m.material_id}>
                {m.material_id}
              </span>
              <span className="font-medium truncate flex-1" title={m.name}>{m.name || m.material_id}</span>
              <select
                value={m.role || ''}
                disabled={disabled}
                onChange={e => updateAt(i, { role: e.target.value })}
                className="h-6 rounded bg-background border border-border text-[10px] px-1 max-w-[100px]"
              >
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={m.qty ?? ''}
                disabled={disabled}
                placeholder="用量"
                onChange={e => updateAt(i, { qty: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                className="h-6 w-16 rounded bg-background border border-border text-[10px] px-1 font-mono text-right"
              />
              <input
                type="text"
                value={m.unit ?? ''}
                disabled={disabled}
                placeholder="单位"
                onChange={e => updateAt(i, { unit: e.target.value })}
                className="h-6 w-14 rounded bg-background border border-border text-[10px] px-1"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="p-0.5 text-muted-foreground hover:text-red-600"
                  title="移除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 原料选择器对话框 */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg w-[520px] max-h-[560px] shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">从原料库选择</span>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 border-b border-border">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索名称 / ID..."
                className="w-full h-8 px-2 rounded bg-background border border-border text-xs"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredLibrary.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">
                  {library.length === 0 ? '原料库为空, 请先到"原料库"添加' : '无匹配原料'}
                </div>
              ) : (
                filteredLibrary.map(m => (
                  <button
                    key={m.material_id}
                    type="button"
                    onClick={() => addMaterial(m)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-muted/60 border border-transparent hover:border-border transition-colors"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground w-24 truncate flex-shrink-0">
                      {m.material_id}
                    </span>
                    <span className="text-xs flex-1 truncate">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">
                      {m.category}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
