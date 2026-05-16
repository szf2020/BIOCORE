import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgLamp } from '../SvgLamp';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgLamp', () => {
  it('renders off-color circle when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={false} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders on-color circle when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={true} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('uses config.onColor when provided and truthy', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={1} config={{ onColor: '#f00' }} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#f00');
  });

  it('adds opacity-50 class when tagStale is true', () => {
    const { container } = renderInSvg(<SvgLamp width={40} height={40} tagValue={true} tagStale={true} />);
    expect(container.querySelector('circle')?.getAttribute('class')).toContain('opacity-50');
  });
});
