import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/widgets', () => ({
  BoundWidget: ({ widget }: any) => <div data-testid="bw" data-id={widget.id} />,
}));

import { WidgetItem } from '../WidgetItem';

const w = { id: 't1', type: 'tank', x: 10, y: 20, w: 80, h: 200, props: {} } as any;

describe('WidgetItem', () => {
  it('1. not selected: no resize handle, data-selected=0', () => {
    const { container } = render(
      <WidgetItem widget={w} isSelected={false} onSelect={vi.fn()} onMove={vi.fn()} onResize={vi.fn()} />
    );
    expect(container.querySelector('[data-handle="se"]')).toBeNull();
    const wrap = container.querySelector('[data-testid="widget-item"]') as HTMLElement;
    expect(wrap.getAttribute('data-selected')).toBe('0');
  });

  it('2. selected: outline + handle, mousedown on body triggers onSelect(id)', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WidgetItem widget={w} isSelected={true} onSelect={onSelect} onMove={vi.fn()} onResize={vi.fn()} />
    );
    expect(container.querySelector('[data-handle="se"]')).toBeTruthy();
    const wrap = container.querySelector('[data-testid="widget-item"]') as HTMLElement;
    expect(wrap.getAttribute('data-selected')).toBe('1');
    fireEvent.mouseDown(wrap);
    expect(onSelect).toHaveBeenCalledWith('t1');
  });

  it('3. mousedown on handle does NOT call onSelect (handle short-circuits)', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WidgetItem widget={w} isSelected={true} onSelect={onSelect} onMove={vi.fn()} onResize={vi.fn()} />
    );
    onSelect.mockClear();
    const handle = container.querySelector('[data-handle="se"]') as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
