'use client';

import React, { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AiSuggestion {
  id: number;
  batch_id: string;
  suggestion_type: string;
  source_module: string;
  target_param: string;
  current_value: number | null;
  suggested_value: number | null;
  confidence: number | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
}

export function AiSuggestionCard({ batchId }: { batchId?: string }) {
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = useCallback(async () => {
    try {
      const url = batchId
        ? `${API}/api/ai/suggestions?status=pending&batch_id=${batchId}`
        : `${API}/api/ai/suggestions?status=pending`;
      const res = await fetch(url);
      if (res.ok) setSuggestions(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchSuggestions();
    const timer = setInterval(fetchSuggestions, 30000); // 每30秒刷新
    return () => clearInterval(timer);
  }, [fetchSuggestions]);

  async function handleAccept(id: number) {
    await fetch(`${API}/api/ai/suggestions/${id}/accept`, { method: 'POST' });
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }

  async function handleReject(id: number) {
    await fetch(`${API}/api/ai/suggestions/${id}/reject`, { method: 'POST' });
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }

  if (loading || suggestions.length === 0) return null;

  return (
    <div className="space-y-3">
      {suggestions.map(s => {
        // 计算剩余时间
        const expiresIn = s.expires_at ? Math.max(0, Math.floor((new Date(s.expires_at).getTime() - Date.now()) / 60000)) : null;

        return (
          <div key={s.id} className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1.5">
                <span className="text-base">💡</span> AI 建议
                <span className="text-xs font-normal text-muted-foreground">({s.source_module})</span>
              </h3>
              {s.confidence != null && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-600">
                  置信度 {(s.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>

            {/* 建议内容 */}
            <div className="text-sm mb-2">
              <span className="text-muted-foreground">参数: </span>
              <span className="font-mono">{s.target_param}</span>
            </div>
            {s.current_value != null && s.suggested_value != null && (
              <div className="text-sm mb-2 flex items-center gap-2">
                <span className="font-mono text-muted-foreground">{s.current_value}</span>
                <span className="text-amber-600">→</span>
                <span className="font-mono font-semibold text-amber-600">{s.suggested_value}</span>
              </div>
            )}
            {s.reasoning && (
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{s.reasoning}</p>
            )}

            {/* 过期倒计时 */}
            {expiresIn != null && expiresIn > 0 && (
              <p className="text-xs text-muted-foreground mb-2">过期时间: 还剩 {expiresIn} 分钟</p>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button onClick={() => handleReject(s.id)}
                className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-white/10 text-muted-foreground hover:bg-white/5">
                拒绝
              </button>
              <button onClick={() => handleAccept(s.id)}
                className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-[#1677ff] text-white hover:bg-[#1677ff]/80">
                采纳 ✓
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
