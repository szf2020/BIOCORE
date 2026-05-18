'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { EnvelopeChart } from '@/components/charts/EnvelopeChart';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const FIELD_LABELS: Record<string, string> = {
  temperature: '温度', pH: 'pH', DO: '溶氧', pressure: '罐压', rpm: '转速',
};

interface SimilarBatch {
  batch_id: string;
  distance: number;
  recipe_id?: string;
  started_at?: string;
  ended_at?: string;
}

export default function SimilarBatchesPage() {
  const params = useParams();
  const batchId = params.id as string;
  const [field, setField] = useState('temperature');
  const [similar, setSimilar] = useState<SimilarBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/batches/${batchId}/similar?field=${field}&top=10`)
      .then(r => r.json())
      .then(data => setSimilar(data.similar || []))
      .catch(() => setSimilar([]))
      .finally(() => setLoading(false));
  }, [batchId, field]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <Link href={`/batches/${batchId}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">批次智能分析</h1>
          <p className="text-sm text-muted-foreground">{batchId}</p>
        </div>
      </div>

      {/* DTW 相似批次 */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground mb-4">DTW 相似批次匹配</h2>

        {/* 字段选择 */}
        <div className="flex gap-2 mb-4">
          {Object.entries(FIELD_LABELS).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setField(f)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                field === f ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 结果表格 */}
        {loading ? (
          <div className="text-muted-foreground text-sm">计算中...</div>
        ) : similar.length === 0 ? (
          <div className="text-muted-foreground text-sm">暂无相似批次数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-2 font-medium">排名</th>
                <th className="text-left py-2 font-medium">批次号</th>
                <th className="text-left py-2 font-medium">配方</th>
                <th className="text-left py-2 font-medium">开始时间</th>
                <th className="text-right py-2 font-medium">DTW距离</th>
                <th className="text-right py-2 font-medium">相似度</th>
              </tr>
            </thead>
            <tbody>
              {similar.map((s, i) => {
                // 归一化相似度 (距离越小越相似)
                const maxDist = Math.max(...similar.map(x => x.distance), 1);
                const similarity = Math.max(0, (1 - s.distance / maxDist) * 100);
                return (
                  <tr key={s.batch_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 text-muted-foreground">#{i + 1}</td>
                    <td className="py-2">
                      <Link href={`/batches/${s.batch_id}`} className="text-blue-600 hover:underline">
                        {s.batch_id}
                      </Link>
                    </td>
                    <td className="py-2 text-muted-foreground">{s.recipe_id || '-'}</td>
                    <td className="py-2 text-muted-foreground">{s.started_at ? new Date(s.started_at).toLocaleDateString() : '-'}</td>
                    <td className="py-2 text-right font-mono text-foreground/90">{s.distance.toFixed(1)}</td>
                    <td className="py-2 text-right">
                      <span className={`font-mono ${similarity > 80 ? 'text-emerald-600' : similarity > 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {similarity.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 包络线图 */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground mb-4">历史包络线对比</h2>
        <EnvelopeChart batchId={batchId} field={field} />
      </div>
    </div>
  );
}
