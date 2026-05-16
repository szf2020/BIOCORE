import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgSelect } from '../SvgSelect';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgSelect', () => {
  it('renders box + value text + arrow path', () => {
    const { container } = renderInSvg(<SvgSelect width={120} height={30} tagValue="OptionA" />);
    expect(container.querySelector('rect')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('OptionA');
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('renders em-dash when tagValue is undefined', () => {
    const { container } = renderInSvg(<SvgSelect width={120} height={30} tagValue={undefined} />);
    expect(container.querySelector('text')?.textContent).toBe('—');
  });
});
