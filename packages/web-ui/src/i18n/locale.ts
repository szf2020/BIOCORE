export type Locale = 'zh' | 'en';

export const LOCALE_STORAGE_KEY = 'biocore.locale';
export const DEFAULT_LOCALE: Locale = 'zh';

export function isValidLocale(v: unknown): v is Locale {
  return v === 'zh' || v === 'en';
}
