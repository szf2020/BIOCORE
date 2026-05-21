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
  // Default to list mode for existing tests that use [data-testid="view-row"]
  localStorage.setItem('biocore.scada.viewListMode', 'list');
});

describe('ViewListPanel', () => {
  it('renders view rows', () => {
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText('Plant Overview')).toBeTruthy();
    expect(screen.getByText('Reactor 3')).toBeTruthy();
  });

  it('shows empty state when no views', () => {
    mocks.views = [];
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText(/没有画面/)).toBeTruthy();
  });

  it('rename button triggers inline rename', async () => {
    render(<ViewListPanel projectId="p1" />);
    const row = screen.getByText('Plant Overview').closest('[data-testid="view-row"]')!;
    const renameBtn = row.querySelector('[data-testid="rename-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(renameBtn); });
    const input = row.querySelector('input[data-testid="rename-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Renamed' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(mocks.rename).toHaveBeenCalledWith('v1', 'Renamed');
  });

  it('delete confirmation calls mutations.delete', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ViewListPanel projectId="p1" />);
    const row = screen.getByText('Reactor 3').closest('[data-testid="view-row"]')!;
    const delBtn = row.querySelector('[data-testid="delete-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(delBtn); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith('v2');
    confirmSpy.mockRestore();
  });

  it('move-up button reorders adjacent rows', async () => {
    render(<ViewListPanel projectId="p1" />);
    const row = screen.getByText('Reactor 3').closest('[data-testid="view-row"]')!;
    const upBtn = row.querySelector('[data-testid="move-up-btn"]') as HTMLButtonElement;
    await act(async () => { fireEvent.click(upBtn); });
    expect(mocks.reorder).toHaveBeenCalledWith(['v2', 'v1']);
  });

  it('loading state renders skeleton', () => {
    mocks.loading = true;
    render(<ViewListPanel projectId="p1" />);
    expect(screen.getByText(/加载中/)).toBeTruthy();
  });

  describe('mutation error banner', () => {
    it('rename failure shows dismissible banner with error message', async () => {
      mocks.rename.mockRejectedValueOnce(new Error('HTTP 409 (name taken)'));
      render(<ViewListPanel projectId="p1" />);
      const row = screen.getByText('Plant Overview').closest('[data-testid="view-row"]')!;
      await act(async () => { fireEvent.click(row.querySelector('[data-testid="rename-btn"]') as HTMLButtonElement); });
      const input = row.querySelector('input[data-testid="rename-input"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Renamed' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      const banner = await screen.findByTestId('mutation-error-banner');
      expect(banner.textContent).toContain('HTTP 409');
      const dismiss = banner.querySelector('[data-testid="dismiss-error-btn"]') as HTMLButtonElement;
      await act(async () => { fireEvent.click(dismiss); });
      expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
    });

    it('delete failure shows banner and view remains listed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mocks.delete.mockRejectedValueOnce(new Error('HTTP 500'));
      render(<ViewListPanel projectId="p1" />);
      const row = screen.getByText('Reactor 3').closest('[data-testid="view-row"]')!;
      await act(async () => { fireEvent.click(row.querySelector('[data-testid="delete-btn"]') as HTMLButtonElement); });
      const banner = await screen.findByTestId('mutation-error-banner');
      expect(banner.textContent).toContain('HTTP 500');
      expect(screen.getByText('Reactor 3')).toBeTruthy();
      confirmSpy.mockRestore();
    });

    it('reorder failure shows banner', async () => {
      mocks.reorder.mockRejectedValueOnce(new Error('HTTP 503'));
      render(<ViewListPanel projectId="p1" />);
      const row = screen.getByText('Reactor 3').closest('[data-testid="view-row"]')!;
      await act(async () => { fireEvent.click(row.querySelector('[data-testid="move-up-btn"]') as HTMLButtonElement); });
      const banner = await screen.findByTestId('mutation-error-banner');
      expect(banner.textContent).toContain('HTTP 503');
    });

    it('successful mutation after failure clears the banner', async () => {
      mocks.rename.mockRejectedValueOnce(new Error('HTTP 409'));
      render(<ViewListPanel projectId="p1" />);
      const row = screen.getByText('Plant Overview').closest('[data-testid="view-row"]')!;
      await act(async () => { fireEvent.click(row.querySelector('[data-testid="rename-btn"]') as HTMLButtonElement); });
      let input = row.querySelector('input[data-testid="rename-input"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: 'X' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(await screen.findByTestId('mutation-error-banner')).toBeTruthy();
      await act(async () => { fireEvent.click(row.querySelector('[data-testid="rename-btn"]') as HTMLButtonElement); });
      input = row.querySelector('input[data-testid="rename-input"]') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: 'Y' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      expect(screen.queryByTestId('mutation-error-banner')).toBeNull();
    });
  });

  describe('view mode toggle', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('defaults to cards mode', () => {
      render(<ViewListPanel projectId="p1" />);
      expect(screen.getByTestId('view-mode-cards')).toBeTruthy();
    });

    it('restores list mode from localStorage', () => {
      localStorage.setItem('biocore.scada.viewListMode', 'list');
      render(<ViewListPanel projectId="p1" />);
      expect(screen.getAllByTestId('view-row').length).toBeGreaterThan(0);
    });

    it('clicking list toggle switches to list mode', async () => {
      render(<ViewListPanel projectId="p1" />);
      await act(async () => { fireEvent.click(screen.getByTestId('view-mode-list')); });
      expect(screen.getAllByTestId('view-row').length).toBeGreaterThan(0);
      expect(localStorage.getItem('biocore.scada.viewListMode')).toBe('list');
    });

    it('clicking cards toggle from list switches to cards mode', async () => {
      localStorage.setItem('biocore.scada.viewListMode', 'list');
      render(<ViewListPanel projectId="p1" />);
      await act(async () => { fireEvent.click(screen.getByTestId('view-mode-cards')); });
      expect(screen.getAllByTestId('view-card').length).toBeGreaterThan(0);
      expect(localStorage.getItem('biocore.scada.viewListMode')).toBe('cards');
    });
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
