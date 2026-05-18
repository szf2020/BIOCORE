// SP-FX-26 T9: SCADA pages i18n 验证
// 验证: zh locale 渲染中文, en locale 渲染英文
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/useLocale';

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (_k: string) => null }),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/',
}));

import { ViewListSearchBar } from '../ViewListSearchBar';
import { ViewPaginator } from '../ViewPaginator';

const searchBarProps = {
  q: '',
  sort: 'name_asc' as const,
  tags: [],
  availableTags: [],
  onChange: vi.fn(),
};

const paginatorProps = {
  page: 1,
  total: 100,
  size: 12,
  onPageChange: vi.fn(),
  onSizeChange: vi.fn(),
};

describe('SCADA pages i18n (SP-FX-26)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ViewListSearchBar: zh locale placeholder 含中文', () => {
    localStorage.setItem('biocore.locale', 'zh');
    render(
      <LocaleProvider>
        <ViewListSearchBar {...searchBarProps} />
      </LocaleProvider>
    );
    const input = screen.getByTestId('view-search-input') as HTMLInputElement;
    expect(input.placeholder).toMatch(/搜索/);
  });

  it('ViewListSearchBar: en locale placeholder is English', () => {
    localStorage.setItem('biocore.locale', 'en');
    render(
      <LocaleProvider>
        <ViewListSearchBar {...searchBarProps} />
      </LocaleProvider>
    );
    const input = screen.getByTestId('view-search-input') as HTMLInputElement;
    expect(input.placeholder).toMatch(/[Ss]earch/);
  });

  it('ViewPaginator: zh locale 显示"共"', () => {
    localStorage.setItem('biocore.locale', 'zh');
    render(
      <LocaleProvider>
        <ViewPaginator {...paginatorProps} />
      </LocaleProvider>
    );
    expect(screen.getByText(/共/)).toBeTruthy();
  });

  it('ViewPaginator: en locale shows "Total"', () => {
    localStorage.setItem('biocore.locale', 'en');
    render(
      <LocaleProvider>
        <ViewPaginator {...paginatorProps} />
      </LocaleProvider>
    );
    expect(screen.getByText(/Total/i)).toBeTruthy();
  });
});
