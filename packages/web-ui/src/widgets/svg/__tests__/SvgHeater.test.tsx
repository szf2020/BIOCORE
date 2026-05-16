import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgHeater } from '../SvgHeater';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgHeater', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgHeater width={80} height={40} tagValue={false} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders heated color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgHeater width={80} height={40} tagValue={true} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#dc2626');
  });

  it('renders wavy paths', () => {
    const { container } = renderInSvg(<SvgHeater width={80} height={40} tagValue={true} />);
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
