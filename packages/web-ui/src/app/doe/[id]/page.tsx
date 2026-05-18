// DoE 研究详情页 — 设计 / 执行 / 分析 三个标签
// 参照 DASware design, 与配方编辑器 + 批次双向对接
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FlaskConical, Plus, Trash2, ArrowLeft, Save, Play, Wand2, TrendingUp,
  Loader2, CheckCircle, AlertCircle, ChevronRight, BookOpen,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useAudit } from '@/hooks/useAudit';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Factor {
  name: string;
  path: string;   // e.g. "HEAT_01.target_temp_C"
  min: number;
  max: number;
  levels?: number;
}

interface Response {
  name: string;
  source?: string;   // 'manual' | influx field | batch_summary
  goal: 'max' | 'min' | 'target';
  target?: number;
}

interface DoeRun {
  run_id: string;
  run_index: number;
  factor_values: Record<string, number>;
  recipe_id: string | null;
  recipe_version: string | null;
  batch_id: string | null;
  response_values: Record<string, number> | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

interface DoeStudy {
  study_id: string;
  name: string;
  description: string | null;
  base_recipe_id: string | null;
  base_recipe_version: string | null;
  design_type: string;
  status: string;
  factors: Factor[];
  responses: Response[];
  created_at: string;
  runs: DoeRun[];
}

type Tab = 'design' | 'runs' | 'analysis';

const RUN_STATUS: Record<string, { bg: string; label: string }> = {
  pending:           { bg: 'bg-gray-500/15 text-gray-400', label: '待生成' },
  recipe_generated:  { bg: 'bg-blue-500/15 text-blue-600', label: '已生成配方' },
  running:           { bg: 'bg-yellow-500/15 text-amber-600', label: '执行中' },
  completed:         { bg: 'bg-green-500/15 text-emerald-600', label: '已完成' },
  failed:            { bg: 'bg-red-500/15 text-red-600', label: '失败' },
};

export default function DoeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const audit = useAudit();
  const studyId = decodeURIComponent((params?.id as string) || '');

  const [tab, setTab] = useState<Tab>('design');
  const [study, setStudy] = useState<DoeStudy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState<any>(null);
  const [modelLoading, setModelLoading] = useState(false);

