'use client';
/**
 * /offline — 离线 fallback 页面 (SP-FX-44)
 *
 * Service Worker navigate 失败时重定向至此页。
 * 显示: 离线图标 / 标题 / 重试按钮 / 缓存的最近 view 列表
 */

import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, ExternalLink } from 'lucide-react';

interface CachedView {
  id: string;
  name: string;
}

/** 从 localStorage 读取上次缓存的 view 列表 */
function loadCachedViews(): CachedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('biocore_cached_views');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function OfflinePage() {
  const [cachedViews, setCachedViews] = useState<CachedView[]>([]);

  useEffect(() => {
    setCachedViews(loadCachedViews());
  }, []);

  function handleRetry() {
    window.location.reload();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* 离线图标 */}
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <WifiOff className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
      </div>

      {/* 标题 */}
      <h1 className="text-2xl font-bold text-foreground mb-2">您当前处于离线状态</h1>
      <p className="text-muted-foreground text-center mb-8 max-w-sm">
        请检查网络连接后重试。已缓存的数据仍可查看。
      </p>

      {/* 重试按钮 */}
      <button
        type="button"
        onClick={handleRetry}
        data-testid="retry-btn"
        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors mb-10"
      >
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        重新连接
      </button>

      {/* 缓存的最近 view 列表 */}
      {cachedViews.length > 0 && (
        <div className="w-full max-w-sm">
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            最近缓存的视图
          </h2>
          <ul className="space-y-2" data-testid="cached-views-list">
            {cachedViews.map((view) => (
              <li key={view.id}>
                <a
                  href={`/scada2/${view.id}`}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-accent transition-colors text-sm"
                >
                  <span className="text-foreground font-medium">{view.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
