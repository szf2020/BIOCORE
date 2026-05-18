import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Page from '../page';

const navMock = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => navMock,
  useSearchParams: () => ({ get: (k: string) => (k === 'project' ? 'p1' : null) }),
}));

const createMock = vi.fn();
vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    create: createMock, rename: vi.fn(), delete: vi.fn(), reorder: vi.fn(), setTemplate: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [{ view_id: 't1', name: 'T1', is_template: 1, display_order: 0 }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  navMock.push.mockClear();
  navMock.replace.mockClear();
  createMock.mockReset();
});

describe('/scada2/edit/new', () => {
  it('blank create: user types name, picks 空白, submits → POST with no clone_from', async () => {
    createMock.mockResolvedValueOnce('new-view-1');
    render(<Page />);
    const input = screen.getByTestId('new-view-name') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'New View' } }); });
    await act(async () => { fireEvent.click(screen.getByText('空白')); });
    await act(async () => { fireEvent.click(screen.getByText('创建')); });
    expect(createMock).toHaveBeenCalledWith('New View', { cloneFrom: undefined });
    expect(navMock.replace).toHaveBeenCalledWith('/scada2/edit-v2/new-view-1');
  });

  it('clone create: user picks template, submits → POST with clone_from', async () => {
    createMock.mockResolvedValueOnce('new-view-2');
    render(<Page />);
    const input = screen.getByTestId('new-view-name') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Clone View' } }); });
    await act(async () => { fireEvent.click(screen.getByText('T1')); });
    await act(async () => { fireEvent.click(screen.getByText('创建')); });
    expect(createMock).toHaveBeenCalledWith('Clone View', { cloneFrom: 't1' });
  });

  it('create failure shows error and does not navigate', async () => {
    createMock.mockRejectedValueOnce(new Error('boom'));
    render(<Page />);
    const input = screen.getByTestId('new-view-name') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'Bad' } }); });
    await act(async () => { fireEvent.click(screen.getByText('空白')); });
    await act(async () => { fireEvent.click(screen.getByText('创建')); });
    expect(navMock.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('new-view-error').textContent).toMatch(/boom/);
  });
});
