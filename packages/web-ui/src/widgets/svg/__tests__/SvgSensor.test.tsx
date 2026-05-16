import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSensor } from '../SvgSensor';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSensor', () => {
  it('renders diamond polygon and value', () => {
    const { container } = renderInSvg(<SvgSensor width={60} height={60} tagValue={1.5} />);
    expect(container.querySelector('polygon')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('1.50');
  });

  it('formats with config.decimals + unit', () => {
    const { container } = renderInSvg(<SvgSensor width={60} height={60} tagValue={1.5} config={{ decimals: 1, unit: 'bar' }} />);
    expect(container.querySelector('text')?.textContent).toBe('1.5 bar');
  });
});
