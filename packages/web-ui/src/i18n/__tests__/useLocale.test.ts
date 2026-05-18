import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocale, LocaleProvider } from '../useLocale';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (_k: string) => null }),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
}));

describe('useLocale', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('默认 locale 是 zh', () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: LocaleProvider,
    });
    expect(result.current.locale).toBe('zh');
  });

  it('setLocale 切换到 en', async () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: LocaleProvider,
    });
    await act(async () => {
      result.current.setLocale('en');
    });
    expect(result.current.locale).toBe('en');
  });

  it('setLocale 持久化到 localStorage', async () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: LocaleProvider,
    });
    await act(async () => {
      result.current.setLocale('en');
    });
    expect(localStorage.getItem('biocore.locale')).toBe('en');
  });

  it('localStorage 已存 en 时初始 locale 为 en', () => {
    localStorage.setItem('biocore.locale', 'en');
    const { result } = renderHook(() => useLocale(), {
      wrapper: LocaleProvider,
    });
    expect(result.current.locale).toBe('en');
  });

  it('未知 key fallback to key 本身', () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: LocaleProvider,
    });
    const translated = result.current.t('nonexistent.key.foo');
    expect(translated).toBe('nonexistent.key.foo');
  });

  it('{{name}} 插值替换', async () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: LocaleProvider,
    });
    // key 不在字典时 fallback = key 本身，插值仍应应用
    const translated = result.current.t('hello {{name}} world', { name: 'Alice' });
    expect(translated).toBe('hello Alice world');
  });
});
