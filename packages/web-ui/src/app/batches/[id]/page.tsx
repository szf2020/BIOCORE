'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileText, Download, Upload, ChevronRight, ChevronDown, FlaskConical, Brain, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import type { RecipeDAG } from '@/types';
import { useAudit } from '@/hooks/useAudit';
import { SampleImportDialog } from '@/components/SampleImportDialog';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BatchDetail {
  id: string; batch_id: string; recipe_name?: string; operator?: string;
  state: string; started_at?: string; ended_at?: string; outcome?: string;
  summary_text?: string;
  // Optional DAG fields (present when server persists recipe_dag, forward-compat)
  recipe_dag?: RecipeDAG;
  recipe?: { dag?: RecipeDAG; phases?: Array<{ phase_id?: string; type?: string }> };
  // phase_statuses: array (realtime WS shape) or object keyed by node_id
  phase_statuses?: Array<{ state?: string; phase_index?: number }> | Record<string, { state?: string; phase_index?: number }>;
}
interface Phase { id: string; phase_name: string; phase_index: number; started_at?: string; ended_at?: string; status?: string }
interface Step { id: string; step_number: number; phase_id: string; step_type?: string; description?: string; status?: string; started_at?: string }
interface Transition { id: string; from_state: string; to_state: string; triggered_at: string; trigger_reason?: string }
interface Sample {
  id: string;
  sample_time: string;
  sampled_by?: string;
  od600?: number;
  dcw_g_L?: number;
  glucose_g_L?: number;
  acetate_g_L?: number;
  product_titer?: number;
  product_unit?: string;
  // M2.4 新增字段
  lactate_g_L?: number;
  biomass_g_L?: number;
  cell_viability_pct?: number;
  ethanol_g_L?: number;
  notes?: string;
}

const STATE_COLORS: Record<string, string> = {
  running: 'bg-green-100 text-green-800', completed: 'bg-blue-100 text-blue-800',
  aborted: 'bg-red-100 text-red-800', held: 'bg-orange-100 text-orange-800', idle: 'bg-gray-100 text-gray-800',
};

// 新样本 form 默认值
const EMPTY_SAMPLE = {
  sampled_by: '',
  od600: '',
  dcw_g_L: '',
  glucose_g_L: '',
  acetate_g_L: '',
  product_titer: '',
  // M2.4 高级字段
  lactate_g_L: '',
  biomass_g_L: '',
  cell_viability_pct: '',
  ethanol_g_L: '',
  notes: '',
};