  // 本地可编辑副本
  const [localFactors, setLocalFactors] = useState<Factor[]>([]);
  const [localResponses, setLocalResponses] = useState<Response[]>([]);
  const [lhsN, setLhsN] = useState<number>(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}`);
      if (r.ok) {
        const data = await r.json();
        setStudy(data);
        setLocalFactors(data.factors || []);
        setLocalResponses(data.responses || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [studyId]);

  useEffect(() => { load(); }, [load]);

  // ─── 因子 / 响应 编辑 ────────────────────────────────────
  const addFactor = () => {
    setLocalFactors([...localFactors, { name: `F${localFactors.length + 1}`, path: '', min: 0, max: 1 }]);
  };
  const updateFactor = (i: number, patch: Partial<Factor>) => {
    setLocalFactors(localFactors.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };
  const removeFactor = (i: number) => {
    setLocalFactors(localFactors.filter((_, idx) => idx !== i));
  };

  const addResponse = () => {
    setLocalResponses([...localResponses, { name: `Y${localResponses.length + 1}`, goal: 'max', source: 'manual' }]);
  };
  const updateResponse = (i: number, patch: Partial<Response>) => {
    setLocalResponses(localResponses.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };
  const removeResponse = (i: number) => {
    setLocalResponses(localResponses.filter((_, idx) => idx !== i));
  };

  const saveFactorsResponses = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/api/v1/doe/studies/${studyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factors: localFactors, responses: localResponses }),
      });
      if (res.ok) await load();
      else alert('保存失败');
    } catch { alert('网络错误'); }
    setSaving(false);
  };

  // 生成设计矩阵
  const generateMatrix = () => {
    if (localFactors.length === 0) { alert('请先定义至少 1 个因子'); return; }
    audit.confirm({
      description: `为研究 "${study?.name}" 生成 ${study?.design_type} 设计矩阵`,
      action: 'doe_generate_design',
      targetType: 'doe_study',
      targetId: studyId,
      newValue: `${localFactors.length} factors`,
      onConfirm: async () => {
        // 先保存 factors, 再生成矩阵
        await apiFetch(`${API}/api/v1/doe/studies/${studyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ factors: localFactors, responses: localResponses }),
        });
        const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/generate-design`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ n: lhsN }),
        });
        if (r.ok) {
          await load();
          setTab('runs');
        } else {
          const d = await r.json().catch(() => ({}));
          alert('生成失败: ' + (d.error || '未知错误'));
        }
      },
    });
  };

  // Materialize: 为每个 run 克隆基础配方 + 注入因子值
  const materializeRuns = () => {
    if (!study?.base_recipe_id) { alert('未关联基础配方, 请先在列表页创建时关联, 或直接编辑创建配方'); return; }
    audit.confirm({
      description: `为研究 "${study.name}" 生成 ${study.runs.length} 份子配方 (从 ${study.base_recipe_id} 克隆)`,
      action: 'doe_materialize',
      targetType: 'doe_study',
      targetId: studyId,
      newValue: `${study.runs.length} child recipes`,
      onConfirm: async () => {
        const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/materialize`, {
          method: 'POST',
        });
        if (r.ok) {
          await load();
        } else {
          const d = await r.json().catch(() => ({}));
          alert('生成子配方失败: ' + (d.error || '未知错误'));
        }
      },
    });
  };

  // 填写响应值
  const [respInputs, setRespInputs] = useState<Record<number, Record<string, string>>>({});
  const saveResponse = async (runIndex: number) => {
    const vals = respInputs[runIndex] || {};
    const parsed: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals)) {
      if (v.trim() === '') continue;
      const n = parseFloat(v);
      if (!isNaN(n)) parsed[k] = n;
    }
    if (Object.keys(parsed).length === 0) { alert('请填入至少一个响应值'); return; }
    const res = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/runs/${runIndex}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responses: parsed }),
    });
    if (res.ok) {
      setRespInputs(prev => ({ ...prev, [runIndex]: {} }));
      await load();
    } else {
      alert('保存失败');
    }
  };

  // 拟合模型
  const fitModel = useCallback(async () => {
    setModelLoading(true);
    try {
      const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/model`);
      if (r.ok) setModel(await r.json());
      else setModel(null);
    } catch { setModel(null); }
    setModelLoading(false);
  }, [studyId]);

  useEffect(() => { if (tab === 'analysis') fitModel(); }, [tab, fitModel]);

  // 应用最优参数到新配方 (服务端创建 + DOE 回链)
  const applyOptimumToRecipe = async (responseName: string, optimumVals: Record<string, number>, predictedResponse?: number) => {
    if (!study?.base_recipe_id) { alert('无基础配方可参考'); return; }
    audit.confirm({
      description: `基于响应 ${responseName} 的最优点创建新配方`,
      action: 'doe_apply_optimum',
      targetType: 'doe_study',
      targetId: studyId,
      newValue: Object.entries(optimumVals).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', '),
      onConfirm: async () => {
        const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/create-optimal-recipe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response_name: responseName,
            optimum_factor_values: optimumVals,
            predicted_response: predictedResponse,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const recipeId = (data?.data ?? data)?.recipe_id;
          if (recipeId) router.push(`/recipes/${encodeURIComponent(recipeId)}/edit?version=1.0.0`);
          else { alert('配方已创建'); await load(); }
        } else {
          const d = await r.json().catch(() => ({}));
          alert('创建最优配方失败: ' + ((d?.data ?? d)?.error || '未知错误'));
        }
      },
    });
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-1" />加载中...</div>;
  if (!study) return <div className="p-6 text-sm text-red-600">研究不存在</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {audit.dialog}

      {/* 标题栏 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/doe')}>
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold flex items-center gap-2 truncate">
            <FlaskConical className="w-4 h-4 text-primary" />
            {study.name}
          </h1>
          <div className="text-sm font-mono text-muted-foreground">
            {study.study_id} · {study.design_type} · 状态: {study.status}
          </div>
        </div>
        {!study.base_recipe_id ? (
          <BindBaseRecipe studyId={studyId} onBound={load} />
        ) : study.runs.length > 0 && !study.runs.some(r => r.recipe_id) ? (
          <Button size="sm" onClick={materializeRuns}>
            <Wand2 className="w-3.5 h-3.5 mr-1" />物化配方 ({study.runs.length} 份)
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground font-mono">
            基础配方: {study.base_recipe_id} v{study.base_recipe_version}
          </span>
        )}
      </div>

      {/* 流程 Stepper (DOE 全链路 7 步) */}
      <DoeStepper study={study} onAutoCollect={async () => {
        const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/auto-collect-all`, { method: 'POST' });
        if (r.ok) { const d = await r.json(); alert(`已收集 ${(d?.data ?? d)?.collected ?? 0} 个响应`); await load(); }
        else alert('自动收集失败');
      }} onCreateOptimal={async () => {
        // 拟合模型 → 获取最优点 → 直接调用服务端生成最优配方
        try {
          const mRes = await apiFetch(`${API}/api/v1/doe/studies/${studyId}/model`);
          if (!mRes.ok) { alert('模型拟合失败'); return; }
          const mData = await mRes.json();
          const responses = (mData?.data ?? mData)?.responses || [];
          // 取第一个有 optimum 或 rangeAnalysis 的响应
          const resp = responses.find((r: any) => r.optimum || r.rangeAnalysis?.optimalCombination);
          if (!resp) { alert('无法确定最优点, 请先在分析标签查看结果'); setTab('analysis'); return; }

          const optVals = resp.optimum?.optimum_factor_values || resp.rangeAnalysis?.optimalCombination || {};
          const predicted = resp.optimum?.predicted_response;
          const respName = resp.response || study.responses[0]?.name || 'Y';

          applyOptimumToRecipe(respName, optVals, predicted);
        } catch { alert('网络错误'); }
      }} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { k: 'design', label: '① 设计' },
          { k: 'runs', label: `② 执行 (${study.runs.length})` },
          { k: 'analysis', label: '③ 分析' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as Tab)}
            className={`h-9 px-4 text-sm font-medium border-b-2 -mb-px ${
              tab === t.k
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: 设计 ── */}
      {tab === 'design' && (
        <div className="space-y-4">
          {/* 因子定义 */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">因子 (自变量)</div>
                <Button size="sm" variant="outline" onClick={addFactor}>
                  <Plus className="w-3.5 h-3.5 mr-1" />添加因子
                </Button>
              </div>
              {localFactors.length === 0 ? (
                <div className="text-sm text-muted-foreground italic py-4 text-center border border-dashed border-border rounded">
                  未定义因子 — 添加要研究的变量 (如 温度/pH/初始搅拌), 指定范围和对应的配方参数路径
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 text-sm text-muted-foreground px-1">
                    <div className="col-span-2">名称</div>
                    <div className="col-span-4">配方参数路径 (phase_id.param_key)</div>
                    <div className="col-span-2">最小值</div>
                    <div className="col-span-2">最大值</div>
                    <div className="col-span-1">水平</div>
                    <div className="col-span-1"></div>
                  </div>
                  {localFactors.map((f, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-2 h-7 text-sm" value={f.name}
                        onChange={e => updateFactor(i, { name: e.target.value })} placeholder="A" />
                      <Input className="col-span-4 h-7 text-sm font-mono" value={f.path}
                        onChange={e => updateFactor(i, { path: e.target.value })}
                        placeholder="HEAT_01.target_temp_C" />
                      <Input className="col-span-2 h-7 text-sm" type="number" value={f.min}
                        onChange={e => updateFactor(i, { min: parseFloat(e.target.value) || 0 })} />
                      <Input className="col-span-2 h-7 text-sm" type="number" value={f.max}
                        onChange={e => updateFactor(i, { max: parseFloat(e.target.value) || 0 })} />
                      <Input className="col-span-1 h-7 text-sm" type="number" value={f.levels || ''}
                        onChange={e => updateFactor(i, { levels: parseInt(e.target.value) || undefined })}
                        placeholder="2" />
                      <button onClick={() => removeFactor(i)} className="col-span-1 text-red-600 hover:bg-red-500/10 rounded p-1 justify-self-end">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 响应变量 */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">响应变量 (因变量)</div>
                <Button size="sm" variant="outline" onClick={addResponse}>
                  <Plus className="w-3.5 h-3.5 mr-1" />添加响应
                </Button>
              </div>
              {localResponses.length === 0 ? (
                <div className="text-sm text-muted-foreground italic py-4 text-center border border-dashed border-border rounded">
                  未定义响应 — 添加要优化的目标 (如 OD600 / 产物浓度 / 产率)
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-12 gap-2 text-sm text-muted-foreground px-1">
                    <div className="col-span-4">名称</div>
                    <div className="col-span-4">来源</div>
                    <div className="col-span-3">目标</div>
                    <div className="col-span-1"></div>
                  </div>
                  {localResponses.map((r, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-4 h-7 text-sm" value={r.name}
                        onChange={e => updateResponse(i, { name: e.target.value })} placeholder="OD600" />
                      <Input className="col-span-4 h-7 text-sm" value={r.source || ''}
                        onChange={e => updateResponse(i, { source: e.target.value })}
                        placeholder="manual / AI-0 / batch_summary" />
                      <select className="col-span-3 h-7 text-sm rounded bg-background border border-border px-1"
                        value={r.goal}
                        onChange={e => updateResponse(i, { goal: e.target.value as any })}>
                        <option value="max">最大化</option>
                        <option value="min">最小化</option>
                        <option value="target">目标值</option>
                      </select>
                      <button onClick={() => removeResponse(i)} className="col-span-1 text-red-600 hover:bg-red-500/10 rounded p-1 justify-self-end">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={saveFactorsResponses} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? '保存中...' : '保存定义'}
            </Button>
            {study.design_type === 'latin_hypercube' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">LHS 运行数:</span>
                <Input type="number" value={lhsN} onChange={e => setLhsN(parseInt(e.target.value) || 10)}
                  className="w-20 h-8" min={2} max={200} />
              </div>
            )}
            <div className="flex-1" />
            <Button onClick={generateMatrix} disabled={localFactors.length === 0}>
              <Wand2 className="w-3.5 h-3.5 mr-1" />生成设计矩阵
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <div>• 全因子: 点数 = 水平^k · CCD: 点数 ≈ 2^k+2k+3 · LHS: 点数 = 上方指定的 N</div>
            <div>• 因子路径格式: <code className="font-mono">{'{phase_id 或 phase_type}.{参数 key}'}</code> · 支持嵌套 (用 . 分隔)</div>
          </div>
        </div>
      )}

      {/* ── Tab 2: 执行 ── */}
      {tab === 'runs' && (
        <div className="space-y-3">
          {/* 操作栏 */}
          <div className="flex items-center gap-2">
            {study.base_recipe_id && (
              <Button
                size="sm"
                variant="outline"
                onClick={materializeRuns}
                disabled={study.runs.length === 0 || study.runs.every(r => r.recipe_id)}
              >
                <BookOpen className="w-3.5 h-3.5 mr-1" />生成子配方
              </Button>
            )}
            <div className="text-sm text-muted-foreground">
              {study.runs.filter(r => r.status === 'completed').length}/{study.runs.length} 已完成
            </div>
          </div>

          {/* 运行表 */}
          {study.runs.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              暂无运行, 请先回到"设计"标签生成矩阵
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {study.runs.map(run => {
                const st = RUN_STATUS[run.status] || RUN_STATUS.pending;
                return (
                  <Card key={run.run_id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-semibold w-8">#{run.run_index}</span>
                        <span className={`px-1.5 py-0.5 rounded text-sm font-semibold ${st.bg}`}>{st.label}</span>
                        {run.recipe_id && (
                          <button
                            onClick={() => router.push(`/recipes/${encodeURIComponent(run.recipe_id!)}/edit?version=${run.recipe_version}`)}
                            className="text-sm text-primary hover:underline flex items-center gap-0.5 font-mono"
                          >
                            <BookOpen className="w-3 h-3" /> {run.recipe_id}
                          </button>
                        )}
                        {run.batch_id && (
                          <span className="text-sm text-muted-foreground font-mono">批次: {run.batch_id}</span>
                        )}
                      </div>
                      {/* 因子值 */}
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(run.factor_values).map(([k, v]) => (
                          <span key={k} className="text-sm bg-muted/50 px-2 py-0.5 rounded font-mono">
                            {k}={typeof v === 'number' ? v.toFixed(3) : String(v)}
                          </span>
                        ))}
                      </div>
                      {/* 响应填写 */}
                      {run.status !== 'completed' && study.responses.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          {study.responses.map(resp => (
                            <div key={resp.name} className="flex items-center gap-1">
                              <span className="text-sm text-muted-foreground">{resp.name}:</span>
                              <Input
                                type="number"
                                className="h-6 w-20 text-[12px]"
                                value={respInputs[run.run_index]?.[resp.name] || ''}
                                onChange={e => setRespInputs(prev => ({
                                  ...prev,
                                  [run.run_index]: { ...(prev[run.run_index] || {}), [resp.name]: e.target.value },
                                }))}
                                placeholder={resp.goal === 'max' ? '↑越大越好' : resp.goal === 'min' ? '↓越小越好' : '目标'}
                              />
                            </div>
                          ))}
                          <Button size="sm" variant="outline" onClick={() => saveResponse(run.run_index)}>
                            <CheckCircle className="w-3 h-3 mr-1" />提交响应
                          </Button>
                        </div>
                      )}
                      {run.status === 'completed' && run.response_values && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {Object.entries(run.response_values).map(([k, v]) => (
                            <span key={k} className="text-sm bg-green-500/15 text-emerald-600 px-2 py-0.5 rounded font-mono">
                              {k}={typeof v === 'number' ? v.toFixed(3) : String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 3: 分析 ── */}
      {tab === 'analysis' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={fitModel} disabled={modelLoading}>
              <TrendingUp className="w-3.5 h-3.5 mr-1" />{modelLoading ? '拟合中...' : '重新拟合'}
            </Button>
            <span className="text-sm text-muted-foreground">
              仅对已完成运行的响应值建模 · 默认二次模型 (RSM)
            </span>
          </div>

          {!model && !modelLoading && (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
              点击"重新拟合"开始分析
            </CardContent></Card>
          )}

          {model?.responses?.map((respResult: any, i: number) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">{respResult.response}</span>
                  <span className="text-sm text-muted-foreground">
                    目标: {respResult.goal === 'max' ? '最大化' : respResult.goal === 'min' ? '最小化' : '目标值'}
                  </span>
                  {respResult.analysis_type && (
                    <span className="text-[12px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                      {respResult.analysis_type === 'orthogonal' ? '极差+ANOVA' : respResult.analysis_type === 'regression' ? '回归' : 'RSM'}
                    </span>
                  )}
                </div>
                {respResult.error ? (
                  <div className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{respResult.error}
                  </div>
                ) : respResult.analysis_type === 'orthogonal' ? (
                  <>
                    {/* ── 正交设计: 极差分析表 ── */}
                    <div>
                      <div className="text-sm font-semibold mb-1 text-muted-foreground">极差分析 (因素重要性排名)</div>
                      <div className="text-[12px] font-mono overflow-x-auto">
                        <table className="w-full">
                          <thead><tr className="border-b border-border text-muted-foreground">
                            <th className="text-left py-1 pr-2">因素</th>
                            {respResult.rangeAnalysis?.factors?.[0]?.k?.map((_: any, j: number) => (
                              <th key={j} className="text-right py-1 px-2">k{j + 1}</th>
                            ))}
                            <th className="text-right py-1 px-2 text-primary">R (极差)</th>
                            <th className="text-right py-1 px-2">最优水平</th>
                          </tr></thead>
                          <tbody>
                            {respResult.rangeAnalysis?.factors?.map((f: any) => (
                              <tr key={f.name} className="border-b border-border/30">
                                <td className="py-1 pr-2 font-semibold">{f.name}</td>
                                {f.k.map((v: number, j: number) => (
                                  <td key={j} className={`text-right py-1 px-2 ${j + 1 === f.optimalLevel ? 'text-emerald-600 font-bold' : ''}`}>
                                    {v.toFixed(3)}
                                  </td>
                                ))}
                                <td className="text-right py-1 px-2 text-primary font-bold">{f.R.toFixed(3)}</td>
                                <td className="text-right py-1 px-2 text-emerald-600">{f.optimalValue}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        排名: {respResult.rangeAnalysis?.ranking?.join(' > ')}
                      </div>
                    </div>

                    {/* ANOVA 表 */}
                    {respResult.anova && (
                      <div>
                        <div className="text-sm font-semibold mb-1 text-muted-foreground">方差分析 (F 检验)</div>
                        <div className="text-[12px] font-mono overflow-x-auto">
                          <table className="w-full">
                            <thead><tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-1 pr-2">来源</th>
                              <th className="text-right py-1 px-2">SS</th>
                              <th className="text-right py-1 px-2">df</th>
                              <th className="text-right py-1 px-2">MS</th>
                              <th className="text-right py-1 px-2">F</th>
                              <th className="text-center py-1 px-2">显著性</th>
                            </tr></thead>
                            <tbody>
                              {respResult.anova.sources?.map((s: any) => (
                                <tr key={s.name} className="border-b border-border/30">
                                  <td className="py-1 pr-2">{s.name}</td>
                                  <td className="text-right py-1 px-2">{s.ss.toFixed(3)}</td>
                                  <td className="text-right py-1 px-2">{s.df}</td>
                                  <td className="text-right py-1 px-2">{s.ms.toFixed(3)}</td>
                                  <td className="text-right py-1 px-2">{s.F.toFixed(3)}</td>
                                  <td className="text-center py-1 px-2">
                                    <span className={s.significance === '**' ? 'text-red-600 font-bold' : s.significance === '*' ? 'text-amber-600' : 'text-muted-foreground'}>
                                      {s.significance || 'ns'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              <tr className="border-t border-border text-muted-foreground">
                                <td className="py-1 pr-2">误差</td>
                                <td className="text-right py-1 px-2">{respResult.anova.error?.ss?.toFixed(3)}</td>
                                <td className="text-right py-1 px-2">{respResult.anova.error?.df}</td>
                                <td className="text-right py-1 px-2">{respResult.anova.error?.ms?.toFixed(3)}</td>
                                <td className="text-right py-1 px-2">—</td>
                                <td></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {respResult.anova.pooledFactors?.length > 0 && (
                          <div className="text-sm text-muted-foreground mt-1">
                            合并到误差项: {respResult.anova.pooledFactors.join(', ')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 主效应图 (参考 Minitab) */}
                    {respResult.rangeAnalysis?.factors?.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold mb-1 text-muted-foreground">主效应图 (各因素水平均值)</div>
                        <EChartsWrapper option={{
                          tooltip: { trigger: 'axis' as const },
                          legend: { data: respResult.rangeAnalysis.factors.map((f: any) => f.name), textStyle: { color: '#888', fontSize: 10 } },
                          grid: { left: 50, right: 20, top: 30, bottom: 30 },
                          xAxis: { type: 'category' as const, data: respResult.rangeAnalysis.factors[0]?.k?.map((_: any, j: number) => `水平${j + 1}`), axisLabel: { fontSize: 10, color: '#888' } },
                          yAxis: { type: 'value' as const, name: respResult.response, axisLabel: { fontSize: 9, color: '#666' } },
                          series: respResult.rangeAnalysis.factors.map((f: any, idx: number) => ({
                            name: f.name, type: 'line', data: f.k,
                            symbol: 'circle', symbolSize: 8,
                            lineStyle: { width: 2 },
                            itemStyle: { color: ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'][idx % 6] },
                          })),
                        }} style={{ height: 220 }} />
                      </div>
                    )}

                    {/* 最优水平组合 */}
                    <div className="bg-primary/5 border border-primary/30 rounded p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-primary" />
                        <span className="text-sm font-semibold">最优水平组合</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(respResult.rangeAnalysis?.optimalCombination || {}).map(([k, v]: [string, any]) => (
                          <span key={k} className="text-[12px] bg-primary/15 text-primary px-2 py-0.5 rounded font-mono">
                            {k} = {typeof v === 'number' ? v : String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : respResult.analysis_type === 'regression' ? (
                  <>
                    {/* ── 均匀设计: 回归分析 ── */}
                    <div className="flex flex-wrap gap-3 text-[12px] bg-muted/30 rounded p-2">
                      <span>类型: {respResult.regression_type}</span>
                      <span>R² = <strong>{respResult.regression?.rSquared?.toFixed(4)}</strong></span>
                      <span>Adj R² = <strong>{respResult.regression?.adjustedRSquared?.toFixed(4)}</strong></span>
                      <span>F = {respResult.regression?.fStatistic?.toFixed(3)} {respResult.regression?.fSignificance}</span>
                    </div>
                    <div className="text-[12px] font-mono bg-muted/20 p-2 rounded break-all">
                      {respResult.regression?.equation}
                    </div>
                    <div className="text-[12px] font-mono space-y-0.5">
                      {respResult.regression?.coefficients?.map((c: any, idx: number) => (
                        <div key={idx} className="flex gap-2">
                          <span className="w-24">{c.term}</span>
                          <span className="w-20 text-right">{c.value?.toFixed(4)}</span>
                          <span className="w-16 text-right">{c.pValue?.toFixed(4)}</span>
                          <span>{c.significant ? <span className="text-emerald-600">✓</span> : ''}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {/* ── RSM 分析 (原有) ── */}
                    <div className="flex flex-wrap gap-3 text-[12px] bg-muted/30 rounded p-2">
                      <span>R² = <strong>{respResult.model?.r_squared?.toFixed(4)}</strong></span>
                      <span>Adj R² = <strong>{respResult.model?.adjusted_r_squared?.toFixed(4)}</strong></span>
                      <span>Residual SE = <strong>{respResult.model?.residual_std_error?.toFixed(4)}</strong></span>
                      <span>N = {respResult.model?.n_observations} obs / {respResult.model?.n_terms} terms</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-1 text-muted-foreground">系数 (coded)</div>
                      <div className="text-[12px] space-y-0.5 font-mono">
                        {respResult.model?.terms?.map((t: any, idx: number) => (
                          <div key={idx} className="flex gap-2">
                            <span className="w-20">{t.term}</span>
                            <span className="w-20 text-right">{t.coefficient?.toFixed(4)}</span>
                            <span className="w-16 text-right">{t.p_value?.toFixed(4)}</span>
                            <span>{t.significant ? <span className="text-emerald-600">✓</span> : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {respResult.pareto && (
                      <div>
                        <div className="text-sm font-semibold mb-1 text-muted-foreground">效应 Pareto 图</div>
                        <div className="space-y-1">
                          {respResult.pareto.map((p: any, idx: number) => {
                            const max = Math.max(...respResult.pareto.map((x: any) => x.abs_coefficient));
                            const pct = max > 0 ? (p.abs_coefficient / max) * 100 : 0;
                            return (
                              <div key={idx} className="flex items-center gap-2 text-[12px]">
                                <span className="w-20 font-mono">{p.term}</span>
                                <div className="flex-1 h-4 bg-muted/40 rounded overflow-hidden">
                                  <div className={`h-full ${p.significant ? 'bg-primary' : 'bg-muted-foreground/40'}`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-16 text-right font-mono">{p.abs_coefficient?.toFixed(4)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {respResult.optimum && (
                      <div className="bg-primary/5 border border-primary/30 rounded p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-primary" />
                          <span className="text-sm font-semibold">推荐最优点</span>
                          <span className="text-sm text-muted-foreground">
                            预测: <strong>{respResult.optimum.predicted_response?.toFixed(4)}</strong>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(respResult.optimum.optimum_factor_values || {}).map(([k, v]: [string, any]) => (
                            <span key={k} className="text-[12px] bg-primary/15 text-primary px-2 py-0.5 rounded font-mono">
                              {k} = {typeof v === 'number' ? v.toFixed(3) : String(v)}
                            </span>
                          ))}
                        </div>
                        {study.base_recipe_id && (
                          <Button size="sm" onClick={() => applyOptimumToRecipe(respResult.response, respResult.optimum.optimum_factor_values, respResult.optimum.predicted_response)}>
                            <ChevronRight className="w-3.5 h-3.5 mr-1" />应用最优参数创建新配方
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}

          {/* 等高线图 (RSM 设计类型可用, 参考 Minitab) */}
          {study.factors.length >= 2 && model?.responses?.some((r: any) => r.analysis_type === 'rsm' && r.model) && (
            <ContourPlot studyId={studyId} factors={study.factors} responses={study.responses} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── 绑定基础配方 (物化前置条件) ────────────────────────────

function BindBaseRecipe({ studyId, onBound }: { studyId: string; onBound: () => void }) {
  const [open, setOpen] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (!open) return;
    apiFetch(`${API}/api/v1/recipes?status=approved`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setRecipes(Array.isArray(d) ? d : (d?.data || [])))
      .catch(() => {});
  }, [open]);

  const bind = async () => {
    if (!selected) return;
    const [id, version] = selected.split('::');
    const r = await apiFetch(`${API}/api/v1/doe/studies/${studyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_recipe_id: id, base_recipe_version: version }),
    });
    if (r.ok) { setOpen(false); onBound(); }
    else alert('绑定失败');
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-amber-600 border-yellow-500/40">
        <AlertCircle className="w-3.5 h-3.5 mr-1" />绑定基础配方
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-lg w-[400px] p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">绑定基础配方</h3>
            <p className="text-sm text-muted-foreground">物化（Materialize）需要一个已批准的基础配方，DOE 会克隆该配方并注入因素值。</p>
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="w-full h-8 px-2 rounded bg-background border border-border text-sm">
              <option value="">-- 选择已批准配方 --</option>
              {recipes.map((r: any) => (
                <option key={`${r.recipe_id}::${r.version}`} value={`${r.recipe_id}::${r.version}`}>
                  {r.name} ({r.recipe_id} v{r.version})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button size="sm" onClick={bind} disabled={!selected}>确认绑定</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── DOE 全链路 Stepper ────────────────────────────────────

function DoeStepper({ study, onAutoCollect, onCreateOptimal }: { study: DoeStudy; onAutoCollect: () => void; onCreateOptimal: () => void }) {
  const hasFactors = study.factors.length > 0;
  const hasRuns = study.runs.length > 0;
  const materialized = study.runs.some(r => r.recipe_id);
  const materializedCount = study.runs.filter(r => r.recipe_id).length;
  const boundCount = study.runs.filter(r => r.batch_id).length;
  const completedCount = study.runs.filter(r => r.status === 'completed').length;
  const allCompleted = hasRuns && completedCount === study.runs.length;
  const hasOptimal = !!(study as any).optimal_recipe_id;

  const steps = [
    { label: '设计', done: hasFactors, detail: hasFactors ? `${study.factors.length} 因素 / ${study.responses.length} 响应` : '待定义' },
    { label: '矩阵', done: hasRuns, detail: hasRuns ? `${study.runs.length} 次试验` : '未生成' },
    { label: '配方', done: materialized, detail: materialized ? `${materializedCount}/${study.runs.length}` : '未物化' },
    { label: '执行', done: boundCount > 0 || completedCount > 0, detail: boundCount > 0 ? `${boundCount}/${study.runs.length} 已绑定` : completedCount > 0 ? `${completedCount}/${study.runs.length} 已完成` : '待执行' },
    { label: '响应', done: allCompleted, detail: `${completedCount}/${study.runs.length} 已收集`, action: !allCompleted && (boundCount > 0 || materializedCount > 0) },
    { label: '分析', done: allCompleted, detail: allCompleted ? 'R² 可拟合' : '待完成' },
    { label: '最优', done: hasOptimal, detail: hasOptimal ? '✓ 已生成' : '待确认', action: !hasOptimal && allCompleted, actionLabel: '生成最优配方', onAction: onCreateOptimal },
  ];

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className={`w-6 h-px ${s.done || steps[i - 1].done ? 'bg-primary/60' : 'bg-border'}`} />}
          <div className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded ${s.done ? 'bg-primary/10' : 'bg-muted/30'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-sm font-bold ${s.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {s.done ? '✓' : i + 1}
            </div>
            <span className="text-sm font-semibold">{s.label}</span>
            <span className="text-[12px] text-muted-foreground">{s.detail}</span>
            {s.action && (
              <button onClick={(s as any).onAction || onAutoCollect} className="text-[12px] text-primary hover:underline mt-0.5">
                {(s as any).actionLabel || '一键收集'}
              </button>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── 等高线图组件 (参考 Minitab RSM Contour Plot) ──────────

function ContourPlot({ studyId, factors, responses }: {
  studyId: string; factors: Factor[]; responses: Response[];
}) {
  const [selResp, setSelResp] = useState(responses[0]?.name || '');
  const [selX, setSelX] = useState(factors[0]?.name || '');
  const [selY, setSelY] = useState(factors[1]?.name || '');
  const [contour, setContour] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadContour = useCallback(async () => {
    if (!selResp || !selX || !selY || selX === selY) return;
    setLoading(true);
    try {
      const r = await apiFetch(
        `${API}/api/v1/doe/studies/${studyId}/contour?response=${selResp}&factorX=${selX}&factorY=${selY}&grid=25`
      );
      if (r.ok) { const d = await r.json(); setContour(d?.data ?? d); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [studyId, selResp, selX, selY]);

  useEffect(() => { loadContour(); }, [loadContour]);

  // 转 ECharts heatmap 数据
  const heatmapData: [number, number, number][] = [];
  if (contour?.z) {
    for (let yi = 0; yi < contour.z.length; yi++) {
      for (let xi = 0; xi < contour.z[yi].length; xi++) {
        heatmapData.push([xi, yi, contour.z[yi][xi]]);
      }
    }
  }

  const allZ = heatmapData.map(d => d[2]);
  const zMin = allZ.length > 0 ? Math.min(...allZ) : 0;
  const zMax = allZ.length > 0 ? Math.max(...allZ) : 1;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-muted-foreground">等高线图 (Contour)</span>
          <select value={selResp} onChange={e => setSelResp(e.target.value)} className="h-7 px-2 text-[12px] rounded bg-background border border-border">
            {responses.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">X:</span>
          <select value={selX} onChange={e => setSelX(e.target.value)} className="h-7 px-2 text-[12px] rounded bg-background border border-border">
            {factors.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">Y:</span>
          <select value={selY} onChange={e => setSelY(e.target.value)} className="h-7 px-2 text-[12px] rounded bg-background border border-border">
            {factors.filter(f => f.name !== selX).map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
          </select>
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>

        {contour && heatmapData.length > 0 ? (
          <EChartsWrapper option={{
            tooltip: { formatter: (p: any) => `${selX}=${contour.x[p.data[0]]?.toFixed(2)}, ${selY}=${contour.y[p.data[1]]?.toFixed(2)}<br/>${selResp}=<strong>${p.data[2]?.toFixed(3)}</strong>` },
            grid: { left: 70, right: 80, top: 10, bottom: 40 },
            xAxis: { type: 'category' as const, data: contour.x.map((v: number) => v.toFixed(2)), name: selX, axisLabel: { fontSize: 9, color: '#666', rotate: 30 } },
            yAxis: { type: 'category' as const, data: contour.y.map((v: number) => v.toFixed(2)), name: selY, axisLabel: { fontSize: 9, color: '#666' } },
            visualMap: { min: zMin, max: zMax, calculable: true, orient: 'vertical', right: 10, top: 'center', inRange: { color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#d73027'] }, textStyle: { color: '#888', fontSize: 10 } },
            series: [{ type: 'heatmap', data: heatmapData, emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 1 } } }],
          }} style={{ height: 350 }} />
        ) : !loading ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            {selX === selY ? '请选择不同的 X/Y 因素' : '无等高线数据（需完成试验并拟合模型）'}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
