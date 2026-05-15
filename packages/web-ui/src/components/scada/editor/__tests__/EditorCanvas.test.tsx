import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

vi.mock('../WidgetItem', () => ({
  WidgetItem: ({ widget, isSelected }: any) => (
    <div data-testid="widget-item" data-id={widget.id} data-selected={isSelected ? '1' : '0'} />
  ),
}));

import { EditorCanvas } from '../EditorCanvas';

describe('EditorCanvas', () => {
  it('1. onDrop fires with extracted type + xy coords', () => {
    const onAdd = vi.fn();
    const view = { width: 800, height: 480, background: '#fff' };
    const { container } = render(
      <EditorCanvas view={view as any} items={{}} selectedId={null} onSelect={vi.fn()} onAdd={onAdd} onMove={vi.fn()} onResize={vi.fn()} />
    );
    const canvas = container.querySelector('[data-testid="scada-edit-canvas"]') as HTMLElement;

    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0, top: 0, width: 800, height: 480,
      right: 800, bottom: 480, x: 0, y: 0,
      toJSON: () => ({}),
    });

    // fireEvent.drop doesn't pass clientX/clientY properly, so manually dispatch
    const evt = new MouseEvent('drop', {
      bubbles: true, cancelable: true,
      clientX: 120, clientY: 80,
    }) as any;
    evt.dataTransfer = {
      getData: (key: string) => (key === 'text/plain' ? 'tank' : ''),
    };
    canvas.dispatchEvent(evt);

    expect(onAdd).toHaveBeenCalledTimes(1);
    const arg = onAdd.mock.calls[0][0];
    expect(arg.type).toBe('tank');
    expect(arg.x).toBe(120);
    expect(arg.y).toBe(80);
  });

  it('2. renders one WidgetItem per item, marks selected', () => {
    const view = { width: 800, height: 480, background: '#fff' };
    const items = {
      a: { id: 'a', type: 'tank', x: 0, y: 0, w: 10, h: 10, props: {} },
      b: { id: 'b', type: 'label', x: 0, y: 0, w: 10, h: 10, props: {} },
    };
    const { container } = render(
      <EditorCanvas view={view as any} items={items as any} selectedId={'a'} onSelect={vi.fn()} onAdd={vi.fn()} onMove={vi.fn()} onResize={vi.fn()} />
    );
    const items_ = container.querySelectorAll('[data-testid="widget-item"]');
    expect(items_).toHaveLength(2);
    const selected = Array.from(items_).find(el => el.getAttribute('data-selected') === '1');
    expect(selected?.getAttribute('data-id')).toBe('a');
  });

  it('3. mousedown on empty canvas → onSelect(null)', () => {
    const onSelect = vi.fn();
    const view = { width: 800, height: 480, background: '#fff' };
    const { container } = render(
      <EditorCanvas view={view as any} items={{}} selectedId={'x'} onSelect={onSelect} onAdd={vi.fn()} onMove={vi.fn()} onResize={vi.fn()} />
    );
    const canvas = container.querySelector('[data-testid="scada-edit-canvas"]') as HTMLElement;
    fireEvent.mouseDown(canvas);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
