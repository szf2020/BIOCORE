import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { WidgetLinkPanel } from '../WidgetLinkPanel';

const mockViews = [
  { view_id: 'v1', name: 'Main', is_template: 0, display_order: 0 },
  { view_id: 'v2', name: 'Secondary', is_template: 0, display_order: 1 },
];

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({ views: mockViews, loading: false, error: null, refetch: vi.fn() }),
}));

beforeEach(() => {
  useEditorStore.getState().__resetForTests({
    width: 800, height: 600,
    items: [{ id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50 }],
  });
});

describe('WidgetLinkPanel', () => {
  it('renders nothing when no widget is selected', () => {
    const { container } = render(<WidgetLinkPanel projectId="p1" />);
    expect(container.querySelector('[data-testid="widget-link-panel"]')).toBeNull();
  });

  it('dropdown lists views; selecting one writes link to the selected widget', async () => {
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetLinkPanel projectId="p1" />);
    const select = screen.getByTestId('widget-link-select') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: 'v2' } }); });
    const item = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect(item.link).toEqual({ viewId: 'v2' });
  });

  it('excludes currentViewId from the dropdown options', () => {
    useEditorStore.getState().select(['w1'], 'replace');
    const { container } = render(<WidgetLinkPanel projectId="p1" currentViewId="v1" />);
    const opts = Array.from(container.querySelectorAll('option')).map(o => (o as HTMLOptionElement).value);
    expect(opts).not.toContain('v1');
    expect(opts).toContain('v2');
  });

  it('clearing the link writes link = undefined', async () => {
    useEditorStore.getState().__resetForTests({
      width: 800, height: 600,
      items: [{ id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50, link: { viewId: 'v2' } }],
    });
    useEditorStore.getState().select(['w1'], 'replace');
    render(<WidgetLinkPanel projectId="p1" />);
    const select = screen.getByTestId('widget-link-select') as HTMLSelectElement;
    await act(async () => { fireEvent.change(select, { target: { value: '' } }); });
    const item = useEditorStore.getState().view.items.find(it => it.id === 'w1')!;
    expect(item.link).toBeUndefined();
  });
});
