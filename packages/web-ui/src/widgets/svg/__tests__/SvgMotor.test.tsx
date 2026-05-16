import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgMotor } from '../SvgMotor';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgMotor', () => {
  it('renders idle color when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgMotor width={40} height={40} tagValue={false} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('renders running color when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgMotor width={40} height={40} tagValue={true} />);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('#22c55e');
  });

  it('renders an M-shaped path marker', () => {
    const { container } = renderInSvg(<SvgMotor width={40} height={40} tagValue={true} />);
    expect(container.querySelector('path')).not.toBeNull();
  });
});
