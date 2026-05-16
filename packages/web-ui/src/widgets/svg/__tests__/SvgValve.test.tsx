import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgValve } from '../SvgValve';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgValve', () => {
  it('renders closed color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgValve width={40} height={24} tagValue={false} />);
    expect(container.querySelector('polygon')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders open color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgValve width={40} height={24} tagValue={true} />);
    expect(container.querySelector('polygon')?.getAttribute('fill')).toBe('#22c55e');
  });
});
