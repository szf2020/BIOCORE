'use client';

import React, { useState } from 'react';
import { Search } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface RootCauseResult {
  alarm_id: string;
  alarm_code: string;
  probableCauses: Array<{ cause: string; confidence: number; category: string }>;
  recommendations: string[];
  narrative: string;
}

export function RootCausePanel({ alarmId, alarmCode, onClose }: {
  alarmId: string | number;
  alarmCode?: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<RootCauseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function analyze() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/alarms/${alarmId}/root-cause`, { method: 'POST' });
      if (res.ok) {
        setResult(await res.json());
      } else {
        // 回退到通用分析接口
        const res2 = await fetch(`${API}/api/root-cause/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alarmCode: alarmCode || 'UNKNOWN' }),
        });
        if (res2.ok) setResult(await res2.json());
        else setError('分析失败');
      }
    } catch { setError('网络错误'); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg p-6 w-[520px] max-h-[80vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">根因分析</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground/90">&times;</button>
        </div>

        <div className="text-sm text-muted-foreground">
          告警: <span className="text-foreground font-mono">{alarmCode || alarmId}</span>
        </div>

        {!result && !loading && (
          <button
            onClick={analyze}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            <Search size={14} /> 开始分析
          </button>
        )}

        {loading && <div className="text-muted-foreground text-sm">正在分析根因...</div>}
        {error && <div className="text-red-600 text-sm">{error}</div>}

        {result && (
          <div className="space-y-4">
            {/* 可能原因 */}
            <div>
              <h4 className="text-sm font-medium text-foreground/90 mb-2">可能原因</h4>
              <div className="space-y-2">
                {(result.probableCauses || []).map((cause, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className="w-12 text-right font-mono text-muted-foreground">
                      {(cause.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${cause.confidence * 100}%` }}
                      />
                    </div>
                    <div className="flex-[2] text-foreground">{cause.cause}</div>
                    <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">{cause.category}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 建议措施 */}
            {result.recommendations && result.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-foreground/90 mb-2">建议措施</h4>
                <ul className="space-y-1">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-blue-600 flex-shrink-0">{i + 1}.</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 分析叙述 */}
            {result.narrative && (
              <div>
                <h4 className="text-sm font-medium text-foreground/90 mb-2">分析说明</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{result.narrative}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
