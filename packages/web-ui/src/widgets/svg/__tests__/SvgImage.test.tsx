import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgImage } from '../SvgImage';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgImage', () => {
  it('renders <image href> when config.src provided', () => {
    const { container } = renderInSvg(<SvgImage width={100} height={100} config={{ src: '/assets/tank.svg' }} />);
    const img = container.querySelector('image');
    expect(img?.getAttribute('href')).toBe('/assets/tank.svg');
  });

  it('renders placeholder when src missing', () => {
    const { container } = renderInSvg(<SvgImage width={100} height={100} />);
    expect(container.querySelector('image')).toBeNull();
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('?image');
  });

  it('uses tagValue as src override when string', () => {
    const { container } = renderInSvg(<SvgImage width={100} height={100} tagValue="/dyn.png" config={{ src: '/default.svg' }} />);
    expect(container.querySelector('image')?.getAttribute('href')).toBe('/dyn.png');
  });
});
