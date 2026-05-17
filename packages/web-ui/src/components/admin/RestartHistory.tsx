// ============================================================
// RestartHistory — 重启统计 + 崩溃诊断包列表 (T41)
// ============================================================
'use client';

import React from 'react';

export interface RestartSnap {
  restarts: { last_24h: number; since_install: number; last_reason?: string | null };
  crashes: { total: number; files: Array<{ name: string; ts?: string }> };
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function RestartHistory({ snap }: { snap: RestartSnap }) {
  const files = snap?.crashes?.files ?? [];
  return (
    <div className="bg-card border rounded p-3">
      <h2 className="font-semibold mb-2 text-sm">最近重启与崩溃</h2>
      <div className="text-sm space-y-1">
        <p>
          最近 24h 重启：<strong>{snap?.restarts?.last_24h ?? 0}</strong>
        </p>
        <p>
          累计重启：<strong>{snap?.restarts?.since_install ?? 0}</strong>
        </p>
        <p>
          最近原因：<code className="text-sm">{snap?.restarts?.last_reason ?? '—'}</code>
        </p>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          诊断包列表（{snap?.crashes?.total ?? 0}）
        </summary>
        <ul className="text-sm font-mono mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.name}>
              <a
                href={`${API}/api/v1/admin/crashes/${encodeURIComponent(f.name)}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {f.name}
              </a>
              {f.ts && <span className="text-muted-foreground ml-2">{f.ts}</span>}
            </li>
          ))}
          {files.length === 0 && <li className="text-muted-foreground">无崩溃记录</li>}
        </ul>
      </details>
    </div>
  );
}
