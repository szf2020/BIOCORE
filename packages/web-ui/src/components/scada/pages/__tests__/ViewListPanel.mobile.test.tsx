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

// SP-FX-FF.49: sticky toolbar 取消 (cards/list 切换 + pageSize 已删),原 SP-FX-25
// 测试 obsolete。保留 grid 渲染检查 + 确认 toolbar/searchbar 都不存在。
describe('ViewListPanel mobile (SP-FX-FF.49 cards-only)', () => {
  it('ViewCardGrid grid 容器在 DOM 中存在 (含 grid class)', () => {
    const { container } = render(<ViewListPanel projectId="default" />);
    const grid = container.querySelector('.grid');
    expect(grid).toBeTruthy();
  });

  it('sticky-toolbar-container 已移除', () => {
    const { queryByTestId } = render(<ViewListPanel projectId="default" />);
    expect(queryByTestId('sticky-toolbar-container')).toBeNull();
  });

  it('view-search-bar 已移除', () => {
    const { queryByTestId } = render(<ViewListPanel projectId="default" />);
    expect(queryByTestId('view-search-bar')).toBeNull();
  });
});
