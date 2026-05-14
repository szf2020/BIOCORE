// 三态主题切换 — light / dark / system
// 持久化: localStorage 'biocore_theme'
// 系统模式: 监听 prefers-color-scheme 变化
'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'biocore_theme';

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return (v === 'light' || v === 'dark' || v === 'system') ? v : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>('system');

  // 初次挂载: 读取偏好并应用
  useEffect(() => {
    const initial = readStored();
    setModeState(initial);
    applyTheme(initial);
  }, []);

  // system 模式下监听 OS 变化
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
    applyTheme(next);
  }, []);

  // 循环: light → dark → system → light
  const cycle = useCallback(() => {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    setMode(next);
  }, [mode, setMode]);

  return { mode, setMode, cycle };
}
