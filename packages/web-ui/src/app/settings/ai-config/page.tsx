'use client';

import React, { useState, useEffect } from 'react';
import { useAudit } from '@/hooks/useAudit';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AiConfig {
  ollama_url: string;
  model: string;
  cloud_api_key: string;
  cloud_provider: string;
}

const MODEL_OPTIONS = ['gemma4', 'qwen2.5:7b', 'llama3.1:8b', 'llama3.1:70b', 'mistral:7b', 'deepseek-coder:6.7b'];
const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
];

export default function AiConfigPage() {
  const [config, setConfig] = useState<AiConfig>({
    ollama_url: 'http://localhost:11434',
    model: 'gemma4',
    cloud_api_key: '',
    cloud_provider: 'anthropic',
  });
  const [originalConfig, setOriginalConfig] = useState<AiConfig | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<{ available: boolean; models: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const audit = useAudit();

  useEffect(() => {
    // 加载已保存配置
    fetch(`${API}/api/settings/ai`).then(r => r.json()).then(c => { setConfig(c); setOriginalConfig(c); }).catch(() => {});
    // 检查Ollama状态
    fetch(`${API}/api/ai/status`).then(r => r.json()).then(setOllamaStatus).catch(() => {});
  }, []);

  const doSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API}/api/settings/ai`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) { setSaved(true); setOriginalConfig(config); }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const summarize = (c: AiConfig) =>
      `Ollama: ${c.ollama_url} / 模型: ${c.model} / 云端: ${c.cloud_provider}${c.cloud_api_key ? ' (含密钥)' : ''}`;
    audit.confirm({
      description: '更新 AI 配置 (Ollama + 云端)',
      action: 'ai_config_update', targetType: 'settings', targetId: 'ai',
      oldValue: originalConfig ? summarize(originalConfig) : undefined,
      newValue: summarize(config),
      onConfirm: doSave,
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">AI 配置</h1>
      <p className="text-sm text-muted-foreground mb-6">配置本地Ollama和云端AI服务</p>

      {/* Ollama 状态 */}
      <div className="mb-6 p-3 rounded-lg border border-white/10 bg-white/5">
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2.5 h-2.5 rounded-full ${ollamaStatus?.available ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium">Ollama 状态: {ollamaStatus?.available ? '在线' : '离线'}</span>
        </div>
        {ollamaStatus?.available && ollamaStatus.models.length > 0 && (
          <p className="text-sm text-muted-foreground ml-4.5">可用模型: {ollamaStatus.models.join(', ')}</p>
        )}
        {ollamaStatus && !ollamaStatus.available && (
          <p className="text-sm text-red-600 ml-4.5">请运行: <code className="bg-white/10 px-1 rounded">ollama serve</code></p>
        )}
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Ollama 服务地址</label>
          <input type="text" value={config.ollama_url}
            onChange={e => setConfig({ ...config, ollama_url: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5" placeholder="http://localhost:11434" />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">模型选择</label>
          <select value={config.model} onChange={e => setConfig({ ...config, model: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5">
            {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            {ollamaStatus?.models.filter(m => !MODEL_OPTIONS.includes(m)).map(m =>
              <option key={m} value={m}>{m} (已安装)</option>
            )}
          </select>
          <p className="text-sm text-muted-foreground">推荐 gemma4 (Google Gemma 4, 多语言, 8B参数)</p>
        </div>

        <hr className="border-white/10" />

        <div className="space-y-2">
          <label className="text-sm font-medium">云端AI提供商 (可选)</label>
          <select value={config.cloud_provider} onChange={e => setConfig({ ...config, cloud_provider: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5">
            {PROVIDER_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">云端 API 密钥 (可选)</label>
          <input type="password" value={config.cloud_api_key}
            onChange={e => setConfig({ ...config, cloud_api_key: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5" placeholder="sk-..." />
          <p className="text-sm text-muted-foreground">本地Ollama不可用时自动回退到云端 (需网络)</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[#1677ff] text-white hover:bg-[#1677ff]/80 disabled:opacity-50">
            {saving ? '保存中...' : '保存配置'}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ 已保存</span>}
        </div>
      </div>

      {audit.dialog}
    </div>
  );
}
