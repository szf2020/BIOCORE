import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgProbe } from '../SvgProbe';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgProbe', () => {
  it('renders head circle, cable line, and value text', () => {
    const { container } = renderInSvg(<SvgProbe width={60} height={60} tagValue={37.25} />);
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('line')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('37.25');
  });

  it('formats with config.decimals + unit', () => {
    const { container } = renderInSvg(<SvgProbe width={60} height={60} tagValue={37.2} config={{ decimals: 1, unit: '°C' }} />);
    expect(container.querySelector('text')?.textContent).toBe('37.2 °C');
  });

  it('renders em-dash for undefined value', () => {
    const { container } = renderInSvg(<SvgProbe width={60} height={60} tagValue={undefined} />);
    expect(container.querySelector('text')?.textContent).toBe('—');
  });
});
