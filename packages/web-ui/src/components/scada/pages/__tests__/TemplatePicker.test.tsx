import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TemplatePicker } from '../TemplatePicker';

// SP-FX-41: mock BUILTIN_TEMPLATES for TemplatePicker builtin section tests
vi.mock('@/scada-engine/templates', () => ({
  BUILTIN_TEMPLATES: [
    {
      id: 'builtin-cstr',
      name: 'CSTR 连续搅拌反应器',
      description: 'CSTR 模板',
      widgetCount: 8,
      view: { id: 'builtin-cstr', name: 'CSTR', type: 'svg', svgcontent: '<svg></svg>', width: 900, height: 680, items: {}, variables: {}, schemaVersion: 1 },
    },
    {
      id: 'builtin-pfr',
      name: 'PFR 活塞流反应器',
      description: 'PFR 模板',
      widgetCount: 7,
      view: { id: 'builtin-pfr', name: 'PFR', type: 'svg', svgcontent: '<svg></svg>', width: 900, height: 600, items: {}, variables: {}, schemaVersion: 1 },
    },
  ],
}));

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

  // SP-FX-41: builtin templates section tests
  describe('builtin templates section', () => {
    it('显示 "内置模板" 分组标题', () => {
      render(<TemplatePicker projectId="p1" onPick={vi.fn()} onCancel={() => {}} />);
      expect(screen.getByTestId('builtin-templates-section')).toBeTruthy();
    });

    it('渲染 2 个内置模板按钮（mock 数据有 2 个）', () => {
      render(<TemplatePicker projectId="p1" onPick={vi.fn()} onCancel={() => {}} />);
      const btns = screen.getAllByTestId('builtin-template-btn');
      expect(btns).toHaveLength(2);
    });

    it('点击内置模板按钮 → onPick 含 __builtin__: 前缀', async () => {
      const onPick = vi.fn();
      render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
      const btns = screen.getAllByTestId('builtin-template-btn');
      await act(async () => { fireEvent.click(btns[0]); });
      expect(onPick).toHaveBeenCalledWith('__builtin__:builtin-cstr');
    });

    it('"空白" button 在内置模板存在时仍可用', async () => {
      const onPick = vi.fn();
      render(<TemplatePicker projectId="p1" onPick={onPick} onCancel={() => {}} />);
      await act(async () => { fireEvent.click(screen.getByText('空白')); });
      expect(onPick).toHaveBeenCalledWith(null);
    });

    it('server 模板分组与内置模板分组共存', () => {
      render(<TemplatePicker projectId="p1" onPick={vi.fn()} onCancel={() => {}} />);
      // server templates
      expect(screen.getByText('Plant Template')).toBeTruthy();
      // builtin templates section
      expect(screen.getByTestId('builtin-templates-section')).toBeTruthy();
      expect(screen.getByText('CSTR 连续搅拌反应器')).toBeTruthy();
    });
  });
});
