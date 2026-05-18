'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Brain, Trash2, Play, Plus } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SoftSensorModel {
  id: string;
  name: string;
  target: string;
  input_features: string[];
  r_squared: number;
  training_batches: number;
  status: string;
}

interface PredictionResult {
  value: number;
  confidence: { lower: number; upper: number };
  isExtrapolating: boolean;
}

export default function SoftSensorPage() {
  const [models, setModels] = useState<SoftSensorModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrainDialog, setShowTrainDialog] = useState(false);
  const [predicting, setPredicting] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);

  // 训练表单
  const [trainTarget, setTrainTarget] = useState('OD600');
  const [trainFeatures, setTrainFeatures] = useState('temperature,pH,DO,rpm');

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/soft-sensor/models`);
      if (res.ok) setModels(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const [trainError, setTrainError] = useState('');
  const [training, setTraining] = useState(false);

  async function handleTrain() {
    setTrainError('');
    setTraining(true);
    try {
      const res = await fetch(`${API}/api/soft-sensor/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: trainTarget,
          features: trainFeatures.split(',').map(f => f.trim()),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowTrainDialog(false);
        fetchModels();
      } else {
        setTrainError(data.error || '训练失败');
      }
    } catch (e) {
      setTrainError((e as Error).message || '网络错误');
    }
    setTraining(false);
  }

  async function handleDelete(id: string) {
    await fetch(`${API}/api/soft-sensor/models/${id}`, { method: 'DELETE' });
    setModels(prev => prev.filter(m => m.id !== id));
  }

  async function handlePredict(modelId: string) {
    setPredicting(modelId);
    setPrediction(null);
    try {
      const res = await fetch(`${API}/api/soft-sensor/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) setPrediction(await res.json());
    } catch { /* ignore */ }
    setPredicting(null);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain size={24} className="text-purple-600" />
          <div>
            <h1 className="text-xl font-bold text-foreground">软测量模型管理</h1>
            <p className="text-sm text-muted-foreground">训练、管理和运行软测量推断模型</p>
          </div>
        </div>
        <button
          onClick={() => setShowTrainDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={16} /> 训练新模型
        </button>
      </div>

      {/* 模型列表 */}
      {loading ? (
        <div className="text-muted-foreground">加载中...</div>
      ) : models.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Brain size={48} className="mx-auto text-muted-foreground/70 mb-3" />
          <p className="text-muted-foreground">暂无软测量模型</p>
          <p className="text-muted-foreground/70 text-sm mt-1">点击"训练新模型"开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map(model => (
            <div key={model.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{model.name || model.id}</h3>
                  <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                    <span>目标: <span className="text-foreground/90">{model.target}</span></span>
                    <span>R²: <span className={model.r_squared > 0.8 ? 'text-emerald-600' : model.r_squared > 0.5 ? 'text-amber-600' : 'text-red-600'}>
                      {(model.r_squared ?? 0).toFixed(3)}
                    </span></span>
                    <span>训练样本: {model.training_batches}</span>
                    <span>特征: {(model.input_features || []).join(', ')}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePredict(model.id)}
                    disabled={predicting === model.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-muted hover:bg-accent text-foreground/90 rounded transition-colors"
                  >
                    <Play size={12} /> {predicting === model.id ? '推断中...' : '在线推断'}
                  </button>
                  <button
                    onClick={() => handleDelete(model.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-muted hover:bg-red-900/50 text-muted-foreground hover:text-red-600 rounded transition-colors"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>

              {/* 预测结果 */}
              {prediction && predicting === null && (
                <div className="mt-3 p-3 bg-muted/50 rounded text-sm">
                  <div className="flex gap-6">
                    <span className="text-muted-foreground">预测值: <span className="text-foreground font-mono">{prediction.value?.toFixed(3)}</span></span>
                    <span className="text-muted-foreground">置信区间: <span className="text-foreground/90 font-mono">[{prediction.confidence?.lower?.toFixed(3)}, {prediction.confidence?.upper?.toFixed(3)}]</span></span>
                    {prediction.isExtrapolating && <span className="text-amber-600">外推警告</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 训练对话框 */}
      {showTrainDialog && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-[420px] space-y-4">
            <h3 className="text-lg font-semibold text-foreground">训练新模型</h3>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">目标变量</label>
              <select
                value={trainTarget}
                onChange={e => setTrainTarget(e.target.value)}
                className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground"
              >
                <option value="OD600">OD600 (生物量)</option>
                <option value="glucose">葡萄糖浓度</option>
                <option value="product">产物浓度</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">输入特征 (逗号分隔)</label>
              <input
                value={trainFeatures}
                onChange={e => setTrainFeatures(e.target.value)}
                className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground"
                placeholder="temperature,pH,DO,rpm"
              />
            </div>

            {trainError && <p className="text-sm text-red-600">{trainError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowTrainDialog(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleTrain}
                disabled={training}
                className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {training ? '训练中...' : '开始训练'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
