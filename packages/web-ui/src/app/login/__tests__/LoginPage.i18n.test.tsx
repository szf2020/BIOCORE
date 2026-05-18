// SP-FX-26 T9: LoginPage i18n 验证
// 验证: zh locale 渲染中文, en locale 渲染英文
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/useLocale';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: (_k: string) => null }),
  usePathname: () => '/login',
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn() }),
}));

import LoginPage from '../page';

describe('LoginPage i18n', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('zh locale: 提交按钮显示中文"登录"', () => {
    localStorage.setItem('biocore.locale', 'zh');
    render(
      <LocaleProvider>
        <LoginPage />
      </LocaleProvider>
    );
    expect(screen.getByRole('button', { name: /登录/ })).toBeTruthy();
  });

  it('en locale: submit button shows "Sign In"', () => {
    localStorage.setItem('biocore.locale', 'en');
    render(
      <LocaleProvider>
        <LoginPage />
      </LocaleProvider>
    );
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeTruthy();
  });

  it('zh locale: 用户名 label 显示中文', () => {
    localStorage.setItem('biocore.locale', 'zh');
    render(
      <LocaleProvider>
        <LoginPage />
      </LocaleProvider>
    );
    expect(screen.getByText(/用户名/)).toBeTruthy();
  });

  it('en locale: username label shows English', () => {
    localStorage.setItem('biocore.locale', 'en');
    render(
      <LocaleProvider>
        <LoginPage />
      </LocaleProvider>
    );
    expect(screen.getByText(/Username/i)).toBeTruthy();
  });
});
