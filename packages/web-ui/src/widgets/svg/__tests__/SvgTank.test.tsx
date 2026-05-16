import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgTank } from '../SvgTank';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgTank', () => {
  it('renders background rect and zero-height fill when tagValue is 0', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={0} />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(2);
    expect(rects[1].getAttribute('height')).toBe('0');
  });

  it('renders 50% fill when tagValue is 50', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={50} />);
    const rects = container.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('50');
  });

  it('clamps values above 100 to 100', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={150} />);
    const rects = container.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('100');
  });

  it('clamps negative values to 0', () => {
    const { container } = renderInSvg(<SvgTank width={60} height={100} tagValue={-10} />);
    const rects = container.querySelectorAll('rect');
    expect(rects[1].getAttribute('height')).toBe('0');
  });
});