export default function BatchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const audit = useAudit();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false);
  const [newSample, setNewSample] = useState(EMPTY_SAMPLE);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // ── DAG-derived phase list ─────────────────────────────────────────────────

  /** Resolve a phase status string from batch.phase_statuses, by node_id or index. */
  const lookupStatus = useCallback((
    b: BatchDetail | null,
    nodeId: string | undefined,
    idx: number,
  ): string => {
    if (!b?.phase_statuses) return 'pending';
    const ps = b.phase_statuses;
    // Array shape: [{ state, phase_index }, ...]
    if (Array.isArray(ps)) return ps[idx]?.state ?? 'pending';
    // Object shape: keyed by node_id or by phase_index string
    if (nodeId && ps[nodeId]) return ps[nodeId].state ?? 'pending';
    const byIndex = Object.values(ps).find((p) => p?.phase_index === idx);
    return byIndex?.state ?? 'pending';
  }, []);

  /**
   * Derive a flat list of phases from the DAG when available, otherwise fall
   * back to the linear `phases` array fetched from /batches/:id/phases.
   */
  const allPhases = useMemo(() => {
    const dag = (batch?.recipe_dag ?? batch?.recipe?.dag) as RecipeDAG | undefined;
    if (dag?.nodes) {
      return dag.nodes
        .filter((n) => n.type === 'phase')
        .map((n, idx) => {
          const pn = n as import('@/types').DAGPhaseNode;
          return {
            node_id: pn.id,
            phase_id: pn.phase_id,
            phase_type: pn.phase_type as string,
            status: lookupStatus(batch, pn.id, idx),
          };
        });
    }
    // Legacy fallback: linear phases from /batches/:id/phases endpoint
    return phases
      .slice()
      .sort((a, b) => a.phase_index - b.phase_index)
      .map((p, idx) => ({
        node_id: `n_${p.phase_index}`,
        phase_id: p.phase_name ?? `phase_${p.phase_index}`,
        phase_type: '-',
        status: lookupStatus(batch, undefined, idx),
      }));
  }, [batch, phases, lookupStatus]);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      apiFetch(`${API}/api/v1/batches/${id}`).then(r => r.ok ? r.json() : null),
      apiFetch(`${API}/api/v1/batches/${id}/phases`).then(r => r.ok ? r.json() : []),
      apiFetch(`${API}/api/v1/batches/${id}/steps`).then(r => r.ok ? r.json() : []),
      apiFetch(`${API}/api/v1/batches/${id}/transitions`).then(r => r.ok ? r.json() : []),
      apiFetch(`${API}/api/v1/batches/${id}/samples`).then(r => r.ok ? r.json() : []),
    ]).then(([bRes, pRes, sRes, tRes, smRes]) => {
      const unwrap = (r: PromiseSettledResult<unknown>) => r.status === 'fulfilled' ? r.value : null;
      const b = unwrap(bRes) as BatchDetail | null;
      if (!b) { setError('批次不存在'); return; }
      setBatch(b);
      const pData = unwrap(pRes); setPhases(Array.isArray(pData) ? pData : (pData as { data?: Phase[] })?.data ?? []);
      const sData = unwrap(sRes); setSteps(Array.isArray(sData) ? sData : (sData as { data?: Step[] })?.data ?? []);
      const tData = unwrap(tRes); setTransitions(Array.isArray(tData) ? tData : (tData as { data?: Transition[] })?.data ?? []);
      const smData = unwrap(smRes); setSamples(Array.isArray(smData) ? smData : (smData as { data?: Sample[] })?.data ?? []);
    }).catch(() => setError('加载失败')).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(phaseId) ? next.delete(phaseId) : next.add(phaseId);
      return next;
    });
  };

  // 转化表单字符串为 float|null
  const num = (s: string): number | null => {
    if (!s || !s.trim()) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  const doSubmitSample = useCallback(async () => {
    setSubmitting(true);
    try {
      const body = {
        sample_time: new Date().toISOString(),
        sampled_by: newSample.sampled_by || 'unknown',
        od600: num(newSample.od600),
        dcw_g_L: num(newSample.dcw_g_L),
        glucose_g_L: num(newSample.glucose_g_L),
        acetate_g_L: num(newSample.acetate_g_L),
        product_titer: num(newSample.product_titer),
        lactate_g_L: num(newSample.lactate_g_L),
        biomass_g_L: num(newSample.biomass_g_L),
        cell_viability_pct: num(newSample.cell_viability_pct),
        ethanol_g_L: num(newSample.ethanol_g_L),
        notes: newSample.notes || undefined,
      };
      const r = await apiFetch(`${API}/api/v1/batches/${id}/samples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('保存失败');
      // 重新拉列表 (简单粗暴, 避免前端维护 id)
      const smResp = await apiFetch(`${API}/api/v1/batches/${id}/samples`).then(x => x.ok ? x.json() : []);
      setSamples(Array.isArray(smResp) ? smResp : smResp?.data ?? []);
      setSampleDialogOpen(false);
      setNewSample(EMPTY_SAMPLE);
      setShowAdvanced(false);
    } catch (e) {
      alert(`保存失败: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }, [id, newSample]);

  // 审计包装 — 所有字段值合并成一个摘要字符串
  const submitSample = () => {
    const summary = Object.entries(newSample)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    audit.confirm({
      description: `为批次 ${batch?.batch_id ?? id} 添加离线取样`,
      action: 'offline_sample_create',
      targetType: 'offline_sample',
      targetId: id,
      batchId: batch?.batch_id ?? id,
      newValue: summary || '(空样本)',
      onConfirm: doSubmitSample,
    });
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载批次详情...</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!batch) return <div className="p-8 text-center text-muted-foreground">批次未找到</div>;

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      {audit.dialog}
      {/* Basic info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="w-4 h-4" />批次 {batch.batch_id ?? id}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.open(`${API}/api/v1/batches/${id}/export/xlsx`, '_blank')}><Download className="w-3.5 h-3.5 mr-1" />导出Excel</Button>
              <Button size="sm" variant="outline" onClick={() => alert('CSV导出功能开发中')}><FileText className="w-3.5 h-3.5 mr-1" />导出CSV</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">配方: </span>{batch.recipe_name ?? '-'}</div>
            <div><span className="text-muted-foreground">操作员: </span>{batch.operator ?? '-'}</div>
            <div><span className="text-muted-foreground">状态: </span><Badge className={STATE_COLORS[batch.state] ?? 'bg-gray-100'}>{batch.state}</Badge></div>
            <div><span className="text-muted-foreground">结果: </span>{batch.outcome ?? '-'}</div>
            <div><span className="text-muted-foreground">开始: </span>{batch.started_at ? new Date(batch.started_at).toLocaleString('zh-CN') : '-'}</div>
            <div><span className="text-muted-foreground">结束: </span>{batch.ended_at ? new Date(batch.ended_at).toLocaleString('zh-CN') : '-'}</div>
          </div>
        </CardContent>
      </Card>

      {/* AI Summary */}
      {batch.summary_text && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" />AI分析摘要</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{batch.summary_text}</p></CardContent>
        </Card>
      )}

      {/* Phase/Step tree — derived from DAG nodes (or linear fallback) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">阶段/步骤执行日志</CardTitle></CardHeader>
        <CardContent>
          {allPhases.length === 0 ? <p className="text-sm text-muted-foreground">暂无阶段数据</p> : (
            <ul className="space-y-1">
              {allPhases.map((p, listIdx) => {
                // Match phase log entry for step expansion (by phase_index position)
                const phaseLog = phases[listIdx];
                const phaseSteps = phaseLog ? steps.filter(s => s.phase_id === phaseLog.id) : [];
                const expandKey = p.node_id;
                const expanded = expandedPhases.has(expandKey);
                return (
                  <li key={p.node_id}>
                    <button
                      onClick={() => togglePhase(expandKey)}
                      className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-muted text-sm"
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <code className="text-xs text-gray-500 font-mono">{p.node_id}</code>
                      <span className="font-medium">{p.phase_id}</span>
                      <span className="text-xs text-gray-500">{p.phase_type}</span>
                      <Badge variant="outline" className="ml-auto text-xs">{p.status}</Badge>
                    </button>
                    {expanded && phaseSteps.length > 0 && (
                      <div className="ml-6 border-l pl-3 space-y-1 mb-2">
                        {phaseSteps.sort((a, b) => a.step_number - b.step_number).map(step => (
                          <div key={step.id} className="flex items-center gap-2 text-xs py-1 text-muted-foreground">
                            <span className="font-mono">Step {step.step_number}</span>
                            <span>{step.description ?? step.step_type ?? '-'}</span>
                            <Badge variant="outline" className="ml-auto text-xs">{step.status ?? '-'}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {expanded && phaseSteps.length === 0 && <p className="ml-8 text-xs text-muted-foreground py-1">无步骤</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* State transitions */}
      {transitions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" />状态转换时间线</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {transitions.map((t, i) => (
                <div key={t.id ?? i} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-muted-foreground w-40">{new Date(t.triggered_at).toLocaleString('zh-CN')}</span>
                  <Badge variant="outline">{t.from_state}</Badge>
                  <span className="text-muted-foreground">&rarr;</span>
                  <Badge>{t.to_state}</Badge>
                  {t.trigger_reason && <span className="text-xs text-muted-foreground ml-2">{t.trigger_reason}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offline samples */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">离线取样数据</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="w-3.5 h-3.5 mr-1" />导入 CSV</Button>
              <Button size="sm" onClick={() => setSampleDialogOpen(true)}>添加取样</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {samples.length === 0 ? <p className="text-sm text-muted-foreground">暂无取样数据</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>取样时间</TableHead>
                    <TableHead>取样人</TableHead>
                    <TableHead>OD600</TableHead>
                    <TableHead>干重 DCW (g/L)</TableHead>
                    <TableHead>湿重 Biomass (g/L)</TableHead>
                    <TableHead>活性 (%)</TableHead>
                    <TableHead>葡萄糖 (g/L)</TableHead>
                    <TableHead>乳酸 (g/L)</TableHead>
                    <TableHead>乙酸 (g/L)</TableHead>
                    <TableHead>乙醇 (g/L)</TableHead>
                    <TableHead>产物滴度</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {samples.map((s, i) => (
                    <TableRow key={s.id ?? i}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(s.sample_time).toLocaleString('zh-CN')}</TableCell>
                      <TableCell className="text-xs">{s.sampled_by ?? '-'}</TableCell>
                      <TableCell>{s.od600 ?? '-'}</TableCell>
                      <TableCell>{s.dcw_g_L ?? '-'}</TableCell>
                      <TableCell>{s.biomass_g_L ?? '-'}</TableCell>
                      <TableCell>{s.cell_viability_pct ?? '-'}</TableCell>
                      <TableCell>{s.glucose_g_L ?? '-'}</TableCell>
                      <TableCell>{s.lactate_g_L ?? '-'}</TableCell>
                      <TableCell>{s.acetate_g_L ?? '-'}</TableCell>
                      <TableCell>{s.ethanol_g_L ?? '-'}</TableCell>
                      <TableCell>{s.product_titer != null ? `${s.product_titer}${s.product_unit ? ' ' + s.product_unit : ''}` : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add sample dialog */}
      <Dialog open={sampleDialogOpen} onOpenChange={o => { setSampleDialogOpen(o); if (!o) { setNewSample(EMPTY_SAMPLE); setShowAdvanced(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>添加离线取样</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            {/* 基本字段 */}
            <div className="grid grid-cols-3 items-center gap-2">
              <Label className="text-right">取样人</Label>
              <Input className="col-span-2" placeholder="用户名"
                value={newSample.sampled_by}
                onChange={e => setNewSample(prev => ({ ...prev, sampled_by: e.target.value }))} />
            </div>
            {([
              ['od600', 'OD600'],
              ['dcw_g_L', '干重 DCW (g/L)'],
              ['glucose_g_L', '葡萄糖 (g/L)'],
              ['acetate_g_L', '乙酸 (g/L)'],
              ['product_titer', '产物滴度 (g/L)'],
            ] as const).map(([key, label]) => (
              <div key={key} className="grid grid-cols-3 items-center gap-2">
                <Label className="text-right">{label}</Label>
                <Input type="number" step="0.01" className="col-span-2"
                  value={newSample[key]}
                  onChange={e => setNewSample(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}

            {/* 高级字段 (M2.4) — 折叠 */}
            <button type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-start">
              {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              高级分析物字段 {showAdvanced ? '' : '(乳酸 / 湿重 / 活性 / 乙醇)'}
            </button>
            {showAdvanced && (
              <div className="grid gap-3 border-l-2 border-muted pl-3 ml-1">
                {([
                  ['lactate_g_L', '乳酸 Lactate (g/L)'],
                  ['biomass_g_L', '湿重 Biomass (g/L)'],
                  ['cell_viability_pct', '细胞活性 (%)'],
                  ['ethanol_g_L', '乙醇 Ethanol (g/L)'],
                ] as const).map(([key, label]) => (
                  <div key={key} className="grid grid-cols-3 items-center gap-2">
                    <Label className="text-right">{label}</Label>
                    <Input type="number" step="0.01" className="col-span-2"
                      value={newSample[key]}
                      onChange={e => setNewSample(prev => ({ ...prev, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}

            {/* 备注 */}
            <div className="grid grid-cols-3 items-center gap-2 mt-1">
              <Label className="text-right">备注</Label>
              <Input className="col-span-2" placeholder="可选"
                value={newSample.notes}
                onChange={e => setNewSample(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSampleDialogOpen(false)}>取消</Button>
            <Button onClick={submitSample} disabled={submitting}>{submitting ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV 导入对话框 */}
      <SampleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        batchId={id}
        onImported={() => {
          // 导入完成后重新拉取取样列表
          apiFetch(`${API}/api/v1/batches/${id}/samples`)
            .then(r => r.ok ? r.json() : [])
            .then(d => setSamples(Array.isArray(d) ? d : d?.data ?? []))
            .catch(() => {});
        }}
      />
    </div>
  );
}
