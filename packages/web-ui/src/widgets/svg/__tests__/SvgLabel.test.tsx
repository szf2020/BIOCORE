import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgLabel } from '../SvgLabel';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgLabel', () => {
  it('renders <text> with the string tagValue', () => {
    const { container } = renderInSvg(<SvgLabel width={100} height={20} tagValue="hello" />);
    expect(container.querySelector('text')?.textContent).toBe('hello');
  });

  it('renders the stringified number when tagValue is a number', () => {
    const { container } = renderInSvg(<SvgLabel width={100} height={20} tagValue={42} />);
    expect(container.querySelector('text')?.textContent).toBe('42');
  });

  it('renders the em-dash placeholder when tagValue is undefined', () => {
    const { container } = renderInSvg(<SvgLabel width={100} height={20} tagValue={undefined} />);
    expect(container.querySelector('text')?.textContent).toBe('—');
  });

  it('adds opacity-50 class on the <text> when tagStale is true', () => {
    const { container } = renderInSvg(
      <SvgLabel width={100} height={20} tagValue="x" tagStale={true} />,
    );
    expect(container.querySelector('text')?.getAttribute('class')).toContain('opacity-50');
  });
});
