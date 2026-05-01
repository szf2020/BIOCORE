// 配方 v2 DAG 编辑器页面 (M3.7)
// 用 react-flow 图形编辑器编辑 DAG 配方
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, CheckCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/auth';
import { useAudit } from '@/hooks/useAudit';
import dynamic from 'next/dynamic';
import type { RecipeDAG } from '@/components/recipe-graph/RecipeGraphEditor';

const RecipeGraphEditor = dynamic(
  () => import('@/components/recipe-graph/RecipeGraphEditor').then(m => ({ default: m.RecipeGraphEditor })),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-sm text-muted-foreground">图形编辑器加载中...</div> },
);

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const EMPTY_DAG: RecipeDAG = {
  schema_version: 2,
  nodes: [
    { id: 'n_start', type: 'start' },
    { id: 'n_end', type: 'end' },
  ],
  edges: [
    { id: 'e_start_end', from: 'n_start', to: 'n_end' },
  ],
};

export default function RecipeEditV2Page() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeId = params.id as string;
  const isNew = routeId === 'new';
  const version = searchParams.get('version') ?? undefined;
  const audit = useAudit();

  const [recipeId, setRecipeId] = useState(isNew ? 'NEW_DAG_RECIPE' : routeId);
  const [recipeName, setRecipeName] = useState('新 DAG 配方');
  const [recipeVersion, setRecipeVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('工艺工程师');
  const [dag, setDag] = useState<RecipeDAG>(EMPTY_DAG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // M3.2: 配方审核状态
  const [recipeStatus, setRecipeStatus] = useState<string>('draft');

  // 加载已有配方
  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    const url = version
      ? `${API}/api/v1/recipes/${encodeURIComponent(routeId)}?version=${version}`
      : `${API}/api/v1/recipes/${encodeURIComponent(routeId)}`;
    apiFetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setRecipeId(data.recipe_id);
        setRecipeName(data.name);
        setRecipeVersion(data.version);
        setAuthor(data.author || '');
        setRecipeStatus(data.status || 'draft');
        if (data.dag && data.dag.schema_version === 2) {
          setDag(data.dag);
        } else {
          // 线性配方自动转 DAG
          setDag(EMPTY_DAG);
          setSaveMsg({ ok: false, text: '此配方尚未迁移到 DAG schema v2' });
        }
      })
      .finally(() => setLoading(false));
  }, [routeId, version, isNew]);

  const doSave = async (nextDag: RecipeDAG) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const body = {
        recipe_id: recipeId,
        version: recipeVersion,
        name: recipeName,
        author,
        vessel_config: { id: 'F01', working_volume_L: 5 },
        dag_schema_version: 2,
        dag: nextDag,
        created_by: author,
      };
      const res = await apiFetch(`${API}/api/v1/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.msg || '保存失败');
      }
      setSaveMsg({ ok: true, text: '保存成功' });
      setDag(nextDag);
      if (isNew) {
        router.push(`/recipes/${recipeId}/edit-v2?version=${recipeVersion}`);
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (nextDag: RecipeDAG) => {
    audit.confirm({
      description: isNew ? `创建 DAG 配方 ${recipeId} v${recipeVersion}` : `保存 DAG 配方 ${recipeId} v${recipeVersion}`,
      action: isNew ? 'recipe_create' : 'recipe_update',
      targetType: 'recipe',
      targetId: `${recipeId}@${recipeVersion}`,
      newValue: `${recipeName} / ${nextDag.nodes.length} 节点 / ${nextDag.edges.length} 边 (DAG v2)`,
      onConfirm: () => doSave(nextDag),
    });
  };

  // M3.2: 提交审核 (draft → pending_approval)
  const handleSubmitForReview = () => {
    if (isNew) {
      setSaveMsg({ ok: false, text: '请先保存配方再提交审核' });
      return;
    }
    audit.confirm({
      description: `提交 DAG 配方 ${recipeId} v${recipeVersion} 进入审核队列`,
      action: 'recipe_submit_review',
      targetType: 'recipe',
      targetId: `${recipeId}@${recipeVersion}`,
      oldValue: 'draft', newValue: 'pending_approval',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`${API}/api/v1/recipes/${encodeURIComponent(recipeId)}/submit-for-review`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: recipeVersion }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body?.error || '提交失败');
          setRecipeStatus('pending_approval');
          setSaveMsg({ ok: true, text: '已提交审核' });
        } catch (e) {
          setSaveMsg({ ok: false, text: (e as Error).message });
        }
      },
    });
  };

  return (
    <div className="h-screen flex flex-col">
      {audit.dialog}

      {/* 顶栏 */}
      <div className="h-14 border-b border-border flex items-center gap-3 px-4 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => router.push('/recipes')}>
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <div className="flex items-center gap-2">
          <Input
            value={recipeId}
            onChange={e => setRecipeId(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
            disabled={!isNew}
            className="h-8 w-40 text-xs font-mono"
            placeholder="recipe_id"
          />
          <Input
            value={recipeVersion}
            onChange={e => setRecipeVersion(e.target.value)}
            disabled={!isNew}
            className="h-8 w-24 text-xs font-mono"
            placeholder="1.0.0"
          />
          <Input
            value={recipeName}
            onChange={e => setRecipeName(e.target.value)}
            className="h-8 w-64 text-sm"
            placeholder="配方名称"
          />
        </div>
        <div className="px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300">
          DAG schema v2
        </div>
        {/* M3.2: 配方状态徽章 */}
        {!isNew && recipeStatus === 'pending_approval' && (
          <div className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />等待审核
          </div>
        )}
        {!isNew && recipeStatus === 'approved' && (
          <div className="px-2 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />已批准
          </div>
        )}
        <div className="flex-1" />
        {saveMsg && (
          <div className={`flex items-center gap-1 text-xs ${saveMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {saveMsg.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {saveMsg.text}
          </div>
        )}
        {/* M3.2: 提交审核按钮 (仅 draft 且已保存时) */}
        {!isNew && recipeStatus === 'draft' && (
          <Button size="sm" variant="outline" onClick={handleSubmitForReview}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            <Send className="w-3.5 h-3.5 mr-1" />提交审核
          </Button>
        )}
      </div>

      {/* 主编辑区 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          加载中...
        </div>
      ) : (
        <RecipeGraphEditor
          initialDag={dag}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}
