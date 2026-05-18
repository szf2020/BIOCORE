import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleSwitcher } from '../LocaleSwitcher';
import { LocaleProvider } from '@/i18n/useLocale';

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (_k: string) => null, toString: () => '' }),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
}));

function renderWithLocale(ui: React.ReactElement) {
  return render(ui, { wrapper: LocaleProvider });
}

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('默认显示 zh 激活状态 (中文)', () => {
    renderWithLocale(<LocaleSwitcher />);
    const zhBtn = screen.getByRole('button', { name: /中文/i });
    expect(zhBtn).toBeDefined();
    expect(zhBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('点击 EN 按钮切换到 en locale', () => {
    renderWithLocale(<LocaleSwitcher />);
    const enBtn = screen.getByRole('button', { name: /EN/i });
    fireEvent.click(enBtn);
    expect(enBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('切换到 en 后，中文按钮 aria-pressed=false', () => {
    renderWithLocale(<LocaleSwitcher />);
    const enBtn = screen.getByRole('button', { name: /EN/i });
    const zhBtn = screen.getByRole('button', { name: /中文/i });
    fireEvent.click(enBtn);
    expect(zhBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('再次点击中文按钮切回 zh', () => {
    renderWithLocale(<LocaleSwitcher />);
    const enBtn = screen.getByRole('button', { name: /EN/i });
    const zhBtn = screen.getByRole('button', { name: /中文/i });
    fireEvent.click(enBtn);
    fireEvent.click(zhBtn);
    expect(zhBtn.getAttribute('aria-pressed')).toBe('true');
  });
});
