import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgButton } from '../SvgButton';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgButton', () => {
  it('renders rect and label text', () => {
    const { container } = renderInSvg(<SvgButton width={100} height={30} config={{ label: 'Start' }} />);
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('Start');
  });

  it('falls back to "?" when label missing', () => {
    const { container } = renderInSvg(<SvgButton width={100} height={30} />);
    expect(container.querySelector('text')?.textContent).toBe('?');
  });

  it('respects config.fontSize', () => {
    const { container } = renderInSvg(<SvgButton width={100} height={30} config={{ label: 'Go', fontSize: 18 }} />);
    expect(container.querySelector('text')?.getAttribute('font-size')).toBe('18');
  });
});
