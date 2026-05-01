// ============================================================
// HealthOverview — /admin/health 顶部 4 张状态卡 (T41)
// ============================================================
'use client';

import React from 'react';

export interface HealthSnap {
  service: { uptime_sec: number };
  memory: { rss_mb: number; oom_pct: number; oom_threshold_mb: number };
  plc: { connected: boolean };
  batches: { active_count: number };
}

function formatUptime(sec: number): string {
  if (!sec || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

export function HealthOverview({ snap }: { snap: HealthSnap }) {
  const memoryDanger = (snap?.memory?.oom_pct ?? 0) > 80;
  const plcDanger = !snap?.plc?.connected;
  const items: Array<{ label: string; value: React.ReactNode; sub?: string; danger?: boolean }> = [
    {
      label: '运行时长',
      value: formatUptime(snap?.service?.uptime_sec ?? 0),
    },
    {
      label: '内存使用',
      value: `${snap?.memory?.oom_pct ?? 0}%`,
      sub: `${snap?.memory?.rss_mb ?? 0}MB / ${snap?.memory?.oom_threshold_mb ?? 0}MB`,
      danger: memoryDanger,
    },
    {
      label: 'PLC 状态',
      value: snap?.plc?.connected ? '在线' : '离线',
      danger: plcDanger,
    },
    {
      label: '活跃批次',
      value: snap?.batches?.active_count ?? 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((i) => (
        <div
          key={i.label}
          className={`p-4 rounded border ${i.danger ? 'bg-red-50 border-red-300' : 'bg-card'}`}
        >
          <div className="text-sm text-muted-foreground">{i.label}</div>
          <div className={`text-2xl font-bold ${i.danger ? 'text-red-700' : ''}`}>{i.value}</div>
          {i.sub && <div className="text-xs text-muted-foreground mt-1">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}
