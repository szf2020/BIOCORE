import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgIndicator } from '../SvgIndicator';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgIndicator', () => {
  it('renders normal color when value below threshold', () => {
    const { container } = renderInSvg(<SvgIndicator width={80} height={24} tagValue={50} config={{ threshold: 100 }} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('renders alert color when value at or above threshold', () => {
    const { container } = renderInSvg(<SvgIndicator width={80} height={24} tagValue={120} config={{ threshold: 100 }} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#dc2626');
  });

  it('renders value text', () => {
    const { container } = renderInSvg(<SvgIndicator width={80} height={24} tagValue={42} />);
    expect(container.querySelector('text')?.textContent).toBe('42');
  });
});
