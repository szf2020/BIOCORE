import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgInput } from '../SvgInput';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgInput', () => {
  it('renders rect with value text when tagValue set', () => {
    const { container } = renderInSvg(<SvgInput width={120} height={28} tagValue="abc" />);
    expect(container.querySelector('text')?.textContent).toBe('abc');
  });

  it('renders placeholder when tagValue undefined', () => {
    const { container } = renderInSvg(<SvgInput width={120} height={28} tagValue={undefined} config={{ placeholder: 'enter…' }} />);
    expect(container.querySelector('text')?.textContent).toBe('enter…');
  });
});
