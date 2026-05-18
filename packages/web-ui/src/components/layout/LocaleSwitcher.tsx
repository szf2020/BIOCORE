'use client';

import React from 'react';
import { useLocale } from '@/i18n/useLocale';

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-0.5 shrink-0" aria-label="语言切换">
      <button
        type="button"
        aria-pressed={locale === 'zh'}
        onClick={() => setLocale('zh')}
        className={`px-2 py-1 text-xs rounded-l transition-colors ${
          locale === 'zh'
            ? 'bg-primary text-primary-foreground font-semibold'
            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        中文
      </button>
      <button
        type="button"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
        className={`px-2 py-1 text-xs rounded-r transition-colors ${
          locale === 'en'
            ? 'bg-primary text-primary-foreground font-semibold'
            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
