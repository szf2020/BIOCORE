import React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';

beforeAll(() => {
  ensureBuiltinSvgWidgetsRegistered();
});

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgWidgetInstance link', () => {
  it('wraps in <a> when item.link.viewId is set', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      link: { viewId: 'next-view' },
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('/scada2/next-view');
  });

  it('does NOT wrap in <a> when item.link is undefined', () => {
    const item: SvgWidgetItem = { id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10 };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('does NOT wrap in <a> when editMode prop is true', () => {
    const item: SvgWidgetItem = {
      id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 10, h: 10,
      link: { viewId: 'next-view' },
    };
    const { container } = renderInSvg(<SvgWidgetInstance instance={item} reactorId="F01" editMode />);
    expect(container.querySelector('a')).toBeNull();
  });
});
