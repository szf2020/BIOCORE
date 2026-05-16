import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgPump } from '../SvgPump';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgPump', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgPump width={40} height={40} tagValue={false} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders running color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgPump width={40} height={40} tagValue={true} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('renders impeller path', () => {
    const { container } = renderInSvg(<SvgPump width={40} height={40} tagValue={true} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
