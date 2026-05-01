// 原料库详情/编辑对话框 (M2.6)
// 三栏 tabs: 基本 / 物性 / 安全+MSDS
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, FileCheck2, FileWarning, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { PhysicalPropertiesEditor, type PhysicalProperties } from './PhysicalPropertiesEditor';
import { ViscosityCurveChart } from './ViscosityCurveChart';

export const CATEGORY_OPTIONS = [
  { value: 'media',     label: '培养基' },
  { value: 'buffer',    label: '缓冲液' },
  { value: 'reagent',   label: '试剂' },
  { value: 'substrate', label: '底物' },
  { value: 'additive',  label: '添加剂' },
  { value: 'other',     label: '其他' },
] as const;

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
);

export interface RawMaterial {
  material_id: string;
  name: string;
  category: string;
  supplier?: string | null;
  catalog_no?: string | null;
  unit?: string | null;
  cost_per_unit?: number | null;
  storage?: string | null;
  physical_properties?: PhysicalProperties | null;
  msds_filename?: string | null;
  msds_uploaded_at?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material: RawMaterial | null; // null = new
  apiBase: string;
  onSaved: () => void;
  audit: any; // ReturnType<typeof useAudit>
}

interface FormState {
  name: string;
  category: string;
  supplier: string;
  catalog_no: string;
  unit: string;
  cost_per_unit: string; // stored as string for input
  storage: string;
  notes: string;
  physical_properties: PhysicalProperties;
}

const EMPTY_FORM: FormState = {
  name: '',
  category: 'media',
  supplier: '',
  catalog_no: '',
  unit: 'kg',
  cost_per_unit: '',
  storage: '',
  notes: '',
  physical_properties: {},
};

