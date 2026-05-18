'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type Locale, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isValidLocale } from './locale';
import dictZh from './dict-zh.json';
import dictEn from './dict-en.json';

// ── 字典 ──────────────────────────────────────────────────────────────────
const DICTS: Record<Locale, Record<string, string>> = {
  zh: dictZh as Record<string, string>,
  en: dictEn as Record<string, string>,
};

// ── 工具函数 ───────────────────────────────────────────────────────────────
function interpolate(str: string, params?: Record<string, string>): string {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
}

function readStored(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const v = localStorage.getItem(LOCALE_STORAGE_KEY);
  return isValidLocale(v) ? v : DEFAULT_LOCALE;
}

// ── Context ───────────────────────────────────────────────────────────────
interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 初次挂载: URL ?lang= > localStorage > 默认 zh
  useEffect(() => {
    const urlLang = searchParams.get('lang');
    if (isValidLocale(urlLang)) {
      setLocaleState(urlLang);
      try { localStorage.setItem(LOCALE_STORAGE_KEY, urlLang); } catch { /* private mode */ }
    } else {
      setLocaleState(readStored());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, l); } catch { /* private mode */ }
    // URL 双向同步
    const params = new URLSearchParams(searchParams.toString());
    if (l === DEFAULT_LOCALE) {
      params.delete('lang');
    } else {
      params.set('lang', l);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [router, pathname, searchParams]);

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const dict = DICTS[locale];
    const raw = dict[key] ?? key;
    return interpolate(raw, params);
  }, [locale]);

  const value: LocaleContextValue = { locale, setLocale, t };
  return React.createElement(LocaleContext.Provider, { value }, children);
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // 在 Provider 外使用时返回 zh 默认值 (graceful degradation)
    const t = (key: string, params?: Record<string, string>) => {
      const raw = DICTS['zh'][key] ?? key;
      return interpolate(raw, params);
    };
    return { locale: 'zh', setLocale: () => {}, t };
  }
  return ctx;
}

export type { Locale, LocaleContextValue };
