/**
 * useServiceWorker — SP-FX-44
 *
 * 注册 Service Worker，并检测新版本等待激活。
 * 当有新 SW 版本时，updateReady = true，
 * 调用 skipWaiting() → postMessage({ type: 'SKIP_WAITING' }) → window.location.reload()
 */

import { useEffect, useState, useCallback } from 'react';

export interface UseServiceWorkerResult {
  /** 是否有新版本等待激活 */
  updateReady: boolean;
  /** 触发 SKIP_WAITING + 刷新页面 */
  skipWaiting: () => void;
}

export function useServiceWorker(): UseServiceWorkerResult {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      // 已有 waiting worker (SW 刚安装完毕)
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateReady(true);
      }

      // 安装新 SW 时触发
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            // 有旧 controller → 新版本就绪
            setWaitingWorker(installing);
            setUpdateReady(true);
          }
        });
      });
    }).catch(() => {
      // SW 注册失败时静默 — 不影响主应用
    });
  }, []);

  const skipWaiting = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    // 等 SW 控制权交接后刷新
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }, [waitingWorker]);

  return { updateReady, skipWaiting };
}
