// 原料库列表页 — Sprint 2 M2.6 (原料/试剂/缓冲液主数据)
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, FlaskConical, Pencil, FileCheck2, FileWarning, Search } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useAudit } from '@/hooks/useAudit';
import { RawMaterialDialog, type RawMaterial, CATEGORY_OPTIONS, CATEGORY_LABEL } from '@/components/raw-materials/RawMaterialDialog';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RawMaterialsPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [catFilter, setCatFilter] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const audit = useAudit();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const qs = catFilter ? `?category=${catFilter}` : '';
      const res = await apiFetch(`${API}/api/v1/raw-materials${qs}`);
      if (res.ok) {
        const list = await res.json();
        setMaterials(Array.isArray(list) ? list : (list?.data ?? []));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [catFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const onAdd = () => { setEditing(null); setDialogOpen(true); };
  const onEdit = (m: RawMaterial) => { setEditing(m); setDialogOpen(true); };

  const onDelete = (m: RawMaterial) => {
    audit.confirm({
      description: `删除原料 ${m.material_id} (${m.name}) — 软删除, 配方历史引用不受影响`,
      action: 'raw_material_delete',
      targetType: 'raw_material',
      targetId: m.material_id,
      oldValue: `${m.name} / ${CATEGORY_LABEL[m.category] || m.category}`,
      onConfirm: async () => {
        const res = await apiFetch(`${API}/api/v1/raw-materials/${m.material_id}`, { method: 'DELETE' });
        if (res.ok) fetchAll();
      },
    });
  };

  const filteredMaterials = search.trim()
    ? materials.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.material_id.toLowerCase().includes(search.toLowerCase()) ||
        (m.supplier || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.catalog_no || '').toLowerCase().includes(search.toLowerCase())
      )
    : materials;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {audit.dialog}

      {/* 标题 + 添加按钮 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="w-6 h-6" /> 原料库
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            原料 / 试剂 / 缓冲液主数据管理 · 含物性曲线 · 支持 MSDS PDF 上传
          </p>
        </div>
        <Button onClick={onAdd}><Plus className="w-4 h-4 mr-1" />添加原料</Button>
      </div>

      {/* 过滤工具栏 */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索名称 / ID / 供应商 / 目录号..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Button size="sm" variant={catFilter === '' ? 'default' : 'outline'} onClick={() => setCatFilter('')}>全部</Button>
            {CATEGORY_OPTIONS.map(o => (
              <Button key={o.value} size="sm"
                variant={catFilter === o.value ? 'default' : 'outline'}
                onClick={() => setCatFilter(o.value)}>
                {o.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      {loading ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">加载中...</Card>
      ) : filteredMaterials.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm mb-3">{catFilter || search ? '无匹配原料' : '尚未添加任何原料'}</p>
          <Button size="sm" onClick={onAdd}><Plus className="w-4 h-4 mr-1" />添加第一个原料</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMaterials.map(m => (
            <Card key={m.material_id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{m.material_id}</Badge>
                      <Badge className="text-[10px] shrink-0">{CATEGORY_LABEL[m.category] || m.category}</Badge>
                    </div>
                    <h3 className="text-base font-semibold truncate" title={m.name}>{m.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.supplier || '-'} {m.catalog_no ? ` · ${m.catalog_no}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-right shrink-0">
                    {m.cost_per_unit != null && (
                      <span className="font-mono text-sm">¥{m.cost_per_unit}</span>
                    )}
                    {m.unit && <span className="text-[10px] text-muted-foreground">/ {m.unit}</span>}
                  </div>
                </div>

                {/* MSDS 状态 + 存储条件 */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                  {m.msds_filename ? (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <FileCheck2 className="w-3.5 h-3.5" /> MSDS 已上传
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <FileWarning className="w-3.5 h-3.5" /> 无 MSDS
                    </span>
                  )}
                  {m.storage && <span className="text-muted-foreground">{m.storage}</span>}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center justify-end gap-1 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(m)} title="编辑/查看详情">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(m)} title="删除">
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 对话框 */}
      <RawMaterialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        material={editing}
        apiBase={API}
        onSaved={() => { fetchAll(); }}
        audit={audit}
      />
    </div>
  );
}
