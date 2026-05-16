import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';

beforeAll(() => { ensureBuiltinSvgWidgetsRegistered(); });

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgWidgetInstance writeIntent', () => {
  it('viewer click fires onWriteIntent when writeIntent set', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      writeIntent: { tag: 't1', value: 1 },
    };
    const onWriteIntent = vi.fn();
    const { container } = renderInSvg(
      <SvgWidgetInstance instance={item} reactorId="F01" onWriteIntent={onWriteIntent} />
    );
    const wrapper = container.querySelector('[data-write-intent="true"]') as SVGElement;
    expect(wrapper).not.toBeNull();
    act(() => { fireEvent.click(wrapper); });
    expect(onWriteIntent).toHaveBeenCalledWith(item);
  });

  it('no click wrapper when writeIntent absent', () => {
    const item: SvgWidgetItem = { id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10 };
    const onWriteIntent = vi.fn();
    const { container } = renderInSvg(
      <SvgWidgetInstance instance={item} reactorId="F01" onWriteIntent={onWriteIntent} />
    );
    expect(container.querySelector('[data-write-intent="true"]')).toBeNull();
  });

  it('editMode does not attach click', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      writeIntent: { tag: 't1', value: 1 },
    };
    const onWriteIntent = vi.fn();
    const { container } = renderInSvg(
      <SvgWidgetInstance instance={item} reactorId="F01" editMode onWriteIntent={onWriteIntent} />
    );
    expect(container.querySelector('[data-write-intent="true"]')).toBeNull();
  });
});
