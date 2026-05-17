// 配方版本历史抽屉 (Sprint 3 M3.1)
// 显示某 recipe_id 的所有版本时间线 + 选 2 个版本对比 diff
'use client';

import React, { useEffect, useState } from 'react';
import { X, GitBranch, History, ArrowRight, FileText, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface VersionRow {
  recipe_id: string;
  version: string;
  status: string;
  created_at: string;
  created_by: string;
  parent_version: string | null;
  dag_schema_version: number;
  name: string;
}

interface DiffEntry {
  kind: 'E' | 'N' | 'D' | 'A';
  path: string[];
  lhs?: any;
  rhs?: any;
}

interface DiffResult {
  v1: { version: string; status: string; created_at: string };
  v2: { version: string; status: string; created_at: string };
  diff: DiffEntry[];
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-500/20 text-gray-300',
  pending_approval: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  archived: 'bg-orange-500/20 text-orange-300',
  superseded: 'bg-blue-500/20 text-blue-300',
};

const KIND_LABELS: Record<string, { label: string; color: string }> = {
  E: { label: '修改', color: 'text-amber-400' },
  N: { label: '新增', color: 'text-emerald-600' },
  D: { label: '删除', color: 'text-red-600' },
  A: { label: '数组', color: 'text-blue-600' },
};

interface Props {
  open: boolean;
  recipeId: string | null;
  onClose: () => void;
}

export function RecipeHistoryDrawer({ open, recipeId, onClose }: Props) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]); // 最多 2 个 version
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    if (!open || !recipeId) return;
    setLoading(true);
    setSelected([]);
    setDiff(null);
    apiFetch(`${API}/api/v1/recipes/${encodeURIComponent(recipeId)}/versions`)
      .then(r => r.ok ? r.json() : [])
      .then((list: any) => {
        setVersions(Array.isArray(list) ? list : (list?.data ?? []));
      })
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, recipeId]);

  const toggleSelect = (version: string) => {
    setSelected(prev => {
      if (prev.includes(version)) return prev.filter(v => v !== version);
      if (prev.length >= 2) return [prev[1], version];
      return [...prev, version];
    });
  };

  const runDiff = async () => {
    if (selected.length !== 2 || !recipeId) return;
    setDiffLoading(true);
    try {
      const url = `${API}/api/v1/recipes/${encodeURIComponent(recipeId)}/diff?v1=${selected[0]}&v2=${selected[1]}`;
      const res = await apiFetch(url);
      if (res.ok) setDiff(await res.json());
    } finally {
      setDiffLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-foreground/30 backdrop-blur-sm" />
      <div className="w-[560px] bg-card border-l border-border shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">版本历史</h2>
            {recipeId && <span className="text-sm text-muted-foreground font-mono">{recipeId}</span>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-muted-foreground py-10 text-sm">加载中...</div>
          ) : versions.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">无历史版本</div>
          ) : (
            <div className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground mb-2">选择 2 个版本对比差异</p>
              {versions.map(v => {
                const isSelected = selected.includes(v.version);
                return (
                  <div
                    key={v.version}
                    onClick={() => toggleSelect(v.version)}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold">v{v.version}</span>
                          <span className={`px-1.5 py-0.5 rounded text-sm ${STATUS_COLORS[v.status] || 'bg-gray-500/20'}`}>
                            {v.status}
                          </span>
                          {v.dag_schema_version >= 2 && (
                            <span className="px-1.5 py-0.5 rounded text-sm bg-purple-500/20 text-purple-300">
                              DAG v2
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-foreground">{v.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {new Date(v.created_at).toLocaleString('zh-CN')} · {v.created_by}
                        </div>
                        {v.parent_version && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                            <GitBranch className="w-2.5 h-2.5" />
                            源自 v{v.parent_version}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <div className="text-sm text-primary font-semibold">
                          {selected.indexOf(v.version) === 0 ? 'A' : 'B'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Diff 工具栏 */}
        {selected.length === 2 && (
          <div className="border-t border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm flex items-center gap-1.5">
                <span className="font-mono text-foreground">v{selected[0]}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono text-foreground">v{selected[1]}</span>
              </div>
              <button
                onClick={runDiff}
                disabled={diffLoading}
                className="h-7 px-3 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
              >
                {diffLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                对比
              </button>
            </div>

            {diff && (
              <div className="border border-border rounded p-2 max-h-[200px] overflow-y-auto bg-muted/20">
                {diff.diff.length === 0 ? (
                  <div className="text-center text-muted-foreground py-3 text-sm">两个版本完全相同</div>
                ) : (
                  <div className="space-y-1.5">
                    {diff.diff.map((d, i) => {
                      const k = KIND_LABELS[d.kind] || KIND_LABELS.E;
                      return (
                        <div key={i} className="text-[11px] font-mono leading-tight">
                          <span className={`${k.color} font-semibold mr-1.5`}>{k.label}</span>
                          <span className="text-muted-foreground">{d.path?.join('.') || '(root)'}</span>
                          {d.kind === 'E' && (
                            <div className="ml-4 mt-0.5 space-y-0.5">
                              <div className="text-red-600">- {JSON.stringify(d.lhs)}</div>
                              <div className="text-emerald-600">+ {JSON.stringify(d.rhs)}</div>
                            </div>
                          )}
                          {d.kind === 'N' && (
                            <div className="ml-4 mt-0.5 text-emerald-600">+ {JSON.stringify(d.rhs)}</div>
                          )}
                          {d.kind === 'D' && (
                            <div className="ml-4 mt-0.5 text-red-600">- {JSON.stringify(d.lhs)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
