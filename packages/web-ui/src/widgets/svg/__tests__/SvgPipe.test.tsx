import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgPipe } from '../SvgPipe';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgPipe', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgPipe width={100} height={20} tagValue={false} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders flowing color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgPipe width={100} height={20} tagValue={true} />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#3b82f6');
  });

  it('renders arrow path indicating flow direction', () => {
    const { container } = renderInSvg(<SvgPipe width={100} height={20} tagValue={true} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
