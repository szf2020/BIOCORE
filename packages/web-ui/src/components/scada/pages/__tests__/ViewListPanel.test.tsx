import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ViewListPanel } from '../ViewListPanel';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (_k: string) => null }),
  useRouter: () => ({ replace: mockReplace }),
}));

const mockViews = [
  { view_id: 'v1', name: 'Plant Overview', is_template: 0, display_order: 0 },
  { view_id: 'v2', name: 'Reactor 3', is_template: 0, display_order: 1 },
];
const mockTemplates = [{ view_id: 't1', name: 'Template 1', is_template: 1, display_order: 0 }];

const mocks = {
  views: mockViews,
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(async () => {}),
  create: vi.fn(async (_name: string, _opts?: any) => 'new-id'),
  rename: vi.fn(async () => {}),
  delete: vi.fn(async () => {}),
  reorder: vi.fn(async () => {}),
  setTemplate: vi.fn(async () => {}),
  templates: mockTemplates,
};

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({ views: mocks.views, total: mocks.views.length, loading: mocks.loading, error: mocks.error, refetch: mocks.refetch }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: mocks.templates, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    create: mocks.create, rename: mocks.rename, delete: mocks.delete,
    reorder: mocks.reorder, setTemplate: mocks.setTemplate,
  }),
}));

beforeEach(() => {
  mocks.views = [...mockViews];
  mocks.loading = false;
  mocks.error = null;
  mocks.refetch.mockClear();
  mocks.create.mockClear();
  mocks.rename.mockClear();
  mocks.delete.mockClear();
  mocks.reorder.mockClear();
  // SP-FX-FF.49: cards-only mode after toolbar removal — no localStorage seeding.
});

describe('ViewListPanel', () => {
  it('renders view names', () => {
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText('Plant Overview')).toBeTruthy();
    expect(screen.getByText('Reactor 3')).toBeTruthy();
  });

  it('shows empty state when no views', () => {
    mocks.views = [];
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText(/没有画面/)).toBeTruthy();
  });

  it('loading state renders skeleton', () => {
    mocks.loading = true;
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText(/加载中/)).toBeTruthy();
  });

  // SP-FX-FF.49: list mode + sticky toolbar 取消, cards-only。delete 走 ViewCard.
  it('delete confirmation calls mutations.delete (cards mode)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ViewListPanel projectId="p1" />);
    const card = screen.getAllByTestId('view-card')[1];
    const delBtn = card.querySelector('[data-testid="view-card-delete-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(delBtn); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith('v2');
    confirmSpy.mockRestore();
  });

  it('delete failure shows banner (cards mode)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.delete.mockRejectedValueOnce(new Error('HTTP 500'));
    render(<ViewListPanel projectId="p1" />);
    const card = screen.getAllByTestId('view-card')[1];
    await act(async () => { fireEvent.click(card.querySelector('[data-testid="view-card-delete-btn"]') as HTMLButtonElement); });
    const banner = await screen.findByTestId('mutation-error-banner');
    expect(banner.textContent).toContain('HTTP 500');
    expect(screen.getByText('Reactor 3')).toBeTruthy();
    confirmSpy.mockRestore();
  });

  // SP-FX-FF.48: SearchBar (search input + sort + tag chips) 整个组件取消。
  describe('search bar removed', () => {
    it('does not render view-search-bar element', () => {
      mocks.views = [
        { view_id: 'v1', name: 'demo_alpha', is_template: 0, display_order: 0 },
        { view_id: 'v2', name: 'prod_beta', is_template: 0, display_order: 1 },
      ];
      render(<ViewListPanel projectId="p1" />);
      expect(screen.queryByTestId('view-search-bar')).toBeNull();
      expect(screen.queryByTestId('tag-chip-demo')).toBeNull();
      expect(screen.queryByTestId('tag-chip-prod')).toBeNull();
    });
  });
});
