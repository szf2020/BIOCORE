import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TemplatePicker } from '../TemplatePicker';

const mocks = {
  templates: [
    { view_id: 't1', name: 'Plant Template', is_template: 1, display_order: 0 },
    { view_id: 't2', name: 'Reactor Template', is_template: 1, display_order: 1 },
  ] as Array<{ view_id: string; name: string; is_template: number; display_order: number }>,
  loading: false,
  error: null as Error | null,
  refetch: vi.fn(async () => {}),
};

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: mocks.templates, loading: mocks.loading, error: mocks.error, refetch: mocks.refetch }),
}));

beforeEach(() => {
  mocks.templates = [
    { view_id: 't1', name: 'Plant Template', is_template: 1, display_order: 0 },
    { view_id: 't2', name: 'Reactor Template', is_template: 1, display_order: 1 },
  ];
  mocks.loading = false;
  mocks.error = null;
  mocks.refetch.mockClear();
});

describe('TemplatePicker', () => {
  it('renders "空白" + each template option', () => {
    const onPick = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
    expect(screen.getByText('空白')).toBeTruthy();
    expect(screen.getByText('Plant Template')).toBeTruthy();
    expect(screen.getByText('Reactor Template')).toBeTruthy();
  });

  it('picking a template calls onPick with its view_id', async () => {
    const onPick = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('Plant Template')); });
    expect(onPick).toHaveBeenCalledWith('t1');
  });

  it('picking "空白" calls onPick with null', async () => {
    const onPick = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByText('空白')); });
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<TemplatePicker projectId="p1" onPick={() => {}} onCancel={onCancel} />);
    await act(async () => { fireEvent.click(screen.getByText('取消')); });
    expect(onCancel).toHaveBeenCalled();
  });

  describe('templates fetch error', () => {
    it('shows error banner with retry button when useTemplates returns error', () => {
      mocks.templates = [];
      mocks.error = new Error('HTTP 503 (db down)');
      render(<TemplatePicker projectId="p1" onPick={() => {}} onCancel={() => {}} />);
      const banner = screen.getByTestId('templates-error-banner');
      expect(banner.textContent).toContain('HTTP 503');
      expect(screen.getByTestId('templates-retry-btn')).toBeTruthy();
    });

    it('retry button calls refetch', async () => {
      mocks.templates = [];
      mocks.error = new Error('HTTP 503');
      render(<TemplatePicker projectId="p1" onPick={() => {}} onCancel={() => {}} />);
      await act(async () => { fireEvent.click(screen.getByTestId('templates-retry-btn')); });
      expect(mocks.refetch).toHaveBeenCalled();
    });

    it('"空白" option is still available when templates errored', async () => {
      mocks.templates = [];
      mocks.error = new Error('HTTP 503');
      const onPick = vi.fn();
      render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
      await act(async () => { fireEvent.click(screen.getByText('空白')); });
      expect(onPick).toHaveBeenCalledWith(null);
    });
  });
});
