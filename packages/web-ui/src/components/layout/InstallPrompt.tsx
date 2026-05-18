'use client';
/**
 * InstallPrompt — SP-FX-44
 *
 * 监听 beforeinstallprompt 事件，显示 "添加到主屏幕" banner。
 * localStorage key 'biocore_install_dismissed' 控制是否再次显示。
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Download, X } from 'lucide-react';

// BeforeInstallPromptEvent 是非标准 API，需手动声明
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'biocore_install_dismissed';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined') return;

    // 已经 dismissed → 不再提示
    if (localStorage.getItem(DISMISSED_KEY) === '1') return;

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setDeferredPrompt(null);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // localStorage 不可用时静默
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      data-testid="install-prompt"
      role="banner"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border border-border bg-card max-w-sm w-[calc(100%-2rem)]"
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
           style={{ background: 'linear-gradient(135deg, #0F766E, #005c55)' }}>
        <Download className="w-4 h-4 text-white" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">安装 BIOCore</p>
        <p className="text-xs text-muted-foreground mt-0.5">添加到主屏幕，随时快速访问</p>
      </div>

      <button
        type="button"
        onClick={handleInstall}
        data-testid="install-btn"
        className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        安装
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        data-testid="dismiss-btn"
        aria-label="关闭安装提示"
        className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
