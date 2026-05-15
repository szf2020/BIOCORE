import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/widgets', () => ({
  BoundWidget: ({ widget }: any) => (
    <div
      data-testid="bw"
      data-id={widget.id}
      data-blen={widget.bindings?.length ?? 0}
      data-type={widget.type}
    />
  ),
}));

import { WidgetView } from '../WidgetView';

describe('WidgetView', () => {
  it('1. empty items → 0 BoundWidget rendered', () => {
    const view = {
      view_id: 'v1', project_id: 'p', name: 'V', reactor_id: null,
      width: 800, height: 600, background: '#ffffff',
      items: {}, updated_at: '2026-05-15T00:00:00Z',
    };
    const { container } = render(<WidgetView view={view as any} />);
    expect(container.querySelectorAll('[data-testid="bw"]')).toHaveLength(0);
  });

  it('2. 3 items → 3 BoundWidget with bindings length attribute', () => {
    const view = {
      view_id: 'v1', project_id: 'p', name: 'V', reactor_id: null,
      width: 800, height: 600, background: '#ffffff',
      items: {
        a: { id: 'a', type: 'tank', x: 0, y: 0, w: 10, h: 10, props: {}, bindings: [{ tag: 't', prop: 'fillPct' }] },
        b: { id: 'b', type: 'label', x: 0, y: 0, w: 10, h: 10, props: {} },
        c: { id: 'c', type: 'button', x: 0, y: 0, w: 10, h: 10, props: {}, bindings: [{ tag: 't1', prop: 'x' }, { tag: 't2', prop: 'y' }] },
      },
      updated_at: '2026-05-15T00:00:00Z',
    };
    const { container } = render(<WidgetView view={view as any} />);
    const bws = container.querySelectorAll('[data-testid="bw"]');
    expect(bws).toHaveLength(3);
    const blens = Array.from(bws).map(el => el.getAttribute('data-blen')).sort();
    expect(blens).toEqual(['0', '1', '2']);
  });

  it('3. view.width/height/background applied as inline style on canvas', () => {
    const view = {
      view_id: 'v1', project_id: 'p', name: 'V', reactor_id: null,
      width: 1024, height: 768, background: '#abcdef',
      items: {}, updated_at: '2026-05-15T00:00:00Z',
    };
    const { container } = render(<WidgetView view={view as any} />);
    const canvas = container.querySelector('[data-testid="scada-canvas"]') as HTMLElement;
    expect(canvas).toBeTruthy();
    expect(canvas.style.width).toBe('1024px');
    expect(canvas.style.height).toBe('768px');
    expect(canvas.style.background).toMatch(/#abcdef|rgb\(171, 205, 239\)/i);
  });
});
