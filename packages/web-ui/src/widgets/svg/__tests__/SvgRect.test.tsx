import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgRect } from '../SvgRect';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgRect', () => {
  it('renders <rect> with width/height and default fill #999', () => {
    const { container } = renderInSvg(<SvgRect width={120} height={60} />);
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('width')).toBe('120');
    expect(rect?.getAttribute('height')).toBe('60');
    expect(rect?.getAttribute('fill')).toBe('#999');
  });

  it('uses config.fill when provided', () => {
    const { container } = renderInSvg(<SvgRect width={10} height={10} config={{ fill: '#0f0' }} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#0f0');
  });
});
