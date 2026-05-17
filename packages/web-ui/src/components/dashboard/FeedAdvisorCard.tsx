'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Droplets } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FeedRecommendation {
  suggestedRate: number;
  reason: string;
  confidence: number;
  action: 'increase' | 'decrease' | 'maintain';
}

const ACTION_LABELS: Record<string, { text: string; color: string }> = {
  increase: { text: '增加', color: 'text-emerald-600' },
  decrease: { text: '减少', color: 'text-red-600' },
  maintain: { text: '维持', color: 'text-muted-foreground' },
};

// 默认 Monod 参数 (E.coli)
const DEFAULT_PARAMS = {
  targetMu: 0.2,
  muMax: 0.6,
  Ks: 0.05,
  Yxs: 0.45,
  feedConcentration: 500,
  liquidVolume: 5,
};

export function FeedAdvisorCard({ batchId }: { batchId?: string }) {
  const [recommendation, setRecommendation] = useState<FeedRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/soft-sensor/feed-recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentOD: 5.0,       // 将来从 soft-sensor WebSocket 获取
          currentGlucose: 0.5,  // 将来从 soft-sensor WebSocket 获取
          currentFeedRate: 10,
          ...DEFAULT_PARAMS,
        }),
      });
      if (res.ok) setRecommendation(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchRecommendation();
    const timer = setInterval(fetchRecommendation, 60000); // 每60秒刷新
    return () => clearInterval(timer);
  }, [fetchRecommendation]);

  if (!batchId || loading && !recommendation) return null;

  if (!recommendation) return null;

  const actionInfo = ACTION_LABELS[recommendation.action] || ACTION_LABELS.maintain;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Droplets size={16} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-foreground/90">补料建议</h3>
        <span className="ml-auto text-sm text-muted-foreground/70">基于 Monod 动力学</span>
      </div>

      <div className="flex items-baseline gap-4 mb-2">
        <div>
          <span className="text-2xl font-mono text-foreground">{recommendation.suggestedRate.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground ml-1">mL/h</span>
        </div>
        <span className={`text-sm font-medium ${actionInfo.color}`}>
          {actionInfo.text}
        </span>
        <span className="text-sm text-muted-foreground">
          置信度 {(recommendation.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {recommendation.reason}
      </p>
    </div>
  );
}
