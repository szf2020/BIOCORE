'use client';
/**
 * UpdateToast — SP-FX-44
 *
 * Service Worker 新版本就绪时显示 toast 提示。
 * 使用 useServiceWorker hook 检测 updateReady 状态。
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useServiceWorker } from '@/hooks/useServiceWorker';

export function UpdateToast() {
  const { updateReady, skipWaiting } = useServiceWorker();

  if (!updateReady) return null;

  return (
    <div
      data-testid="update-toast"
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-primary/30 bg-card max-w-sm w-[calc(100%-2rem)]"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">新版本可用</p>
        <p className="text-xs text-muted-foreground mt-0.5">刷新页面以使用最新功能</p>
      </div>

      <button
        type="button"
        onClick={skipWaiting}
        data-testid="update-reload-btn"
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        立即刷新
      </button>
    </div>
  );
}
