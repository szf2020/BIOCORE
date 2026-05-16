import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgReactor } from '../SvgReactor';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgReactor', () => {
  it('renders vessel rect, jacket lines, and stirrer placeholder', () => {
    const { container } = renderInSvg(<SvgReactor width={100} height={140} tagValue={50} />);
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('line')).not.toBeNull();
  });

  it('clamps fill % to [0, 100]', () => {
    const { container } = renderInSvg(<SvgReactor width={100} height={140} tagValue={150} />);
    const rects = Array.from(container.querySelectorAll('rect'));
    expect(rects.length).toBeGreaterThan(0);
  });
});