export function RawMaterialDialog({ open, onOpenChange, material, apiBase, onSaved, audit }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [currentMsds, setCurrentMsds] = useState<{ filename: string; uploadedAt?: string } | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null); // for new materials set after create
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 切换到新原料或编辑模式时重置 form
  useEffect(() => {
    if (!open) return;
    if (material) {
      setForm({
        name: material.name,
        category: material.category,
        supplier: material.supplier || '',
        catalog_no: material.catalog_no || '',
        unit: material.unit || '',
        cost_per_unit: material.cost_per_unit != null ? String(material.cost_per_unit) : '',
        storage: material.storage || '',
        notes: material.notes || '',
        physical_properties: material.physical_properties || {},
      });
      setMaterialId(material.material_id);
      setCurrentMsds(material.msds_filename
        ? { filename: material.msds_filename, uploadedAt: material.msds_uploaded_at || undefined }
        : null);
    } else {
      setForm(EMPTY_FORM);
      setMaterialId(null);
      setCurrentMsds(null);
    }
    setError('');
  }, [open, material]);

  const doSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name,
        category: form.category,
        supplier: form.supplier || undefined,
        catalog_no: form.catalog_no || undefined,
        unit: form.unit || undefined,
        cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : undefined,
        storage: form.storage || undefined,
        notes: form.notes || undefined,
        physical_properties: form.physical_properties,
      };
      const url = materialId
        ? `${apiBase}/api/v1/raw-materials/${materialId}`
        : `${apiBase}/api/v1/raw-materials`;
      const method = materialId ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || data?.msg || '保存失败');
        return;
      }
      // 新建时拿到 material_id, 允许继续上传 MSDS
      if (!materialId && data?.material_id) {
        setMaterialId(data.material_id);
      }
      onSaved();
      if (materialId) {
        // 编辑模式保存完关闭
        onOpenChange(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) { setError('名称不能为空'); return; }
    const summary = `${form.name} / ${CATEGORY_LABEL[form.category]} / ${form.supplier || '-'} / ¥${form.cost_per_unit || '0'}`;
    audit.confirm({
      description: materialId ? `编辑原料 ${materialId}` : `创建原料 ${form.name}`,
      action: materialId ? 'raw_material_update' : 'raw_material_create',
      targetType: 'raw_material',
      targetId: materialId || 'new',
      newValue: summary,
      onConfirm: doSave,
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !materialId) return;
    if (file.type !== 'application/pdf') {
      setError('只支持 PDF 文件');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('文件超过 20MB');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(`${apiBase}/api/v1/raw-materials/${materialId}/msds`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || '上传失败');
        return;
      }
      setCurrentMsds({ filename: data.filename, uploadedAt: new Date().toISOString() });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async () => {
    if (!materialId || !currentMsds) return;
    try {
      const res = await apiFetch(`${apiBase}/api/v1/raw-materials/${materialId}/msds`);
      if (!res.ok) { setError('下载失败'); return; }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = currentMsds.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {materialId ? (
              <>
                编辑原料
                <Badge variant="outline" className="font-mono text-[10px]">{materialId}</Badge>
              </>
            ) : '添加新原料'}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded border border-red-500/30">
            {error}
          </div>
        )}

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="basic">基本信息</TabsTrigger>
            <TabsTrigger value="physical">物性参数</TabsTrigger>
            <TabsTrigger value="safety">安全 / MSDS</TabsTrigger>
          </TabsList>

          {/* ─── Tab 1: 基本信息 ─── */}
          <TabsContent value="basic" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">名称 *</Label>
                <Input value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="例如: 酵母粉"
                  className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">类别 *</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">供应商</Label>
                <Input value={form.supplier}
                  onChange={e => setForm({ ...form, supplier: e.target.value })}
                  placeholder="Sigma / Merck / 国产..."
                  className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">目录号</Label>
                <Input value={form.catalog_no}
                  onChange={e => setForm({ ...form, catalog_no: e.target.value })}
                  placeholder="Y1625"
                  className="h-9 text-sm mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">单位</Label>
                <Input value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  placeholder="kg / L / g"
                  className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">单价 (¥)</Label>
                <Input type="number" step="0.01" value={form.cost_per_unit}
                  onChange={e => setForm({ ...form, cost_per_unit: e.target.value })}
                  className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">存储条件</Label>
                <Input value={form.storage}
                  onChange={e => setForm({ ...form, storage: e.target.value })}
                  placeholder="4°C / -20°C / RT"
                  className="h-9 text-sm mt-1" />
              </div>
            </div>

            <div>
              <Label className="text-xs">备注</Label>
              <Input value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="使用场景 / 注意事项..."
                className="h-9 text-sm mt-1" />
            </div>
          </TabsContent>

          {/* ─── Tab 2: 物性参数 ─── */}
          <TabsContent value="physical" className="pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <PhysicalPropertiesEditor
                  value={form.physical_properties}
                  onChange={pp => setForm({ ...form, physical_properties: pp })}
                />
              </div>
              <div className="border-l border-border/50 pl-4">
                <Label className="text-xs mb-2 block">粘度曲线预览</Label>
                <ViscosityCurveChart
                  data={form.physical_properties.viscosity_curve || []}
                  height={280}
                />
              </div>
            </div>
          </TabsContent>

          {/* ─── Tab 3: 安全 / MSDS ─── */}
          <TabsContent value="safety" className="pt-3 space-y-4">
            {!materialId ? (
              <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded">
                请先保存原料基本信息, 保存后即可上传 MSDS 文件
              </div>
            ) : (
              <>
                <div className="p-4 border rounded bg-muted/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                        {currentMsds ? (
                          <>
                            <FileCheck2 className="w-4 h-4 text-emerald-600" />
                            当前 MSDS 文件
                          </>
                        ) : (
                          <>
                            <FileWarning className="w-4 h-4 text-muted-foreground" />
                            尚未上传 MSDS
                          </>
                        )}
                      </h4>
                      {currentMsds && (
                        <>
                          <p className="text-xs font-mono text-muted-foreground break-all">
                            {currentMsds.filename}
                          </p>
                          {currentMsds.uploadedAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              上传于 {new Date(currentMsds.uploadedAt).toLocaleString('zh-CN')}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    {currentMsds && (
                      <Button size="sm" variant="outline" onClick={handleDownload}>
                        <Download className="w-3.5 h-3.5 mr-1" />下载
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">
                    {currentMsds ? '替换 MSDS 文件' : '上传 MSDS 文件'} (PDF, 最大 20MB)
                  </Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handleUpload}
                      className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
                      disabled={uploading}
                    />
                    {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    系统会自动校验 PDF 格式 (magic bytes) 并重命名为 {`{material_id}_{timestamp}.pdf`}
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : materialId ? '保存修改' : '创建原料'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
