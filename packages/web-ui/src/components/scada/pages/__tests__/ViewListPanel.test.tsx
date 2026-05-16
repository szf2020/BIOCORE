import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ViewListPanel } from '../ViewListPanel';

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
  useViewList: () => ({ views: mocks.views, loading: mocks.loading, error: mocks.error, refetch: mocks.refetch }),
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
});
