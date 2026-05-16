import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSlider } from '../SvgSlider';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSlider', () => {
  it('renders track, fill rect, and thumb circle', () => {
    const { container } = renderInSvg(<SvgSlider width={200} height={24} tagValue={50} />);
    expect(container.querySelectorAll('rect').length).toBe(2);
    expect(container.querySelector('circle')).not.toBeNull();
  });

  it('thumb cx reflects tagValue position', () => {
    const { container } = renderInSvg(<SvgSlider width={200} height={24} tagValue={50} />);
    expect(container.querySelector('circle')?.getAttribute('cx')).toBe('100');
  });

  it('clamps value above max to thumb at width', () => {
    const { container } = renderInSvg(<SvgSlider width={200} height={24} tagValue={500} />);
    expect(container.querySelector('circle')?.getAttribute('cx')).toBe('200');
  });
});
