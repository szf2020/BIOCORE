import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSparger } from '../SvgSparger';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSparger', () => {
  it('renders idle color lines when tagValue is falsy', () => {
    const { container } = renderInSvg(<SvgSparger width={100} height={20} tagValue={false} />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].getAttribute('stroke')).toBe('#9ca3af');
  });

  it('renders flowing color lines when tagValue is truthy', () => {
    const { container } = renderInSvg(<SvgSparger width={100} height={20} tagValue={true} />);
    const lines = container.querySelectorAll('line');
    expect(lines[0].getAttribute('stroke')).toBe('#3b82f6');
  });
});
