// ============================================================
// /admin/health — 运行时健康度页面 (T41)
//   - 4 张状态卡 (HealthOverview)
//   - 内存 24h 折线 (MemoryChart)
//   - 事件循环延迟 24h 折线 (EventLoopChart)
//   - 最近重启与崩溃诊断包列表 (RestartHistory)
//   - 每 10 秒自动刷新
// ============================================================
'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { HealthOverview, type HealthSnap } from '@/components/admin/HealthOverview';
import { MemoryChart, type MemorySample } from '@/components/admin/MemoryChart';
import { EventLoopChart, type EventLoopSample } from '@/components/admin/EventLoopChart';
import { RestartHistory, type RestartSnap } from '@/components/admin/RestartHistory';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type FullSnap = HealthSnap & RestartSnap & Record<string, any>;
type TimeseriesSample = MemorySample & EventLoopSample;

async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: any = await res.json();
  // /api/v1/* 经过 apiFetch 拦截器自动 unwrap, 但兜底再剥一层 {data}
  return (body && typeof body === 'object' && 'data' in body && 'code' in body) ? body.data : body;
}

export default function AdminHealthPage() {
  const [snap, setSnap] = useState<FullSnap | null>(null);
  const [series, setSeries] = useState<TimeseriesSample[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const [a, b] = await Promise.all([
          fetchJson<FullSnap>(`${API}/api/v1/admin/health`),
          fetchJson<{ samples: TimeseriesSample[] }>(`${API}/api/v1/admin/health/timeseries`),
        ]);
        if (mounted) {
          setSnap(a);
          setSeries(Array.isArray(b?.samples) ? b.samples : []);
          setError(null);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message ?? 'Failed to fetch');
      }
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (error && !snap) {
    return <div className="p-6 text-red-600">无法加载健康度数据：{error}</div>;
  }
  if (!snap) {
    return <div className="p-6 text-muted-foreground">加载中…</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">系统健康度</h1>
        {error && <span className="text-sm text-red-600">刷新失败：{error}</span>}
      </div>
      <p className="text-sm text-muted-foreground">实时运行时数据，每 10 秒自动刷新。</p>

      <HealthOverview snap={snap} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MemoryChart series={series} />
        <EventLoopChart series={series} />
      </div>

      <RestartHistory snap={snap} />
    </div>
  );
}
