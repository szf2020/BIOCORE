import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Palette } from '../Palette';

describe('Palette component (SP-FX-4)', () => {
  it('renders 3 palette items', () => {
    const { container } = render(<Palette />);
    const items = container.querySelectorAll('[data-palette-item]');
    expect(items.length).toBe(3);
  });

  it('each item is draggable', () => {
    const { container } = render(<Palette />);
    const items = container.querySelectorAll('[data-palette-item]');
    items.forEach((item) => {
      expect(item.getAttribute('draggable')).toBe('true');
    });
  });

  it('renders Chinese labels 矩形 椭圆 文本', () => {
    const { getByText } = render(<Palette />);
    expect(getByText('矩形')).not.toBeNull();
    expect(getByText('椭圆')).not.toBeNull();
    expect(getByText('文本')).not.toBeNull();
  });

  it('dragstart on rect item sets dataTransfer palette-item=rect + effectAllowed=copy', () => {
    const { container } = render(<Palette />);
    const rectItem = container.querySelector('[data-palette-item="rect"]') as HTMLElement;
    let recordedType = '';
    let recordedEffect = '';
    const dataTransfer = {
      setData: (k: string, v: string) => { if (k === 'palette-item') recordedType = v; },
      effectAllowed: '',
    } as unknown as DataTransfer;
    Object.defineProperty(dataTransfer, 'effectAllowed', {
      set(v: string) { recordedEffect = v; },
      get() { return recordedEffect; },
    });
    fireEvent.dragStart(rectItem, { dataTransfer });
    expect(recordedType).toBe('rect');
    expect(recordedEffect).toBe('copy');
  });

  it('items rendered as <li> inside <ul data-panel="palette">', () => {
    const { container } = render(<Palette />);
    const ul = container.querySelector('ul[data-panel="palette"]');
    expect(ul).not.toBeNull();
    // Avoid :scope > li selector (jsdom/nwsapi bug with className containing brackets).
    // Filter children to LI elements via direct DOM API.
    const lis = Array.from(ul!.children).filter((c) => c.tagName === 'LI');
    expect(lis.length).toBe(3);
  });
});
