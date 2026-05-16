import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgStirrer } from '../SvgStirrer';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgStirrer', () => {
  it('renders default 3 blades', () => {
    const { container } = renderInSvg(<SvgStirrer width={60} height={60} />);
    expect(container.querySelectorAll('rect').length).toBe(3);
  });

  it('respects config.bladeCount', () => {
    const { container } = renderInSvg(<SvgStirrer width={60} height={60} config={{ bladeCount: 5 }} />);
    expect(container.querySelectorAll('rect').length).toBe(5);
  });
});
