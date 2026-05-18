// SP-FX-25: ViewListPanel sticky toolbar responsive tests
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (k: string) => ({ page: '1', size: '12', q: '', sort: 'name_asc', tag: '' }[k] ?? null),
  }),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({
    views: [
      { view_id: 'v1', name: 'demo_alpha', display_order: 0, thumbnail_url: null, created_at: '', updated_at: '' },
      { view_id: 'v2', name: 'prod_beta', display_order: 1, thumbnail_url: null, created_at: '', updated_at: '' },
    ],
    total: 2,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    rename: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    create: vi.fn(),
  }),
}));

import { ViewListPanel } from '../ViewListPanel';

describe('ViewListPanel mobile sticky toolbar (SP-FX-25)', () => {
  it('sticky-toolbar-container 存在', () => {
    const { getByTestId } = render(<ViewListPanel projectId="default" />);
    expect(getByTestId('sticky-toolbar-container')).toBeTruthy();
  });

  it('sticky-toolbar-container 含 sticky class', () => {
    const { getByTestId } = render(<ViewListPanel projectId="default" />);
    const el = getByTestId('sticky-toolbar-container');
    expect(el.className).toContain('sticky');
  });

  it('ViewCardGrid grid 容器在 DOM 中存在 (含 grid class)', () => {
    const { container } = render(<ViewListPanel projectId="default" />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
  });

  it('sticky toolbar 包含 view-search-bar', () => {
    const { getByTestId } = render(<ViewListPanel projectId="default" />);
    const toolbar = getByTestId('sticky-toolbar-container');
    const searchBar = toolbar.querySelector('[data-testid="view-search-bar"]');
    expect(searchBar).toBeTruthy();
  });
});
