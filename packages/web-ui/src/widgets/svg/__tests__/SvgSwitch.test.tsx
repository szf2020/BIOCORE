import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSwitch } from '../SvgSwitch';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSwitch', () => {
  it('renders off color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgSwitch width={50} height={24} tagValue={false} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders on color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgSwitch width={50} height={24} tagValue={true} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('thumb cx moves right when on', () => {
    const { container } = renderInSvg(<SvgSwitch width={50} height={24} tagValue={true} />);
    expect(Number(container.querySelector('circle')?.getAttribute('cx'))).toBeGreaterThan(25);
  });
});
